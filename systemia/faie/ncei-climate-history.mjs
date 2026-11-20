// Official NCEI GHCN-Daily observations, not climate normals or site conditions.
// Deliberately limited to a single NOAA-identified Yakima Airport station
// and two complete historical calendar years. No hidden nearest-station inference.
const NCEI_ORIGIN='https://www.ncei.noaa.gov';
const API_PATH='/access/services/data/v1';
export const YAKIMA_CLIMATE_STATION=Object.freeze({
  id:'USW00024243',
  name:'Yakima Airport, WA (NOAA GHCN-Daily)',
  latitude:46.56398,
  longitude:-120.53488,
  source:'https://www.ncei.noaa.gov/cdo-web/datasets/GHCND/stations/GHCND%3AUSW00024243/detail'
});
export const CLIMATE_SAMPLE_YEARS=Object.freeze([2023,2024]);
const MAX_STATION_DISTANCE_KM=40;
const EXPECTED_DAYS=731; // complete 2023 and leap-year 2024
const types=['TMAX','TMIN','PRCP'];
function finite(v){return typeof v==='number'&&Number.isFinite(v)}
function numberOrNull(v){
  if(v===null||v===undefined||v==='')return null;
  const n=Number(v);
  return Number.isFinite(n)?n:null;
}
function stationDistanceKm(a,b){
  const rad=Math.PI/180;
  const latDelta=(b.latitude-a.latitude)*rad;
  const lonDelta=(b.longitude-a.longitude)*rad;
  const h=Math.sin(latDelta/2)**2+Math.cos(a.latitude*rad)*Math.cos(b.latitude*rad)*Math.sin(lonDelta/2)**2;
  return 6371.0088*2*Math.asin(Math.min(1,Math.sqrt(h)));
}
export function eligibleYakimaClimatePoint(latitude,longitude){
  const lat=Number(latitude),lon=Number(longitude);
  if(!finite(lat)||!finite(lon)||lat<24||lat>50||lon< -125||lon> -66){
    throw new TypeError('explicit_contiguous_us_point_required');
  }
  const distanceKm=stationDistanceKm({latitude:lat,longitude:lon},YAKIMA_CLIMATE_STATION);
  return {
    station_eligible:distanceKm<=MAX_STATION_DISTANCE_KM,
    distance_km:Number(distanceKm.toFixed(1)),
    max_context_distance_km:MAX_STATION_DISTANCE_KM,
    station_id:YAKIMA_CLIMATE_STATION.id
  };
}
function officialUrl(year){
  if(!CLIMATE_SAMPLE_YEARS.includes(year))throw new TypeError('unapproved_historical_year');
  const params=new URLSearchParams({
    dataset:'daily-summaries',stations:YAKIMA_CLIMATE_STATION.id,
    startDate:year+'-01-01',endDate:year+'-12-31',
    dataTypes:types.join(','),units:'standard',format:'json',
    includeAttributes:'true'
  });
  return NCEI_ORIGIN+API_PATH+'?'+params.toString();
}
function dateValidForYear(date,year){
  return typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date) &&
    date.startsWith(String(year)) &&
    !Number.isNaN(Date.parse(date+'T00:00:00Z')) &&
    new Date(date+'T00:00:00Z').toISOString().slice(0,10)===date;
}
function observation(row,key){
  // GHCN-Daily attributes are generally MFLAG,QFLAG,SFLAG,OBS-TIME.
  // Skip records with a reported quality flag, or nonnumeric/trace values.
  const raw=row[key];
  const attributes=row[key+'_ATTRIBUTES'];
  if(typeof attributes==='string'&&attributes.split(',')[1]?.trim())return null;
  const num=numberOrNull(raw);
  if(num===null)return null;
  if(key==='TMAX'||key==='TMIN')return num>= -120&&num<=145?num:null; // °F
  if(key==='PRCP')return num>=0&&num<=50?num:null; // inches
  return null;
}
async function officialDailyRows(url,year,fetchImpl){
  const ctl=new AbortController();
  const timeout=setTimeout(()=>ctl.abort(),16000);
  let response;
  try{
    response=await fetchImpl(url,{
      method:'GET',redirect:'error',
      headers:{accept:'application/json','user-agent':'Evercraft-FAIE/1.0 (https://fabric.systemiacommandcenters.com/faie/)'},
      signal:ctl.signal
    });
    if(!response?.ok)throw new Error('ncei_source_unavailable');
    const text=await response.text();
    if(text.length>1500000)throw new Error('ncei_source_too_large');
    let data;try{data=JSON.parse(text)}catch{throw new Error('ncei_invalid_json')}
    if(!Array.isArray(data)||data.length>370)throw new Error('ncei_unexpected_year_response');
    const byDate=new Map();
    for(const row of data){
      if(!row||typeof row!=='object')continue;
      const date=String(row.DATE||'').slice(0,10);
      if(!dateValidForYear(date,year))continue;
      if(row.STATION && row.STATION!==YAKIMA_CLIMATE_STATION.id)continue;
      if(byDate.has(date))continue;
      byDate.set(date,Object.fromEntries(types.map(key=>[key,observation(row,key)])));
    }
    return byDate;
  }finally{clearTimeout(timeout)}
}
function metric(days,key,threshold,description){
  let observedDays=0,triggerDays=0;
  for(const v of days.values()){
    const value=v[key];
    if(value===null||value===undefined)continue;
    observedDays++;
    if(threshold(value))triggerDays++;
  }
  return {
    description,
    observed_days:observedDays,
    missing_days:EXPECTED_DAYS-observedDays,
    threshold_days:triggerDays,
    observation_coverage:Number((observedDays/EXPECTED_DAYS).toFixed(3)),
    threshold_unit:key==='PRCP'?'inches':'degrees Fahrenheit'
  };
}
export async function collectYakimaHistoricalClimate({
  latitude,longitude,fetchImpl=globalThis.fetch,
  retrievedAt=new Date().toISOString()
}={}){
  const point=eligibleYakimaClimatePoint(latitude,longitude);
  if(!point.station_eligible)throw new RangeError('no_approved_nearby_historical_station');
  if(typeof fetchImpl!=='function')throw new TypeError('fetch_required');
  if(!Number.isFinite(Date.parse(retrievedAt)))throw new TypeError('invalid_retrieval_time');
  const years=CLIMATE_SAMPLE_YEARS.map(year=>({year,url:officialUrl(year)}));
  const settled=await Promise.allSettled(years.map(async y=>({
    ...y,rows:await officialDailyRows(y.url,y.year,fetchImpl)
  })));
  // Partial year failures are never promoted to a two-year baseline.
  if(settled.some(x=>x.status!=='fulfilled'))throw new Error('ncei_required_year_unavailable');
  const daily=new Map();
  for(const run of settled)for(const [date,values] of run.value.rows)daily.set(date,values);
  if(daily.size>EXPECTED_DAYS)throw new Error('ncei_excess_date_rows');
  const metrics={
    hot_days_ge_95f:metric(daily,'TMAX',value=>value>=95,'Maximum temperature at least 95°F'),
    freeze_nights_le_32f:metric(daily,'TMIN',value=>value<=32,'Minimum temperature at most 32°F'),
    wet_days_ge_0_01in:metric(daily,'PRCP',value=>value>=0.01,'Recorded precipitation at least 0.01 inch')
  };
  // Counts are not useful if the station is missing most of the observed dates.
  const usable=Object.values(metrics).every(x=>x.observation_coverage>=0.7);
  return {
    schema:'evercraft.faie.ncei-station-history.v1',
    status:usable?'historical_station_context_available':'insufficient_historical_coverage',
    evidence_state:'OBSERVED',
    source:'NOAA NCEI GHCN-Daily',
    station:{...YAKIMA_CLIMATE_STATION,distance_km:point.distance_km},
    location_scope:'Historical station observations, NOT measurements at the requested property',
    sample_years:[...CLIMATE_SAMPLE_YEARS],
    expected_days:EXPECTED_DAYS,
    received_calendar_dates:daily.size,
    metrics,
    retrieved_at:new Date(retrievedAt).toISOString(),
    provenance_urls:[YAKIMA_CLIMATE_STATION.source,...years.map(x=>x.url)],
    limitations:[
      'Two historical years are NOT 30-year climate normals and cannot establish a long-term return period.',
      'Airport station microclimate may differ from an orchard, basin, hillside, or any property nearby.',
      'Missing or quality-flagged values are excluded, never silently interpreted as zero.',
      'Counts use only the days with valid individual measurements. Thresholds are transparent screening descriptors, not crop-specific advice.'
    ],
    field_verification_required:true,
    site_suitability_verdict:null,
    decision_authority:false,
    publication_authority:false,
    request_persisted:false
  };
}
