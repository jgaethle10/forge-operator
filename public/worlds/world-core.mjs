// Evercraft Worlds / first browser projection. Authoritative World Engine integration is a future server adapter.
// Only allowlisted, data-only scene edits. This module is intentionally dependency-free and Node-testable.
export const SCHEMA = 'evercraft.worlds.local-scene.v1';
export const STORAGE_KEY = 'evercraft.worlds.mossmere.v1';
const KINDS = ['tree','flower','bench','lamp','rock','mushroom'];
const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
export function initialWorld(){return {
 schema:SCHEMA,id:'mossmere-workshop',version:1,sky:'day',revision:1,
 player:{x:0,z:8,yaw:0},objects:[],
 agents:[
  {id:'pip',name:'Pip',color:'#e9b5c5',x:2,z:1,goal:'Tending the garden',mood:'curious',memories:[]},
  {id:'momo',name:'Momo',color:'#a6cabd',x:-1,z:-6,goal:'Exploring the workshop',mood:'happy',memories:[]},
  {id:'lumi',name:'Lumi',color:'#e9cf90',x:6,z:-3,goal:'Watching the pond',mood:'thoughtful',memories:[]}
 ],updatedAt:null
};}
export function validateWorld(world){
 if(!world||world.schema!==SCHEMA||world.id!=='mossmere-workshop')throw Error('Unsupported world document');
 if(!Array.isArray(world.objects)||world.objects.length>160)throw Error('Invalid object count');
 const ids=new Set();
 for(const o of world.objects){
  if(typeof o.id!=='string'||!/^[a-z0-9-]{1,48}$/.test(o.id)||ids.has(o.id))throw Error('Invalid object ID');
  if(!KINDS.includes(o.kind)||!Number.isFinite(o.x)||!Number.isFinite(o.z)||Math.abs(o.x)>17||Math.abs(o.z)>17)throw Error('Invalid object');
  ids.add(o.id);
 }
 if(!['day','sunset','night'].includes(world.sky))throw Error('Invalid sky');
 if(!world.player||!Number.isFinite(world.player.x)||!Number.isFinite(world.player.z)||!Number.isFinite(world.player.yaw))throw Error('Invalid player');
 if(!Array.isArray(world.agents)||world.agents.length!==3)throw Error('Invalid agents');
 return world;
}
export function loadWorld(storage){try{const item=storage.getItem(STORAGE_KEY);return item?validateWorld(JSON.parse(item)):initialWorld();}catch{return initialWorld();}}
export function saveWorld(storage,world){validateWorld(world);const copy={...world,updatedAt:new Date().toISOString()};storage.setItem(STORAGE_KEY,JSON.stringify(copy));return copy;}
export function applyCommand(world,text){
 const raw=String(text||'').trim().toLowerCase().replace(/\s+/g,' ');
 if(!raw||raw.length>180)return {world,message:'Describe a small change to this world.'};
 const next=structuredClone(validateWorld(world));let message='';
 const make=raw.match(/^(?:add|plant|place|create) (?:a |an )?(tree|flower|bench|lamp|rock|mushroom)(?: (?:at|near) (-?\d+(?:\.\d+)?)\s*,?\s*(-?\d+(?:\.\d+)?))?$/);
 if(make){
  if(next.objects.length>=160)return {world,message:'World object limit reached (160).'};
  const x=make[2]===undefined?clamp(next.player.x+Math.sin(next.player.yaw)*3,-16,16):Number(make[2]);
  const z=make[3]===undefined?clamp(next.player.z-Math.cos(next.player.yaw)*3,-16,16):Number(make[3]);
  if(Math.abs(x)>16||Math.abs(z)>16)return {world,message:'That spot is outside the buildable world.'};
  const id='made-'+(Math.max(0,...next.objects.map(o=>Number(o.id.split('-').at(-1))||0))+1);
  next.objects.push({id,kind:make[1],x,z});message=`Added ${make[1]} at ${x.toFixed(1)}, ${z.toFixed(1)}.`;
 }else if(/^(?:set |change )?(?:the )?sky (?:to )?(day|sunset|night)$/.test(raw)){
  next.sky=raw.match(/(day|sunset|night)$/)[1];message=`Sky changed to ${next.sky}.`;
 }else if(/^(?:remove|delete) (?:last|latest)(?: object)?$/.test(raw)){
  const removed=next.objects.pop();if(!removed)return {world,message:'There is no placed object to remove.'};message=`Removed ${removed.kind}.`;
 }else if(/^clear (?:my |placed )?objects$/.test(raw)){
  next.objects=[];message='Removed all objects you placed. The original world is intact.';
 }else{return {world,message:'Try “add tree”, “plant flower at 4, 2”, “sky sunset”, or “remove last”.'};}
 next.revision+=1;return {world:next,message};
}
export function stepAgents(world,dt,elapsed){
 // Bounded local behavior projection only. No claim of independently-running AI agents.
 return world.agents.map((agent,i)=>{
  const phase=elapsed*.21+i*2.09;
  const anchors=[[2,1],[-1,-6],[6,-3]];
  return {...agent,renderX:anchors[i][0]+Math.cos(phase)*1.05,renderZ:anchors[i][1]+Math.sin(phase*.85)*.75,renderBob:Math.sin(elapsed*2.5+i*2)*.065};
 });
}
export function canWalk(x,z){
 if(Math.abs(x)>17||Math.abs(z)>17)return false;
 // Physical footprints of pavilion, desk and fish tank are conservative AABBs.
 const blocks=[[-5.9,-4.7,-4.1,-2.9],[-5.6,-4.1,-1.5,-.35],[-3.8,-2.3,-4.4,-3.25]];
 return !blocks.some(([x1,x2,z1,z2])=>x>x1&&x<x2&&z>z1&&z<z2);
}