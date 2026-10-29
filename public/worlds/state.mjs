// Evercraft Worlds · Mosslight browser world state v0.1
// Local/browser persistence is intentionally separate from the authoritative Node World Engine.
export const SCHEMA='evercraft.worlds.browser-scene.v1';
export const STORAGE_KEY='evercraft.worlds.mosslight.v1';
const COLORS={lavender:'#ad90ff',mint:'#70d9bd',peach:'#ffb28b',rose:'#f595b4',yellow:'#f2d98e'};
export const residents=[
  {id:'pippin',name:'Pippin',role:'Garden keeper',description:'A tiny peach-colored explorer who checks every bloom.',color:'#ffb38d',origin:[-5.8,0,3.3],path:[[-5.8,3.3],[-8.2,5.1],[-5.0,8.7],[-4.4,4.4]],speed:.48},
  {id:'mira',name:'Mira',role:'Studio maker',description:'A curious lavender inventor with lots of questions.',color:'#b9a5ff',origin:[1.1,0,.3],path:[[1.1,.3],[2.6,-.7],[3,2.5],[.1,1.5]],speed:.4},
  {id:'nori',name:'Nori',role:'Pond watcher',description:'A mint-green naturalist who adores the fish.',color:'#83e4ce',origin:[-7.7,0,9.4],path:[[-7.7,9.4],[-10,8.5],[-8.8,11],[-6.3,9.9]],speed:.34},
];
export function seedState(){return {schema:SCHEMA,worldId:'mosslight',revision:1,lighting:'golden',spawn:{x:1.6,y:1.6,z:11.9,yaw:0,pitch:-.08},timeSec:0,objects:[
  {id:'welcome-tree',kind:'tree',name:'Welcome willow',x:6,y:0,z:10,color:'#70d9bd',size:1.4,description:'A very old tree with a very young spirit.'},
  {id:'bench-1',kind:'bench',name:'Reflection bench',x:-5.8,y:0,z:10.6,color:'#d4a6ff',size:1,description:'Take a moment beside the little pond.'},
  {id:'flower-1',kind:'flower',name:'Violet bloom',x:-5.8,y:0,z:7,color:'#b59dff',size:1,description:'A cheerful flower that loves this place.'},
  {id:'flower-2',kind:'flower',name:'Rose bloom',x:-7.3,y:0,z:6.5,color:'#f595b4',size:1,description:'One of Mosslight’s many tiny residents.'},
  {id:'planter-1',kind:'plant',name:'Studio monstera',x:3.4,y:.08,z:-1.6,color:'#75d5b1',size:.82,description:'A bright leafed houseplant.'},
  {id:'lamp-1',kind:'lamp',name:'Garden lantern',x:6.1,y:0,z:5,color:'#ffe4af',size:1,description:'A lantern glowing gently through the evening.'},
  {id:'portal-1',kind:'portal',name:'The Dream Door',x:8.5,y:0,z:2.1,color:'#aa93ff',size:1.2,description:'A shimmer between places. For now, it takes you across Mosslight.'},
  {id:'portal-2',kind:'portal',name:'The Garden Door',x:-10.7,y:0,z:1.8,color:'#83e4ce',size:1.2,description:'An echo of the other doorway.'},
]};}
export function validateState(v){
 if(!v||v.schema!==SCHEMA||v.worldId!=='mosslight'||!Array.isArray(v.objects)||v.objects.length>150||!Number.isInteger(v.revision)||v.revision<1) return false;
 if(!['golden','sunset','night'].includes(v.lighting))return false;
 const ids=new Set();
 for(const o of v.objects){if(!o||typeof o.id!=='string'||o.id.length>90||ids.has(o.id)||!['tree','bench','flower','plant','lamp','portal','rock','table','crystal'].includes(o.kind)||typeof o.name!=='string'||o.name.length>100||!/^#[0-9a-fA-F]{6}$/.test(o.color||'')||!['x','y','z','size'].every(k=>Number.isFinite(o[k]))||Math.abs(o.x)>50||Math.abs(o.z)>50||Math.abs(o.y)>30||o.size<.2||o.size>4)return false;ids.add(o.id)}
 return true;
}
export function loadState(storage){try{const raw=storage?.getItem(STORAGE_KEY);if(raw){const v=JSON.parse(raw);if(validateState(v))return v}}catch{}return seedState()}
export function saveState(storage,s){if(!validateState(s))throw new Error('Invalid world scene'); storage?.setItem(STORAGE_KEY,JSON.stringify(s));return s.revision}
export function addObject(s,kind,x,z,opts={}){
 if(s.objects.length>=150)return {ok:false,message:'This little world is full (150 objects).'};
 const k=String(kind).toLowerCase();if(!['tree','bench','flower','plant','lamp','rock','table','crystal'].includes(k))return {ok:false,message:'That object is not in the builder yet.'};
 const n=1+Math.max(0,...s.objects.map(o=>Number((o.id.match(/-([0-9]+)$/)||[])[1])||0));
 const names={tree:'Dream tree',bench:'Garden bench',flower:'Wildflower',plant:'Leafy friend',lamp:'Warm lantern',rock:'River stone',table:'Little table',crystal:'Glowing crystal'};
 const color=opts.color&&/^#[\da-fA-F]{6}$/.test(opts.color)?opts.color:({tree:COLORS.mint,flower:COLORS.lavender,plant:COLORS.mint,lamp:COLORS.yellow,crystal:COLORS.lavender,bench:COLORS.peach,rock:'#b5b2c7',table:'#d2a886'}[k]);
 const obj={id:`added-${n}`,kind:k,name:names[k],x:Math.max(-22,Math.min(22,x)),y:0,z:Math.max(-22,Math.min(22,z)),size:1,color,description:`A ${names[k].toLowerCase()} you placed here.`};
 s.objects.push(obj);s.revision++;return{ok:true,message:`Added ${obj.name.toLowerCase()}!`,object:obj};
}
export function patchObject(s,id,patch){const o=s.objects.find(o=>o.id===id);if(!o)return {ok:false,message:'Object missing.'};const next={...o,...patch};if(!validateState({...s,objects:s.objects.map(v=>v.id===id?next:v)}))return {ok:false,message:'That edit is outside the world limits.'};Object.assign(o,patch);s.revision++;return{ok:true,message:`Updated ${o.name}.`,object:o}}
export function applyCommand(s,input,{x=0,z=5}={}){
 const text=String(input||'').trim().slice(0,250).toLowerCase();if(!text)return {ok:false,message:'Describe what you would like to change.'};
 if(/\b(sunset|night|golden|sunrise|daylight)\b/.test(text)&& /\b(sky|light|lighting|sun|make|turn|set|change)\b/.test(text)){
   s.lighting=/night/.test(text)?'night':/sunset/.test(text)?'sunset':'golden';s.revision++;return {ok:true,message:`Lighting changed to ${s.lighting}.`};
 }
 const match=text.match(/\b(tree|bench|flowers?|plant|lamp|rock|table|crystal)\b/);
 if(match&&/\b(add|place|plant|grow|create|put|build|make)\b/.test(text)){
   const color=/purple|violet|lavender/.test(text)?COLORS.lavender:/pink|rose/.test(text)?COLORS.rose:/peach|orange/.test(text)?COLORS.peach:/mint|green/.test(text)?COLORS.mint:/yellow|gold/.test(text)?COLORS.yellow:null;
   const x0=/\b(left|pond)\b/.test(text)?-8:/\b(right|portal)\b/.test(text)?8:x;
   const z0=/\b(pond)\b/.test(text)?9:/\b(studio|inside)\b/.test(text)?0:z;
   return addObject(s,match[1].replace(/s$/,''),x0,z0,{color});
 }
 return {ok:false,message:'I can add a tree, bench, flower, plant, lamp, rock, table, or crystal, and change the sky to golden, sunset, or night. Try “add purple flowers near the pond”.'};
}
export function agentAt(agent,elapsed){const points=agent.path;const segments=points.map((a,i)=>{const b=points[(i+1)%points.length];return Math.hypot(b[0]-a[0],b[1]-a[1])});const total=segments.reduce((a,b)=>a+b,0);let d=(Math.max(0,elapsed)*agent.speed)%total;let i=0;while(d>segments[i]&&i<segments.length-1){d-=segments[i];i++}const a=points[i],b=points[(i+1)%points.length],p=d/segments[i];return{x:a[0]+(b[0]-a[0])*p,y:.42+Math.sin(elapsed*3+i)*.04,z:a[1]+(b[1]-a[1])*p}}
export function exportWorld(s){return JSON.stringify({...s,exportedAt:new Date().toISOString(),note:'Browser scene; not a canonical authoritative world-engine snapshot.'},null,2)}

