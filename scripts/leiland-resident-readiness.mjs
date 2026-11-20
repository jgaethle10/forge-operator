// Leiland Node 001 read-only handoff inspection.
// Evaluates the CURRENT shell checkout and optional resident local HTTP endpoint.
// Does NOT configure the Systemia supervisor, activate services, publish pulses,
// inspect raw Yard data, change DNS/TLS, or claim ownership of the host.
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {LEILAND_HOST_SCHEMA,approvedPublicProjection} from '../systemia/leiland/owned-observatory-host.mjs';
import {assessPublicPulse} from '../public/kaidance/pulse-source.mjs';
import {assessLeilandFeed} from './probe-leiland-owned-release.mjs';

export const READINESS_SCHEMA='evercraft.leiland.resident-readiness.v1';
const SHA=/^[0-9a-f]{40}$/;
const REPOSITORY_ORIGINS=new Set([
 'https://github.com/jgaethle10/forge-operator',
 'https://github.com/jgaethle10/forge-operator.git',
 'git@github.com:jgaethle10/forge-operator.git',
 'ssh://git@github.com/jgaethle10/forge-operator.git'
]);
const md=buffer=>createHash('sha256').update(buffer).digest('hex');
const fail=why=>{throw Error(why)};
function git(checkout,...args){
 try{return execFileSync('git',['-C',checkout,...args],{
  encoding:'utf8',timeout:6000,maxBuffer:100000,
  stdio:['ignore','pipe','ignore']
 }).trim()}
 catch{fail('local_checkout_git_unavailable')}
}
async function checkDirectory(dir){
 if(typeof dir!=='string'||!path.isAbsolute(dir))fail('absolute_checkout_required');
 const root=path.resolve(dir);
 const stat=await fs.lstat(root);
 if(!stat.isDirectory()||stat.isSymbolicLink()||await fs.realpath(root)!==root)
  fail('canonical_checkout_directory_required');
 return root;
}
const boundedRead=async(response,maxBytes)=>{
 const size=Number(response.headers?.get?.('content-length')||0);
 if(size>maxBytes)fail('local_response_too_large');
 const bytes=Buffer.from(await response.arrayBuffer());
 if(bytes.length>maxBytes)fail('local_response_too_large');
 return bytes;
};
async function localFetch(fetchImpl,origin,route,maxBytes=24000){
 try{
  const response=await fetchImpl(origin+route,{
   method:'GET',credentials:'omit',redirect:'error',cache:'no-store',
   signal:AbortSignal.timeout(2500)
  });
  const bytes=await boundedRead(response,maxBytes);
  return {status:response.status,bytes};
 }catch(e){
  if(e.message==='local_response_too_large')throw e;
  return {status:0,bytes:Buffer.alloc(0)};
 }
}
const notClaimed=Object.freeze({
 private_yard_source_verified:false,
 signed_publisher_approval_verified:false,
 two_real_cycles_independently_verified:false,
 owned_edge_tls_verified:false,
 public_launch_authorized:false,
 private_inference_verified:false
});
const configuredKeys=['LEILAND_STATIC_PUBLIC_ROOT','LEILAND_PUBLICATION_ROOT','LEILAND_RELEASE_SHA'];
const serviceKey='leiland-owned-observatory';
export async function inspectLeilandResident({
 checkout,expectedSha,env=process.env,port=8795,fetchImpl=globalThis.fetch,
 now=Date.now()
}={}){
 if(typeof expectedSha!=='string'||!SHA.test(expectedSha))fail('operator_pinned_sha_required');
 if(!Number.isSafeInteger(port)||port<1||port>65535)fail('invalid_loopback_port');
 const root=await checkDirectory(checkout);
 const current=git(root,'rev-parse','--verify','HEAD');
 const origin=git(root,'config','--get','remote.origin.url');
 if(!REPOSITORY_ORIGINS.has(origin))fail('canonical_repository_origin_unverified');
 if(current!==expectedSha)fail('release_sha_differs_from_operator_pin');
 const registry=JSON.parse(await fs.readFile(path.join(root,'systemia/core/resident-services.json'),'utf8'));
 const record=registry.services?.find(x=>x.service_key===serviceKey);
 if(!record||record.mode!=='resident'||record.optional_when_unconfigured!==true||
    record.executable!=='systemia/leiland/resident-host-runner.mjs'||
    record.manifest!=='systemia/organism/leiland-owned-observatory.workflow.json'||
    configuredKeys.some(key=>!Object.values(record.env_args||{}).includes(key)))
  fail('canonical_systemia_resident_registry_invalid');
 const supervisor=JSON.parse(await fs.readFile(path.join(root,'systemia/core/supervisor.evercraft.compute.json'),'utf8'));
 if(!JSON.stringify(supervisor).includes('"'+serviceKey+'"'))fail('resident_supervisor_registration_missing');
 const publicRoot=path.join(root,'public');
 const sample=await fs.readFile(path.join(publicRoot,'leiland/index.html'));
 if(!sample.includes(Buffer.from('CONCEPTUAL ANIMATION')))fail('static_public_disclosure_missing');
 const shellKeys=configuredKeys.filter(key=>typeof env?.[key]==='string'&&env[key].trim().length>0);
 const shellVisibility=shellKeys.length===3?'all_present_in_this_process':
  shellKeys.length===0?'not_visible_in_this_shell':'partial_in_this_process';
 // Missing shell variables do not establish that Systemia's separately launched
 // resident has no bindings. Expose presence only, NEVER path values.
 const processBinding=shellKeys.length===3&&
  path.resolve(env.LEILAND_STATIC_PUBLIC_ROOT)===publicRoot&&
  env.LEILAND_RELEASE_SHA===current;
 let publicationDirObserved=false;
 if(processBinding&&typeof env.LEILAND_PUBLICATION_ROOT==='string'){
  try{
   const p=path.resolve(env.LEILAND_PUBLICATION_ROOT),st=await fs.lstat(p);
   const real=await fs.realpath(p);
   publicationDirObserved=path.isAbsolute(env.LEILAND_PUBLICATION_ROOT)&&
    st.isDirectory()&&!st.isSymbolicLink()&&real===p&&
    !p.startsWith(root+path.sep)&&p!==root;
  }catch{}
 }
 const localOrigin='http://127.0.0.1:'+port;
 const health=await localFetch(fetchImpl,localOrigin,'/healthz',5000);
 let residentState='not_listening_or_unreadable',pulseState='not_evaluated',feedState='not_evaluated';
 let cycle=null,assetsChecked=0;
 if(health.status!==0){
  if(health.status!==200)residentState='unexpected_health_status';
  else{
   let info=null;
   try{info=JSON.parse(health.bytes.toString('utf8'))}catch{}
   if(info?.schema===LEILAND_HOST_SCHEMA&&info.ok===true&&
      info.transport==='loopback_only'&&info.source_commit===current&&
      info.public_runtime_authorized===false&&
      info.external_https_verified===false&&info.live_ai_inference_claim===false){
     const home=await localFetch(fetchImpl,localOrigin,'/leiland/',500000);
     if(home.status===200&&md(home.bytes)===md(sample)){
      residentState='local_loopback_source_matched';assetsChecked=1;
     }else residentState='local_static_bytes_mismatch';
   }else residentState='local_release_or_identity_mismatch';
  }
 }
 if(residentState==='local_loopback_source_matched'){
  const pulse=await localFetch(fetchImpl,localOrigin,'/kaidance/pulse.json',16000);
  if(pulse.status===404)pulseState='public_projection_absent';
  else if(pulse.status!==200)pulseState='public_projection_unreadable';
  else if(!approvedPublicProjection('kaidance/pulse.json',pulse.bytes,now))
   pulseState='public_projection_unapproved';
  else{
   const assessed=assessPublicPulse(JSON.parse(pulse.bytes.toString('utf8')),now);
   cycle=assessed.cycle_number;
   pulseState=assessed.verified?'source_reported_attested':
      !assessed.sourceFresh||!assessed.cycleFresh?'stale':'unverified';
  }
  const feed=await localFetch(fetchImpl,localOrigin,'/leiland/feed.json',20000);
  if(feed.status===200&&approvedPublicProjection('leiland/feed.json',feed.bytes,now)){
   feedState=assessLeilandFeed(JSON.parse(feed.bytes.toString('utf8')),now).state;
  }else feedState='unavailable_or_unapproved';
 }
 const next=residentState==='not_listening_or_unreadable'?
  'verify_existing_systemia_resident_admission_and_bindings':
  residentState!=='local_loopback_source_matched'?
  'reconcile_local_resident_source_and_health':
  pulseState==='public_projection_absent'?
  'verify_private_yard_pulse_and_signed_publication_approval':
  pulseState==='public_projection_unreadable'||pulseState==='public_projection_unapproved'?
  'hold_publication_and_reconcile_public_projection':
  'check_signed_field_preflight_then_authorized_owned_https_edge';
 return Object.freeze({
  schema:READINESS_SCHEMA,
  scope:'read_only_local_node_inspection',
  release_sha:current,
  systemia_resident_registered:true,
  shell_bindings:shellVisibility,
  // Scope is exclusively this process, not the separately configured supervisor.
  this_shell_binding_matches_checkout:processBinding,
  this_shell_publication_root_observed:publicationDirObserved,
  local_resident:residentState,
  local_static_assets_checked:assetsChecked,
  public_pulse_state:pulseState,
  public_cycle_number:cycle,
  public_inference_feed_state:feedState,
  suggested_next_gate:next,
  ...notClaimed
 });
}
function options(args){
 const result={},allowed=new Set(['--checkout','--expected-sha','--port']);
 if(args.length!==4&&args.length!==6)fail('readiness_arguments_invalid');
 for(let i=0;i<args.length;i+=2){
  const key=args[i],value=args[i+1];
  if(!allowed.has(key)||key in result||!value)fail('readiness_arguments_invalid');
  result[key]=value;
 }
 if(!result['--checkout']||!result['--expected-sha'])fail('readiness_arguments_invalid');
 return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const args=options(process.argv.slice(2));
  const result=await inspectLeilandResident({
   checkout:args['--checkout'],
   expectedSha:args['--expected-sha'],
   port:args['--port']?Number(args['--port']):8795
  });
  console.log(JSON.stringify(result,null,2));
 }catch(error){
  const code=/^[a-z][a-z0-9_]{2,90}$/.test(error.message)?
   error.message:'local_inspection_unavailable';
  console.error('LEILAND_RESIDENT_READINESS_HELD:',code);process.exitCode=1;
 }
}
