// Original NOAA source points only. DO NOT interpolate, certify, georegister, or invent geometry.
const $=id=>document.getElementById(id);
const EXPECTED_SHA='b83df8dd9ae8ebeee7e23c5b1d8a2550b192137bbe7f1e394e551ee4124dda61';
const EXPECTED_SCHEMA='evercraft.subsea.raw_track_preview_5s.v1';
const positionCanvas=$('position-plot'),depthCanvas=$('depth-plot');
let samples=[],selected=0;

const fmt=(x,n)=>x===null?'Not recorded':Number(x).toFixed(n);
const bounds=(points,key)=>{
 const values=points.map(p=>p[key]).filter(Number.isFinite);
 if(!values.length)return [-1,1];
 const low=Math.min(...values),high=Math.max(...values);
 const pad=Math.max((high-low)*.08,Math.abs(high)*1e-10,1e-9);
 return [low-pad,high+pad];
};
function prepareCanvas(canvas){
 const w=Math.max(220,canvas.clientWidth),h=Math.max(130,canvas.clientHeight),dpr=Math.min(2,devicePixelRatio||1);
 canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
 const c=canvas.getContext('2d');
 if(!c)throw Error('Canvas 2D drawing not supported by this browser.');
 c.setTransform(dpr,0,0,dpr,0,0);
 c.fillStyle='#09202c';c.fillRect(0,0,w,h);
 return {c,w,h};
}
function axes(c,w,h,labelLeft,labelRight){
 const l=48,r=w-14,t=17,b=h-30;
 c.strokeStyle='#29505d';c.lineWidth=1;
 c.beginPath();c.moveTo(l,t);c.lineTo(l,b);c.lineTo(r,b);c.stroke();
 c.fillStyle='#adcdd1';c.font='10px system-ui';
 c.fillText(labelLeft,l,b+18);c.textAlign='right';c.fillText(labelRight,r,b+18);c.textAlign='left';
 return {l,r,t,b};
}
function renderPosition(){
 const {c,w,h}=prepareCanvas(positionCanvas);
 if(!samples.length)return;
 const box=axes(c,w,h,'W ← source longitude','E →');
 const [latMin,latMax]=bounds(samples,'lat');
 const [lonMin,lonMax]=bounds(samples,'lon');
 const map=p=>[
  box.l+(p.lon-lonMin)/(lonMax-lonMin)*(box.r-box.l),
  box.b-(p.lat-latMin)/(latMax-latMin)*(box.b-box.t)
 ];
 c.fillStyle='#bcd6d8';c.font='10px system-ui';
 c.fillText('N ↑',box.l+5,box.t+10);
 c.fillText('Latitude  '+latMax.toFixed(6)+'°',box.l+40,box.t+10);
 for(const p of samples){
  if(!Number.isFinite(p.lat)||!Number.isFinite(p.lon))continue;
  const [x,y]=map(p);
  // One dot per observed source sample. NEVER draw line segments between fixes.
  c.beginPath();c.arc(x,y,p.i===selected?5.5:2.8,0,Math.PI*2);
  c.fillStyle=p.i===selected?'#f6d49a':'#8cdace';
  c.fill();
 }
}
function renderDepth(){
 const {c,w,h}=prepareCanvas(depthCanvas);
 if(!samples.length)return;
 const box=axes(c,w,h,'18:30:00 UTC','+299s');
 const [min,max]=bounds(samples,'depth');
 for(const p of samples){
  if(!Number.isFinite(p.depth))continue;
  const x=box.l+p.t/299*(box.r-box.l);
  const y=box.b-(p.depth-min)/(max-min)*(box.b-box.t);
  c.beginPath();c.arc(x,y,p.i===selected?5:2.3,0,Math.PI*2);
  c.fillStyle=p.i===selected?'#f6d49a':'#8cdace';c.fill();
 }
 c.fillStyle='#bcd6d8';c.font='10px system-ui';
 c.fillText('Raw '+max.toFixed(1),box.l+6,box.t+10);
 c.fillText('Raw '+min.toFixed(1),box.l+6,box.b-7);
}
function show(){
 if(!samples.length)return;
 const p=samples[selected];
 $('observation').value=String(selected);
 $('readout-time').textContent='18:'+String(30+Math.floor(p.t/60)).padStart(2,'0')+':'+String(p.t%60).padStart(2,'0')+' UTC';
 $('readout-depth').textContent=fmt(p.depth,3)+' (raw)';
 $('readout-lat').textContent=p.lat===null?'Not recorded':fmt(p.lat,9)+'°';
 $('readout-lon').textContent=p.lon===null?'Not recorded':fmt(p.lon,9)+'°';
 $('sample-info').textContent='Observation '+(selected+1)+' of '+samples.length+' · elapsed second '+p.t+' · source fields only, no interpolation';
 $('prev').disabled=selected===0;
 $('next').disabled=selected===samples.length-1;
 renderPosition();renderDepth();
}
function validate(raw){
 if(raw.schema!==EXPECTED_SCHEMA||raw.source_archive_sha256!==EXPECTED_SHA)throw Error('Unexpected dataset or source hash.');
 if(raw.status!=='PROVISIONAL_ROUNDED_DOWNSAMPLED_OBSERVATIONS')throw Error('Missing provisional evidence status.');
 if(raw.original_window_count!==300||raw.preview_sample_count!==61||raw.points?.length!==61)throw Error('Missing expected 300-second source window.');
 if(raw.positioning_quality!=='UNVERIFIED'||raw.site_geometry!=='NONE'||raw.safety!=='NOT_FOR_NAVIGATION_OR_DIVE_CLEARANCE')
  throw Error('Source dataset lacks mandatory safety labels.');
 return raw.points.map((row,i)=>{
  if(!Array.isArray(row)||row.length!==4)throw Error('Malformed source observation.');
  const [t,lat,lon,depth]=row;
  if(!Number.isInteger(t)||t!==(i===60?299:i*5))throw Error('Missing or reordered sample.');
  if((lat!==null&&(!Number.isFinite(lat)||Math.abs(lat)>90))||
     (lon!==null&&(!Number.isFinite(lon)||Math.abs(lon)>180))||
     (depth!==null&&!Number.isFinite(depth)))throw Error('Invalid numeric evidence.');
  if((lat===null)!==(lon===null))throw Error('Partial source position cannot be plotted.');
  return {i,t,lat,lon,depth};
 });
}
async function load(){
 try{
  const res=await fetch('./sample-5s.json',{cache:'no-store'});
  if(!res.ok)throw Error('HTTP '+res.status);
  const data=await res.json();samples=validate(data);
  $('hash-value').textContent=EXPECTED_SHA;
  $('observation').max=String(samples.length-1);
  $('observation').disabled=false;
  $('load-state').textContent='Authenticated source archive · display values rounded · no site model or certified positions';
  document.documentElement.dataset.noaaTrack='source-observations-loaded';
  show();
 }catch(error){
  $('load-state').textContent='Evidence preview unavailable: '+error.message;
  document.documentElement.dataset.noaaTrack='source-load-failed';
 }
}
$('observation').addEventListener('input',e=>{selected=Number(e.target.value);show();});
$('prev').addEventListener('click',()=>{selected=Math.max(0,selected-1);show();});
$('next').addEventListener('click',()=>{selected=Math.min(samples.length-1,selected+1);show();});
window.addEventListener('resize',()=>{if(samples.length){renderPosition();renderDepth();}});
load();