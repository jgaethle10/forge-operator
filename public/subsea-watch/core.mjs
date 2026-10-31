// Evercraft Subsea Watch / replay evidence core.
// Never infer underwater XY from depth, time, or a surface GPS fix.
export const SCHEMA='evercraft.subsea.replay.v1';
const SOURCES=new Set(['USBL','LBL','DVL_INS','ROV_TRACK','SURVEYED','SIMULATED']);
const finite=v=>typeof v==='number'&&Number.isFinite(v);
export function normalizeDive(raw){
 if(!raw||typeof raw!=='object'||!Array.isArray(raw.points))throw Error('Expected an object with a points array.');
 if(raw.points.length<2||raw.points.length>10000)throw Error('Use 2–10,000 samples.');
 const source=String(raw.position_source||'').toUpperCase();
 const points=raw.points.map((p,i)=>{
  const t=Number(p.t_s??p.time_s),depth=Number(p.depth_m);
  if(!finite(t)||t<0||!finite(depth)||depth<0||depth>450)throw Error('Invalid time or depth at row '+(i+1));
  const hasX=p.x_m!==undefined&&p.x_m!==null&&p.x_m!=='';
  const hasY=p.y_m!==undefined&&p.y_m!==null&&p.y_m!=='';
  if(hasX!==hasY)throw Error('A horizontal fix needs both x_m and y_m at row '+(i+1));
  const x=hasX?Number(p.x_m):null,y=hasY?Number(p.y_m):null;
  if(hasX&&(!finite(x)||!finite(y)||Math.abs(x)>1e6||Math.abs(y)>1e6))throw Error('Invalid local coordinates at row '+(i+1));
  const pointSource=String(p.position_source||source).toUpperCase();
  if(hasX&&!SOURCES.has(pointSource))throw Error('XY coordinates require a declared positioning method: USBL, LBL, DVL_INS, ROV_TRACK, SURVEYED or SIMULATED. Row '+(i+1));
  return {t,depth,x,y,position_source:hasX?pointSource:null,label:typeof p.note==='string'?p.note.slice(0,120):''};
 });
 points.sort((a,b)=>a.t-b.t);
 for(let i=1;i<points.length;i++)if(points[i].t===points[i-1].t)throw Error('Duplicate time samples are not allowed.');
 const xyCount=points.filter(p=>p.x!==null).length;
 const completeXY=xyCount===points.length;
 const method=completeXY&&points.every(p=>p.position_source===points[0].position_source)?points[0].position_source:null;
 const xyAvailable=Boolean(completeXY&&method);
 // A mixed or partial track can still be shown in depth profile, never a fabricated XY route.
 return {
  schema:SCHEMA,
  title:String(raw.title||'Imported dive').slice(0,100),
  provenance:String(raw.provenance||'User-provided file; not independently verified').slice(0,180),
  demo:raw.demo===true&&method==='SIMULATED',
  points,
  xyAvailable,
  positionSource:method,
  xyState:xyAvailable?(method==='SIMULATED'?'synthetic_demo':'user_declared_position_source_unverified'):'horizontal_position_unavailable',
  duration:points.at(-1).t-points[0].t,
  maxDepth:Math.max(...points.map(p=>p.depth)),
  infrastructure:raw.demo===true&&method==='SIMULATED'?{kind:'illustrative_pipe',x:10,y:3,depth:13,length:18,operating_state:'unknown',isolation_status:'not_supplied'}:null
 };
}
export function atTime(dive,t){
 const pts=dive.points;
 const time=Math.max(pts[0].t,Math.min(pts.at(-1).t,Number(t)||0));
 let i=0;
 while(i<pts.length-2&&pts[i+1].t<time)i++;
 const a=pts[i],b=pts[i+1],dt=b.t-a.t;
 const fraction=dt>0?(time-a.t)/dt:0;
 const depth=a.depth+(b.depth-a.depth)*fraction;
 const canInterpolate=dive.xyAvailable&&dt<=15&&a.position_source===b.position_source;
 return {t:time,depth,x:canInterpolate?a.x+(b.x-a.x)*fraction:null,y:canInterpolate?a.y+(b.y-a.y)*fraction:null,
  positionState:!dive.xyAvailable?'not_recorded':canInterpolate?'within_recorded_interval':'gap_not_interpolated',
  source:canInterpolate?a.position_source:null,nearest:i};
}
export function segments(dive){
 if(!dive.xyAvailable)return [];
 const out=[];
 for(let i=1;i<dive.points.length;i++){
  const a=dive.points[i-1],b=dive.points[i];
  if(b.t-a.t<=15&&a.position_source===b.position_source)out.push({a,b});
 }
 return out;
}
function splitCsvLine(line){
 const out=[];let value='',quoted=false;
 for(let i=0;i<line.length;i++){
  const ch=line[i];
  if(ch==='"'){if(quoted&&line[i+1]==='"'){value+='"';i++;}else quoted=!quoted;}
  else if(ch===','&&!quoted){out.push(value.trim());value='';}
  else value+=ch;
 }
 if(quoted)throw Error('Unclosed CSV quote.');
 out.push(value.trim());return out;
}
export function parseCsv(text){
 const lines=String(text).replace(/\r/g,'').split('\n').filter(x=>x.trim()&&!x.trim().startsWith('#'));
 if(lines.length<3)throw Error('CSV requires a header and at least two readings.');
 const header=splitCsvLine(lines[0]).map(x=>x.toLowerCase());
 if(!header.includes('t_s')||!header.includes('depth_m'))throw Error('CSV needs t_s and depth_m columns.');
 const fields=['t_s','depth_m','x_m','y_m','position_source','note'];
 const points=lines.slice(1).map((line,i)=>{
  const values=splitCsvLine(line);if(values.length!==header.length)throw Error('CSV column count mismatch at row '+(i+2));
  const row=Object.fromEntries(header.map((key,j)=>[key,values[j]]));
  return Object.fromEntries(fields.filter(f=>row[f]!==undefined).map(f=>[f,row[f]]));
 });
 return {title:'Imported CSV dive',provenance:'User-provided CSV; position method not independently verified',points};
}
export function parseInput(text,fileName=''){
 if(String(text).length>2e6)throw Error('File exceeds the 2 MB local preview limit.');
 const raw=/\.csv$/i.test(fileName)?parseCsv(text):JSON.parse(text);
 return normalizeDive(raw);
}
export function brief(dive){
 return [
  'EVERCRAFT SUBSEA WATCH — REPLAY EVIDENCE BRIEF',
  'Title: '+dive.title,
  'Record: '+(dive.demo?'Synthetic demonstration, not an actual dive':'User-imported record, not independently verified'),
  'Source: '+dive.provenance,
  'Samples: '+dive.points.length,
  'Duration: '+dive.duration.toFixed(1)+' s',
  'Maximum recorded depth: '+dive.maxDepth.toFixed(1)+' m',
  'Horizontal position: '+(dive.xyAvailable?dive.positionSource+' (user-declared/simulated, not independently validated)':'Unavailable — no spatial route is drawn'),
  'Infrastructure: '+(dive.infrastructure?'Illustrative sample pipe, operation and isolation UNKNOWN':'No infrastructure verified or mapped from this file'),
  'Recorded telemetry is not a terrain survey, photogrammetric reconstruction or safe-dive clearance.',
  'Uncharted infrastructure and unknown Delta-P conditions remain possible.',
  'Dive supervisors and facility operators must independently verify hazards and isolation.'
 ].join('\n');
}
