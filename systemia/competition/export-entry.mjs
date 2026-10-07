import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const repoRoot=path.resolve(__dirname,"..","..");
const catalogPath=path.join(__dirname,"public-entry-catalog.json");

const sha256=(buffer)=>crypto.createHash("sha256").update(buffer).digest("hex");
function arg(name,fallback=""){ const i=process.argv.indexOf(name); return i>=0?String(process.argv[i+1]||""):fallback; }
function relativeFiles(root){
  const out=[];
  function walk(dir){
    for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
      if(["node_modules",".git",".DS_Store"].includes(entry.name)) continue;
      const full=path.join(dir,entry.name);
      if(entry.isDirectory()) walk(full);
      else if(entry.isFile()) out.push(path.relative(root,full).split(path.sep).join("/"));
    }
  }
  walk(root);
  return out.sort();
}
function secretFindings(root,files){
  const patterns=[
    ["private_key",/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
    ["github_pat",/\bgh[pousr]_[A-Za-z0-9_]{20,}\b/],
    ["stripe_live_secret",/\bsk_live_[A-Za-z0-9]{16,}\b/],
  ];
  const findings=[];
  for(const rel of files){
    const full=path.join(root,rel);
    if(fs.statSync(full).size>512*1024) continue;
    const ext=path.extname(rel).toLowerCase();
    if([".png",".jpg",".jpeg",".gif",".webp",".pdf",".zip",".gz"].includes(ext)) continue;
    const text=fs.readFileSync(full,"utf8");
    for(const [code,regex] of patterns) if(regex.test(text)) findings.push({file:rel,code});
  }
  return findings;
}
export function loadCatalog(){ return JSON.parse(fs.readFileSync(catalogPath,"utf8")); }
export function validateEntrySource(entryKey,{catalog=loadCatalog()}={}){
  const entry=catalog.entries?.[entryKey];
  if(!entry) throw new Error("unknown_entry:"+entryKey);
  const source=path.resolve(repoRoot,entry.source);
  if(!source.startsWith(repoRoot+path.sep)) throw new Error("entry_source_outside_repo");
  if(!fs.existsSync(source)||!fs.statSync(source).isDirectory()) throw new Error("entry_source_missing:"+entryKey);
  const files=relativeFiles(source);
  const missing=(entry.required_root_files||[]).filter(name=>!files.includes(name));
  if(missing.length) throw new Error("entry_required_root_files_missing:"+missing.join(","));
  if(!/MIT License/i.test(fs.readFileSync(path.join(source,"LICENSE"),"utf8"))) throw new Error("entry_root_license_not_mit");
  const pkg=JSON.parse(fs.readFileSync(path.join(source,"package.json"),"utf8"));
  if(String(pkg.license||"").toUpperCase()!=="MIT") throw new Error("entry_package_license_not_mit");
  const forbidden=files.filter(rel=>rel===".env"||rel.startsWith(".env.")||/\.(?:pem|p12|pfx|key)$/i.test(rel));
  if(forbidden.length) throw new Error("entry_forbidden_files:"+forbidden.join(","));
  const secrets=secretFindings(source,files);
  if(secrets.length) throw new Error("entry_secret_scan_failed:"+secrets.map(x=>x.file+":"+x.code).join(","));
  return {entry,source,files};
}
export function exportEntry(entryKey,outDir){
  const {entry,source}=validateEntrySource(entryKey);
  const destination=path.resolve(outDir);
  if(!destination.startsWith(repoRoot+path.sep)) throw new Error("export_destination_outside_repo");
  fs.rmSync(destination,{recursive:true,force:true});
  fs.mkdirSync(destination,{recursive:true});
  for(const rel of relativeFiles(source)){
    const from=path.join(source,rel),to=path.join(destination,rel);
    fs.mkdirSync(path.dirname(to),{recursive:true});
    fs.copyFileSync(from,to);
  }
  const checksums=relativeFiles(destination).map(rel=>{
    const body=fs.readFileSync(path.join(destination,rel));
    return {path:rel,bytes:body.length,sha256:sha256(body)};
  });
  const receipt={
    schema:"evercraft.systemia.competition-public-export-receipt.v1",
    entry_key:entryKey,
    source:entry.source,
    suggested_repository:entry.suggested_repository,
    generated_at:new Date().toISOString(),
    root_license:"MIT",
    required_root_files_present:true,
    secret_scan:"passed",
    file_count:checksums.length,
    files:checksums
  };
  fs.writeFileSync(path.join(destination,"PUBLIC_EXPORT_RECEIPT.json"),JSON.stringify(receipt,null,2)+"\n");
  return receipt;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const entry=arg("--entry"),out=arg("--out");
  if(!entry||!out){ console.error("Usage: node systemia/competition/export-entry.mjs --entry <entry-key> --out <repo-relative-output>"); process.exit(2); }
  try{ process.stdout.write(JSON.stringify(exportEntry(entry,path.resolve(repoRoot,out)),null,2)+"\n"); }
  catch(error){ console.error(error instanceof Error?error.message:String(error)); process.exit(1); }
}
