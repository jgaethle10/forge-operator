// Evercraft Worlds: load one bundled original GLB from the same-origin asset folder.
// Import fails closed. Never accepts arbitrary URLs or unreviewed remote media.
import {admitOwnedGlb,MAX_GLB_BYTES} from './owned-glb.mjs';
export async function loadOwnedSceneMesh(name,{fetchFn=fetch,baseUrl=new URL('./assets/',import.meta.url)}={}){
 if(typeof name!=='string'||!/^[a-z0-9-]{3,64}$/.test(name))throw Error('worlds_asset_name_invalid');
 const base=new URL(baseUrl),modelUrl=new URL(name+'.glb',base),rightsUrl=new URL(name+'.rights.json',base);
 if(modelUrl.origin!==base.origin||rightsUrl.origin!==base.origin||base.protocol!=='http:'&&base.protocol!=='https:')
  throw Error('worlds_asset_origin_unsupported');
 const [model,rights]=await Promise.all([
  fetchFn(modelUrl.href,{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(5000)}),
  fetchFn(rightsUrl.href,{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(5000)})
 ]);
 if(!model.ok||!rights.ok)throw Error('worlds_asset_unavailable');
 const declared=Number(model.headers?.get('content-length')||0);
 if(declared>MAX_GLB_BYTES)throw Error('worlds_asset_oversize');
 const bytes=new Uint8Array(await model.arrayBuffer());
 if(bytes.byteLength>MAX_GLB_BYTES)throw Error('worlds_asset_oversize');
 const manifest=await rights.json();
 return admitOwnedGlb(bytes,manifest);
}
