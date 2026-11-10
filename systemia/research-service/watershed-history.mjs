// Evercraft Watershed Intelligence | immutable source-receipt history.
// Only official public collector receipts; no publishing, payment, alerting or forecast authority.
import {createHash} from 'node:crypto';

export const HISTORY_SCHEMA='evercraft.watershed.evidence-history.v1';
export const HISTORY_SOURCES=Object.freeze([
  'latest.json',
  'swe-median-audit.json',
  'official-basin-report.json',
  'reservoir-source-probe.json'
]);
export const HISTORY_MAX_BYTES=250_000;
const SHA=/^[a-f0-9]{40}$/i;
const RUN=/^[1-9][0-9]{4,17}$/;
const ISO=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
const DAY=/^\d{4}-\d{2}-\d{2}$/;
const VALID_HOSTS=new Set(['wcc.sc.egov.usda.gov','api.waterdata.usgs.gov','data.usbr.gov']);

const isNumber=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
const goodDay=value=>{
  if(typeof value!=='string'||!DAY.test(value))return false;
  const n=Date.parse(value+'T00:00:00Z');
  return Number.isFinite(n)&&new Date(n).toISOString().slice(0,10)===value;
};
const goodTime=value=>typeof value==='string'&&ISO.test(value)&&Number.isFinite(Date.parse(value));
const exactKeys=(obj,keys)=>obj&&typeof obj==='object'&&!Array.isArray(obj)&&keys.every(k=>Object.hasOwn(obj,k));
const officialUrl=value=>{
  try{
    const u=new URL(value);
    return u.protocol==='https:'&&!u.username&&!u.password&&VALID_HOSTS.has(u.hostname.toLowerCase());
  }catch{return false}
};
const nonnegativeOrNull=v=>v===null||isNumber(v);
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');

