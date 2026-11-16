// External Worlds write proof. EXPLICIT OPT-IN only. Uses a disposable, empty
// scene; never prints or uploads the creator's one-time editing capability.
import {probeWorldsPublic,checkWorldsOrigin} from './probe-worlds-public.mjs';
import {initialWorld} from '../public/worlds/world-core.mjs';
import {encodeSharedScene} from '../public/worlds/share-scene.mjs';
export const WRITE_PROOF_SCHEMA='evercraft.worlds.external-write-proof.v1';
const ID=/^[a-f0-9]{32}$/;
const SECRET=/^[a-f0-9]{64}$/;
const error=reason=>Object.assign(new Error(reason),{reason});
const readJson=async response=>{try{return await response.json();}catch{throw error('invalid_json_response');}};
function acceptedIdentity(row,id){
 return !!row&&row.schema==='evercraft.worlds.vault.v1'&&row.world_id===id&&
 Number.isInteger(row.version)&&row.version>=1;
}
export async function probeWorldsWrite(rawOrigin,{execute=false,fetchFn=fetch,readProbe=probeWorldsPublic}={}){
 const origin=checkWorldsOrigin(rawOrigin);
 const report={schema:WRITE_PROOF_SCHEMA,origin,verified:false,write_test_performed:false,
  create_ok:false,read_ok:false,stale_revision_rejected:false,update_ok:false,
  unpublish_ok:false,old_link_404:false,cleanup_ok:false,
  device_hardware_verified:false,customer_data_used:false};
 if(execute!==true)return {...report,reason:'explicit_operator_approval_required'};
 const preflight=await readProbe(origin,{fetchFn});
 if(preflight?.verified!==true)return {...report,reason:'read_only_gate_failed'};
 const request=(endpoint,{method='GET',headers={},body}={})=>fetchFn(origin+endpoint,{
  method,redirect:'error',cache:'no-store',credentials:'omit',
  signal:AbortSignal.timeout(10000),
  headers:{...headers,...(method==='POST'||method==='PUT'||method==='DELETE'?{origin}:{}),
   ...(body?{'content-type':'application/json'}:{})},
  ...(body?{body:JSON.stringify(body)}:{})
 });
 let id='',secret='',phase='pinned_origin',success=false,reason='';
 try{
  const health=await request('/worlds/api/health');
  const identity=await readJson(health);
  if(health.status!==200||identity.schema!=='evercraft.worlds.vault.v1'||
   identity.public_origin!==origin||identity.mode!=='owned-durable-vault')
   throw error('pinned_origin_mismatch');
  const first=encodeSharedScene(initialWorld());
  const updated=initialWorld();updated.sky='night';
  const second=encodeSharedScene(updated);
  if(first===second)throw error('test_scene_not_distinct');
  phase='create';
  const created=await request('/worlds/api/worlds',{method:'POST',body:{scene_token:first}});
  report.write_test_performed=true;
  if(created.status!==201)throw error('create_failed');
  const receipt=await readJson(created);
  if(receipt.schema!=='evercraft.worlds.vault.v1'||!ID.test(receipt.world_id||'')||
   !SECRET.test(receipt.edit_token||'')||receipt.version!==1)throw error('create_identity_invalid');
  id=receipt.world_id;secret=receipt.edit_token;
  report.create_ok=true;
  const endpoint='/worlds/api/worlds/'+id;
  phase='read';
  const fetched=await request(endpoint);
  const current=await readJson(fetched);
  if(fetched.status!==200||!acceptedIdentity(current,id)||
   current.version!==1||current.scene_token!==first||Object.hasOwn(current,'edit_token'))
   throw error('readback_mismatch');
  report.read_ok=true;
  phase='conflict';
  const stale=await request(endpoint,{method:'PUT',
   headers:{authorization:'Bearer '+secret,'if-match':'"0"'},
   body:{scene_token:second}});
  if(stale.status!==409)throw error('stale_revision_not_rejected');
  report.stale_revision_rejected=true;
  phase='update';
  const write=await request(endpoint,{method:'PUT',
   headers:{authorization:'Bearer '+secret,'if-match':'"1"'},
   body:{scene_token:second}});
  const saved=await readJson(write);
  if(write.status!==200||!acceptedIdentity(saved,id)||saved.version!==2)
   throw error('update_failed');
  const verify=await request(endpoint);
  const viewed=await readJson(verify);
  if(verify.status!==200||!acceptedIdentity(viewed,id)||
   viewed.version!==2||viewed.scene_token!==second)throw error('updated_readback_mismatch');
  report.update_ok=true;success=true;
 }catch(e){
  reason=e?.reason||'network_or_unexpected_error';
 }finally{
  if(id&&secret){
   const endpoint='/worlds/api/worlds/'+id;
   // Always try to remove the temporary scene, even if update/read assertions failed.
   for(let attempt=0;attempt<2&&!report.cleanup_ok;attempt++){
    try{
     const current=await request(endpoint);
     if(current.status===404){report.cleanup_ok=true;report.old_link_404=true;break;}
     if(current.status!==200)continue;
     const row=await readJson(current);
     if(!acceptedIdentity(row,id))continue;
     const deleted=await request(endpoint,{method:'DELETE',
      headers:{authorization:'Bearer '+secret,'if-match':'"'+row.version+'"'}});
     if(deleted.status!==200)continue;
     const confirmation=await readJson(deleted);
     if(confirmation.schema!=='evercraft.worlds.vault.v1'||
      confirmation.world_id!==id||confirmation.unpublished!==true)continue;
     report.unpublish_ok=true;
     const missing=await request(endpoint);
     if(missing.status===404){report.old_link_404=true;report.cleanup_ok=true;}
    }catch{}
   }
   if(!report.cleanup_ok){
    // No edit capability is written to disk or logs. An operator with private
    // filesystem access may inspect this ID if a temporary scene is stranded.
    report.orphan_world_id=id;
   }
  }
 }
 report.verified=success&&report.cleanup_ok&&report.unpublish_ok&&report.old_link_404;
 if(!report.verified)report.reason=!report.cleanup_ok&&id?'cleanup_unverified':reason||'write_proof_incomplete';
 return report;
}
if(process.argv[1]?.endsWith('probe-worlds-write.mjs')){
 const origin=process.argv[2]||'';
 const execute=process.argv.includes('--execute');
 probeWorldsWrite(origin,{execute}).then(result=>{
  console.log(JSON.stringify(result,null,2));
  if(!result.verified)process.exitCode=1;
 }).catch(e=>{
  // Failure output intentionally never includes a bearer token, payload or URL query.
  console.log(JSON.stringify({schema:WRITE_PROOF_SCHEMA,verified:false,
   reason:'invalid_origin_or_unexpected_error'}));process.exitCode=1;
 });
}
