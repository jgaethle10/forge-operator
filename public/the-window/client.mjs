import { replayWorld, advanceWorld, REAL_TICK_MS, PUBLIC_GENESIS_MS, MAX_REPLAY_TICKS } from './world.mjs';
const icons={homes:'🏡',bakery:'🥐',garden:'🌾',workshop:'🛠️',market:'🏪',library:'📖',lake:'🌊'};
const $=id=>document.getElementById(id);
let world=null;
let selected='r1';
const els=new Map();
function el(tag,className,text){
  const n=document.createElement(tag);
  if(className)n.className=className;
  if(text!==undefined)n.textContent=String(text);
  return n;
}
function label(value){return String(value).replace(/_/g,' ');}
function renderZones(w){
  if($('zones').children.length)return;
  for(const z of w.zones){
    const node=el('div','zone '+z.type);
    node.style.left=z.x+'%';node.style.top=z.y+'%';
    node.append(el('span','symbol',icons[z.id]||'🏠'),el('span','name',z.name));
    $('zones').append(node);
  }
}
function residentPosition(w,a){
  const zone=w.zones.find(z=>z.id===a.zone)||w.zones[0];
  const index=w.actors.findIndex(x=>x.id===a.id);
  const x=zone.x+Math.sin(index*2.399+w.tick*.15)*9;
  const y=zone.y+Math.cos(index*1.847+w.tick*.13)*10;
  return {x:Math.max(4,Math.min(95,x)),y:Math.max(6,Math.min(91,y))};
}
function renderResidents(w){
  for(const a of w.actors){
    let node=els.get(a.id);
    if(!node){
      node=el('button','agent');
      node.type='button';
      node.setAttribute('aria-label','Open '+a.name+' profile');
      node.append(el('span','emoji',a.emoji),el('span','name',a.name));
      node.addEventListener('click',()=>{selected=a.id;renderResidents(world);renderProfile(world);});
      $('residents').append(node);
      els.set(a.id,node);
    }
    const pos=residentPosition(w,a);
    node.style.left=pos.x+'%';node.style.top=pos.y+'%';
    node.classList.toggle('selected',selected===a.id);
    node.title=a.name+' · '+a.action;
  }
}
function renderProfile(w){
  const a=w.actors.find(x=>x.id===selected);
  if(!a)return;
  $('resident-heading').textContent=a.name+' · '+a.job;
  const profile=$('profile');
  profile.replaceChildren();
  profile.append(el('div','avatar',a.emoji),el('h3','',a.name),el('p','description',a.personality));
  profile.append(el('p','',a.action+' at '+(w.zones.find(z=>z.id===a.zone)?.name||'town')+'.'));
  profile.append(el('p','description','Household: '+(a.household||'Willow Row')));
  profile.append(el('h4','','LONG-TERM ASPIRATION'));
  profile.append(el('p','',a.aspiration||'Finding a purpose in Mossmere'));
  const progress=el('progress','goal-progress');
  progress.max=100;progress.value=Math.max(0,Math.min(100,a.goal_progress||0));
  progress.setAttribute('aria-label','Aspiration progress');
  profile.append(progress,el('p','description',(a.goal_progress||0)+'% toward the next milestone · '+(a.goal_milestones||0)+' completed'));

  const facts=el('div','facts');
  for(const [name,value] of [['MOOD',a.mood+'%'],['ENERGY',a.energy+'%'],['COINS',a.coins]]) {
    const fact=el('div');fact.append(el('strong','',value),el('small','',name));facts.append(fact);
  }
  profile.append(facts);
  profile.append(el('h4','', 'CLOSEST CONNECTIONS'));
  const bonds=Object.entries(a.bonds).sort((x,y)=>y[1]-x[1]).slice(0,3);
  const connections=el('ul');
  for(const [id,score] of bonds){
    const other=w.actors.find(x=>x.id===id);
    if(other)connections.append(el('li','',other.name+' · '+score+'/100'));
  }
  profile.append(connections);
  profile.append(el('h4','', 'THINGS THEY REMEMBER'));
  const memories=el('ul');
  for(const m of a.memories.length?a.memories:['Their story is just beginning.'])memories.append(el('li','',m));
  profile.append(memories);
}
function renderEvents(w){
  $('history-count').textContent=w.events.length+' recent events';
  const list=$('events');
  const items=w.events.slice(0,23).map(e=>{
    const node=el('li');
    node.append(el('span','when','DAY '+e.day+' · '+e.time+' · '+label(e.type).toUpperCase()));
    node.append(document.createTextNode(e.description));
    return node;
  });
  list.replaceChildren(...items);
}
function render(w){
  world=w;
  $('clock').textContent='Day '+w.day+' · '+String(Math.floor(w.minute/60)).padStart(2,'0')+':'+String(w.minute%60).padStart(2,'0');
  $('population').textContent=w.actors.length;
  $('town-status').textContent=w.actors.length+' residents · tick '+w.tick;
  $('bread').textContent=w.metrics.bread;
  $('produce').textContent=w.metrics.produce;
  $('repairs').textContent=w.metrics.repairs;
  renderZones(w);renderResidents(w);renderProfile(w);renderEvents(w);
}
function connection(online){
  $('connection').textContent=online?'Clock synchronized':'Sync unavailable';
  document.querySelector('.live-dot').classList.toggle('online',online);
}

// Clock-synchronized reconstruction. This public static page does not use
// a live server, SSE, an LLM, or persistent external agent execution.
function desiredTick(at=Date.now()) {
  return Math.max(0,Math.min(MAX_REPLAY_TICKS,
    Math.floor((at-PUBLIC_GENESIS_MS)/REAL_TICK_MS)));
}
function refresh() {
  const target = desiredTick();
  if(!world || target < world.tick) {
    render(replayWorld(Date.now()));
  } else if(target > world.tick) {
    const projected = world;
    const until = target;
    while(projected.tick < until) {
      advanceWorld(projected,PUBLIC_GENESIS_MS+(projected.tick+1)*REAL_TICK_MS);
    }
    render(projected);
  }
  connection(true);
  $('viewers').textContent='ONE SHARED TIMELINE';
  const outdated=desiredTick()>=MAX_REPLAY_TICKS;
  if(outdated){
    connection(false);
    $('connection').textContent='Season limit reached';
  }
}
try{
  render(replayWorld(Date.now()));
  refresh();
  window.setInterval(refresh,5000);
  document.addEventListener('visibilitychange',()=>{
    if(!document.hidden)refresh();
  });
}catch(err){
  console.error('Failed to reconstruct the society timeline',err);
  connection(false);
  $('connection').textContent='Preview unavailable';
  const note=document.createElement('p');
  note.textContent='The simulation could not load. Reload this page to try again.';
  $('profile').append(note);
}