function boundedObservations(rows,count,name){
  if(!Array.isArray(rows)||rows.length>count)throw new TypeError('unsupported '+name+' observation count');
  const seen=new Set();
  for(const row of rows){
    if(!row||typeof row.station_id!=='string'||row.station_id.length>48 ||
       !/^[A-Z0-9:_-]+$/i.test(row.station_id))throw new TypeError('invalid '+name+' station identity');
    if(!nonnegativeOrNull(row.value)||typeof row.unit!=='string'||row.unit.length>18)
      throw new TypeError('invalid '+name+' values');
    const key=row.station_id+'|'+row.kind+'|'+row.time;
    if(seen.has(key))throw new TypeError('duplicate '+name+' observation');
    seen.add(key);
    if(!officialUrl(row.provenance))throw new TypeError('untrusted '+name+' source URL');
  }
}
function verifySensor(sensor){
  if(sensor.schema!=='evercraft.research.watershed-intelligence.v1'||sensor.region!=='yakima-basin-wa'||
     sensor.live_collection!==true||sensor.publication_authorized!==false||
     sensor.drone_operations_authorized!==false||!goodTime(sensor.as_of))
    throw new TypeError('source sensor receipt is not authorized for history');
  boundedObservations(sensor.snow,80,'snow');
  boundedObservations(sensor.river,80,'river');
  for(const row of sensor.snow) {
    if(!/^[0-9A-Z_-]{2,20}:WA:(SNTL|SNOL)$/.test(row.station_id) ||
       !['WTEQ','SNWD'].includes(row.kind) || !goodDay(row.time) || row.unit!=='in' ||
       typeof row.freshness!=='string' || row.freshness.length>45)
      throw new TypeError('snow unit, station or observation day mismatch');
  }
  for(const row of sensor.river) {
    if(!/^USGS-[0-9A-Z]{5,20}$/.test(row.station_id) ||
       !['stream_discharge','gage_height'].includes(row.kind) ||
       (!goodTime(row.time) && !(row.freshness==='invalid_time' &&
         typeof row.time==='string' && row.time.length<=90)) ||
       (row.kind==='stream_discharge'&&row.unit!=='ft^3/s') ||
       (row.kind==='gage_height'&&row.unit!=='ft') ||
       typeof row.freshness!=='string' || row.freshness.length>45)
      throw new TypeError('USGS unit, station or timestamp mismatch');
  }
  if(!Array.isArray(sensor.failures)||sensor.failures.length>16)throw new TypeError('sensor failure inventory invalid');
  if(sensor.source_coverage?.suitable_for_publication!==false)throw new TypeError('source coverage publication flag absent');
  return Object.freeze({
    as_of:sensor.as_of,
    report_status:sensor.status,
    snow:sensor.snow.map(r=>({
      station_id:r.station_id,kind:r.kind,source_day:r.time,value:r.value,unit:r.unit,
      freshness:r.freshness,quality:r.state
    })),
    river:sensor.river.map(r=>({
      station_id:r.station_id,kind:r.kind,observed_at:r.time,value:r.value,unit:r.unit,
      freshness:r.freshness,quality:r.state
    })),
    coverage:{snow_stations:sensor.source_coverage.snow_station_count??0,
      river_locations:sensor.source_coverage.usgs_discharge_location_count??0,
      status:sensor.source_coverage.status},
    failure_count:sensor.failures.length
  });
}
function verifyMedians(median){
  if(!median)return null;
  if(median.schema!=='evercraft.research.swe-median-audit.v1'||median.publication_authorized!==false||
    median.basin_percent_of_median!==null||median.period!=='1991-2020'||
    !Array.isArray(median.station_comparisons)||median.station_comparisons.length>35)
    throw new TypeError('invalid official station-median audit');
  const seen=new Set();
  return {
    period:median.period,
    comparisons:median.station_comparisons.map(r=>{
      const key=r.station_id+'|'+r.date;
      if(seen.has(key)||!goodDay(r.date)||!officialUrl(r.source)||!nonnegativeOrNull(r.median_swe_in)||
        !nonnegativeOrNull(r.observed_swe_in)||
        (r.ratio_percent!==null&&!isNumber(r.ratio_percent)))
          throw new TypeError('invalid station median row');
      seen.add(key);
      return {station_id:r.station_id,source_day:r.date,swe_in:r.observed_swe_in,
        median_in:r.median_swe_in,station_percent:r.state==='station_comparison_valid'&&
          r.median_swe_in>=1?r.ratio_percent:null,state:r.state};
    })
  };
}
function verifyBasins(report){
  if(!report)return null;
  if(report.schema!=='evercraft.research.nrcs-basin-index.v1'||
    report.publication_authorized!==false||report.not_an_independent_recalculation!==true||
    !goodDay(report.observed_date)||!officialUrl(report.source_url)||report.reference_period!=='1991-2020'||
    !Array.isArray(report.basins)||report.basins.length!==3)
    throw new TypeError('invalid NRCS basin source receipt');
  const ids=report.basins.map(x=>x.id);
  if(new Set(ids).size!==3||!['upper-yakima','naches','lower-yakima'].every(id=>ids.includes(id))||
      report.all_basins_warned!==report.basins.every(x=>x.warning_flag===true))
    throw new TypeError('NRCS basin roster or warning inconsistent');
  return {
    source_day:report.observed_date,period:report.reference_period,source_url:report.source_url,
    indices:report.basins.map(r=>{
      if(!isNumber(r.value_percent)||typeof r.warning_flag!=='boolean'||r.observation_date!==report.observed_date||
         r.reference_period!=='1991-2020'||!officialUrl(r.provenance))
        throw new TypeError('invalid NRCS basin index row');
      return {id:r.id,index_percent:r.value_percent,warning_flag:r.warning_flag};
    })
  };
}
function verifyReservoirs(reservoir){
  if(!reservoir)return null;
  if(reservoir.source_id!=='usbr-rise-edr-reservoir-storage'||
    reservoir.publication_authorized!==false||reservoir.total_storage_af!==null||
    !goodTime(reservoir.as_of)||!Array.isArray(reservoir.observations)||
    reservoir.observations.length>5||!Array.isArray(reservoir.failures))
    throw new TypeError('invalid USBR source receipt');
  const rows=reservoir.observations.map(r=>{
    if(!['KEE','KAC','CLE','BUM','RIM'].includes(r.station_id)||
       !nonnegativeOrNull(r.value)||r.unit!=='af'||
       !goodDay(r.source_day_reported)||r.source_time_zone!=='unspecified'||
       !officialUrl(r.provenance))
      throw new TypeError('invalid provisional reservoir row');
    return {station_id:r.station_id,source_day:r.source_day_reported,storage_af:r.value,
      unit:'af',freshness:r.freshness,provisional:true,timezone_reconciled:false};
  });
  if(new Set(rows.map(r=>r.station_id)).size!==rows.length)throw new TypeError('duplicate reservoir');
  const derived=reservoir.derived_provisional_sum_af;
  if(derived!==null) {
    if(rows.length!==5||rows.some(r=>r.storage_af===null)||
      new Set(rows.map(r=>r.source_day)).size!==1||
      !isNumber(derived)||Math.abs(rows.reduce((sum,r)=>sum+r.storage_af,0)-derived)>0.011)
      throw new TypeError('reservoir sum not supported by five matching source days');
  }
  return {readings:rows,derived_provisional_sum_af:derived,provisional:true,
    official_total:false,reporting_day_reconciled:false,
    source_day:reservoir.derived_sum_source_reported_day??null};
}
export function makeHistoryReceipt(rawFiles,{runId,headSha,event='schedule',ingestedAt=new Date().toISOString()}={}){
  if(!RUN.test(String(runId??''))||!SHA.test(String(headSha??''))||
     !['schedule','workflow_dispatch'].includes(event)||!goodTime(ingestedAt))
    throw new TypeError('trusted main-branch scheduled run metadata required');
  if(!rawFiles||typeof rawFiles!=='object'||!Object.hasOwn(rawFiles,'latest.json'))
    throw new TypeError('sensor receipt required');
  const parsed={},digests={};
  for(const filename of HISTORY_SOURCES){
    const bytes=rawFiles[filename];
    if(bytes===undefined||bytes===null)continue;
    if(!Buffer.isBuffer(bytes)&&typeof bytes!=='string')throw new TypeError('source must be byte buffer');
    if(bytes.length<2||bytes.length>HISTORY_MAX_BYTES)throw new RangeError('source payload bounds exceeded');
    try{parsed[filename]=JSON.parse(bytes.toString('utf8'));}catch{throw new TypeError('invalid public source JSON: '+filename);}
    digests[filename]=sha256(bytes);
  }
  const sensors=verifySensor(parsed['latest.json']);
  const medians=verifyMedians(parsed['swe-median-audit.json']);
  const basins=verifyBasins(parsed['official-basin-report.json']);
  const reservoirs=verifyReservoirs(parsed['reservoir-source-probe.json']);
  // Sources may arrive on different local reporting days. Preserve dates and never fill gaps.
  const observedDay=sensors.as_of.slice(0,10);
  const key=observedDay+'/'+String(runId);
  return Object.freeze({
    schema:HISTORY_SCHEMA,
    key,
    source_run_id:String(runId),source_head_sha:String(headSha).toLowerCase(),
    source_event:event,collection_day_utc:observedDay,
    ingested_at:ingestedAt,source_digests:digests,
    archived_sources:Object.keys(digests).sort(),
    sensors,medians,basins,reservoirs,
    source_completeness:{
      sensor:!!sensors,medians:!!medians,official_basins:!!basins,reservoirs:!!reservoirs
    },
    publication_authorized:false,forecast_authorized:false,
    hazard_alert_authorized:false,customer_delivery_verified:false,payment_verified:false
  });
}
export function buildDailyHistory(receipts,{asOf,windowDays=7}={}){
  if(![7,30,90].includes(windowDays)||!goodDay(asOf)||!Array.isArray(receipts)||receipts.length>5000)
    throw new TypeError('history requests must use bounded 7, 30, or 90 day window');
  const selected=new Map();
  for(const rec of receipts){
    if(rec?.schema!==HISTORY_SCHEMA||rec.publication_authorized!==false||
       !goodDay(rec.collection_day_utc)||!goodTime(rec.sensors?.as_of))throw new TypeError('invalid historical receipt');
    const day=rec.collection_day_utc;
    const previous=selected.get(day);
    if(!previous||rec.sensors.as_of>previous.sensors.as_of)selected.set(day,rec);
  }
  const days=[];
  const start=Date.parse(asOf+'T00:00:00Z');
  for(let i=windowDays-1;i>=0;i--){
    const day=new Date(start-i*86400000).toISOString().slice(0,10);
    const rec=selected.get(day);
    const basin=rec?.basins;
    days.push({
      day,
      source_available:!!rec,
      official_basin_indices:basin?.indices??null,
      official_basin_source_day:basin?.source_day??null,
      provisional_reservoir_sum_af:rec?.reservoirs?.derived_provisional_sum_af??null,
      reservoir_source_day:rec?.reservoirs?.source_day??null,
      snow_station_count:rec?.sensors?.coverage.snow_stations??null,
      river_location_count:rec?.sensors?.coverage.river_locations??null,
      quality:rec?'source_dated_not_forecast':'missing_not_zero'
    });
  }
  const daysWithObservations=days.filter(d=>d.source_available).length;
  return {schema:'evercraft.watershed.daily-history.v1',as_of_day:asOf,window_days:windowDays,
    days_with_observations:daysWithObservations,
    status:daysWithObservations<2?'insufficient_history':'dated_observations_only',
    interpolation_performed:false,official_supply_forecast:false,
    points:days};
}
