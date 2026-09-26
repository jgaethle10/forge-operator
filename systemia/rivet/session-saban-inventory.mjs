import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildNationalSessionWorkQueue } from './national-session-sprawl.mjs';

const DEFAULT_REGISTRY='systemia/rivet/session-source-registry.json';
const DEFAULT_OUT='artifacts/rivet-session-sprawl/saban-jobs.json';

export function buildSabanSessionInventory(registry){
  const queue=buildNationalSessionWorkQueue().map((raw,index)=>({kind:'session_acquisition_work',key:raw.jurisdiction+':'+raw.lane_id+':'+index,...raw}));
  const sources=(registry.sources||[]).map(source=>({kind:'session_source',key:'source:'+source.source_id,...source}));
  return {schema:'evercraft.rivet.session-saban-inventory.v1',generated_at:new Date().toISOString(),jobs:[...queue,...sources]};
}
function argValue(argv,flag,fallback=null){const i=argv.indexOf(flag);return i>=0&&argv[i+1]?argv[i+1]:fallback;}
function main(){
  const argv=process.argv.slice(2);
  const registryPath=argValue(argv,'--registry',DEFAULT_REGISTRY);
  const out=argValue(argv,'--out',DEFAULT_OUT);
  const registry=JSON.parse(fs.readFileSync(registryPath,'utf8'));
  const result=buildSabanSessionInventory(registry);
  fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({ok:true,jobs:result.jobs.length,jurisdiction_work:result.jobs.filter(x=>x.kind==='session_acquisition_work').length,sources:result.jobs.filter(x=>x.kind==='session_source').length,out}));
}
if(import.meta.url===pathToFileURL(process.argv[1]||'').href)main();
