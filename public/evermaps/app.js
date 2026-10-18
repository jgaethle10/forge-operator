// EverMaps RC001. First-party source code and source API. No legacy platform, SDK,
// auth, virtual geofences or rewards. OSM map tiles are third-party cartography;
// this is a preview, not an approved production tile-service contract.
const map=document.querySelector('#em-map');
const tilesHost=document.querySelector('#em-tiles');
const fallbackSvg=document.querySelector('#em-fallback');
const markersHost=document.querySelector('#em-markers');
const sourceEl=document.querySelector('#em-source');
const listEl=document.querySelector('#em-list');
const countEl=document.querySelector('#em-count');
const groupEl=document.querySelector('#em-groups');
const fetchedEl=document.querySelector('#em-fetched');
const layerInput=document.querySelector('#em-layer-toggle');
const TILE=256,MIN_ZOOM=4,MAX_ZOOM=12;
const FALLBACK={lat:46.6021,lon:-120.5059,zoom:5};
const state={...FALLBACK,showReports:true,records:[],sourceState:'loading',selectedId:null,lastFetch:0,fetching:false};
const tileNodes=new Map();
const SVG_NS='http://www.w3.org/2000/svg';
let landPolygons=[];
let cachedLandZoom=null;
let cachedProjectedLand=[];
const geoCities=[['Seattle',47.6062,-122.3321],['Vancouver',49.2827,-123.1207],['Yakima',46.6021,-120.5059],['Portland',45.5152,-122.6784],['Spokane',47.6588,-117.426],['Boise',43.615,-116.202]];
const n=(value)=>typeof value==='number'&&Number.isFinite(value);
const clamp=(x,min,max)=>Math.min(max,Math.max(min,x));
const sourceLine=(message,status)=>{
 sourceEl.dataset.state=status;
 sourceEl.lastElementChild.textContent=message;
};
const fmtDate=(v)=>{
 const t=Date.parse(v);
 return Number.isFinite(t)?new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZone:'America/Los_Angeles',timeZoneName:'short'}).format(new Date(t)):'Source time unavailable';
};
function mercator(lat,lon,zoom){
 const projected=clamp(lat,-85.051128,85.051128)*Math.PI/180;
 const span=TILE*2**zoom;
 return {x:(lon+180)/360*span,y:(1-Math.asinh(Math.tan(projected))/Math.PI)/2*span};
}
function coordinates(x,y,zoom){
 const span=TILE*2**zoom;
 const lon=x/span*360-180;
 const lat=Math.atan(Math.sinh(Math.PI*(1-2*y/span)))*180/Math.PI;
 return {lat:clamp(lat,-85,85),lon:((lon+180)%360+360)%360-180};
}
function showZoom(){
 document.querySelector('#em-zoom-label').textContent='Zoom '+state.zoom;
}
function updateTileCoverage(){
 let needed=0,loaded=0;
 const w=map.clientWidth,h=map.clientHeight;
 for(const node of tileNodes.values()){
  const x=parseFloat(node.style.left),y=parseFloat(node.style.top);
  if(!Number.isFinite(x)||!Number.isFinite(y)||x+TILE<=0||y+TILE<=0||x>=w||y>=h)continue;
  needed++;
  if(node.complete&&node.naturalWidth>0)loaded++;
 }
 const coverage=needed?loaded/needed:0;
 const rasterReady=needed>=2&&coverage>=0.9;
 tilesHost.style.opacity=rasterReady?'1':'0';
 tilesHost.dataset.coverage=coverage.toFixed(2);
 tilesHost.dataset.state=rasterReady?'raster-ready':'geography-fallback';
}
function renderFallback(){
 const w=map.clientWidth,h=map.clientHeight;
 if(!w||!h)return;
 fallbackSvg.setAttribute('viewBox',`0 0 ${w} ${h}`);
 if(!landPolygons.length)return;
 const center=mercator(state.lat,state.lon,state.zoom);
 const xy=(lat,lon)=>{const p=mercator(lat,lon,state.zoom);return{x:Math.round((w/2+p.x-center.x)*10)/10,y:Math.round((h/2+p.y-center.y)*10)/10}};
 if(cachedLandZoom!==state.zoom){
  cachedProjectedLand=landPolygons.map(polygon=>polygon.map(ring=>{
   const points=ring.map(([lon,lat])=>mercator(lat,lon,state.zoom));
   const xx=points.map(p=>p.x),yy=points.map(p=>p.y);
   return {points,bounds:{left:Math.min(...xx),right:Math.max(...xx),top:Math.min(...yy),bottom:Math.max(...yy)}};
  }));
  cachedLandZoom=state.zoom;
 }
 const originX=w/2-center.x,originY=h/2-center.y;
 const paths=[];
 for(const polygon of cachedProjectedLand){
  for(const ring of polygon){
   if(ring.points.length<3)continue;
   const b=ring.bounds;
   if(b.right+originX<0||b.left+originX>w||b.bottom+originY<0||b.top+originY>h)continue;
   let d='';
   for(let i=0;i<ring.points.length;i++){
    const p=ring.points[i];
    const x=Math.round((p.x+originX)*10)/10,y=Math.round((p.y+originY)*10)/10;
    d+=(i===0?'M':'L')+x+' '+y;
   }
   paths.push(d+'Z');
  }
 }
 const land=document.createElementNS(SVG_NS,'path');
 land.setAttribute('d',paths.join(''));
 land.setAttribute('fill','#365e52');
 land.setAttribute('stroke','#82a79a');
 land.setAttribute('stroke-width',state.zoom>=9?'1.3':'0.85');
 land.setAttribute('fill-rule','evenodd');
 const fragment=document.createDocumentFragment();
 fragment.append(land);
 for(const [name,lat,lon] of geoCities){
  const p=xy(lat,lon);
  if(p.x<25||p.y<20||p.x>w-85||p.y>h-20)continue;
  const circle=document.createElementNS(SVG_NS,'circle');
  circle.setAttribute('cx',p.x);circle.setAttribute('cy',p.y);circle.setAttribute('r','3');
  circle.setAttribute('fill','#b7d6c3');
  const label=document.createElementNS(SVG_NS,'text');
  label.setAttribute('x',p.x+8);label.setAttribute('y',p.y-4);
  label.textContent=name;
  fragment.append(circle,label);
 }
 fallbackSvg.replaceChildren(fragment);
 fallbackSvg.dataset.source='natural-earth-50m-public-domain';
}
async function loadFallback(){
 try{
  const response=await fetch('/evermaps/pnw-land.geojson',{cache:'force-cache'});
  if(!response.ok)throw Error('Natural Earth local geography HTTP '+response.status);
  const body=await response.json();
  if(body?.metadata?.rights!=='public domain'||!Array.isArray(body.features)||body.features.length<15)
   throw Error('Natural Earth public-domain geography unavailable or malformed');
  landPolygons=body.features.map(f=>f.geometry?.coordinates).filter(Array.isArray);
  cachedLandZoom=null;cachedProjectedLand=[];
  renderFallback();
 }catch{
  fallbackSvg.dataset.source='unavailable';
 }
}
function repaintTiles(){
 const w=map.clientWidth,h=map.clientHeight;
 if(!w||!h)return;
 const center=mercator(state.lat,state.lon,state.zoom);
 const maxTiles=2**state.zoom;
 const left=center.x-w/2,top=center.y-h/2;
 const fromX=Math.floor(left/TILE)-1,toX=Math.floor((left+w)/TILE)+1;
 const fromY=Math.max(0,Math.floor(top/TILE)-1),toY=Math.min(maxTiles-1,Math.floor((top+h)/TILE)+1);
 const used=new Set();
 for(let y=fromY;y<=toY;y++)for(let x=fromX;x<=toX;x++){
  const wrapped=((x%maxTiles)+maxTiles)%maxTiles;
  const key=state.zoom+'/'+wrapped+'/'+y;
  let node=tileNodes.get(key);
  if(!node){
   node=document.createElement('img');
   node.loading='lazy';
   node.alt='';
   node.decoding='async';
   node.addEventListener('load',updateTileCoverage);
   node.addEventListener('error',updateTileCoverage);
   node.src='https://tile.openstreetmap.org/'+key+'.png';
   tileNodes.set(key,node);
   tilesHost.append(node);
  }
  node.style.left=Math.round(x*TILE-left)+'px';
  node.style.top=Math.round(y*TILE-top)+'px';
  used.add(key);
 }
 for(const [key,node] of tileNodes)if(!used.has(key)){node.remove();tileNodes.delete(key)}
 updateTileCoverage();
 showZoom();
}
function projectedPixel(record){
 const rect=map.getBoundingClientRect();
 const center=mercator(state.lat,state.lon,state.zoom);
 const point=mercator(record.latitude,record.longitude,state.zoom);
 return {x:rect.width/2+point.x-center.x,y:rect.height/2+point.y-center.y};
}
function visibleRecords(){
 if(!state.showReports || (state.lastFetch && Date.now()-state.lastFetch>15*60000))return [];
 const now=Date.now();
 return state.records.filter(r=>n(r.latitude)&&n(r.longitude)
  &&Number.isFinite(Date.parse(r.modified_at_utc))
  &&now-Date.parse(r.modified_at_utc)<14*86400000
  &&Date.parse(r.modified_at_utc)-now<15*60000);
}
function cluster(records){
 const w=map.clientWidth,h=map.clientHeight;
 const cells=new Map();
 for(const record of records){
  const point=projectedPixel(record);
  if(point.x < -55||point.x>w+55||point.y < -55||point.y>h+55)continue;
  if(state.zoom>=8){cells.set(record.incident_id,[record]);continue;}
  const key=Math.floor(point.x/76)+':'+Math.floor(point.y/76);
  const items=cells.get(key)||[];
  items.push(record);cells.set(key,items);
 }
 return [...cells.values()];
}
function setCenter(lat,lon,zoom=state.zoom){
 if(!n(lat)||!n(lon))return;
 state.lat=clamp(lat,39,55);
 state.lon=clamp(lon,-133,-110);
 state.zoom=clamp(Math.round(zoom),MIN_ZOOM,MAX_ZOOM);
 renderMap();
}
function setZoom(delta){
 setCenter(state.lat,state.lon,state.zoom+delta);
}
function selectRecord(record){
 state.selectedId=record.incident_id;
 setCenter(record.latitude,record.longitude,Math.max(8,state.zoom));
 renderList();
}
function makeMarker(group){
 const isGroup=group.length>1;
 const point=isGroup?{
  latitude:group.reduce((a,r)=>a+r.latitude,0)/group.length,
  longitude:group.reduce((a,r)=>a+r.longitude,0)/group.length
 }:group[0];
 const p=projectedPixel(point);
 const button=document.createElement('button');
 button.type='button';
 button.className='em-marker';
 button.dataset.group=String(isGroup);
 button.textContent=isGroup?String(group.length):'WF';
 const hint=isGroup?group.length+' reported incident records; zoom in':'Reported incident: '+group[0].name+'; active flames unverified';
 button.title=hint;button.setAttribute('aria-label',hint);
 button.style.left=p.x+'px';button.style.top=p.y+'px';
 button.addEventListener('click',(event)=>{
  event.stopPropagation();
  if(isGroup)setCenter(point.latitude,point.longitude,Math.min(10,state.zoom+2));
  else selectRecord(group[0]);
 });
 return button;
}
function renderMarkers(){
 const groups=cluster(visibleRecords());
 markersHost.replaceChildren(...groups.map(makeMarker));
 groupEl.textContent=state.showReports?String(groups.length):'Off';
}
function renderMap(){repaintTiles();renderFallback();renderMarkers();}
function makeText(tag,className,text){
 const el=document.createElement(tag);el.className=className;el.textContent=text;return el;
}
function renderList(){
 const records=visibleRecords();
 countEl.textContent=state.sourceState==='unavailable'?'—':String(records.length);
 const entries=records.slice(0,25);
 if(!state.showReports){
  listEl.replaceChildren(makeText('p','em-empty','Incident layer is off. No reports are displayed.'));
  return;
 }
 if(!entries.length){
  const message=state.sourceState==='unavailable'?
   'Official source unavailable. Existing observations have been cleared, not presented as live.':
   state.sourceState==='loading'?'Checking the official data source…':
   'No qualifying reports returned for this scope. This does not prove that no fires exist.';
  listEl.replaceChildren(makeText('p','em-empty',message));
  return;
 }
 const nodes=entries.map(record=>{
  const b=document.createElement('button');b.type='button';b.className='em-record';
  b.setAttribute('aria-pressed',String(state.selectedId===record.incident_id));
  b.append(
   makeText('span','em-record-name',record.name||'Unnamed report'),
   makeText('span','em-record-meta',(record.reported_acres==null?'Acreage not supplied':record.reported_acres.toLocaleString()+' reported acres')+
     ' · '+(record.reported_containment_percent==null?'Containment not reported':record.reported_containment_percent+'% reported containment')),
   makeText('span','em-record-time','Source updated '+fmtDate(record.modified_at_utc)+' · flames unverified')
  );
  b.addEventListener('click',()=>selectRecord(record));
  return b;
 });
 if(records.length>entries.length)nodes.push(makeText('p','em-empty','Showing first '+entries.length+' source records. Map displays all qualifying records in view.'));
 listEl.replaceChildren(...nodes);
}
function clearUnavailable(message){
 state.records=[];
 state.lastFetch=0;
 state.selectedId=null;
 state.sourceState='unavailable';
 sourceLine(message,'unavailable');
 fetchedEl.textContent='Source verification failed';
 renderMap();renderList();
}
async function refresh(){
 if(state.fetching||!state.showReports)return;
 state.fetching=true;
 sourceLine('Checking NIFC source through Evercraft-owned API…','loading');
 state.sourceState='loading';
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),15000);
 try{
  const result=await fetch('/api/evermaps/incidents/pnw',{signal:controller.signal,headers:{Accept:'application/json'},cache:'no-store'});
  if(!result.ok)throw new Error('HTTP '+result.status);
  const json=await result.json();
  if(!state.showReports)return; // Ignore in-flight results after a user disables this layer.
  if(json.schema!=='evercraft.evermaps.incident-observations.v1'||!Array.isArray(json.records)
   ||json.count!==json.records.length||json.records.length>600
   ||json.guarantees?.current_feed_is_burning_confirmation!==false)
   throw new Error('Source response missing required evidence guarantees');
  state.records=json.records.filter(r=>typeof r.incident_id==='string'&&r.incident_id.length>0
   &&typeof r.name==='string'&&n(r.latitude)&&n(r.longitude));
  state.lastFetch=Date.now();
  state.sourceState=state.records.length?'ready':'empty';
  fetchedEl.textContent='Source checked '+fmtDate(json.fetched_at_utc);
  sourceLine(state.records.length?
   state.records.length+' incident reports · none confirms active flames':
   'Source responded with zero qualifying reports; no-fires conclusion prohibited',
   state.records.length?'ready':'empty');
  renderMap();renderList();
 }catch{
  if(state.showReports)clearUnavailable('Official incident source unavailable · nothing shown as current');
 }finally{clearTimeout(timer);state.fetching=false;}
}
let drag=null;
map.addEventListener('pointerdown',(event)=>{
 if(event.button!==0||event.target.closest('button,a'))return;
 drag={x:event.clientX,y:event.clientY,center:mercator(state.lat,state.lon,state.zoom)};
 map.setPointerCapture(event.pointerId);
});
map.addEventListener('pointermove',(event)=>{
 if(!drag)return;
 const moveX=event.clientX-drag.x,moveY=event.clientY-drag.y;
 const next=coordinates(drag.center.x-moveX,drag.center.y-moveY,state.zoom);
 state.lat=clamp(next.lat,39,55);state.lon=clamp(next.lon,-133,-110);
 renderMap();
});
function endDrag(){drag=null}
map.addEventListener('pointerup',endDrag);
map.addEventListener('pointercancel',endDrag);
map.addEventListener('lostpointercapture',endDrag);
map.addEventListener('wheel',(event)=>{event.preventDefault();setZoom(event.deltaY>0?-1:1)},{passive:false});
map.addEventListener('keydown',(event)=>{
 const delta=event.key==='ArrowLeft'?[0,-.7]:event.key==='ArrowRight'?[0,.7]:
  event.key==='ArrowUp'?[.7,0]:event.key==='ArrowDown'?[-.7,0]:null;
 if(!delta)return;
 event.preventDefault();
 setCenter(state.lat+delta[0]/(2**(state.zoom-4)),state.lon+delta[1]/(2**(state.zoom-4)));
});
map.tabIndex=0;
document.querySelector('#em-increase').addEventListener('click',()=>setZoom(1));
document.querySelector('#em-decrease').addEventListener('click',()=>setZoom(-1));
document.querySelector('#em-home-button').addEventListener('click',()=>setCenter(FALLBACK.lat,FALLBACK.lon,FALLBACK.zoom));
document.querySelector('#em-refresh').addEventListener('click',refresh);
layerInput.addEventListener('change',()=>{
 state.showReports=layerInput.checked;
 if(state.showReports)refresh();
 else{state.records=[];state.sourceState='idle';state.selectedId=null;sourceLine('Incident layer off · no reports fetched','idle');fetchedEl.textContent='Layer disabled';}
 renderMap();renderList();
});
const sizeObserver=new ResizeObserver(renderMap);
sizeObserver.observe(map);
renderMap();renderList();
loadFallback();
refresh();
setInterval(()=>{
 if(!document.hidden&&state.showReports){
  if(Date.now()-state.lastFetch>=15*60000)refresh();
  else{renderMarkers();renderList()}
 }
},60000);
