// An evidence-only view of public GitHub Actions. This does not observe private agents.
import {publicUrl, titleSafe} from './work-source.mjs';

export const STATIONS = Object.freeze([
 {key:'research',name:'RESEARCH & MAPS',description:'Research, geospatial and scientific verification',glyph:'◎'},
 {key:'agents',name:'SABAN & COMPUTE',description:'Published agent, node and compute workflows',glyph:'⌘'},
 {key:'creative',name:'CREATIVE STUDIO',description:'Commercial, graphics, audio and video pipelines',glyph:'◈'},
 {key:'commerce',name:'PRODUCT & REVENUE',description:'Commercial-readiness and customer-path verification',glyph:'◇'},
 {key:'infrastructure',name:'NETWORK & SECURITY',description:'Public edge, network and security verification',glyph:'⌁'},
 {key:'quality',name:'BUILD & RELEASE',description:'Build, canary, testing and release workflows',glyph:'⎔'}
]);

const LOOKBACK_MS=36*60*60*1000;
const MAX_ACTIVE_AGE_MS=30*60*1000;
const branchBlock=/\b(?:private|secrets|production-credential)\b/i;
const patterns=[
 ['research',/\b(research|gis|evermaps|hazard|earthquake|volcano|frontier|mapping|map\b|radar|science|watershed|atlas|rockies|daytrade-edge)/i],
 ['agents',/\b(saban|agent|compute|node|organism|kaidance|society|autonomy|federation|local-worker|collider)/i],
 ['creative',/\b(clip|fallen|voice|animation|graphics|laser|studio|media|film|render|commercial|audio|visual-desk)/i],
 ['commerce',/\b(chum|commerce|checkout|buyer|revenue|sale|payment|lead|offer|customer|affiliate|findmypart|forensiscope)/i],
 ['infrastructure',/\b(edge|fabric|network|router|dns|security|sentinel|mcp|remote-operator|public-ingress)/i]
];
export function stationFor(name){
 for(const [station,pattern] of patterns)if(pattern.test(name))return station;
 return 'quality';
}
const parsedTime=value=>{
 const ms=Date.parse(value||'');
 return Number.isFinite(ms)?ms:0;
};
function outcome(row, now, observed){
 const status=String(row?.status||'');
 if(status==='in_progress')return now-observed<=MAX_ACTIVE_AGE_MS?'RUNNING':'UNVERIFIED';
 if(status==='queued'||status==='waiting'||status==='pending')return now-observed<=MAX_ACTIVE_AGE_MS?'QUEUED':'UNVERIFIED';
 if(status!=='completed')return 'UNVERIFIED';
 switch(String(row.conclusion||'')){
  case 'success':return 'PASSED';
  case 'failure':case 'timed_out':case 'startup_failure':return 'FAILED';
  case 'cancelled':return 'CANCELLED';
  default:return 'COMPLETED';
 }
}
export function normalizeFloorRuns(rows, now=Date.now()){
 const sample=Array.isArray(rows)?rows:[];
 const events=[];
 const seen=new Set();
 for(const row of sample){
  const id=Number(row?.id),title=titleSafe(row?.name),url=publicUrl(row?.html_url);
  const created=parsedTime(row?.created_at);
  const updated=parsedTime(row?.updated_at)||created;
  const observed=Math.max(created,updated);
  if(!Number.isSafeInteger(id)||id<=0||seen.has(id)||!title||!url)continue;
  if(branchBlock.test(row?.head_branch||''))continue;
  if(!created||!observed||created>now+300000||observed>now+300000||now-observed>LOOKBACK_MS)continue;
  seen.add(id);
  events.push({
   id, title, url, time:observed, created,
   state:outcome(row,now,observed),
   station:stationFor(title),
   event:String(row.event||'unknown').slice(0,32).replace(/[^a-z_-]/gi,''),
   runNumber:Number.isInteger(row.run_number)?row.run_number:null
  });
 }
 events.sort((a,b)=>b.time-a.time||b.id-a.id);
 const stations=STATIONS.map(s=>{
  const matching=events.filter(x=>x.station===s.key);
  const active=matching.filter(x=>x.state==='RUNNING').length;
  const queued=matching.filter(x=>x.state==='QUEUED').length;
  const latest=matching[0]||null;
  const state=active?'RUNNING':queued?'QUEUED':latest?.state||'NO RECENT RUN';
  return {...s,state,active,queued,latest,recent:matching.slice(0,4),sampleCount:matching.length};
 });
 return {
  schema:'evercraft.live.public-workflow-floor.v1',
  observed_at:new Date(now).toISOString(),
  scope:'RECENT PUBLIC GITHUB ACTIONS SAMPLE',
  events:events.slice(0,60),
  stations,
  stats:{
   observed:events.length,
   running:events.filter(x=>x.state==='RUNNING').length,
   queued:events.filter(x=>x.state==='QUEUED').length,
   failed:events.filter(x=>x.state==='FAILED').length
  }
 };
}