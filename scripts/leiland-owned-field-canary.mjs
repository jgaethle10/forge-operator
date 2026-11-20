// Read-only field canary for the Leiland observatory on an Evercraft-owned node.
// Starts a temporary loopback server; NEVER writes public data, changes DNS,
// creates a service, or claims public HTTPS / private inference verification.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {startLeilandObservatory,STATIC_PATHS,LEILAND_HOST_SCHEMA} from '../systemia/leiland/owned-observatory-host.mjs';
import {assessPublicPulse} from '../public/kaidance/pulse-source.mjs';
import {assessLeilandFeed} from './probe-leiland-owned-release.mjs';

export const FIELD_CANARY_SCHEMA='evercraft.leiland.owned-field-canary.v1';
const sha256=raw=>createHash('sha256').update(raw).digest('hex');
const deny=reason=>{throw Error(reason)};
function git(repo,args,encoding='utf8'){
 try{return execFileSync('git',['-C',repo,...args],{encoding,maxBuffer:2_000_000,timeout:8000,stdio:['ignore','pipe','pipe']}).toString().trim()}
 catch{deny('canonical_git_checkout_unavailable')}
}
async function checkedRoot(root){
 if(typeof root!=='string'||!path.isAbsolute(root))deny('absolute_checkout_required');
 const resolved=path.resolve(root);
 if(await fs.realpath(resolved)!==resolved)deny('checkout_symlink_forbidden');
 const stat=await fs.lstat(resolved);
 if(!stat.isDirectory()||stat.isSymbolicLink())deny('checkout_directory_invalid');
 return resolved;
}
async function exactAssetProof(repo,relative){
 const file=path.join(repo,relative);
 const disk=await fs.readFile(file);
 let canonical;
 try{canonical=execFileSync('git',['-C',repo,'show','HEAD:'+relative],{maxBuffer:2_000_000,timeout:8000,stdio:['ignore','pipe','pipe']})}
 catch{deny('canonical_asset_missing')}
 if(sha256(disk)!==sha256(canonical))deny('canonical_asset_modified_'+relative.replaceAll('/','_'));
}
async function readLocal(fetchImpl,url,maxBytes=500000){
 const response=await fetchImpl(url,{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(5000)});
 const data=Buffer.from(await response.arrayBuffer());
 if(data.length>maxBytes)deny('local_payload_too_large');
 return {response,data};
}
export async function runLeilandFieldCanary({checkout,publicationRoot,expectedSha,fetchImpl=globalThis.fetch}={}){
 const repo=await checkedRoot(checkout);
 if(typeof expectedSha!=='string'||!/^[a-f0-9]{40}$/.test(expectedSha))deny('operator_pinned_commit_required');
 const current=git(repo,['rev-parse','--verify','HEAD']);
 if(current!==expectedSha)deny('local_release_commit_not_pinned');
 for(const rel of new Set([...Object.values(STATIC_PATHS),'leiland/feed.json'])){
  await exactAssetProof(repo,'public/'+rel);
 }
 const publicRoot=path.join(repo,'public');
 const app=await startLeilandObservatory({
  publicRoot,publicationRoot,releaseSha:current,port:0,host:'127.0.0.1'
 });
 try{
  const health=await readLocal(fetchImpl,app.origin+'/healthz');
  if(health.response.status!==200)deny('local_host_unhealthy');
  let h;try{h=JSON.parse(health.data.toString('utf8'))}catch{deny('health_json_invalid')}
  if(h.schema!==LEILAND_HOST_SCHEMA||h.source_commit!==current||
   h.transport!=='loopback_only'||h.external_https_verified!==false||
   h.public_runtime_authorized!==false||h.live_ai_inference_claim!==false)deny('local_host_identity_mismatch');
  let verifiedAssets=0;
  for(const [route,relative] of Object.entries(STATIC_PATHS)){
   const readback=await readLocal(fetchImpl,app.origin+route);
   if(readback.response.status!==200||sha256(readback.data)!==sha256(await fs.readFile(path.join(publicRoot,relative))))deny('local_asset_mismatch_'+route.replaceAll('/','_'));
   verifiedAssets++;
  }
  const homepage=await readLocal(fetchImpl,app.origin+'/leiland/');
  if(homepage.response.status!==200||sha256(homepage.data)!==sha256(await fs.readFile(path.join(publicRoot,'leiland/index.html'))))deny('local_homepage_mismatch');
  const pulse=await readLocal(fetchImpl,app.origin+'/kaidance/pulse.json',16000);
  let pulseState='not_connected',cycle=null;
  if(pulse.response.status===200){
   let parsed;try{parsed=JSON.parse(pulse.data.toString('utf8'))}catch{deny('local_public_pulse_json_invalid')}
   const assessment=assessPublicPulse(parsed);
   if(!assessment.ok)deny('local_public_pulse_schema_invalid');
   pulseState=assessment.verified?'source_reported_attested':(!assessment.sourceFresh||!assessment.cycleFresh)?'stale':'unverified';
   cycle=assessment.cycle_number;
  }else if(pulse.response.status!==404)deny('public_pulse_invalid_at_origin');
  const feed=await readLocal(fetchImpl,app.origin+'/leiland/feed.json',20000);
  if(feed.response.status!==200)deny('public_feed_invalid_at_origin');
  let data;try{data=JSON.parse(feed.data.toString('utf8'))}catch{deny('local_public_feed_json_invalid')}
  let state;try{state=assessLeilandFeed(data).state}catch{deny('local_public_feed_schema_invalid')}
  const post=await readLocal((u,opts)=>fetchImpl(u,{...opts,method:'POST',body:'never-write'}),app.origin+'/kaidance/pulse.json',1000);
  if(post.response.status!==405)deny('unexpected_public_write_route');
  const privatePath=await readLocal(fetchImpl,app.origin+'/systemia/leiland/owned-pulse-publisher.mjs',1000);
  if(privatePath.response.status!==404)deny('private_source_exposed');
  return Object.freeze({
   schema:FIELD_CANARY_SCHEMA,status:'local_loopback_verified_only',
   release_sha:current,static_assets_verified:verifiedAssets+1,
   public_pulse_state:pulseState,public_cycle_number:cycle,
   public_inference_feed_state:state,
   external_https_verified:false,public_route_activated:false,
   private_runtime_verified:false,operator_release_authorized:false
  });
 }finally{await app.close()}
}
function flagMap(argv){
 const result={};
 const allowed=new Set(['--checkout','--publication-root','--expected-sha']);
 if(argv.length!==6)deny('usage_invalid');
 for(let i=0;i<argv.length;i+=2){
  const key=argv[i],val=argv[i+1];
  if(!allowed.has(key)||key in result||typeof val!=='string'||!val)deny('usage_invalid');
  result[key]=val;
 }
 if(Object.keys(result).length!==allowed.size)deny('usage_invalid');
 return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const a=flagMap(process.argv.slice(2));
  const r=await runLeilandFieldCanary({
   checkout:a['--checkout'],publicationRoot:a['--publication-root'],expectedSha:a['--expected-sha']
  });
  console.log(JSON.stringify(r));
 }catch(error){console.error('LEILAND_FIELD_CANARY_HELD:',error.message);process.exitCode=1}
}
