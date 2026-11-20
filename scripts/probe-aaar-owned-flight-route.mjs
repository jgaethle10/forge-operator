// Read-only probe for an Evercraft-owned AAAR flight route.
// Does not modify DNS, leases, files, process state, or publish anything.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const sha256 = input => createHash('sha256').update(input).digest('hex');
const path = 'public/worlds/flight/index.html';
const urls = [
  ['owned-loopback', 'http://127.0.0.1:8788/worlds/flight/'],
  ['owned-https', 'https://worlds.systemiacommandcenters.com/worlds/flight/']
];
const localOnly=process.argv.includes('--local-only');
let source;
try {source=await readFile(path);}catch(e){console.log(JSON.stringify({ok:false,reason:'aaar_source_missing',path}));process.exit(2);}
const expectedHash=sha256(source);
const checks=[];
for(const [name,url] of urls){
  if(localOnly&&name==='owned-https')continue;
  try {
    const res=await fetch(url,{cache:'no-store',redirect:'manual',signal:AbortSignal.timeout(8000)});
    const type=res.headers.get('content-type')||'';
    const data=Buffer.from(await res.arrayBuffer());
    const actual=sha256(data);
    const ok=res.status===200&&/text\/html/i.test(type)&&actual===expectedHash;
    checks.push({name,status:res.status,content_type:type,sha256:actual,source_match:actual===expectedHash,ok});
  } catch(error) {checks.push({name,ok:false,reason:String(error.cause?.code||error.message||error).slice(0,150)});}
}
const verified=checks.length===2&&checks.every(x=>x.ok);
const receipt={
  schema:'evercraft.aaar.owned-flight-route-probe.v1',
  verified, source_path:path, source_sha256:expectedHash,
  source_commit:process.env.AAAR_RELEASE_SHA||null,
  checked_at_utc:new Date().toISOString(), checks,
  js_executed_in_browser:false,physical_iphone_safari_verified:false,
  release_authorized:false,
  note:verified?'Static bytes served at both owned endpoints; browser JS and physical Safari still require separate proof.':'No claim of a working public flight URL.'
};
console.log(JSON.stringify(receipt,null,2));
if(!verified)process.exitCode=1;
