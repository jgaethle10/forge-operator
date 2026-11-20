import {API,normalizePublicActivity} from './work-source.mjs';
import {assessPublicPulse,durationText} from './pulse-source.mjs';
const $=id=>document.getElementById(id);
const state={pulse:null,cycleSeen:null,events:[],current:0,eventStart:Date.now(),githubChecked:false,githubPartial:false,pulseBusy:false,githubBusy:false};
const EVENT_MS=13000,PULSE_POLL_MS=20000,GITHUB_POLL_MS=600000;
const labelTime=ms=>Number.isFinite(ms)?new Date(ms).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'UNKNOWN';
function setStatus(message,kind){
  const badge=$('statusBadge');
  badge.className='status-badge '+kind;
  badge.querySelector('span').textContent=message;
}
function readableSource(p){
  if(!p?.ok)return 'NO APPROVED COLLIDER FEED';
  if(!p.sourceFresh)return 'PUBLIC FEED STALE';
  if(!p.cycleFresh)return 'HEARTBEAT OVERDUE';
  if(!p.coverage_receipt_valid)return 'RECEIPT NOT CONFIRMED';
  if(!p.field_attestation_verified)return 'FIELD ATTESTATION PENDING';
  if(!p.fresh)return 'COLLIDER STATE DEGRADED';
  return 'VERIFIED HEARTBEAT OBSERVED';
}
function renderPulse(){
 const p=state.pulse?assessPublicPulse(state.pulse,Date.now()):{ok:false};
 const status=readableSource(p);
 $('streamType').textContent=status;
 $('portraitSource').textContent=status;
 if(!p.ok){
   setStatus('HEARTBEAT NOT CONNECTED','waiting');
   $('colliderState').textContent='FEED PENDING';
   document.querySelector('.hero-pulse-label').lastChild.textContent=' COLLIDER TELEMETRY: PENDING';
   $('stageNote').textContent='No approved live Collider export is connected.';
   $('cycleLarge').textContent='—';$('cycleCount').textContent='—';
   $('admittedCount').textContent='—';$('heldCount').textContent='—';
   $('coverageState').textContent='UNKNOWN';
   $('cycleUpdated').textContent='NO SOURCE TIMESTAMP';
   $('heartbeatTiming').textContent='Not connected';
   $('lastBeat').textContent='Last observation unknown';
   $('verificationText').textContent='No independent field verification reported';
   $('verificationLight').className='verification-light';
   return;
 }
 $('cycleLarge').textContent=String(p.cycle_number);
 $('cycleCount').textContent=String(p.cycle_number);
 $('admittedCount').textContent=String(p.admitted_count);
 $('heldCount').textContent=String(p.held_count);
 $('coverageState').textContent=p.coverage_receipt_valid?'RECORDED':'UNVERIFIED';
 $('cycleUpdated').textContent='OBSERVED '+labelTime(p.observed_at);
 $('lastBeat').textContent=p.last_completed_cycle?'Last cycle '+labelTime(p.last_completed_cycle):'No cycle recorded';
 $('colliderState').textContent=p.verified?'HEARTBEAT VERIFIED':p.sourceFresh?'OBSERVED · NOT VERIFIED':'SOURCE STALE';
 $('stageNote').textContent=status;
 document.querySelector('.hero-pulse-label').lastChild.textContent=p.verified?' COLLIDER TELEMETRY: VERIFIED':' COLLIDER TELEMETRY: '+(p.sourceFresh?'UNVERIFIED':'STALE');
 $('verificationText').textContent=p.verified?'Independent field attestation and fresh receipt reported':
    p.field_attestation_verified?'Field attested, but current heartbeat not verified':'Independent field attestation not verified';
 $('verificationLight').className='verification-light'+(p.verified?' ok':'');
 if(!p.sourceFresh){
   $('heartbeatTiming').textContent='Public export delayed';
 } else if(p.age_seconds===null){
   $('heartbeatTiming').textContent='Awaiting first cycle';
 } else {
   const remainder=p.heartbeat_target_seconds-p.age_seconds;
   $('heartbeatTiming').textContent=remainder>0
       ?'Next target window in '+durationText(remainder)
       :'Target window passed by '+durationText(-remainder);
 }
 setStatus(p.verified?'VERIFIED PULSE OBSERVED':status,p.verified?'verified':!p.sourceFresh?'lost':'unverified');
}
function triggerBeat(){
 const collider=$('collider');
 collider.classList.remove('beat');
 // Retrigger animation for new authenticated cycle only, never on an elapsed timer.
 void collider.offsetWidth;
 collider.classList.add('beat');
 setTimeout(()=>collider.classList.remove('beat'),1800);
}
async function refreshPulse(){
 if(state.pulseBusy)return;
 state.pulseBusy=true;
 try{
   const res=await fetch('./pulse.json',{cache:'no-store',credentials:'omit'});
   if(!res.ok)throw Error('No approved pulse export at the public origin');
   const raw=await res.json();
   const assessed=assessPublicPulse(raw,Date.now());
   if(!assessed.ok)throw Error('Pulse rejected');
   if(state.cycleSeen!==null&&assessed.cycle_number<state.cycleSeen)throw Error('Collider cycle rolled back');
   if(state.cycleSeen!==null&&assessed.cycle_number>state.cycleSeen&&assessed.verified)triggerBeat();
   if(state.cycleSeen===null||assessed.cycle_number>=state.cycleSeen){
     state.cycleSeen=assessed.cycle_number;
     state.pulse=raw;
   }
 }catch{
   // Never keep claiming an authenticated live cycle when the upstream export fails.
   state.pulse=null;
 }
 state.pulseBusy=false;renderPulse();renderFooter();
}
function renderFooter(){
 $('sourceFoot').textContent='COLLIDER: '+readableSource(state.pulse?assessPublicPulse(state.pulse):null)+
  ' · GITHUB: '+(state.githubChecked?(state.githubPartial?'PARTIAL':'PUBLIC RECORD'):'UNAVAILABLE');
}
function showEvent(){
 const events=state.events;
 if(!events.length){
   $('eventKind').textContent='PUBLIC ENGINEERING SOURCE HELD';
   $('eventTitle').textContent='No eligible verified event available';
   $('eventMeta').textContent='No simulated commits, reviews, or tests will appear.';
   $('eventAge').textContent='WAITING FOR SOURCE';
   $('eventLink').hidden=true;
   $('portraitEventKind').textContent='PUBLIC SOURCE UNAVAILABLE';
   $('portraitEventTitle').textContent='No verified engineering event';
   $('portraitEventMeta').textContent='Collider data is shown separately; no activity is being invented.';
   $('portraitProofProgress').style.width='0%';
   $('heroEventKind').textContent='SOURCE NOT AVAILABLE';
   $('heroEventTitle').textContent='No source-backed public event is available.';
   $('heroEventMeta').textContent='No activity is invented when public source access fails.';
   $('heroEventLink').hidden=true;
   $('heroProgress').style.width='0%';
   $('eventProgress').style.width='0%';
   $('signalSpotlight').dataset.state='PENDING';
   $('signalIndex').textContent='SOURCE PENDING';
   return;
 }
 const e=events[state.current%events.length];
 $('eventKind').textContent=e.kind+' / '+e.category;
 const publicStatus=e.state==='RUNNING'||e.state==='PASSED'||e.state==='MERGED'
   ||e.state==='FAILED'||e.state==='CANCELLED'||e.state==='RECORDED'
   ||e.state==='QUEUED'?e.state:'DEFAULT';
 $('signalSpotlight').dataset.state=publicStatus;
 $('signalIndex').textContent='TRACE '+String((state.current%events.length)+1).padStart(2,'0')+
   ' / '+String(events.length).padStart(2,'0');
 $('eventTitle').textContent=e.title;
 $('eventMeta').textContent=e.detail+' · '+e.source;
 $('eventAge').textContent='RECORDED '+labelTime(e.time);
 $('eventLink').href=e.url;$('eventLink').hidden=false;
 $('portraitEventKind').textContent=e.kind+' · PUBLIC GITHUB';
 $('portraitEventTitle').textContent=e.title;
 $('portraitEventMeta').textContent=e.state+' · Recorded '+labelTime(e.time)+' · Not a Collider event';
 $('heroEventKind').textContent=e.kind+' · '+e.state;
 $('heroEventTitle').textContent=e.title;
 $('heroEventMeta').textContent=e.detail+' · '+labelTime(e.time)+' · PUBLIC GITHUB';
 $('heroEventLink').href=e.url;
 $('heroEventLink').hidden=false;
 // The interactive field may illustrate which public Evercraft topic was
 // recorded. This does NOT report a live mission, agent, or Collider cycle.
 document.dispatchEvent(new CustomEvent('kaidance:public-record',{
   detail:{title:e.title,kind:e.kind,recorded_at:e.time}
 }));
 state.eventStart=Date.now();
}
function renderEventList(){
 const node=$('eventList');node.replaceChildren();
 for(const e of state.events.slice(0,4)){
   const safeState=e.state==='RUNNING'||e.state==='PASSED'||e.state==='MERGED'
     ||e.state==='FAILED'||e.state==='CANCELLED'||e.state==='RECORDED'
     ||e.state==='QUEUED'?e.state:'DEFAULT';
   const style=safeState==='RUNNING'?'running':safeState==='PASSED'?'passed':
     safeState==='MERGED'?'merged':safeState==='FAILED'?'failed':
     safeState==='CANCELLED'?'cancelled':safeState==='RECORDED'?'recorded':
     safeState==='QUEUED'?'review':'default';
   const a=document.createElement('a');a.className='event event--'+style;
   a.dataset.state=safeState;
   a.href=e.url;a.target='_blank';a.rel='noopener noreferrer';
   a.setAttribute('aria-label',e.kind+' '+e.state+': '+e.title+'; open public GitHub receipt');
   const meta=document.createElement('small');meta.textContent=e.kind+' · '+e.state;
   const title=document.createElement('b');title.textContent=e.title;
   const detail=document.createElement('span');detail.className='signal-detail';
   detail.textContent='RECORDED '+labelTime(e.time)+' · PUBLIC GITHUB';
   a.append(meta,title,detail);node.append(a);
 }
 if(!state.events.length){
   const p=document.createElement('p');p.className='empty';
   p.textContent='GitHub evidence could not be verified. Check the source directly.';
   node.append(p);
 }
}
async function githubRequest(path){
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),11000);
 try{
   const res=await fetch(API+path,{headers:{Accept:'application/vnd.github+json'},cache:'no-store',credentials:'omit',signal:ctrl.signal});
   if(!res.ok)throw Error('Public source returned '+res.status);
   return await res.json();
 }finally{clearTimeout(timer)}
}
async function refreshGithub(){
 if(state.githubBusy)return;
 state.githubBusy=true;$('githubStatus').textContent='CHECKING PUBLIC SOURCE';
 const paths=['/pulls?state=all&sort=updated&direction=desc&per_page=35','/actions/runs?per_page=40','/commits?per_page=35'];
 const settled=await Promise.allSettled(paths.map(githubRequest));
 const raw={pulls:[],runs:[],commits:[]};let good=0;
 for(let i=0;i<settled.length;i++){
   const x=settled[i];
   if(x.status!=='fulfilled')continue;
   const data=i===1?x.value.workflow_runs:x.value;
   if(Array.isArray(data)){raw[['pulls','runs','commits'][i]]=data;good++}
 }
 state.githubBusy=false;state.githubChecked=good>0;state.githubPartial=good<3;
 if(good){
   const normalized=normalizePublicActivity(raw);
   state.events=normalized.items.slice(0,20);
   state.current=0;showEvent();renderEventList();
   $('githubStatus').textContent=good===3?'PUBLIC RECORD · '+state.events.length+' EVENTS':'PARTIAL PUBLIC RECORD';
 }else{
   state.events=[];renderEventList();showEvent();
   $('githubStatus').textContent='SOURCE UNAVAILABLE';
 }
 renderFooter();
}
function eventTicker(){
 if(!state.events.length)return;
 const elapsed=Date.now()-state.eventStart;
 if(elapsed>=EVENT_MS){state.current=(state.current+1)%state.events.length;showEvent()}
 const progress=Math.min(100,100*(Date.now()-state.eventStart)/EVENT_MS)+'%';
 $('eventProgress').style.width=progress;
 $('portraitProofProgress').style.width=progress;
 $('heroProgress').style.width=progress;
}
function setBroadcastView(active){
 document.body.classList.toggle('portrait',active);
 $('portraitBtn').setAttribute('aria-pressed',String(active));
 $('portraitBtn').querySelector('span:last-child').textContent=active?'EXIT LIVE VIEW':'9:16 LIVE VIEW';
 $('portraitBtn').setAttribute('aria-label',active?'Exit broadcast view':'Open 9:16 broadcast view');
}
$('portraitBtn').addEventListener('click',()=>setBroadcastView(!document.body.classList.contains('portrait')));
// Direct, shareable streaming layout. Changes presentation only, never pulse state.
if(new URLSearchParams(window.location.search).get('view')==='live')setBroadcastView(true);
$('filmBtn').addEventListener('click',async()=>{
 try{
   if(document.fullscreenElement)await document.exitFullscreen();
   else await $('shell').requestFullscreen();
 }catch{$('filmBtn').textContent='FULLSCREEN UNAVAILABLE'}
});
document.addEventListener('fullscreenchange',()=>{
 const active=Boolean(document.fullscreenElement);
 $('filmBtn').setAttribute('aria-pressed',String(active));
 $('filmBtn').textContent=active?'EXIT FULL SCREEN':'FULL SCREEN ⛶';
});
$('reloadBtn').addEventListener('click',()=>{void refreshPulse();void refreshGithub()});
$('refreshStage').addEventListener('click',()=>{void refreshPulse();void refreshGithub()});
renderPulse();renderFooter();
void refreshPulse();void refreshGithub();
setInterval(renderPulse,1000);
setInterval(eventTicker,250);
setInterval(refreshPulse,PULSE_POLL_MS);
setInterval(refreshGithub,GITHUB_POLL_MS);
