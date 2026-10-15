// Mirrored implementation from Evercraft Wildlife Atlas. Release candidate only; keep identical to src/lib/migrationTimeline.js.
/**
 * Privacy-first wildlife telemetry parser.
 * Parsing happens in the user's browser. Do not persist fixes, transmit them,
 * or interpret coarse species migration summaries as animal GPS observations.
 */
const latitudeKeys = ['latitude','lat','location_lat','location_latitude'];
const longitudeKeys = ['longitude','lon','lng','long','location_long','location_longitude'];
const timeKeys = ['timestamp','time','datetime','date_time','event_timestamp','timestamp_iso'];
const animalKeys = ['animal_id','individual_id','tag_id','animal','individual'];
const norm = key => String(key || '').trim().replace(/\uFEFF/g,'').toLowerCase().replace(/[\s-]+/g,'_');
const find = (record,keys) => {
  const entries=Object.entries(record);
  return entries.find(([name])=>keys.includes(norm(name)))?.[1];
};
function csvRows(input){
  const lines=[]; let cells=[],value='',quoted=false;
  for(let i=0;i<input.length;i++){
    const c=input[i];
    if(c==='"' && quoted && input[i+1]==='"'){value+='"';i++;continue;}
    if(c==='"'){quoted=!quoted;continue;}
    if(!quoted && c===','){cells.push(value);value='';continue;}
    if(!quoted && (c==='\n'||c==='\r')){
      if(c==='\r' && input[i+1]==='\n')i++;
      cells.push(value);value='';
      if(cells.some(x=>x.trim()))lines.push(cells);
      cells=[];continue;
    }
    value+=c;
  }
  if(quoted)throw new Error('CSV has an unclosed quoted field.');
  cells.push(value);
  if(cells.some(x=>x.trim()))lines.push(cells);
  if(lines.length<2)throw new Error('CSV needs a header and at least one observation.');
  const headers=lines.shift().map(norm);
  return lines.map(values=>Object.fromEntries(headers.map((key,i)=>[key,values[i]??''])));
}
function normalizeObservation(record){
  const latRaw=find(record,latitudeKeys),lonRaw=find(record,longitudeKeys),timeRaw=find(record,timeKeys);
  if(latRaw==null||lonRaw==null||timeRaw==null)return null;
  if(String(latRaw).trim()===''||String(lonRaw).trim()===''||String(timeRaw).trim()==='')return null;
  const lat=Number(latRaw),lon=Number(lonRaw),at=Date.parse(String(timeRaw));
  if(!Number.isFinite(lat)||!Number.isFinite(lon)||lat< -90||lat>90||lon< -180||lon>180||!Number.isFinite(at))return null;
  return {lat,lon,at,animal:String(find(record,animalKeys)||'Unspecified animal').trim()||'Unspecified animal'};
}
function normalize(records){
  if(records.length>50000)throw new Error('Limit input to 50,000 records. Split larger research exports first.');
  const points=records.map(normalizeObservation).filter(Boolean).sort((a,b)=>a.at-b.at);
  const seen=new Set();
  const deduped=points.filter(p=>{
    const key=[p.animal,p.at,p.lat,p.lon].join('|');
    if(seen.has(key))return false;seen.add(key);return true;
  });
  if(deduped.length<2)throw new Error('At least two valid dated GPS observations are required. Expected: timestamp, latitude, longitude.');
  return {points:deduped,accepted:deduped.length,rejected:records.length-deduped.length};
}
export function parseMigrationCSV(csv){return normalize(csvRows(csv));}
export function parseMigrationGeoJSON(value){
  const obj=typeof value==='string'?JSON.parse(value):value;
  if(obj?.type!=='FeatureCollection'||!Array.isArray(obj.features))throw new Error('Expected a GeoJSON FeatureCollection of dated Point features.');
  const records=obj.features.map(f=>({
    ...f.properties,
    latitude:f?.geometry?.type==='Point'?f.geometry.coordinates?.[1]:null,
    longitude:f?.geometry?.type==='Point'?f.geometry.coordinates?.[0]:null
  }));
  return normalize(records);
}
export function segmentKm(a,b){
  const R=6371,rad=x=>x*Math.PI/180;
  const dLat=rad(b.lat-a.lat),dLon=rad(b.lon-a.lon);
  const h=Math.sin(dLat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.min(1,Math.sqrt(h)));
}
export const MAX_OBSERVATION_GAP_MS=7*86400000;

/** Linear-time summary. Coordinates are sampled fixes, not a measured flight path. */
export function telemetrySummary(points){
  if(!points.length)return null;
  let distanceKm=0,gapCount=0;
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i];
    if(a.animal!==b.animal)continue;
    distanceKm+=segmentKm(a,b);
    if(b.at-a.at>MAX_OBSERVATION_GAP_MS)gapCount++;
  }
  return {distanceKm,days:(points[points.length-1].at-points[0].at)/86400000,gapCount,count:points.length};
}
/** Rendering-only downsampling; preserve full dataset for scientific statistics. */
export function sampleForMap(points,max=1000){
  if(!Number.isInteger(max)||max<2)throw new Error('Map sample size must be at least two.');
  if(points.length<=max)return points;
  return Array.from({length:max},(_,i)=>points[Math.round(i*(points.length-1)/(max-1))]);
}