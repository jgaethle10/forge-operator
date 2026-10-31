// Evercraft Watershed Intelligence: NRCS 1991-2020 median comparison lane.
// Compare SAME station, SAME date, SAME unit only. No basin-wide SWE percent.
// Official REST getData centralTendencyType=MEDIAN returns DataValueDTO.median.
export const NRCS_AWDB_MEDIAN_API='https://wcc.sc.egov.usda.gov/awdbRestApi/services/v1/data';
export const NRCS_MEDIAN_PERIOD='1991-2020';
export const SMALL_MEDIAN_FLOOR_IN=1.0; // conservative communications policy, not an NRCS threshold

function stationId(value) {
  const x=String(value ?? '').trim().toUpperCase();
  if(!/^[0-9A-Z_-]{2,20}:WA:(SNTL|SNOL)$/.test(x))throw new TypeError('invalid WA snow station');
  return x;
}
function day(value) {
  if(typeof value!=='string'||!/^\\d{4}-\\d{2}-\\d{2}$/.test(value))throw new TypeError('invalid daily date');
  const d=new Date(value+'T00:00:00Z');
  if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==value)throw new TypeError('invalid calendar date');
  return value;
}
function numberOrNull(value) {
  if(value===null||value===undefined||value==='')return null;
  const n=Number(value);return Number.isFinite(n)&&n>=0?n:null;
}
export function parseAwdbSweMedians(payload,{stationTriplets=[],beginDate,endDate}={}) {
  const allowed=new Set(stationTriplets.map(stationId));
  const begin=day(beginDate),end=day(endDate);
  if(!Array.isArray(payload)||payload.length>20)throw new TypeError('bounded AWDB station array required');
  const out=[];
  const seen=new Set();
  for(const station of payload){
    const id=stationId(station.stationTriplet||station.stationId);
    if(!allowed.has(id))throw new TypeError('AWDB median returned unexpected station');
    if(seen.has(id))throw new TypeError('duplicate AWDB median station');
    seen.add(id);
    if(!Array.isArray(station.data)||station.data.length>5)throw new TypeError('AWDB median station data malformed');
    for(const series of station.data){
      if(series.error)throw new TypeError('AWDB median series reported error');
      const element=String(series.stationElement?.elementCode ?? '');
      if(element!=='WTEQ')continue;
      const unit=String(series.stationElement?.storedUnitCode ?? '').toLowerCase();
      if(unit!=='in')throw new TypeError('AWDB SWE median units must be inches');
      if(!Array.isArray(series.values)||series.values.length>45)throw new TypeError('AWDB median samples malformed');
      for(const v of series.values){
        const date=day(v.date);
        if(date<begin||date>end)throw new TypeError('AWDB median date out of requested range');
        out.push(Object.freeze({
          station_id:id,date,kind:'WTEQ',unit:'in',
          swe_in:numberOrNull(v.value),median_in:numberOrNull(v.median),
          historical_baseline:'1991-2020_median',
          evidence_state:'provisional_observed',
          source:'usda-nrcs-awdb',
          provenance:NRCS_AWDB_MEDIAN_API,
          quality_code:v.qaFlag??v.qcFlag??null
        }));
      }
    }
  }
  return out.sort((a,b)=>a.station_id.localeCompare(b.station_id)||a.date.localeCompare(b.date));
}
export async function fetchAwdbSweMedians({
  stationTriplets=[],beginDate,endDate,fetchImpl=globalThis.fetch
}={}){
  if(typeof fetchImpl!=='function')throw new TypeError('fetch implementation required');
  const stations=[...new Set(stationTriplets.map(stationId))];
  if(!stations.length||stations.length>20)throw new TypeError('1-20 WA snow stations required');
  const begin=day(beginDate),end=day(endDate);
  const range=(Date.parse(end)-Date.parse(begin))/86400000;
  if(range<0||range>14)throw new RangeError('median date range limited to 14 days');
  const url=new URL(NRCS_AWDB_MEDIAN_API);
  url.searchParams.set('stationTriplets',stations.join(','));
  url.searchParams.set('elements','WTEQ');
  url.searchParams.set('duration','DAILY');
  url.searchParams.set('beginDate',begin);
  url.searchParams.set('endDate',end);
  url.searchParams.set('centralTendencyType','MEDIAN');
  url.searchParams.set('returnSuspectData','false');
  const resp=await fetchImpl(url,{
    headers:{Accept:'application/json','User-Agent':'Evercraft-Watershed-Research/0.3 (https://github.com/jgaethle10/forge-operator)'}
  });
  if(!resp?.ok)throw new Error('NRCS AWDB SWE median status '+String(resp?.status??'unknown'));
  return parseAwdbSweMedians(await resp.json(),{stationTriplets:stations,beginDate:begin,endDate:end});
}
export function auditSweStationComparisons(snapshot, medianReadings=[], {minMedianIn=SMALL_MEDIAN_FLOOR_IN}={}){
  if(!snapshot||snapshot.region!=='yakima-basin-wa'||!Array.isArray(snapshot.snow))throw new TypeError('Yakima snow snapshot required');
  if(!Number.isFinite(minMedianIn)||minMedianIn<1)throw new TypeError('safe median floor must be at least one inch');
  if(!Array.isArray(medianReadings)||medianReadings.length>500)throw new TypeError('bounded median readings required');
  const observations=new Map(snapshot.snow.filter(row=>row.kind==='WTEQ').map(row=>[row.station_id+':'+row.time,row]));
  const chosen=new Map();
  for(const row of medianReadings){
    const id=stationId(row.station_id),date=day(row.date),key=id+':'+date;
    if(chosen.has(key))throw new TypeError('duplicate station and day median');
    chosen.set(key,row);
  }
  const rows=[];
  for(const [key,snow] of observations){
    const normal=chosen.get(key);
    const currentValid=snow.freshness==='current'&&Number.isFinite(snow.value)&&snow.value>=0&&snow.unit?.toLowerCase()==='in';
    const matched=normal&&normal.unit==='in'&&Number.isFinite(normal.swe_in)&&Number.isFinite(snow.value)&&Math.abs(normal.swe_in-snow.value)<0.011;
    const baselineValid=normal&&Number.isFinite(normal.median_in)&&normal.median_in>=0;
    const state=!currentValid?'current_swe_not_usable':!normal?'median_unavailable':
      !matched?'observation_mismatch':!baselineValid?'median_unavailable':
      normal.median_in<minMedianIn?'small_or_zero_median_suppressed':'station_comparison_valid';
    rows.push({
      station_id:snow.station_id,date:snow.time,
      observed_swe_in:Number.isFinite(snow.value)?snow.value:null,
      median_swe_in:baselineValid?normal.median_in:null,
      ratio_percent:state==='station_comparison_valid'?Math.round(snow.value/normal.median_in*1000)/10:null,
      state,comparison_scope:'single_station_only',
      median_period:NRCS_MEDIAN_PERIOD,
      source:normal?.provenance||null
    });
  }
  return {
    schema:'evercraft.research.swe-median-audit.v1',
    as_of:snapshot.as_of,period:NRCS_MEDIAN_PERIOD,
    denominator_floor_in:minMedianIn,
    station_comparisons:rows.sort((a,b)=>a.station_id.localeCompare(b.station_id)),
    ratios_admitted:rows.filter(r=>r.ratio_percent!==null).length,
    ratios_suppressed:rows.filter(r=>r.ratio_percent===null).length,
    basin_percent_of_median:null,
    basin_percent_status:'not_calculated_requires_official_basin_aggregation',
    message:'October site percentages with zero/small medians suppressed to avoid misleading claims.',
    publication_authorized:false
  };
}
export async function collectSweMedianAudit(snapshot,{fetchImpl=globalThis.fetch}={}){
  if(!snapshot?.as_of||!Array.isArray(snapshot.snow))throw new TypeError('snow snapshot required');
  const stations=[...new Set(snapshot.snow.filter(row=>row.kind==='WTEQ').map(row=>stationId(row.station_id)))];
  const days=snapshot.snow.filter(row=>row.kind==='WTEQ').map(row=>day(row.time)).sort();
  if(!days.length)return { ...auditSweStationComparisons(snapshot,[]),failures:[{source:'nrcs-median',code:'no_snow_observations'}] };
  try {
    const rows=await fetchAwdbSweMedians({
      stationTriplets:stations,beginDate:days[0],endDate:days.at(-1),fetchImpl
    });
    return {...auditSweStationComparisons(snapshot,rows),failures:[]};
  } catch(error) {
    return {
      ...auditSweStationComparisons(snapshot,[]),
      failures:[{source:'nrcs-median',code:'fetch_or_parse_error',detail:String(error?.message||error).slice(0,100)}]
    };
  }
}
