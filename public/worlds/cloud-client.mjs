import {encodeSharedScene,decodeSharedScene} from './share-scene.mjs';
export const CLOUD_KEY='evercraft.worlds.owner-capability.v1';
export const VAULT_SCHEMA='evercraft.worlds.vault.v1';
const idPattern=/^[a-f0-9]{32}$/;
const tokenPattern=/^[a-f0-9]{64}$/;
function apiPath(suffix=''){return '/worlds/api/'+suffix;}
async function jsonResponse(response){
 let data;
 try{data=await response.json();}catch{throw Error('World vault returned an invalid response');}
 if(!response.ok)throw Error(data.error||'World vault request failed');
 if(data.schema!==VAULT_SCHEMA)throw Error('World vault contract mismatch');
 return data;
}
export function validateOwner(owner){
 if(!owner||!idPattern.test(owner.id)||!tokenPattern.test(owner.edit_token)||!Number.isInteger(owner.version)||owner.version<1)return null;
 return owner;
}
export async function vaultAvailable(fetchFn=fetch){
 try{
  const response=await fetchFn(apiPath('health'),{cache:'no-store'});
  const value=await jsonResponse(response);
  return value.ok===true&&value.mode==='owned-durable-vault';
 }catch{return false;}
}
export async function publishWorld(world,owner=null,fetchFn=fetch){
 const scene_token=encodeSharedScene(world);
 const capability=validateOwner(owner);
 const isUpdate=Boolean(capability);
 const endpoint=apiPath('worlds'+(isUpdate?'/'+capability.id:''));
 const response=await fetchFn(endpoint,{
  method:isUpdate?'PUT':'POST',credentials:'same-origin',cache:'no-store',
  headers:{'content-type':'application/json',...(isUpdate?{'authorization':'Bearer '+capability.edit_token,'if-match':'"'+capability.version+'"'}:{})},
  body:JSON.stringify({scene_token})
 });
 const data=await jsonResponse(response);
 if(!idPattern.test(data.world_id)||!Number.isInteger(data.version))throw Error('World vault returned invalid identity');
 if(isUpdate){
  if(data.world_id!==capability.id||data.version!==capability.version+1)throw Error('World vault version mismatch');
  return {...capability,version:data.version};
 }
 if(!tokenPattern.test(data.edit_token))throw Error('World vault did not issue an edit capability');
 return {id:data.world_id,edit_token:data.edit_token,version:data.version};
}
export async function unpublishWorld(owner,fetchFn=fetch){
 const c=validateOwner(owner);
 if(!c)throw Error('World creator capability is missing');
 const value=await jsonResponse(await fetchFn(apiPath('worlds/'+c.id),{
  method:'DELETE',credentials:'same-origin',cache:'no-store',
  headers:{authorization:'Bearer '+c.edit_token,'if-match':'"'+c.version+'"'}
 }));
 if(value.world_id!==c.id||value.unpublished!==true)throw Error('World vault did not confirm unpublishing');
 return true;
}
export async function fetchPublishedWorld(id,fetchFn=fetch){
 if(!idPattern.test(id))throw Error('Invalid world ID');
 const value=await jsonResponse(await fetchFn(apiPath('worlds/'+id),{cache:'no-store',credentials:'same-origin'}));
 if(value.world_id!==id||!Number.isInteger(value.version))throw Error('World vault returned the wrong scene');
 return decodeSharedScene(value.scene_token);
}
export function publishedWorldUrl(pageUrl,id){
 if(!idPattern.test(id))throw Error('Invalid world ID');
 const url=new URL(pageUrl);url.hash='world='+id;return url.toString();
}
