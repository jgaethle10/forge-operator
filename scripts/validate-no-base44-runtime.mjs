import fs from 'node:fs';
import path from 'node:path';

const roots=['server.ts','systemia'];
const extensions=new Set(['.js','.mjs','.cjs','.ts','.tsx','.jsx']);
const excludedParts=[
  path.join('systemia','migrations'),
  path.join('systemia','evidence'),
];
const excludedNames=/\.(test|proof|integration\.test)\.(?:js|mjs|cjs|ts|tsx|jsx)$/i;
const hardcoded=/https:\/\/[^\s"'\x60<>]*base44\.app[^\s"'\x60<>]*/ig;

function walk(target){
  if(!fs.existsSync(target)) return [];
  const stat=fs.statSync(target);
  if(stat.isFile()) return [target];
  const out=[];
  for(const name of fs.readdirSync(target)){
    const next=path.join(target,name);
    if(excludedParts.some((part)=>next===part||next.startsWith(part+path.sep))) continue;
    out.push(...walk(next));
  }
  return out;
}

const files=roots.flatMap(walk)
  .filter((file)=>extensions.has(path.extname(file)))
  .filter((file)=>!excludedNames.test(file));

const findings=[];
for(const file of files){
  const text=fs.readFileSync(file,'utf8');
  const matches=[...text.matchAll(hardcoded)].map((match)=>match[0]);
  if(matches.length) findings.push({file,urls:[...new Set(matches)]});
}

const report={
  schema:'evercraft.systemia.no-hardcoded-base44-runtime.v1',
  checked_files:files.length,
  finding_count:findings.length,
  findings
};
console.log(JSON.stringify(report,null,2));
if(findings.length) process.exit(1);
