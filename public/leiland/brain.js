/* Leiland / Evercraft. Visualization is an architectural illustration, never a raw model activation trace. */
'use strict';
const $=id=>document.getElementById(id);
const systems={
 systemia:{label:'COORDINATION / MISSION CONTROL',name:'Systemia',description:'Systemia coordinates missions, boundaries, and evidence. It distinguishes proposed work from authorized, completed, and verified work.',url:'https://github.com/jgaethle10/forge-operator/tree/main/systemia'},
 raven:{label:'OWNED INTELLIGENCE / INFERENCE',name:'Raven Nexus',description:'Raven orchestrates private model work and team reviews behind an inference gateway. Raw prompts, responses, and credentials stay private.',url:'https://github.com/jgaethle10/forge-operator/tree/main/systemia/raven'},
 saban:{label:'DISTRIBUTED WORK / ROUTING',name:'Saban',description:'Saban explores how owned workers and resources can be discovered, coordinated, and used for bounded tasks with clear authority.',url:'https://github.com/jgaethle10/forge-operator/tree/main/systemia/saban'},
 compute:{label:'SOVEREIGN CAPACITY / RESILIENCE',name:'Evercraft Compute',description:'Evercraft Compute is the planned owned capacity layer, carrying work on controlled machines with receipts rather than claiming cloud resources it cannot prove.',url:'https://github.com/jgaethle10/forge-operator/tree/main/systemia/compute'},
 passport:{label:'SAFETY / AUTHORIZATION',name:'Passport',description:'Passport defines who may perform which actions. An attractive public observatory must never become a path to internal controls.',url:'https://github.com/jgaethle10/forge-operator/tree/main/systemia/passport'}
};
let selected='systemia', sourceEvents=[], developmentEvents=[], sourceFresh=false;
for(const button of document.querySelectorAll('[data-system]')){
 button.addEventListener('click',()=>{
  selected=button.dataset.system;
  for(const b of document.querySelectorAll('[data-system]')){
   const active=b===button;b.classList.toggle('selected',active);b.setAttribute('aria-pressed',String(active));
  }
  const s=systems[selected];
  $('system-label').textContent=s.label;$('system-name').textContent=s.name;$('system-description').textContent=s.description;$('system-evidence').href=s.url;
 });
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
 resize();
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
  $('inference-state').textContent=fresh&&signals.inference?.state==='observed'&&receiptLink(signals.inference?.receipt_url)?'Source-reported activity':'Unverified';
  $('mission-state').textContent=fresh&&signals.missions?.state==='observed'&&receiptLink(signals.missions?.receipt_url)?'Source-reported activity':'Unverified';
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
loadFeed();loadPublicDevelopment();
setInterval(loadFeed,30000);
setInterval(loadPublicDevelopment,600000);
setInterval(()=>{const at=$('observation-age');if(sourceFresh||at.textContent.includes('ago'))loadFeed()},60000);
// Deterministic, abstract visualization of a network. Motion is always illustrative.
// Only the small event flare is keyed to a fresh publisher-reported public event.
const canvas=$('brain-canvas'),ctx=canvas.getContext('2d',{alpha:true});
const reduce=window.matchMedia('(prefers-reduced-motion: reduce)');
let w=800,h=520,dpr=1,frame=0,lastFrame=0,visible=true;
let seed=19092026;
const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
const nodes=[];
for(let i=0;i<208;i++){
 let x,y,tries=0;
 do{x=(rand()*2-1)*1.02;y=(rand()*2-1)*.82;tries++}
 while(tries<200&&!((Math.pow((x+(x<0?.33:-.33))/.78,2)+Math.pow(y/.76,2)<1) && !(Math.abs(x)<.065&&y<-.28)));
 nodes.push({x,y,phase:rand()*6.283,rad:rand()*1.45+.55,side:x<0?0:1});
}
function zone(n){if(n.y<-.16&&Math.abs(n.x)<.36)return 'systemia';if(n.x<-.12&&n.y<.27)return 'raven';if(n.x>=.12&&n.y<.27)return 'saban';return n.x<0?'compute':'passport';}
const links=[];const seen=new Set();
for(let i=0;i<nodes.length;i++){
 const ranked=nodes.map((p,j)=>({j,d:(nodes[i].x-p.x)**2+(nodes[i].y-p.y)**2})).filter(o=>o.j!==i).sort((a,b)=>a.d-b.d).slice(0,3);
 for(const o of ranked){if(o.d>.09)continue;const a=Math.min(i,o.j),b=Math.max(i,o.j),key=a+':'+b;if(!seen.has(key)){seen.add(key);links.push([a,b]);}}
}
function resize(){
 const r=$('brain-stage').getBoundingClientRect();
 w=Math.max(1,r.width);h=Math.max(1,r.height);dpr=Math.min(2,window.devicePixelRatio||1);
 canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);
}
const observer=new ResizeObserver(resize);observer.observe($('brain-stage'));resize();
document.addEventListener('visibilitychange',()=>{visible=!document.hidden;if(visible)requestAnimationFrame(draw)});
function pos(n,t){
 const breathe=reduce.matches?0:Math.sin(t*.00027+n.phase)*.006;
 const size=Math.min(w*.43,h*.52);
 return {x:w/2+(n.x+breathe)*size,y:h/2+n.y*size+Math.sin(t*.00039+n.phase)*size*.007};
}
function draw(t){
 if(!visible)return;
 if(t-lastFrame<26){requestAnimationFrame(draw);return}
 lastFrame=t;ctx.clearRect(0,0,w,h);
 const points=nodes.map(n=>pos(n,t));
 const size=Math.min(w*.43,h*.52);
 const halo=ctx.createRadialGradient(w/2,h/2,10,w/2,h/2,size*1.35);
 halo.addColorStop(0,'rgba(27,94,147,.11)');halo.addColorStop(.6,'rgba(26,91,143,.065)');halo.addColorStop(1,'rgba(0,0,0,0)');
 ctx.fillStyle=halo;ctx.fillRect(0,0,w,h);
 for(let i=0;i<links.length;i++){
  const [a,b]=links[i],p=points[a],q=points[b],left=nodes[a].side===0;
  const focused=zone(nodes[a])===selected||zone(nodes[b])===selected;
  const v=reduce.matches?(focused?.42:.09):focused?.28+.20*(1+Math.sin(t*.001+i*.7))/2:.07;
  ctx.strokeStyle=left?'rgba(102,216,225,'+v+')':'rgba(155,153,254,'+v+')';
  ctx.lineWidth=.75;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.stroke();
  if(!reduce.matches && i%8===0){
   const phase=(t*.00012+i*.037)%1,px=p.x+(q.x-p.x)*phase,py=p.y+(q.y-p.y)*phase;
   ctx.beginPath();ctx.arc(px,py,1.5,0,Math.PI*2);ctx.fillStyle=left?'rgba(100,239,229,.8)':'rgba(177,176,255,.8)';ctx.fill();
  }
 }
 for(let i=0;i<points.length;i++){
  const p=points[i],n=nodes[i];
  const focused=zone(n)===selected;
  const glow=reduce.matches?(focused?.82:.22):focused?.58+.36*(1+Math.sin(t*.0016+n.phase))/2:.16+.10*(1+Math.sin(t*.0016+n.phase))/2;
  ctx.fillStyle=n.side===0?'rgba(125,235,228,'+glow+')':'rgba(170,177,255,'+glow+')';
  ctx.beginPath();ctx.arc(p.x,p.y,n.rad*(focused?1.38:.86),0,Math.PI*2);ctx.fill();
 }
 // Slow perimeter sweep is a purely illustrative broadcast visual.
 if(!reduce.matches){
  const theta=t*.00016,rad=size*.95;
  const xx=w/2+Math.cos(theta)*rad,yy=h/2+Math.sin(theta)*rad*.73;
  const gradient=ctx.createRadialGradient(xx,yy,0,xx,yy,32);
  gradient.addColorStop(0,'rgba(103,241,216,.23)');gradient.addColorStop(1,'rgba(103,241,216,0)');
  ctx.fillStyle=gradient;ctx.beginPath();ctx.arc(xx,yy,32,0,Math.PI*2);ctx.fill();
 }
 if(sourceFresh && sourceEvents.length){
  const index=(Math.floor(t/2800)*37)%nodes.length,p=points[index];
  const radius=reduce.matches?10:9+7*(1+Math.sin(t*.004))/2;
  ctx.strokeStyle='rgba(245,215,164,.8)';ctx.lineWidth=1.7;
  ctx.beginPath();ctx.arc(p.x,p.y,radius,0,Math.PI*2);ctx.stroke();
 }
 frame++;if(!reduce.matches)requestAnimationFrame(draw);
}
requestAnimationFrame(draw);
reduce.addEventListener('change',()=>{resize();requestAnimationFrame(draw)});
