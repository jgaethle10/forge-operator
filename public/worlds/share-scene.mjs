import {initialWorld,validateWorld} from './world-core.mjs';
// Scene-only links. The fragment stays on the visitor's browser, not the server.
// No user identifiers, player position, chat/memories or storage tokens are embedded.
export const SHARE_SCHEMA='evercraft.worlds.shared-scene.v1';
export const SHARE_MAX_OBJECTS=40;
const KINDS=['tree','flower','bench','lamp','rock','mushroom'];
const round=n=>Math.round(n*100)/100;
function encodeBytes(text){
 const bytes=new TextEncoder().encode(text);
 let binary='';
 for(const byte of bytes)binary+=String.fromCharCode(byte);
 return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function decodeBytes(token){
 if(typeof token!=='string'||token.length<4||token.length>6000||!/^[A-Za-z0-9_-]+$/.test(token))throw Error('Invalid or oversized world link');
 const binary=atob(token.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-token.length%4)%4));
 return new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(binary,c=>c.charCodeAt(0)));
}
export function encodeSharedScene(world){
 validateWorld(world);
 if(world.objects.length>SHARE_MAX_OBJECTS)throw Error('Link sharing supports up to 40 placed items. Export JSON for larger worlds.');
 const payload={s:SHARE_SCHEMA,k:world.sky,o:world.objects.map(o=>[KINDS.indexOf(o.kind),round(o.x),round(o.z)])};
 const encoded=encodeBytes(JSON.stringify(payload));
 if(encoded.length>6000)throw Error('World link is too large. Export JSON instead.');
 return encoded;
}
export function decodeSharedScene(token){
 let input;
 try{input=JSON.parse(decodeBytes(token));}catch{throw Error('This world link is damaged or unsupported.');}
 if(!input||input.s!==SHARE_SCHEMA||!['day','sunset','night'].includes(input.k)||!Array.isArray(input.o)||input.o.length>SHARE_MAX_OBJECTS)throw Error('Unsupported shared world');
 const world=initialWorld();
 world.sky=input.k;
 world.objects=input.o.map((o,i)=>{
  if(!Array.isArray(o)||o.length!==3||!Number.isInteger(o[0])||o[0]<0||o[0]>=KINDS.length||!Number.isFinite(o[1])||!Number.isFinite(o[2]))throw Error('Malformed world object');
  return {id:'made-'+(i+1),kind:KINDS[o[0]],x:o[1],z:o[2]};
 });
 world.revision=2;
 return validateWorld(world);
}
export function sharedSceneUrl(pageUrl,world){
 const url=new URL(pageUrl);
 url.hash='scene='+encodeSharedScene(world);
 return url.toString();
}
