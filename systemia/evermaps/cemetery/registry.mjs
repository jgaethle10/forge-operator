import {createHash} from 'node:crypto';
const states=new Set('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' '));
const clean=x=>typeof x==='string'?x.trim():'';
const need=(x,k)=>{if(!clean(x))throw Error('Missing '+k);return clean(x)};
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export function ingest(rows,approval){
 if(!Array.isArray(rows)||rows.length>100000)throw Error('Invalid batch');
 if(approval?.rights_status!=='approved'||!clean(approval.review_ref))throw Error('Rights review required');
 const source=need(approval.source_id,'source_id'), seen=new Map();
 for(const r of rows){
  const id=need(r.source_record_id,'source_record_id'),state=need(r.state,'state');
  if(!states.has(state))throw Error('Invalid state');
  const cemetery=need(r.cemetery,'cemetery'),kind=r.kind;
  if(!['cemetery','burial'].includes(kind))throw Error('Invalid kind');
  const precision=r.location_precision;
  if(!['cemetery_only','section','plot_identifier','surveyed_grave_coordinate'].includes(precision))throw Error('Invalid precision');
  if(kind==='cemetery'&&precision!=='cemetery_only')throw Error('Cemetery precision mismatch');
  const coords=r.coordinates??null;
  if(coords!==null&&(!Array.isArray(coords)||coords.length!==2||!coords.every(Number.isFinite)||Math.abs(coords[0])>180||Math.abs(coords[1])>90))throw Error('Invalid coordinates');
  if(kind==='burial'&&coords!==null&&precision!=='surveyed_grave_coordinate')throw Error('Unverified grave coordinate');
  if(precision==='surveyed_grave_coordinate'&&(!coords||!clean(r.survey_ref)))throw Error('Survey evidence required');
  if(precision==='section'&&!clean(r.section))throw Error('Section required');
  if(precision==='plot_identifier'&&!clean(r.plot))throw Error('Plot required');
  if(!Number.isFinite(Date.parse(r.retrieved_at)))throw Error('Invalid retrieval date');
  const record={source_id:source,source_record_id:id,kind,state,county:clean(r.county),cemetery,name:kind==='burial'?need(r.name,'name'):null,section:clean(r.section),plot:clean(r.plot),location_precision:precision,coordinates:coords,survey_ref:clean(r.survey_ref),retrieved_at:r.retrieved_at,review_ref:approval.review_ref};
  if(seen.has(id)&&hash(seen.get(id))!==hash(record))throw Error('Conflicting duplicate');
  seen.set(id,record);
 }
 const records=[...seen.values()].sort((a,b)=>a.source_record_id.localeCompare(b.source_record_id));
 return {records,receipt:{source_id:source,input_count:rows.length,unique_count:records.length,sha256:hash(records),live_coverage_verified:false}};
}
export function searchBurials(records,{name,state, cemetery}={}){
 const q=clean(name).toLowerCase();if(!q)return [];
 return records.filter(r=>r.kind==='burial'&&r.name.toLowerCase().includes(q)&&(!state||r.state===state)&&(!cemetery||r.cemetery===cemetery)).slice(0,100);
}
