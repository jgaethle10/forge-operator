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
  // Stable disjoint slots around each location: avoids residents occluding
  // one another as their shared town evolves. No random browser jitter.
  const members=w.actors.filter(x=>x.zone===a.zone);
  const slot=members.findIndex(x=>x.id===a.id);
  const count=Math.max(1,members.length);
  const angle=(Math.PI*2*(slot+.5)/count)-Math.PI/2;
  const radius=Math.min(17,10+Math.floor(count/4)*2.5);
  const x=zone.x+Math.cos(angle)*radius;
  const y=zone.y+Math.sin(angle)*radius;
  return {x:Math.max(5,Math.min(95,x)),y:Math.max(7,Math.min(91,y))};
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
  renderZones(w);renderResidents(w);renderProfile(w);renderEvents(w);renderProjects(w);renderSocial(w);
}
function connection(online){
  $('connection').textContent=online?'Clock synchronized':'Sync unavailable';
  document.querySelector('.live-dot').classList.toggle('online',online);
}


// This viewer ONLY reads committed state written by the independent GitHub
// world heartbeat. Browsers do not advance, backfill, or invent resident life.
export const WORLD_STATE_URL='https://raw.githubusercontent.com/jgaethle10/forge-operator/window-society-state/state/window.json';
let lastSequence=0;
let lastHeartbeatedAt=0;
let loading=false;
const STALE_MS=20*60*1000;
function hex(bytes) {
  return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
async function verifyState(s) {
  if(s?.schema!=='evercraft.window.heartbeat.v1'||s.initialized!==true||
     !s.world||s.world.version!==1||!Array.isArray(s.world.actors)||
     s.world.actors.length!==12||s.release_status!=='held'||!Number.isInteger(s.sequence)||
     typeof s.world_hash!=='string')throw new Error('Untrusted or noncanonical world state');
  const bytes=new TextEncoder().encode(JSON.stringify(s.world));
  const hash=hex(await crypto.subtle.digest('SHA-256',bytes));
  if(hash!==s.world_hash)throw new Error('World state hash did not match the commit');
  if(s.sequence<lastSequence)throw new Error('Old sequence returned by cache');
  const t=Date.parse(s.heartbeat_at);
  if(!Number.isFinite(t))throw new Error('Missing world heartbeat time');
  if(t>Date.now()+5*60*1000)throw new Error('World heartbeat timestamp is in the future');
  return t;
}
function renderProjects(w) {
  const dest=$('projects');
  if(!dest)return;
  dest.replaceChildren();
  if(!w.civic){
    dest.append(el('p','description','The independent town council is preparing its first project.'));
    return;
  }
  const list=w.civic.proposals.slice(-4).reverse();
  for(const p of list){
    const section=el('div','project-entry');
    const title=el('strong','',p.title);
    const state=el('span','project-state',p.state.replace(/_/g,' '));
    const desc=el('p','',
      p.state==='fundraising'?'The town has raised '+p.funded+' of '+p.need+' coins.':
      p.state==='construction'?'Construction is '+p.progress+'% complete.':
      p.state==='completed'?'The project was completed on town day '+p.completed_day+'.':
      'The proposal was abandoned after residents weighed its costs.');
    section.append(title,state,desc);
    const prog=el('progress','goal-progress');
    prog.max=100;
    prog.value=p.state==='fundraising'?Math.floor(100*p.funded/p.need):
      (p.state==='completed'?100:(p.progress||0));
    prog.setAttribute('aria-label',p.title+' progress');
    section.append(prog);
    dest.append(section);
  }
  if(!list.length)dest.append(el('p','description','The first proposals are still ahead.'));
  $('project-summary').textContent=w.civic.completed.length+' built · '+w.civic.failed.length+' abandoned · trust '+w.civic.trust;
}

function renderSocial(w){
  const dest=$('social-arcs');
  const summary=$('social-summary');
  if(!dest||!summary)return;
  dest.replaceChildren();
  const social=w.social;
  if(!social){summary.textContent='First commitments pending';dest.append(el('p','description','Residents have not yet recorded any formal promises.'));return;}
  const counts=social.stats||{promised:0,kept:0,broken:0,declined:0};
  summary.textContent=counts.kept+' kept · '+counts.broken+' broken';
  const items=social.commitments.slice(-4).reverse();
  if(!items.length){dest.append(el('p','description','No commitments yet. Come back after the next independent heartbeat.'));return;}
  for(const p of items){
    const a=w.actors.find(x=>x.id===p.from);
    const b=w.actors.find(x=>x.id===p.to);
    if(!a||!b)continue;
    const item=el('div','project-entry');
    item.append(el('strong','',a.emoji+' '+a.name+' → '+b.name));
    item.append(el('span','project-state',p.state));
    const detail=p.state==='promised'
      ?a.name+' promised to '+p.label+'. The outcome is still open.'
      :p.state==='kept'
        ?a.name+' followed through. Their relationship strengthened.'
        :a.name+' did not follow through. Their relationship weakened.';
    item.append(el('p','',detail));
    item.append(el('span','when','TOWN DAY '+(Math.floor((p.created_tick*15+480)/1440)+1)+' · '+(p.state==='promised'?'Awaiting decision':'Consequence recorded')));
    dest.append(item);
  }
}

async function refreshCanonical() {
  if(loading)return;
  loading=true;
  try{
    // One bust parameter per minute prevents raw CDN caching from hiding
    // a completed heartbeat. The browser does not mutate world state.
    const url=WORLD_STATE_URL+'?edition='+Math.floor(Date.now()/60000);
    const resp=await fetch(url,{cache:'no-store'});
    if(!resp.ok)throw Error('Canonical world request failed: '+resp.status);
    const state=await resp.json();
    const t=await verifyState(state);
    lastHeartbeatedAt=t;
    if(state.sequence>lastSequence||!world){
      lastSequence=state.sequence;
      render(state.world);
    }
    const lag=Date.now()-t;
    const online=lag<STALE_MS;
    connection(online);
    $('connection').textContent=online?'Independent heartbeat':'Heartbeat delayed';
    $('viewers').textContent=online?'STATE #'+lastSequence:'PAUSED · STATE #'+lastSequence;
    $('heartbeat-receipt').textContent='Last committed update: '+
      new Date(t).toLocaleString()+' · '+(state.run?.steps||0)+' town steps · '+state.model_mode;
    $('heartbeat-receipt').dataset.state=online?'fresh':'stale';
  }catch(err){
    console.error('World state could not be verified',err);
    connection(false);
    $('connection').textContent='State not verified';
    $('heartbeat-receipt').textContent='The canonical heartbeat is not reachable or failed validation. The town will not invent new activity.';
    $('heartbeat-receipt').dataset.state='error';
  }finally{loading=false;}
}
refreshCanonical();
window.setInterval(refreshCanonical,60000);
document.addEventListener('visibilitychange',()=>{
  if(!document.hidden)refreshCanonical();
});
