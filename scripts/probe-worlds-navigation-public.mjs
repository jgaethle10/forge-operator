// Read-only Evercraft Worlds navigation deployment readback.
// Compares exactly the source bytes in this checked-out release to the owned HTTPS edge.
// Never touches private worlds, files, browser storage, or production service state.
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {checkWorldsOrigin} from './probe-worlds-public.mjs';

export const WORLDS_NAVIGATION_READBACK_SCHEMA='evercraft.worlds.navigation-readback.v1';
export const NAVIGATION_ASSETS=Object.freeze([
 {path:'/worlds/gateway/',file:'public/worlds/gateway/index.html',mime:'text/html'},
 {path:'/worlds/gateway/portal.mjs',file:'public/worlds/gateway/portal.mjs',mime:'javascript'},
 {path:'/worlds/destinations.v1.json',file:'public/worlds/destinations.v1.json',mime:'application/json'},
 {path:'/worlds/world-portal.mjs',file:'public/worlds/world-portal.mjs',mime:'javascript'},
 {path:'/worlds/wayfinder-core.mjs',file:'public/worlds/wayfinder-core.mjs',mime:'javascript'},
 {path:'/worlds/wayfinder.mjs',file:'public/worlds/wayfinder.mjs',mime:'javascript'},
 {path:'/worlds/',file:'public/worlds/index.html',mime:'text/html'},
 {path:'/worlds/flight/',file:'public/worlds/flight/index.html',mime:'text/html'},
 {path:'/worlds/hidden-world/yakima-walk/',file:'public/worlds/hidden-world/yakima-walk/index.html',mime:'text/html'}
]);
const sourceRoot=fileURLToPath(new URL('../',import.meta.url));
const digest=buffer=>createHash('sha256').update(buffer).digest('hex');
const shortReason=e=>String(e?.message||e||'unknown').slice(0,100);
export async function probeWorldsNavigationPublic(rawOrigin,{
 fetchFn=fetch,readFn=readFileSync,root=sourceRoot,
 assets=NAVIGATION_ASSETS,timeoutMs=10000
}={}){
 let origin;
 try{origin=checkWorldsOrigin(rawOrigin);}catch{return {schema:WORLDS_NAVIGATION_READBACK_SCHEMA,verified:false,reason:'invalid_owned_https_origin',read_only:true,checks:[]};}
 const base={schema:WORLDS_NAVIGATION_READBACK_SCHEMA,origin,read_only:true,verified:false,
  physical_device_verified:false,world_state_transferred:false};
 const checks=[];
 for(const asset of assets){
  if(!/^\/worlds\/[a-z0-9/.-]*$/.test(asset.path)||asset.path.includes('..')||
   !/^public\/worlds\/[a-z0-9/.-]+$/.test(asset.file)||asset.file.includes('..')) {
   return {...base,checks,failed_path:asset.path,reason:'invalid_asset_manifest'};
  }
  let expected;
  try{expected=readFn(resolve(root,asset.file));}catch{
   return {...base,checks,failed_path:asset.path,reason:'local_source_unavailable'};
  }
  let response;
  try{
   response=await fetchFn(origin+asset.path,{
    cache:'no-store',redirect:'error',signal:AbortSignal.timeout(timeoutMs)
   });
  }catch(e){
   return {...base,checks,failed_path:asset.path,reason:'public_fetch_failed'};
  }
  if(response.status!==200)return {...base,checks,failed_path:asset.path,reason:'http_not_200',status:response.status};
  const mime=(response.headers.get('content-type')||'').toLowerCase();
  if(!mime.includes(asset.mime))return {...base,checks,failed_path:asset.path,reason:'content_type_mismatch'};
  if(response.headers.get('access-control-allow-origin')==='*')
   return {...base,checks,failed_path:asset.path,reason:'unsafe_cors'};
  let publicBytes;
  try{publicBytes=Buffer.from(await response.arrayBuffer());}catch{
   return {...base,checks,failed_path:asset.path,reason:'public_body_unreadable'};
  }
  const expected_sha256=digest(expected),public_sha256=digest(publicBytes);
  if(expected_sha256!==public_sha256)return {...base,checks,failed_path:asset.path,reason:'source_public_hash_mismatch',
    expected_sha256,public_sha256};
  checks.push({path:asset.path,sha256:expected_sha256,verified:true});
 }
 return {...base,verified:true,checks,source_mirror_verified:true};
}
if(process.argv[1]?.endsWith('probe-worlds-navigation-public.mjs')){
 const origin=process.argv[2]||process.env.WORLDS_ORIGIN||'';
 probeWorldsNavigationPublic(origin).then(receipt=>{
  console.log(JSON.stringify(receipt,null,2));
  if(!receipt.verified)process.exitCode=1;
 }).catch(e=>{
  console.log(JSON.stringify({schema:WORLDS_NAVIGATION_READBACK_SCHEMA,verified:false,read_only:true,
   reason:'unhandled_probe_error',detail:shortReason(e)}));
  process.exitCode=1;
 });
}
