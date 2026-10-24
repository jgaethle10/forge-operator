import {API} from './work-source.mjs';
import {normalizeFloorRuns,STATIONS} from './floor-source.mjs';

const $=id=>document.getElementById(id);
const stage=$('stage'),stationsNode=$('stations'),eventsNode=$('events');
const POLL_MS=180_000;
const state={lastGood:null,lastSuccess:0,loading:false};

function element(tag,className,value){
 const node=document.createElement(tag);
 if(className)node.className=className;
 if(value!==undefined)node.textContent=String(value);
 return node;
}
function timeText(ms){
 if(!ms)return 'TIME UNAVAILABLE';
 return new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(ms));
}
function paint(data,delayed=false){
 $('runningCount').textContent=delayed?'?':String(data.stats.running);
 $('queuedCount').textContent=delayed?'?':String(data.stats.queued);
 $('observedCount').textContent=String(data.stats.observed);
 $('failedCount').textContent=String(data.stats.failed);
 stationsNode.replaceChildren();
 for(const station of data.stations){
  const displayState=delayed && ['RUNNING','QUEUED'].includes(station.state)?'UNVERIFIED':station.state;
  const card=element('section','station');card.dataset.state=displayState;
  card.setAttribute('aria-label',station.name+': '+displayState);
  const top=element('div','station-top');
  const glyph=element('span','station-glyph',station.glyph);glyph.setAttribute('aria-hidden','true');
  top.append(glyph,element('span','station-state',displayState));
  card.append(top,element('h2','',station.name),element('p','',station.description),element('div','station-space'));
  const evidence=element('div','station-evidence');
  if(station.latest){
   const a=element('a','',station.latest.title+' ↗');
   a.href=station.latest.url;a.target='_blank';a.rel='noopener noreferrer';
   evidence.append(a);
  }else{evidence.textContent='No recent public workflow receipt for this station.'}
  card.append(evidence);
  const bottom=element('div','station-bottom');
  bottom.textContent=station.latest?'RECEIPT '+timeText(station.latest.time)+' · '+station.sampleCount+' IN SAMPLE':'UNOBSERVED IN RECENT PUBLIC SAMPLE';
  card.append(bottom);stationsNode.append(card);
 }
 eventsNode.replaceChildren();
 for(const event of data.events.slice(0,22)){
  const a=element('a','event');a.href=event.url;a.target='_blank';a.rel='noopener noreferrer';a.dataset.state=event.state;
  const top=element('div','event-top');
  const label=STATIONS.find(x=>x.key===event.station)?.name||'BUILD & RELEASE';
  top.append(element('span','',label),element('span','',delayed && ['RUNNING','QUEUED'].includes(event.state)?'UNVERIFIED':event.state));
  a.append(top,element('div','event-title',event.title),element('div','event-time',timeText(event.time)+' · VERIFIED SOURCE LINK ↗'));
  eventsNode.append(a);
 }
 if(!data.events.length)eventsNode.append(element('p','fallback','No eligible recent public workflow receipts. The display will not invent activity.'));
}
function setSource(good,label){
 $('sourceLabel').textContent=label;$('sourceLight').className='light '+(good?'good':'bad');
 $('lastCheck').textContent=state.lastSuccess?'CHECKED '+timeText(state.lastSuccess):'NOT YET VERIFIED';
}
async function refresh(){
 if(state.loading)return;state.loading=true;
 $('freshness').textContent='CHECKING PUBLIC WORKFLOW SOURCE…';
 const abort=new AbortController();
 const timer=setTimeout(()=>abort.abort(),12_000);
 try{
  const response=await fetch(API+'/actions/runs?per_page=100',{
   method:'GET',headers:{Accept:'application/vnd.github+json'},
   signal:abort.signal,cache:'no-store',credentials:'omit'
  });
  if(!response.ok)throw new Error('GitHub source unavailable');
  const payload=await response.json();
  if(!Array.isArray(payload.workflow_runs))throw new Error('Invalid GitHub response');
  const now=Date.now();
  state.lastGood=normalizeFloorRuns(payload.workflow_runs,now);
  state.lastSuccess=now;
  paint(state.lastGood,false);
  setSource(true,'PUBLIC SOURCE CHECKED');
  $('freshness').textContent='VERIFIED PUBLIC SAMPLE · UPDATED '+timeText(now);
  $('evidenceWarning').textContent='Source: public GitHub Actions. Running is a recent GitHub in-progress state, not proof of active private AI agents. All events link to exact receipts.';
 }catch{
  if(state.lastGood){
   paint(state.lastGood,true);
   $('freshness').textContent='SOURCE DELAYED · LAST CHECK '+timeText(state.lastSuccess);
   $('evidenceWarning').textContent='Source unavailable or rate limited. Older receipts remain historical. Active work is marked unverified until refreshed.';
  }else{
   stationsNode.replaceChildren(element('div','loading','GitHub unavailable or rate limited. No agent/workflow activity will be fabricated.'));
   eventsNode.replaceChildren(element('p','fallback','No verified workflow activity available.'));
   $('freshness').textContent='NO CURRENT SOURCE';
  }
  setSource(false,'SOURCE DELAYED');
 }finally{
  clearTimeout(timer);state.loading=false;
 }
}
$('refresh').addEventListener('click',refresh);
$('portrait').addEventListener('click',()=>{
 const on=stage.classList.toggle('portrait');
 $('portrait').textContent=on?'16:9':'9:16';
 $('portrait').setAttribute('aria-pressed',String(on));
});
function film(on){stage.classList.toggle('film',on);$('film').setAttribute('aria-pressed',String(on))}
$('film').addEventListener('click',()=>film(true));
$('exitFilm').addEventListener('click',()=>film(false));
document.addEventListener('keydown',e=>{if(e.key==='Escape')film(false)});
setInterval(refresh,POLL_MS);
refresh();
