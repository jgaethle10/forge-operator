// Evercraft Living Worlds: House 001. Local, deterministic simulated residents.
// No LLM endpoint or production Systemia admission is used by this module.
export const SCHEMA = 'evercraft.living-worlds.house.v1';
export const WIDTH = 9, HEIGHT = 6;
export const KINDS = Object.freeze({
  bed: {icon:'🛏️',label:'Bed'},
  fridge: {icon:'🧊',label:'Fridge'},
  sofa: {icon:'🛋️',label:'Sofa'},
  desk: {icon:'💻',label:'Desk'},
  plant: {icon:'🪴',label:'Plant'},
  table: {icon:'🪑',label:'Table'}
});
const STARTERS = [
  {id:'mara',name:'Mara',icon:'👩🏽',trait:'Ambitious organizer',wish:'Build a thriving household',x:1,y:0},
  {id:'ivo',name:'Ivo',icon:'🧔🏻',trait:'Practical maker',wish:'Save for a workshop',x:6,y:0},
  {id:'jun',name:'Jun',icon:'👩🏻',trait:'Social creative',wish:'Make everyone feel at home',x:2,y:5},
  {id:'sable',name:'Sable',icon:'🧑🏿',trait:'Quiet thinker',wish:'Write a great novel',x:7,y:5}
];
const clamp = n => Math.max(0,Math.min(100,Math.round(n)));
const rnd = s => {s.seed=(Math.imul(s.seed,1664525)+1013904223)>>>0;return s.seed/4294967296;};
const take = (s,values) => values[Math.floor(rnd(s)*values.length)];
const tile = (x,y) => Number.isInteger(x)&&Number.isInteger(y)&&x>=0&&x<WIDTH&&y>=0&&y<HEIGHT;
const record = (s,description,actor=null,type='activity') => {
  const entry={id:s.nextEventId++,day:s.day,time:clock(s),actor,type,description};
  s.events.unshift(entry);s.events.length=Math.min(60,s.events.length);
  const resident=s.actors.find(a=>a.id===actor);
  if(resident){resident.memories.unshift(description);resident.memories.length=Math.min(10,resident.memories.length);}
};
export function clock(s){const m=s.minute%1440;return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');}
export function makeHouse(seed=101){
  if(!Number.isSafeInteger(seed)||seed<0)throw Error('Invalid seed');
  const actors=STARTERS.map((a,i)=>({...a,energy:67+i*6,hunger:76-i*6,social:66+i*4,mood:74,coins:15+i*3,action:'Moving in',target:null,memories:[],bonds:{}}));
  for(const a of actors)for(const b of actors)if(a.id!==b.id)a.bonds[b.id]=50;
  return {schema:SCHEMA,seed,day:1,minute:8*60,tick:0,nextId:7,nextEventId:1,
    furniture:[
      {id:'f1',kind:'sofa',x:1,y:1},{id:'f2',kind:'table',x:3,y:1},
      {id:'f3',kind:'fridge',x:6,y:1},{id:'f4',kind:'bed',x:1,y:4},
      {id:'f5',kind:'bed',x:3,y:4},{id:'f6',kind:'desk',x:7,y:4}
    ],actors,events:[]};
}
export function room(x,y){
  return y<3?(x<4?'Living room':'Kitchen'):(x<4?'Bedrooms':'Studio');
}
export function placeFurniture(s,kind,x,y){
  if(!Object.hasOwn(KINDS,kind)||!tile(x,y)||s.furniture.length>=35||s.furniture.some(f=>f.x===x&&f.y===y))return false;
  s.furniture.push({id:'f'+s.nextId++,kind,x,y});
  record(s,'A visitor placed a '+KINDS[kind].label.toLowerCase()+' in the '+room(x,y)+'.',null,'build');
  return true;
}
export function removeFurniture(s,x,y){
  if(!tile(x,y))return false;
  const i=s.furniture.findIndex(f=>f.x===x&&f.y===y);
  if(i<0)return false;
  const [f]=s.furniture.splice(i,1);
  for(const a of s.actors)if(a.target===f.id)a.target=null;
  record(s,'A visitor removed the '+KINDS[f.kind].label.toLowerCase()+'.',null,'build');
  return true;
}
export function gift(s,id){
  const a=s.actors.find(r=>r.id===id);if(!a)return false;
  a.energy=clamp(a.energy+13);a.hunger=clamp(a.hunger+16);a.coins+=5;
  record(s,a.name+' received a gift from the audience.',id,'intervention');
  return true;
}
export function party(s){
  for(const a of s.actors){a.social=clamp(a.social+28);a.energy=clamp(a.energy-6);a.target=null;}
  record(s,'The audience hosted a house party. Everyone feels more connected.',null,'intervention');
}
function plan(s,a){
  const byKind=k=>s.furniture.filter(f=>f.kind===k);
  const needs = a.energy<45?'bed':a.hunger<50?'fridge':a.social<43?'sofa':null;
  let options=needs?byKind(needs):[];
  if(!options.length){
    const taste=a.id==='mara'?['desk','sofa','plant']:a.id==='ivo'?['desk','table','sofa']:a.id==='jun'?['sofa','plant','table']:['desk','plant','bed'];
    for(const kind of taste){options=byKind(kind);if(options.length)break;}
  }
  if(!options.length)options=s.furniture;
  if(!options.length){a.action='Looking for something to do';return;}
  const target=options.slice().sort((f,g)=>(Math.abs(f.x-a.x)+Math.abs(f.y-a.y))-(Math.abs(g.x-a.x)+Math.abs(g.y-a.y))||f.id.localeCompare(g.id))[0];
  a.target=target.id;
  a.action='Heading to the '+KINDS[target.kind].label.toLowerCase();
}
function perform(s,a,f){
  let action;
  switch(f.kind){
    case 'fridge': a.hunger=clamp(a.hunger+39);action='made a snack';break;
    case 'bed': a.energy=clamp(a.energy+32);action='took a restful nap';break;
    case 'sofa': a.social=clamp(a.social+24);action='relaxed on the sofa';break;
    case 'desk': a.coins+=3;a.energy=clamp(a.energy-5);action='worked on a personal project';break;
    case 'plant': a.energy=clamp(a.energy+9);a.social=clamp(a.social+8);action='tended the plants';break;
    default: a.social=clamp(a.social+8);action='spent time at the table';
  }
  const companion=s.actors.find(b=>b.id!==a.id&&b.x===a.x&&b.y===a.y);
  if(companion){
    a.social=clamp(a.social+8);companion.social=clamp(companion.social+8);
    a.bonds[companion.id]=clamp(a.bonds[companion.id]+3);
    companion.bonds[a.id]=clamp(companion.bonds[a.id]+3);
    record(s,a.name+' caught up with '+companion.name+' in the '+room(a.x,a.y)+'.',a.id,'social');
  }
  a.action=action[0].toUpperCase()+action.slice(1);
  record(s,a.name+' '+action+'.',a.id,'activity');
  a.target=null;
}

export function selectModelTarget(s,actorId,targetId,reason){
  if(!validateHouse(s)||typeof reason!=='string'||reason.length<1||reason.length>120||
     /[\x00-\x1F\x7F]/.test(reason))return false;
  const actor=s.actors.find(a=>a.id===actorId);
  if(!actor)return false;
  const obj=targetId===null?null:s.furniture.find(f=>f.id===targetId);
  if(targetId!==null&&!obj)return false;
  actor.target=obj?.id||null;
  actor.intent_wait_until=obj?null:s.tick+1;
  actor.action=obj?'Choosing the '+KINDS[obj.kind].label.toLowerCase():'Taking time to think';
  const choice=obj?'picked the '+KINDS[obj.kind].label.toLowerCase():'chose to wait';
  record(s,actor.name+' '+choice+' (local model: '+reason.slice(0,83)+')',actor.id,'model_choice');
  return true;
}

export function advanceHouse(s){
  s.tick++;s.minute+=15;
  if(s.minute>=1440){s.minute-=1440;s.day++;record(s,'A new day begins at House 001.',null,'day');}
  for(const a of s.actors){
    a.energy=clamp(a.energy-3);a.hunger=clamp(a.hunger-4);a.social=clamp(a.social-2);
    const waiting=a.intent_wait_until===s.tick;
    if(waiting){a.intent_wait_until=null;a.action='Taking time to think';}
    let target=waiting?null:s.furniture.find(f=>f.id===a.target);
    if(!waiting&&!target){a.target=null;plan(s,a);target=s.furniture.find(f=>f.id===a.target);}
    if(target){
      if(a.x!==target.x)a.x+=Math.sign(target.x-a.x);
      else if(a.y!==target.y)a.y+=Math.sign(target.y-a.y);
      if(a.x===target.x&&a.y===target.y)perform(s,a,target);
    }
    a.mood=clamp((a.energy+a.hunger+a.social)/3);
  }
  return s;
}
export function validateHouse(s){
  if(!s||s.schema!==SCHEMA||!Number.isSafeInteger(s.seed)||s.seed<0||!Number.isSafeInteger(s.tick)||s.tick<0
    ||!Number.isInteger(s.day)||s.day<1||!Number.isInteger(s.minute)||s.minute<0||s.minute>=1440
    ||!Number.isSafeInteger(s.nextId)||s.nextId<1||!Number.isSafeInteger(s.nextEventId)||s.nextEventId<1
    ||!Array.isArray(s.furniture)||s.furniture.length>35||!Array.isArray(s.actors)||s.actors.length!==4
    ||!Array.isArray(s.events)||s.events.length>60) return false;
  const ids=new Set(),positions=new Set();
  for(const f of s.furniture){
    if(!f||typeof f.id!=='string'||ids.has(f.id)||!Object.hasOwn(KINDS,f.kind)||!tile(f.x,f.y)||positions.has(f.x+','+f.y))return false;
    ids.add(f.id);positions.add(f.x+','+f.y);
  }
  for(let i=0;i<s.actors.length;i++){
    const a=s.actors[i];
    if(!a||a.id!==STARTERS[i].id||!tile(a.x,a.y)||!['energy','hunger','social','mood'].every(k=>Number.isInteger(a[k])&&a[k]>=0&&a[k]<=100)
      ||!Number.isSafeInteger(a.coins)||a.coins<0||!Array.isArray(a.memories)||a.memories.length>10
      ||typeof a.action!=='string'||a.action.length>160
      ||(a.target!==null&&!ids.has(a.target))||!a.bonds||typeof a.bonds!=='object')return false;
    if(!STARTERS.every(b=>b.id===a.id||Number.isInteger(a.bonds[b.id])&&a.bonds[b.id]>=0&&a.bonds[b.id]<=100))return false;
    if(a.memories.some(m=>typeof m!=='string'||m.length>160))return false;
  }
  return s.events.every(e=>e&&Number.isInteger(e.id)&&typeof e.description==='string'&&e.description.length<=160&&Number.isInteger(e.day)&&typeof e.time==='string');
}
