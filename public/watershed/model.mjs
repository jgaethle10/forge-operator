// Evercraft Watershed Intelligence | browser-side evidence contracts.
// This module never fetches a source, publishes research, or performs payment.
export const EVIDENCE_SCHEMA='evercraft.watershed.public-evidence.v1';
export const SNAPSHOT_PATH='./data/yakima-2026-11-09.json';

const OFFICIAL_HOSTS=new Set([
  'wcc.sc.egov.usda.gov',
  'api.waterdata.usgs.gov',
  'data.usbr.gov',
  'github.com'
]);
export function isOfficialSource(url){
  try {
    const parsed=new URL(url);
    return parsed.protocol==='https:' && !parsed.username && !parsed.password &&
      OFFICIAL_HOSTS.has(parsed.hostname.toLowerCase());
  } catch { return false; }
}
const validNumber=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
export function validateEvidence(e){
  const problems=[];
  if(!e||e.schema!==EVIDENCE_SCHEMA)problems.push('SCHEMA_MISMATCH');
  if(e?.presentation!=='ARCHIVED_EVIDENCE_PREVIEW'||e?.human_publication_approved!==false)
    problems.push('UNREVIEWED_PUBLICATION_AUTHORITY');
  if(e?.forecast_authorized!==false||e?.flood_alert_authorized!==false||
     e?.payment_verified!==false||e?.customer_delivery_verified!==false)
    problems.push('AUTHORITY_FLAG_UNEXPECTED');
  if(e?.source_observed_date!=='2026-11-09'||!Number.isFinite(Date.parse(e?.source_collected_at||'')))
    problems.push('SOURCE_TIME_INVALID');
  if(!isOfficialSource(e?.source_run_url))problems.push('SOURCE_RECEIPT_URL_INVALID');
  const hashes=e?.evidence_sha256||{};
  for(const n of ['water_usgs_nrcs','nrcs_station_medians','nrcs_basin','usbr_reservoir']){
    if(!/^[a-f0-9]{64}$/i.test(hashes[n]||''))problems.push('MISSING_HASH_'+n);
  }
  const basins=e?.nrcs?.basins;
  if(!Array.isArray(basins)||basins.length!==3||
    new Set(basins?.map(x=>x.id)).size!==3 ||
    !basins.every(b=>validNumber(b.index_percent) && typeof b.warning_flag==='boolean')||
    !isOfficialSource(e?.nrcs?.source_url))problems.push('BASIN_EVIDENCE_INVALID');
  const stations=e?.snow?.stations;
  if(!Array.isArray(stations)||stations.length!==6||
    new Set(stations?.map(x=>x.id)).size!==6||
    !stations.every(s=>validNumber(s.swe_in)&&validNumber(s.depth_in)&&
      (s.median_in===null||validNumber(s.median_in)) &&
      (s.ratio_percent===null||validNumber(s.ratio_percent)) &&
      (s.ratio_percent===null||s.median_in>=1) && isOfficialSource(s.source_url)))
    problems.push('SNOW_EVIDENCE_INVALID');
  const rivers=e?.rivers?.sites;
  if(!Array.isArray(rivers)||rivers.length!==3||
    !rivers.every(g=>validNumber(g.discharge_cfs)&&!!Date.parse(g.observed_at)&&isOfficialSource(g.source_url))||
    e?.rivers?.reporting_gauge_count!==3||e?.rivers?.configured_gauge_count!==4)
    problems.push('RIVER_EVIDENCE_INVALID');
  const reservoirs=e?.reservoirs?.sites;
  if(!Array.isArray(reservoirs)||reservoirs.length!==5||
    new Set(reservoirs?.map(x=>x.id)).size!==5||
    !reservoirs.every(r=>validNumber(r.storage_af)&&r.provisional===true &&
      r.time_zone==='unresolved'&&isOfficialSource(r.source_url)) ||
    e?.reservoirs?.timezone_reconciled!==false ||
    e?.reservoirs?.official_system_total!==false ||
    e?.reservoirs?.percent_capacity!==null)
    problems.push('RESERVOIR_EVIDENCE_INVALID');
  if(Array.isArray(reservoirs) && validNumber(e?.reservoirs?.derived_provisional_sum_af)){
    const sum=reservoirs.reduce((total,s)=>total+(Number(s.storage_af)||0),0);
    if(Math.abs(sum-e.reservoirs.derived_provisional_sum_af)>0.01)
      problems.push('RESERVOIR_SUM_CONTRADICTS_SOURCES');
  } else problems.push('PROVISIONAL_SUM_MISSING');
  if(!Array.isArray(e?.limitations)||e.limitations.length<5)
    problems.push('LIMITATIONS_MISSING');
  return Object.freeze({valid:problems.length===0,problems});
}
export function formatNumber(value,digits=0){
  return typeof value==='number'&&Number.isFinite(value)
    ? new Intl.NumberFormat('en-US',{minimumFractionDigits:digits,maximumFractionDigits:digits}).format(value)
    : 'Unavailable';
}
export function sourceAgeLabel(collectedAt, now=new Date()){
  const time=Date.parse(collectedAt);
  if(!Number.isFinite(time))return 'Source date not verified';
  const delta=Math.max(0,now.getTime()-time);
  const days=Math.floor(delta/86400000);
  if(days>=1)return 'Archived '+days+' day'+(days===1?'':'s')+' ago';
  const hours=Math.floor(delta/3600000);
  return hours>=1?'Archived '+hours+' hour'+(hours===1?'':'s')+' ago':'Archived source snapshot';
}
export function shortDate(value){
  // Date-only source observations are calendar dates, never assume a local timestamp.
  if(/^\d{4}-\d{2}-\d{2}$/.test(value||'')){
    const [y,m,d]=value.split('-');
    const names=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return names[Number(m)-1]+' '+Number(d)+', '+y;
  }
  if(!Number.isFinite(Date.parse(value)))return 'Date unavailable';
  return new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',
    month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'
  }).format(new Date(value));
}
export function ratioLabel(station){
  return station?.ratio_percent===null?'Withheld: small historical median':
    validNumber(station?.ratio_percent)
      ?formatNumber(station.ratio_percent,1)+'% of station median'
      :'Comparison unavailable';
}
