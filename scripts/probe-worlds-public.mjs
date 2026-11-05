// Read-only public release canary. Never creates live customer records.
export function checkWorldsOrigin(raw){
 let u;try{u=new URL(raw);}catch{throw Error('worlds_public_origin_required');}
 if(u.protocol!=='https:'||u.pathname!=='/'||u.search||u.hash||u.username||u.password||
 u.origin!==String(raw).replace(/\/$/,'')||/(^|\.)base44\.app$/i.test(u.hostname))throw Error('worlds_public_origin_invalid');
 return u.origin;
}
export async function probeWorldsPublic(origin,{fetchFn=fetch}={}){
 const safe=checkWorldsOrigin(origin);
 const fail=reason=>({schema:'evercraft.worlds.public-release-gate.v1',verified:false,origin:safe,reason});
 try{
  const health=await fetchFn(safe+'/worlds/api/health',{cache:'no-store',signal:AbortSignal.timeout(10000),redirect:'error'});
  if(health.status!==200)return fail('vault_health_status');
  if(health.headers.get('access-control-allow-origin')==='*')return fail('unsafe_cors');
  const data=await health.json();
  if(data.schema!=='evercraft.worlds.vault.v1'||data.ok!==true||data.mode!=='owned-durable-vault')return fail('vault_identity_mismatch');
  const page=await fetchFn(safe+'/worlds/',{cache:'no-store',signal:AbortSignal.timeout(10000),redirect:'error'});
  if(page.status!==200)return fail('worlds_page_unavailable');
  if(!(await page.text()).includes('EVERCRAFT'))return fail('unexpected_worlds_page');
  const js=await fetchFn(safe+'/worlds/cloud-client.mjs',{cache:'no-store',signal:AbortSignal.timeout(10000),redirect:'error'});
  if(js.status!==200||!(await js.text()).includes('publishWorld'))return fail('cloud_bundle_missing');
  return {schema:'evercraft.worlds.public-release-gate.v1',verified:true,origin:safe,checks:['https','vault_health','web_page','cloud_client','cors_not_wildcard'],write_test_performed:false,device_hardware_verified:false};
 }catch{return fail('unreachable_or_invalid_response');}
}
if(process.argv[1]?.endsWith('probe-worlds-public.mjs')){
 probeWorldsPublic(process.argv[2]||'').then(r=>{console.log(JSON.stringify(r,null,2));if(!r.verified)process.exitCode=1;})
 .catch(e=>{console.log(JSON.stringify({verified:false,reason:e.message}));process.exitCode=1;});
}
