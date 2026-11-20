/* Leiland / Evercraft. Visualization is an architectural illustration, never a raw model activation trace. */
import {projectLeilandPulse} from './pulse-bridge.mjs';
import {createNeuralUniverse,REGIONS} from './neural-universe.mjs';
const $=id=>document.getElementById(id);
const systems={
 systemia:{label:'COORDINATION / MISSION CONTROL',name:'Systemia',description:'Systemia coordinates missions, boundaries, and evidence. It distinguishes proposed work from authorized, completed, and verified work.',url:'https://github.com/jgaethle10/forge-operator/tree/main/systemia'},
 raven:{label:'OWNED INTELLIGENCE / INFERENCE',name:'Raven Nexus',description:'Raven orchestrates private model work and team reviews behind an inference gateway. Raw prompts, responses, and credentials stay private.',url:'https://github.com/jgaethle10/forge-operator/tree/main/systemia/raven'},
 saban:{label:'DISTRIBUTED WORK / ROUTING',name:'Saban',description:'Saban explores how owned workers and resources can be discovered, coordinated, and used for bounded tasks with clear authority.',url:'https://github.com/jgaethle10/forge-operator/tree/main/systemia/saban'},
 compute:{label:'SOVEREIGN CAPACITY / RESILIENCE',name:'Evercraft Compute',description:'Evercraft Compute is the planned owned capacity layer, carrying work on controlled machines with receipts rather than claiming cloud resources it cannot prove.',url:'https://github.com/jgaethle10/forge-operator/tree/main/systemia/compute'},
 passport:{label:'SAFETY / AUTHORIZATION',name:'Passport',description:'Passport defines who may perform which actions. An attractive public observatory must never become a path to internal controls.',url:'https://github.com/jgaethle10/forge-operator/tree/main/systemia/passport'}
};
let selected='systemia', sourceEvents=[], developmentEvents=[], sourceFresh=false;
let lastAttestedCycle=null, universe=null;
// The gentle architecture tour is a visual presentation, never a machine pulse.
// Manual exploration keeps the selected region in view for 90 seconds.
const scenicSequence=Object.freeze(['systemia','raven','compute','passport','saban']);
let scenicIndex=0,manualHoldUntil=0;
function chooseRegion(region,manual=false){
 if(manual){
  manualHoldUntil=Date.now()+90000;
  scenicIndex=Math.max(0,scenicSequence.indexOf(region));
 }
 $('system-detail').setAttribute('aria-live',manual?'polite':'off');
 if(!REGIONS.includes(region))return;
 selected=region;
 for(const button of document.querySelectorAll('[data-system],[data-region]')){
  const active=(button.dataset.system||button.dataset.region)===region;
  button.classList.toggle('selected',active);
  button.setAttribute('aria-pressed',String(active));
 }
 const system=systems[region];
 $('system-label').textContent=system.label;
 $('system-name').textContent=system.name;
 $('system-description').textContent=system.description;
 $('system-evidence').href=system.url;
 $('current-region').textContent=system.name.toUpperCase();
 universe?.setFocus(region);
}
for(const button of document.querySelectorAll('[data-system],[data-region]')){
 button.addEventListener('click',()=>chooseRegion(button.dataset.system||button.dataset.region,true));
}
const broadcast=$('broadcast');
function setBroadcast(enabled){
 document.body.classList.toggle('broadcast',enabled);
 broadcast.setAttribute('aria-pressed',String(enabled));
 const old=$('broadcast-exit');if(old)old.remove();
 if(enabled){
  const exit=document.createElement('button');exit.type='button';exit.id='broadcast-exit';exit.className='broadcast-exit';exit.textContent='Exit broadcast view ×';
  exit.addEventListener('click',()=>setBroadcast(false));document.body.append(exit);
 }
 universe?.resize();
}
broadcast.addEventListener('click',()=>setBroadcast(!document.body.classList.contains('broadcast')));
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.body.classList.contains('broadcast'))setBroadcast(false)});
const safeTime=value=>{
 if(typeof value!=='string')return null;
 const time=Date.parse(value);
 if(!Number.isFinite(time)||time>Date.now()+120000||time<Date.now()-365*86400000)return null;
 return time;
};
const label=(value,length=125)=>typeof value==='string'?value.replace(/[\u0000-\u001f<>]/g,' ').trim().slice(0,length):'';
const receiptLink=value=>{
 try{const u=new URL(value);if(u.protocol!=='https:')return null;
  if(u.hostname==='github.com' && u.pathname.startsWith('/jgaethle10/forge-operator/'))return u.href;
  if(u.hostname==='jgaethle10.github.io' && u.pathname.startsWith('/forge-operator/'))return u.href;
 }catch{}return null;
};
const hasFreshReceiptSignal=(signal,published,now=Date.now())=>{
 const observed=safeTime(signal?.observed_at);
 return !!(observed && published && observed<=published+120000 && now-observed<=7*60000 &&
   signal?.state==='observed' && receiptLink(signal?.receipt_url));
};
function formatTime(t){return new Date(t).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});}
function relativeTime(t){
 if(!t)return 'Unavailable';
 const mins=Math.max(0,Math.floor((Date.now()-t)/60000));
 if(mins<1)return 'Less than 1 minute ago';if(mins<60)return mins+' min ago';
 const hrs=Math.floor(mins/60);if(hrs<48)return hrs+' hr ago';
 return Math.floor(hrs/24)+' days ago';
}
function makeEvent(e){
 const li=document.createElement('li');
 const kind=document.createElement('span');kind.className='event-kind';kind.textContent=e.kind;
 const title=document.createElement('strong');title.textContent=e.title;
 const when=document.createElement('small');when.textContent=formatTime(e.at);
 li.append(kind,title,when);
 if(e.url){const a=document.createElement('a');a.href=e.url;a.target='_blank';a.rel='noopener noreferrer';a.textContent='View public source ↗';li.append(a);}
 return li;
}
function renderEvents(){
 const items=[...sourceEvents,...developmentEvents].sort((a,b)=>b.at-a.at).slice(0,6);
 const list=$('event-list');list.replaceChildren();
 if(!items.length){
  const li=document.createElement('li');li.className='event-empty';li.textContent='No public activity receipts are available yet. The animation is illustrative, not proof of active inference.';list.append(li);return;
 }
 for(const e of items)list.append(makeEvent(e));
}
async function loadFeed(){
 try{
  const response=await fetch('./feed.json?view='+Date.now(),{cache:'no-store',credentials:'omit'});
  if(!response.ok)throw Error('public_feed_unavailable');
  const raw=await response.text();if(raw.length>80000)throw Error('public_feed_oversize');
  const feed=JSON.parse(raw);
  if(!feed||feed.schema!=='evercraft.leiland.public-feed.v1')throw Error('public_feed_schema');
  const published=safeTime(feed.published_at);
  const fresh=!!(published && Date.now()-published<=10*60000 && feed.status==='publisher_reported');
  const signals=feed.signals&&typeof feed.signals==='object'?feed.signals:{};
  sourceFresh=fresh;
  $('status-lamp').className='lamp'+(fresh?' live':published?' stale':'');
  $('feed-status').textContent=fresh?'Current public publisher report':published?'Public report stale':'Public activity feed not connected';
  $('source-state').textContent=fresh?'Publisher-reported':published?'Stale / unverified':'Not connected';
  $('source-caption').textContent=fresh?'Source-reported activity, not independent access to private model state.':'Motion is illustrative until a fresh approved public report exists.';
  $('observation-age').textContent=relativeTime(published);
  $('last-observed').textContent=published?'Last publisher report: '+formatTime(published):'No verified live observation';
  $('inference-state').textContent=fresh&&hasFreshReceiptSignal(signals.inference,published)?'Source-reported activity':'Unverified';
  $('mission-state').textContent=fresh&&hasFreshReceiptSignal(signals.missions,published)?'Source-reported activity':'Unverified';
  sourceEvents=[];
  if(fresh && Array.isArray(feed.events)){
   for(const item of feed.events.slice(0,12)){
    const at=safeTime(item?.at),url=receiptLink(item?.receipt_url),title=label(item?.title,105);
    if(at && at<=published+120000 && url && title.length>5){
     sourceEvents.push({at,url,title,kind:'PUBLISHER-REPORTED / PUBLIC RECEIPT'});
    }
   }
  }
 }catch{
  sourceFresh=false;sourceEvents=[];
  $('status-lamp').className='lamp';$('feed-status').textContent='Public activity feed unavailable';
  $('source-state').textContent='Unavailable';$('observation-age').textContent='Unavailable';
  $('inference-state').textContent='Unverified';$('mission-state').textContent='Unverified';
  $('last-observed').textContent='No verified live observation';
  $('source-caption').textContent='Feed failed closed. Visual motion is conceptual only.';
 }
 $('visual-truth').textContent=sourceFresh?'ABSTRACT VISUAL · SOURCE-ALIGNED PUBLIC EVENTS':'CONCEPTUAL ANIMATION · NOT MODEL ACTIVATIONS';
 universe?.setPublicEventCount(sourceFresh?sourceEvents.length:0);
 renderEvents();
}
// Public GitHub development history is separate from private inference activity.
// A GitHub commit proves that public code changed, not that a private model is running.
async function loadPublicDevelopment(){
 try{
  const url='https://api.github.com/repos/jgaethle10/forge-operator/commits?path=systemia%2Fraven&per_page=4';
  const response=await fetch(url,{credentials:'omit',headers:{'Accept':'application/vnd.github+json'}});
  if(!response.ok)throw Error('github_not_available');
  const data=await response.json();if(!Array.isArray(data))throw Error('bad_response');
  developmentEvents=data.slice(0,4).map(item=>{
   const at=safeTime(item?.commit?.committer?.date),url=receiptLink(item?.html_url),title=label(item?.commit?.message?.split('\n')[0],100);
   return at&&url&&title?{at,url,title,kind:'PUBLIC GITHUB CODE HISTORY'}:null;
  }).filter(Boolean);
 }catch{developmentEvents=[]}
 renderEvents();
}
async function loadKaidancePulse(){
 try{
  const response=await fetch('../kaidance/pulse.json?view='+Date.now(),{cache:'no-store',credentials:'omit'});
  if(!response.ok)throw Error('public_pulse_unavailable');
  const raw=await response.text();if(raw.length>16000)throw Error('public_pulse_oversize');
  const pulse=projectLeilandPulse(JSON.parse(raw),Date.now());
  const attested=pulse.state==='source_attested';
  if(attested&&lastAttestedCycle!==null&&pulse.cycle_number>lastAttestedCycle){
    universe?.acknowledgeCycle();
  }
  if(attested&&(lastAttestedCycle===null||pulse.cycle_number>=lastAttestedCycle))lastAttestedCycle=pulse.cycle_number;
  $('collider-state').textContent=attested?'Field-attested public pulse':pulse.state==='stale'?'Heartbeat stale':pulse.state==='unverified'?'Attestation pending':'Not connected';
  $('collider-note').textContent=attested?'A source-attested Collider cycle was reported, not private AI inference.':pulse.state==='stale'?'The public cycle evidence is too old to count as active.':'A private model is not inferred from public development events.';
  $('heartbeat-cycle').textContent=pulse.cycle_number===null?'KAIDANCE cycle: unknown':'KAIDANCE cycle: '+pulse.cycle_number+' · '+pulse.state.replaceAll('_',' ');
 }catch{
  $('collider-state').textContent='Not connected';
  $('collider-note').textContent='The approved KAIDANCE public pulse could not be read. No heartbeat is inferred.';
  $('heartbeat-cycle').textContent='KAIDANCE cycle: unavailable';
 }
}
loadFeed();loadPublicDevelopment();loadKaidancePulse();
setInterval(loadKaidancePulse,20000);
setInterval(loadFeed,30000);
setInterval(loadPublicDevelopment,600000);
setInterval(()=>{const at=$('observation-age');if(sourceFresh||at.textContent.includes('ago'))loadFeed()},60000);
// Visual depth and ambient paths are synthetic. Only the existing source-attested
// cycle gate above may request a short, separately identified acknowledgement.
const reduce=window.matchMedia('(prefers-reduced-motion: reduce)');
universe=createNeuralUniverse({
 canvas:$('brain-canvas'),
 stage:$('brain-stage'),
 reduce,
 initialFocus:selected
});
chooseRegion(selected);
// Ambient tours progress independently from, and never assert, operational
// source events. Do not override manual choices, reduced motion, or hidden tabs.
setInterval(()=>{
 if(document.hidden||reduce.matches||Date.now()<manualHoldUntil)return;
 scenicIndex=(scenicIndex+1)%scenicSequence.length;
 chooseRegion(scenicSequence[scenicIndex]);
},18000);
// A direct, shareable portrait-only link for a broadcast capture device.
// The opt-in query flag changes presentation, not publisher trust or data.
if(new URLSearchParams(window.location.search).get('view')==='live')setBroadcast(true);
