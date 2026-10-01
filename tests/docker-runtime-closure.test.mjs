import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const repoRoot=process.cwd();
const dockerfile=fs.readFileSync(path.join(repoRoot,"Dockerfile"),"utf8");

function runtimeCopyEntries() {
  const runtime=dockerfile.split(/\nFROM\s+/i).find((section)=>/^node:22-alpine\s+AS\s+runtime/i.test(section.trim()));
  assert.ok(runtime,"Dockerfile runtime stage missing");
  const entries=[];
  for(const line of runtime.split(/\r?\n/)){
    const match=line.trim().match(/^COPY\s+--from=build\s+\/app\/([^\s]+)\s+\.\/([^\s]+)$/);
    if(!match) continue;
    entries.push({source:match[1].replace(/\/$/,""),dest:match[2].replace(/\/$/,"")});
  }
  return entries;
}

function listCodeFiles(root){
  if(!fs.existsSync(root)) return [];
  const stat=fs.statSync(root);
  if(stat.isFile()) return /\.(?:mjs|js|ts|cjs)$/.test(root)?[root]:[];
  const out=[];
  for(const name of fs.readdirSync(root)){
    const full=path.join(root,name);
    const s=fs.statSync(full);
    if(s.isDirectory()) out.push(...listCodeFiles(full));
    else if(/\.(?:mjs|js|ts|cjs)$/.test(name)) out.push(full);
  }
  return out;
}

function resolveRelativeImport(fromFile,specifier){
  const base=path.resolve(path.dirname(fromFile),specifier);
  const candidates=[
    base,
    base+".mjs",
    base+".js",
    base+".ts",
    path.join(base,"index.mjs"),
    path.join(base,"index.js"),
    path.join(base,"index.ts"),
  ];
  return candidates.find((candidate)=>fs.existsSync(candidate)&&fs.statSync(candidate).isFile())||null;
}

function importSpecifiers(source){
  const specs=[];
  const patterns=[
    /\bfrom\s+["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for(const pattern of patterns){
    for(const match of source.matchAll(pattern)) specs.push(match[1]);
  }
  return specs;
}

function rel(file){
  return path.relative(repoRoot,file).split(path.sep).join("/");
}

test("production runtime Docker image closes over local code imports",()=>{
  const entries=runtimeCopyEntries();
  const copiedRoots=entries.map((entry)=>entry.source);
  assert.ok(copiedRoots.includes("server.ts"),"server.ts must be copied into runtime");

  const covered=(relativePath)=>copiedRoots.some((root)=>
    relativePath===root || relativePath.startsWith(root+"/")
  );

  const roots=[];
  for(const entry of entries){
    const full=path.join(repoRoot,entry.source);
    roots.push(...listCodeFiles(full));
  }

  const violations=[];
  const checked=new Set();
  for(const file of roots){
    const fileRel=rel(file);
    if(checked.has(fileRel)) continue;
    checked.add(fileRel);
    const source=fs.readFileSync(file,"utf8");
    for(const specifier of importSpecifiers(source)){
      if(!specifier.startsWith(".")) continue;
      const resolved=resolveRelativeImport(file,specifier);
      if(!resolved) continue;
      const resolvedRel=rel(resolved);
      if(!covered(resolvedRel)){
        violations.push({
          importer:fileRel,
          specifier,
          resolved:resolvedRel,
        });
      }
    }
  }

  assert.deepEqual(
    violations,
    [],
    "Production Docker runtime is missing local import closure:\n"+
      violations.map((row)=>`- ${row.importer} imports ${row.resolved} via ${row.specifier}`).join("\n")
  );
});

test("notification fabric carries Signal Fabric into the production image",()=>{
  const entries=runtimeCopyEntries().map((entry)=>entry.source);
  assert.ok(entries.includes("systemia/notification-fabric"));
  assert.ok(
    entries.includes("systemia/signal-fabric"),
    "notification-fabric imports Signal Fabric, so runtime must copy systemia/signal-fabric"
  );
});
