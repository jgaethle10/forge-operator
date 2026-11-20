// Read-only readiness preflight for Leiland on an actual Evercraft-owned node.
// Queries the existing private Yard KAIDANCE pulse. Never publishes, starts,
// schedules, deploys, or reconfigures an edge. Does not prove remote TLS.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {verifyPrivatePulseForPublication,validatePublicApproval} from '../systemia/collider/public-publisher.mjs';
import {LEILAND_HOST_SCHEMA} from '../systemia/leiland/owned-observatory-host.mjs';

export const FIELD_SCHEMA='evercraft.leiland.field-preflight.v1';
const SHA=/^[a-f0-9]{40}$/i;
const fail=code=>{throw Error(code)};
const shaOk=x=>typeof x==='string'&&SHA.test(x);
const safeDirectory=(input,label)=>{
 if(typeof input!=='string'||!path.isAbsolute(input))fail(label+'_absolute_required');
 const normalized=path.resolve(input),st=fs.lstatSync(normalized);
 if(!st.isDirectory()||st.isSymbolicLink()||fs.realpathSync(normalized)!==normalized)
  fail(label+'_not_owned_real_directory');
 return normalized;
};
const canonicalLoopback=value=>{
 let u;try{u=new URL(value)}catch{fail('loopback_url_invalid')}
 if(u.protocol!=='http:'||u.hostname!=='127.0.0.1'||!u.port||
  u.username||u.password||u.pathname!=='/'||u.search||u.hash)fail('loopback_only_required');
 return u.origin;
};
async function localGet(fetchImpl,url){
 const r=await fetchImpl(url,{method:'GET',cache:'no-store',redirect:'error',credentials:'omit',
  signal:AbortSignal.timeout(4000)});
 if(!r.ok)fail('local_host_http_'+r.status);
 const data=await r.text();
 if(data.length>350000)fail('local_host_response_too_large');
 return {body:data,headers:r.headers};
}
export async function inspectLeilandField({
 staticRoot,publicationRoot,approvalFile,deploymentId,expectedSha,actualSha,
 loopbackOrigin,loadPulse,fetchImpl=fetch,now=new Date()
}={}){
 if(!shaOk(expectedSha)||!shaOk(actualSha)||expectedSha!==actualSha)fail('release_sha_not_pinned');
 if(typeof deploymentId!=='string'||!/^[-a-z0-9_.]{3,90}$/i.test(deploymentId))fail('deployment_id_invalid');
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))fail('clock_invalid');
 if(typeof loadPulse!=='function')fail('private_yard_reader_missing');
 const assets=safeDirectory(staticRoot,'source');
 const published=safeDirectory(publicationRoot,'publication');
 if(assets===published||published.startsWith(assets+path.sep)||assets.startsWith(published+path.sep))
  fail('public_and_publisher_roots_must_be_separate');
 for(const asset of ['leiland/index.html','leiland/brain.js','leiland/pulse-bridge.mjs',
   'kaidance/index.html','kaidance/pulse-source.mjs']){
  const file=path.join(assets,asset);
  if(!fs.statSync(file).isFile())fail('required_site_asset_missing');
 }
 if(typeof approvalFile!=='string'||!path.isAbsolute(approvalFile))fail('approval_path_invalid');
 const approvalStat=fs.lstatSync(approvalFile);
 if(!approvalStat.isFile()||approvalStat.isSymbolicLink()||
  (approvalStat.mode&0o077)!==0)fail('operator_approval_file_insecure');
 if(typeof process.getuid==='function'&&approvalStat.uid!==process.getuid())
  fail('operator_approval_owner_mismatch');
 if(fs.realpathSync(approvalFile).startsWith(published+path.sep)||fs.realpathSync(approvalFile)===published)
  fail('approval_is_public');
 let approval;
 try{approval=JSON.parse(fs.readFileSync(approvalFile,'utf8'))}catch{fail('approval_json_invalid')}
 validatePublicApproval(approval,{approvalFile,publicRoot:published,deploymentId,now});
 // This explicitly reads the existing private Yard source, not the static public feed.
 const privatePulse=await loadPulse(deploymentId);
 const projection=verifyPrivatePulseForPublication(privatePulse,{now});
 const base=canonicalLoopback(loopbackOrigin);
 let health;try{health=JSON.parse((await localGet(fetchImpl,base+'/healthz')).body)}
 catch{fail('local_owned_host_health_unverified')}
 if(health.schema!==LEILAND_HOST_SCHEMA||health.ok!==true||
  health.source_commit!==expectedSha||health.transport!=='loopback_only'||
  health.external_https_verified!==false||health.public_runtime_authorized!==false)
  fail('local_owned_host_identity_mismatch');
 const [brain,collider]=await Promise.all([
  localGet(fetchImpl,base+'/leiland/'),
  localGet(fetchImpl,base+'/kaidance/')
 ]);
 if(!brain.body.includes('CONCEPTUAL ANIMATION')||
  !collider.body.includes('HEARTBEAT NOT CONNECTED'))fail('source_content_readback_mismatch');
 const publicFile=path.join(published,'kaidance','pulse.json');
 const pulseAlreadyPublished=fs.existsSync(publicFile);
 // Do not inspect or expose any private raw source material in this receipt.
 return Object.freeze({
  schema:FIELD_SCHEMA,
  result:'local_preflight_pass',
  source_revision:expectedSha,
  cycle_number:projection.cycle_number,
  source_observed_at:projection.observed_at,
  source_field_attestation_reported:projection.field_attestation_verified,
  existing_public_projection_present:pulseAlreadyPublished,
  local_site_verified:true,
  publication_performed:false,
  dns_verified:false,
  external_https_verified:false,
  two_external_cycles_verified:false,
  public_launch_authorized:false
 });
}
function args(argv){
 const allowed=new Set(['--yard-state-dir','--deployment-id','--static-root',
 '--public-root','--approval-file','--release-sha','--loopback-origin']);
 if(argv.length!==allowed.size*2)fail('usage_invalid');
 const bag={};
 for(let i=0;i<argv.length;i+=2){
  const k=argv[i],v=argv[i+1];if(!allowed.has(k)||!v||k in bag)fail('usage_invalid');
  bag[k]=v;
 }
 return bag;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const a=args(process.argv.slice(2));
  const repoRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const actualSha=execFileSync('git',['-C',repoRoot,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
  const {YardOperator}=await import('../systemia/yard/operator.mjs');
  const yardState=safeDirectory(a['--yard-state-dir'],'yard_state');
  const yard=new YardOperator({stateDir:yardState});
  const preflight=await inspectLeilandField({
   staticRoot:a['--static-root'],publicationRoot:a['--public-root'],
   approvalFile:a['--approval-file'],deploymentId:a['--deployment-id'],
   expectedSha:a['--release-sha'],actualSha,
   loopbackOrigin:a['--loopback-origin'],loadPulse:id=>yard.getKaidancePulse(id)
  });
  console.log(JSON.stringify(preflight));
 }catch(error){
  // No secret locations, private Yard details, or raw source values in stdout/stderr.
  const known=/^[a-z][a-z0-9_]{2,100}$/.test(String(error.message));
  console.error('LEILAND_FIELD_PREFLIGHT_HELD:',known?error.message:'field_source_or_local_service_not_verified');
  process.exitCode=1;
 }
}
