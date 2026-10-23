import {API, normalizePublicActivity} from './work-source.mjs';
const $=id=>document.getElementById(id);
const app=$('app'),itemsNode=$('recentList'),checksNode=$('checkList');
const state={items:[],featured:[],position:0,paused:false,lastSync:0,healthy:false,partial:false,waiting:false,sceneStart:Date.now()};
const INTERVAL=600_000,SCENE_MS=11_000;
function dateText(ms){
 if(!ms)return 'TIME UNAVAILABLE';
 try{return new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(ms))}
 catch{return new Date(ms).toISOString().slice(0,16)}
}
function clockText(ms){return ms?new Intl.DateTimeFormat(undefined,{hour:'numeric',minute:'2-digit'}).format(new Date(ms)):'--'}
function make(tag,className,textValue){
 const node=document.createElement(tag);if(className)node.className=className;
 if(textValue!==undefined)node.textContent=String(textValue);
 return node;
}
function drawList(node,subset){
 node.replaceChildren();
 for(const item of subset){
  const a=make('a','card');a.href=item.url;a.target='_blank';a.rel='noopener noreferrer';a.dataset.state=item.state;
  const top=make('div','card-top');top.append(make('span','',item.kind),make('span','',item.state));a.append(top);
  a.append(make('div','card-title',item.title),make('div','card-hint',dateText(item.time)+' · '+item.detail));
  node.append(a);
 }
 if(!subset.length)node.append(make('p','card-hint','No public evidence in this category is currently available.'));
}
function groupFeatured(events){
 const prs=events.filter(x=>x.kind==='PULL REQUEST');
 const commits=events.filter(x=>x.kind==='CODE COMMIT');
 const runs=events.filter(x=>x.kind==='VERIFICATION');
 const output=[],max=Math.max(prs.length,commits.length,runs.length);
 for(let i=0;i<max;i++){
  if(prs[i])output.push(prs[i]);
  if(commits[i])output.push(commits[i]);
  if(runs[i])output.push(runs[i]);
 }
 return output.slice(0,32);
}
function showHeld(msg){
 $('held').classList.add('show');$('heldMessage').textContent=msg;
 $('stateText').textContent='EVIDENCE FEED HELD';$('stateLight').className='signal error';
 $('receipt').removeAttribute('href');$('focusTitle').textContent='No verified public update';
}
function clearHeld(){$('held').classList.remove('show')}
function show(index){
 if(!state.featured.length){showHeld('No eligible, verified public GitHub events are available. No activity is being simulated.');return}
 state.position=(index+state.featured.length)%state.featured.length;
 const item=state.featured[state.position];
 $('focusCategory').textContent='EVENT '+String(state.position+1).padStart(2,'0')+' / '+String(state.featured.length).padStart(2,'0')+' · '+item.category;
 $('focusTitle').textContent=item.title;
 $('eventDetail').textContent=item.detail+' · '+item.source;
 $('focusState').textContent=item.state;
 $('focusWhen').textContent='Recorded '+dateText(item.time);
 $('receipt').href=item.url;
 state.sceneStart=Date.now();$('sceneProgress').style.width='0%';
}
function render(data,partial){
 state.items=data.items;state.featured=groupFeatured(data.items);state.partial=partial;
 $('prCount').textContent=String(data.stats.pr);
 $('runCount').textContent=String(data.stats.run);
 $('commitCount').textContent=String(data.stats.commit);
 drawList(itemsNode,data.items.filter(x=>x.kind==='PULL REQUEST').slice(0,8));
 drawList(checksNode,data.items.filter(x=>x.kind==='VERIFICATION').slice(0,8));
 if(state.featured.length){clearHeld();show(0)}
 else showHeld('The public repository response contained no eligible recent work records. Nothing is being fabricated.');
 $('checkedAt').textContent='Checked '+clockText(state.lastSync);
 $('stateText').textContent=partial?'PARTIAL PUBLIC SOURCE':'PUBLIC GITHUB SOURCE';
 $('stateLight').className='signal '+(partial?'error':'ok');
}
async function request(path){
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),11_000);
 try{
  const response=await fetch(API+path,{headers:{Accept:'application/vnd.github+json'},cache:'no-store',signal:controller.signal,credentials:'omit'});
  if(!response.ok)throw new Error('GitHub HTTP '+response.status);
  return await response.json();
 }finally{clearTimeout(timeout)}
}
async function refresh(){
 if(state.waiting)return;state.waiting=true;
 $('statusText').textContent='CHECKING SOURCE…';
 const keys=['pulls','runs','commits'];
 const calls=[request('/pulls?state=all&sort=updated&direction=desc&per_page=45'),request('/actions/runs?per_page=65'),request('/commits?per_page=35')];
 const settled=await Promise.allSettled(calls);
 const raw={pulls:[],runs:[],commits:[]};let ok=0;
 settled.forEach((v,i)=>{if(v.status==='fulfilled'){
  let data=v.value;if(keys[i]==='runs')data=data.workflow_runs;
  if(Array.isArray(data)){raw[keys[i]]=data;ok++}
 }});
 const now=Date.now();state.waiting=false;
 if(!ok){
  if(!state.lastSync||now-state.lastSync>INTERVAL*2){state.healthy=false;showHeld('GitHub could not be reached. The portal refuses to invent live engineering progress. Open the source directly to inspect current public work.')}
  $('statusText').textContent='SOURCE UNAVAILABLE';
  return;
 }
 state.healthy=true;state.lastSync=now;
 const data=normalizePublicActivity(raw,now);
 render(data,ok<3);
 $('statusText').textContent=ok===3?'VERIFIED PUBLIC ACTIVITY':'PARTIAL PUBLIC ACTIVITY';
}
$('next').onclick=()=>show(state.position+1);
$('hold').onclick=()=>{
 state.paused=!state.paused;
 $('hold').textContent=state.paused?'Resume':'Hold';
 state.sceneStart=Date.now();
};
$('portrait').onclick=()=>{
 const yes=app.classList.toggle('portrait');$('portrait').textContent=yes?'16:9':'9:16';
 $('portrait').setAttribute('aria-pressed',String(yes));
};
function film(on){app.classList.toggle('film',on);$('film').setAttribute('aria-pressed',String(on))}
$('film').onclick=()=>film(true);$('filmExit').onclick=()=>film(false);
$('refresh').onclick=refresh;
document.addEventListener('keydown',e=>{
 if(e.key==='Escape')film(false);
 if(e.key==='ArrowRight'&&e.target===document.body)show(state.position+1);
 if(e.key.toLowerCase()==='f'&&e.target===document.body)film(!app.classList.contains('film'));
});
setInterval(()=>{
 if(!state.healthy||state.paused||!state.featured.length||document.hidden)return;
 const elapsed=Date.now()-state.sceneStart;
 if(elapsed>=SCENE_MS)show(state.position+1);
 else $('sceneProgress').style.width=Math.min(100,elapsed/SCENE_MS*100).toFixed(2)+'%';
},500);
setInterval(refresh,INTERVAL);
showHeld('Checking public GitHub pull requests, commits, and verification runs. This does not read private Systemia activity.');
refresh();
