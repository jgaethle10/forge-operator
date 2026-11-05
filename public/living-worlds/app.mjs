import {SCHEMA,WIDTH,HEIGHT,KINDS,makeHouse,validateHouse,room,clock,placeFurniture,removeFurniture,gift,party,advanceHouse} from './house-core.mjs';
import {decisionContext,applyProposal} from './agent-proposals.mjs';
const $=id=>document.getElementById(id);
const STORAGE='evercraft.living-worlds.house001.v1';
function load(){
  try {const data=JSON.parse(localStorage.getItem(STORAGE));if(validateHouse(data))return data;}
  catch { /* Fresh local session when storage is unavailable or invalid. */ }
  return makeHouse();
}
let state=load(), selected='mara', tool='inspect', running=true, accelerated=false;
let aiAuto=false, aiPending=false, aiRoundRobin=0, aiStatus='Model off. Rules-only simulation.';
let interval=null;
function save(){try{localStorage.setItem(STORAGE,JSON.stringify(state));}catch{/* optional storage */}}
function element(tag,css='',text=''){
  const node=document.createElement(tag);
  if(css)node.className=css;
  node.textContent=text;
  return node;
}
function message(text){$('message').textContent=text;}
function selectedActor(){return state.actors.find(a=>a.id===selected)||state.actors[0];}
function renderHouse(){
  const container=$('house'),nodes=[];
  for(let y=0;y<HEIGHT;y++)for(let x=0;x<WIDTH;x++){
    const area=room(x,y),f=state.furniture.find(v=>v.x===x&&v.y===y);
    const residents=state.actors.filter(a=>a.x===x&&a.y===y);
    const tileNode=element('button','tile '+area.toLowerCase().replace(' ','-')+(x===4?' wall-left':'')+(y===3?' wall-top':''));
    tileNode.type='button';
    tileNode.title=area+(f?' · '+KINDS[f.kind].label:'')+(residents.length?' · '+residents.map(a=>a.name).join(', '):'');
    tileNode.setAttribute('aria-label','Column '+(x+1)+', row '+(y+1)+', '+tileNode.title);
    if(f)tileNode.append(element('span','furnishing',KINDS[f.kind].icon));
    if(residents.length){
      const occupantWrap=element('span','occupants');
      for(const a of residents)occupantWrap.append(element('span','occupant'+(a.id===selected?' selected':''),a.icon));
      tileNode.append(occupantWrap);
    }
    tileNode.addEventListener('click',()=>{
      if(tool==='inspect'){
        if(residents.length){selected=residents[0].id;message('Watching '+residents[0].name+'.');render();}
        else message(area+(f?' · '+KINDS[f.kind].label:'')+'. Choose furniture to build here.');
      } else {
        const changed=tool==='remove'?removeFurniture(state,x,y):placeFurniture(state,tool,x,y);
        message(changed?'House updated. The residents will adapt.':'That tile cannot be changed with this tool.');
        if(changed){save();render();}
      }
    });
    nodes.push(tileNode);
  }
  container.replaceChildren(...nodes);
}
function renderTools(){
  const holder=$('tools');const nodes=[];
  const options=[['inspect','👁 Inspect'],...Object.entries(KINDS).map(([id,k])=>[id,k.icon+' '+k.label]),['remove','⌫ Remove']];
  for(const [id,label] of options){
    const button=element('button','action'+(tool===id?' active':''),label);
    button.type='button';button.setAttribute('aria-pressed',String(tool===id));
    button.addEventListener('click',()=>{tool=id;renderTools();message(id==='inspect'?'Tap a resident to inspect.':id==='remove'?'Tap furniture to remove it.':'Tap an empty tile to place '+KINDS[id].label.toLowerCase()+'.');});
    nodes.push(button);
  }
  holder.replaceChildren(...nodes);
}
function renderActors(){
  const list=[];
  for(const a of state.actors){
    const button=element('button','actor'+(selected===a.id?' active':''));
    button.type='button';button.append(element('span','avatar',a.icon),element('strong','',a.name));
    button.setAttribute('aria-pressed',String(selected===a.id));
    button.addEventListener('click',()=>{selected=a.id;tool='inspect';render();});
    list.push(button);
  }
  $('actors').replaceChildren(...list);
}
function renderProfile(){
  const a=selectedActor(),box=$('profile');
  const head=element('div','profile-top');
  head.append(element('div','profile-emoji',a.icon));
  const copy=element('div');copy.append(element('h3','',a.name),element('p','',a.trait));head.append(copy);
  const status=element('p','',a.action+' · '+a.coins+' coins');
  const wish=element('p','','Dream: '+a.wish);
  const relationship=Object.entries(a.bonds).sort((x,y)=>y[1]-x[1])[0];
  const friend=state.actors.find(r=>r.id===relationship?.[0]);
  const relation=element('p','',friend?'Closest bond: '+friend.name+' ('+relationship[1]+'/100)':'No bonds yet');
  const children=[head,status,wish,relation];
  for(const [label,value] of [['Energy',a.energy],['Hunger',a.hunger],['Social',a.social],['Mood',a.mood]]){
    const row=element('div','stat'),line=element('div','stat-line');
    line.append(element('span','',label),element('strong','',value+' / 100'));
    const meter=element('div','meter'),fill=element('div');fill.style.width=value+'%';meter.append(fill);
    row.append(line,meter);children.push(row);
  }
  box.replaceChildren(...children);
  const memories=$('memories');
  if(!a.memories.length){memories.replaceChildren(element('p','hint','No memories yet. Let the house clock run.'));return;}
  const list=element('ol','memories');
  for(const item of a.memories.slice(0,6))list.append(element('li','',item));
  memories.replaceChildren(list);
}
function renderEvents(){
  const events=state.events.slice(0,18).map(e=>{
    const node=element('div','event');
    node.append(element('div','event-time','DAY '+e.day+' · '+e.time+' · '+e.type.toUpperCase()),element('div','event-text',e.description));
    return node;
  });
  $('events').replaceChildren(...(events.length?events:[element('p','hint','The house is settling in. Start the clock to watch.')])); 
}
function render(){
  $('clock').textContent='Day '+state.day+' · '+clock(state)+' · '+state.tick+' ticks';
  $('mode-label').textContent=aiAuto?'LOCAL SIMULATION · MODEL REQUESTS ON':'LOCAL SIMULATION · MODEL OFF';
  $('ai-auto').textContent=aiAuto?'AI autopilot: On':'AI autopilot: Off';
  $('ai-auto').setAttribute('aria-pressed',String(aiAuto));
  $('think').disabled=aiPending;
  $('ai-status').textContent=aiStatus;
  $('toggle').textContent=running?'⏸ Pause':'▶ Resume';
  $('speed').textContent=accelerated?'4× speed':'1× speed';
  renderHouse();renderTools();renderActors();renderProfile();renderEvents();
}
async function askLocalModel(residentId){
  if(aiPending)return;
  aiPending=true;
  const context=decisionContext(state,residentId);
  aiStatus='Consulting the optional local model for '+residentId+'...';
  render();
  try{
    const response=await fetch('./api/propose',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({context}),signal:AbortSignal.timeout(17000)
    });
    if(!response.ok)throw Error('Model bridge unavailable');
    const result=await response.json();
    if(result?.source!=='local_llm'||result.schema!=='evercraft.living-worlds.inference-result.v1'||
       !applyProposal(state,result.proposal))throw Error('Invalid or stale proposal');
    const actor=state.actors.find(a=>a.id===residentId);
    aiStatus=actor.name+' chose an action using the local model. The simulation validates and executes it.';
    message('Model decision accepted for '+actor.name+'.');
    save();
  }catch{
    aiAuto=false;
    aiStatus='Local model unavailable or decision rejected. Continuing with rules only.';
    message('Model decision could not be accepted. Rule-based residents continue.');
  }finally{aiPending=false;render();}
}
function schedule(){
  if(interval!==null)clearInterval(interval);
  interval=null;
  if(running)interval=setInterval(()=>{
    if(aiPending)return; // Keep a proposal bound to the exact simulation tick it observed.
    advanceHouse(state);
    save();render();
    if(aiAuto&&state.tick%5===0){
      const id=state.actors[aiRoundRobin++%state.actors.length].id;
      void askLocalModel(id);
    }
  },accelerated?330:1200);
}
$('toggle').addEventListener('click',()=>{running=!running;schedule();render();message(running?'Simulation resumed.':'Simulation paused for decorating.');});
$('speed').addEventListener('click',()=>{accelerated=!accelerated;schedule();render();});
$('think').addEventListener('click',()=>{void askLocalModel(selectedActor().id);});
$('ai-auto').addEventListener('click',()=>{
  aiAuto=!aiAuto;
  aiStatus=aiAuto?'AI autopilot armed. The first local model request happens every five simulation ticks.':'AI autopilot stopped. Rules-only simulation continues.';
  render();
});
$('gift').addEventListener('click',()=>{gift(state,selectedActor().id);save();render();message('Gift delivered to '+selectedActor().name+'.');});
$('party').addEventListener('click',()=>{party(state);save();render();message('Party hosted. Watch the social meters.');});
$('reset').addEventListener('click',()=>{if(!window.confirm('Reset this local house, furniture and resident memories?'))return;state=makeHouse();selected='mara';tool='inspect';save();render();message('House reset to its original layout.');});
$('export').addEventListener('click',()=>{
  if(!validateHouse(state)){message('Export blocked: invalid local state.');return;}
  const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob);
  const link=document.createElement('a');link.href=url;link.download='evercraft-house-001-day-'+state.day+'.json';
  document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  message('A copy of the local house snapshot was exported.');
});
if(state.schema!==SCHEMA)state=makeHouse();
render();schedule();