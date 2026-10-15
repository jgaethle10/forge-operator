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
  $('connection').textContent=online?'Observing live':'Reconnecting';
  document.querySelector('.live-dot').classList.toggle('online',online);
}
fetch('/api/world',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('Unavailable');return r.json()}).then(render).catch(()=>connection(false));
const source=new EventSource('/api/events');
source.addEventListener('snapshot',event=>{
  try{render(JSON.parse(event.data));connection(true);}catch(err){console.error('Invalid world snapshot',err);}
});
source.onerror=()=>connection(false);
document.addEventListener('visibilitychange',()=>{
  if(!document.hidden&&world)renderProfile(world);
});
