import fs from 'node:fs';
import path from 'node:path';

export const REAL_TICK_MS = 30_000;
export const WORLD_TICK_MINUTES = 15;
const MAX_EVENTS_IN_SNAPSHOT = 160;
const DAY_MINUTES = 1440;
const ZONES = [
  {id:'homes',name:'Willow Row',x:12,y:18,type:'residential'},
  {id:'bakery',name:'Fern Bakery',x:48,y:25,type:'business'},
  {id:'garden',name:'Community Garden',x:18,y:62,type:'commons'},
  {id:'workshop',name:'The Workshop',x:77,y:29,type:'business'},
  {id:'market',name:'Market Square',x:53,y:60,type:'commons'},
  {id:'library',name:'Town Library',x:79,y:72,type:'civic'},
  {id:'lake',name:'Glasswater Lake',x:34,y:84,type:'nature'}
];
const HOUSEHOLDS = ['Birch House','Mallow Cottage','Foxglove Hall','Hearthside'];
const AMBITIONS = [
  'Expand the village bakery','Restore the old pier','Grow a year-round orchard',
  'Open a public classroom','Create a thriving town market','Build a workshop of their own',
  'Preserve Mossmere history','Write a treasured recipe book','Rebuild the lakeside docks',
  'Open a gallery in town','Organize a harvest festival','Connect every corner of town'
];
const SEEDS = [
  ['Mara','baker','bakery','Patient, proud of her sourdough','🍞'],
  ['Ivo','carpenter','workshop','Practical, quietly competitive','🪚'],
  ['Jun','gardener','garden','Generous, stubborn about compost','🌱'],
  ['Sable','teacher','library','Curious, keeps too many notes','📚'],
  ['Otis','merchant','market','Charming, counts every coin','🧺'],
  ['Pia','apprentice','workshop','Restless, wants recognition','🔧'],
  ['Nico','librarian','library','Observant, enjoys debate','🦉'],
  ['Tess','cook','bakery','Warm, gossip travels fast','🥧'],
  ['Remy','fisher','lake','Reserved, loyal to friends','🎣'],
  ['Vale','artist','market','Inventive, often short of funds','🎨'],
  ['Ash','organizer','garden','Idealistic, persuasive','🌻'],
  ['Sol','courier','market','Energetic, notices everything','🚲']
];
function clamp(n,lo,hi){return Math.max(lo,Math.min(hi,n));}
function random(world){world.seed = (Math.imul(world.seed,1664525)+1013904223)>>>0;return world.seed/4294967296;}
function pick(world,list){return list[Math.floor(random(world)*list.length)];}
function locate(id){return ZONES.find(z=>z.id===id)||ZONES[0];}
function note(agent,msg){agent.memories.unshift(msg);agent.memories=agent.memories.slice(0,8);}
function moodOf(a){return clamp(Math.round((a.energy+a.hunger+a.social)/3),0,100);}
function changeBond(a,b,delta){a.bonds[b.id]=clamp((a.bonds[b.id]||50)+delta,0,100);b.bonds[a.id]=clamp((b.bonds[a.id]||50)+delta,0,100);}
export function createWorld(now=Date.now(),seed=818){
  const actors=SEEDS.map((data,i)=>({
    id:'r'+(i+1),name:data[0],job:data[1],work:data[2],personality:data[3],emoji:data[4],
    zone:i%3===0?'homes':data[2],household:HOUSEHOLDS[Math.floor(i/3)],
    aspiration:AMBITIONS[i],goal_progress:0,goal_milestones:0,
    energy:70+(i%4)*6,hunger:75+(i%3)*8,
    social:65+(i%5)*6,coins:12+(i%4)*5,action:'Getting settled',bonds:{},memories:[],mood:78
  }));
  for(const a of actors)for(const b of actors)if(a.id!==b.id)a.bonds[b.id]=50;
  return {version:1,seed,created_at:now,updated_at:now,last_tick_at:now,tick:0,next_event_id:1,minute:8*60,day:1,
    town:'Mossmere',zones:ZONES,actors,households:HOUSEHOLDS,treasury:120,events:[],
    metrics:{bread:15,produce:22,repairs:0},recovery:{missed_ticks:0}};
}
function event(world,type,actor,description,extras={}){
  const e={id:'e'+(world.next_event_id++),type,agent:actor?.id||null,
    day:world.day,time:timeLabel(world),description,...extras};
  world.events.unshift(e);
  world.events=world.events.slice(0,MAX_EVENTS_IN_SNAPSHOT);
  return e;
}
export function timeLabel(w){
  const minutes=w.minute%DAY_MINUTES;
  return String(Math.floor(minutes/60)).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0');
}
function interact(w,a){
  const neighbors=w.actors.filter(b=>b.id!==a.id&&(b.zone===a.zone||random(w)<0.09));
  if(!neighbors.length)return null;
  const b=pick(w,neighbors),friendship=a.bonds[b.id]||50;
  const clash=random(w)<(friendship<40?0.32:0.09);
  if(clash){
    changeBond(a,b,-3);a.social=clamp(a.social-6,0,100);b.social=clamp(b.social-5,0,100);
    const msg=a.name+' and '+b.name+' disagreed at '+locate(a.zone).name+'.';
    note(a,msg);note(b,msg);return event(w,'dispute',a,msg,{other_agent:b.id});
  }
  const boost=friendship>65?4:2;
  changeBond(a,b,boost);a.social=clamp(a.social+13,0,100);b.social=clamp(b.social+7,0,100);
  const msg=a.name+' shared a conversation with '+b.name+' at '+locate(a.zone).name+'.';
  note(a,msg);note(b,msg);return event(w,'connection',a,msg,{other_agent:b.id});
}
function act(w,a,workHours){
  if(a.hunger<32){
    if(a.coins>0){a.coins-=1;a.hunger=clamp(a.hunger+34,0,100);a.action='Eating a meal';}
    else {a.hunger=clamp(a.hunger+10,0,100);a.action='Sharing community food';}
    a.zone='homes';return null;
  }
  if(a.energy<25||!workHours&&a.energy<65){
    a.zone='homes';a.energy=clamp(a.energy+19,0,100);a.action='Resting at home';return null;
  }
  if(a.social<40||random(w)<0.1){
    a.zone=pick(w,['market','garden','library']);
    a.action='Visiting '+locate(a.zone).name;
    return interact(w,a);
  }
  if(workHours&&random(w)<0.79){
    a.zone=a.work;a.action='Working as '+a.job;
    a.coins+=2;a.energy=clamp(a.energy-8,0,100);
    if(a.job==='baker'||a.job==='cook')w.metrics.bread+=2;
    if(a.job==='gardener'||a.job==='organizer')w.metrics.produce+=2;
    if(a.job==='carpenter'||a.job==='apprentice')w.metrics.repairs+=1;
    if(random(w)<0.11){
      const msg=a.name+' completed meaningful work at '+locate(a.zone).name+'.';
      note(a,msg);return event(w,'work',a,msg);
    }
    return null;
  }
  a.zone=pick(w,['lake','market','garden','library']);
  a.action='Exploring '+locate(a.zone).name;
  a.energy=clamp(a.energy-3,0,100);
  return random(w)<0.2?interact(w,a):null;
}
export function advanceWorld(w,at=Date.now()){
  w.tick+=1;w.minute+=WORLD_TICK_MINUTES;
  if(w.minute>=DAY_MINUTES){w.minute-=DAY_MINUTES;w.day+=1;event(w,'day',null,'Day '+w.day+' begins in Mossmere.');}
  const workHours=w.minute>=8*60&&w.minute<17*60;
  const generated=[];
  for(const a of w.actors){
    a.hunger=clamp(a.hunger-3,0,100);
    a.social=clamp(a.social-2,0,100);
    const e=act(w,a,workHours);
    // Persistent aspirations progress through work and social participation.
    if(typeof a.aspiration!=='string')a.aspiration=AMBITIONS[w.actors.indexOf(a)]||'Find a purpose in Mossmere';
    if(typeof a.household!=='string')a.household=HOUSEHOLDS[Math.floor(w.actors.indexOf(a)/3)];
    if(!Number.isFinite(a.goal_progress))a.goal_progress=0;
    if(!Number.isFinite(a.goal_milestones))a.goal_milestones=0;
    a.goal_progress+=a.action.startsWith('Working')?4:
      (a.action.startsWith('Visiting')||a.action.startsWith('Exploring')?2:0);
    if(a.goal_progress>=100){
      a.goal_progress-=100;a.goal_milestones+=1;
      const msg=a.name+' reached milestone '+a.goal_milestones+' toward their dream: '+a.aspiration+'.';
      note(a,msg);
      event(w,'milestone',a,msg);
    }
    a.mood=moodOf(a);
    if(e)generated.push(e);
  }
  if(w.tick%24===0){
    const e=event(w,'economy',null,'Town inventory: '+w.metrics.bread+' loaves, '+w.metrics.produce+' produce, '+w.metrics.repairs+' repairs.');
    generated.push(e);
  }
  w.updated_at=at;
  w.last_tick_at=at;
  return generated;
}
export class WorldStore{
  constructor(root,options={}){
    this.root=root;
    this.file=path.join(root,'snapshot.json');
    this.eventFile=path.join(root,'events.jsonl');
    this.listeners=new Set();
    this.now=options.now||Date.now;
    fs.mkdirSync(root,{recursive:true});
    if(fs.existsSync(this.file)){
      this.world=JSON.parse(fs.readFileSync(this.file,'utf8'));
      if(this.world.version!==1)throw new Error('Unsupported snapshot version');
      if(!Number.isInteger(this.world.next_event_id))this.world.next_event_id=this.world.tick*32+1;
    }else{this.world=createWorld(this.now());this.save();}
  }
  save(){
    const tmp=this.file+'.tmp';
    fs.writeFileSync(tmp,JSON.stringify(this.world));
    fs.renameSync(tmp,this.file);
  }
  tick(at=this.now()){
    const old=this.world.events.length?this.world.events[0].id:null;
    advanceWorld(this.world,at);
    const news=[];
    for(const e of this.world.events){if(e.id===old)break;news.push(e);}
    if(news.length)fs.appendFileSync(this.eventFile,news.reverse().map(x=>JSON.stringify(x)).join('\n')+'\n');
    this.save();
    for(const cb of this.listeners)cb(this.world,news);
    return news;
  }
  catchUp(){
    const missed=Math.max(0,Math.floor((this.now()-this.world.last_tick_at)/REAL_TICK_MS));
    const steps=Math.min(missed,480);
    for(let i=0;i<steps;i++)this.tick(this.world.last_tick_at+REAL_TICK_MS);
    this.world.recovery.missed_ticks=Math.max(0,missed-steps);
    this.save();
    return {processed:steps,unprocessed:Math.max(0,missed-steps)};
  }
  subscribe(cb){this.listeners.add(cb);return()=>this.listeners.delete(cb);}
  history(limit=100){return this.world.events.slice(0,clamp(limit,1,MAX_EVENTS_IN_SNAPSHOT));}
}
