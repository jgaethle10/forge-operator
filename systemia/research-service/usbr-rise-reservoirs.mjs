// Bureau of Reclamation RISE EDR source lane for Yakima Basin reservoir research.
// Not a reservoir operations controller, flood forecast, or publication authority.
export const USBR_RISE_EDR_ORIGIN = 'https://data.usbr.gov';
export const USBR_RISE_RESERVOIR_PARAMETER = '3'; // Lake/Reservoir Storage (acre-feet)
export const YAKIMA_RESERVOIR_SITES = Object.freeze([
  { code:'KEE', name:'Keechelus Reservoir', location_id:7187, catalog_item_id:131246, catalog_record_id:8304 },
  { code:'KAC', name:'Kachess Reservoir', location_id:7186, catalog_item_id:131227, catalog_record_id:8303 },
  { code:'CLE', name:'Cle Elum Reservoir', location_id:7170, catalog_item_id:129798, catalog_record_id:8199 },
  { code:'BUM', name:'Bumping Reservoir', location_id:3647, catalog_item_id:129605, catalog_record_id:8187 },
  { code:'RIM', name:'Rimrock Reservoir', location_id:7196, catalog_item_id:132729, catalog_record_id:8410 }
]);

const byCode = new Map(YAKIMA_RESERVOIR_SITES.map(site => [site.code, site]));
function checkedCode(code) {
  const text = String(code ?? '').trim().toUpperCase();
  if (!byCode.has(text)) throw new TypeError('unknown Yakima reservoir station');
  return text;
}
function dateOnly(text) {
  if (typeof text !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(text) || !Number.isFinite(Date.parse(text + 'T00:00:00Z'))
      || new Date(text + 'T00:00:00Z').toISOString().slice(0,10) !== text) throw new TypeError('date must be valid YYYY-MM-DD');
  return text;
}
function boundedWindow(beginDate,endDate) {
  const a=dateOnly(beginDate),b=dateOnly(endDate);
  const days=(Date.parse(b)-Date.parse(a))/86400000;
  if (days < 0 || days > 14) throw new RangeError('RISE request window must be 0-14 days');
  return {a,b};
}
function timestamp(value) {
  // RISE EDR can provide wall-clock timestamps with no zone. Do not invent UTC.
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/.test(value)) return null;
  const day=value.slice(0,10);
  try { dateOnly(day); } catch { return null; }
  const offset=/([Zz]|[+-]\d\d:\d\d)$/.test(value);
  if (offset) {
    const n=Date.parse(value);
    return Number.isFinite(n)?{time:new Date(n).toISOString(),day,timezone:'explicit_offset'}:null;
  }
  // Preserve source local clock as a string and explicitly quarantine timezone ambiguity.
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?$/.test(value)) return null;
  if (!Number.isFinite(Date.parse(value+'Z'))) return null;
  return {time:value,day,timezone:'unspecified'};
}
function parseValues(payload, site, {beginDate,endDate}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new TypeError('RISE CoverageJSON object required');
  // Fail closed: RISE sometimes returns multiple coverages/series. We cannot silently choose a different item.
  if (payload.type !== 'Coverage') throw new TypeError('RISE response is not a single Coverage');
  const times=payload.domain?.axes?.t?.values;
  const ranges=payload.ranges;
  if (!Array.isArray(times) || times.length > 80 || !ranges || typeof ranges !== 'object' || Array.isArray(ranges)) {
    throw new TypeError('RISE time axis or ranges missing');
  }
  const entries=Object.entries(ranges);
  // RISE EDR parameter-name=3 must produce exactly one parameter series.
  if (entries.length !== 1) throw new TypeError('RISE response ambiguous storage parameter');
  const [key,range]=entries[0];
  const descriptor=payload.parameters?.[key];
  if (String(key)!==USBR_RISE_RESERVOIR_PARAMETER) {
    const title=String(descriptor?.observedProperty?.label || descriptor?.description || '').toLowerCase();
    if (!title.includes('reservoir storage')) throw new TypeError('RISE returned wrong reservoir parameter');
  }
  if (!Array.isArray(range?.values) || range.values.length !== times.length || (range.axisNames && !range.axisNames.includes('t'))) {
    throw new TypeError('RISE timestamp/value cardinality mismatch');
  }
  const unit=String(descriptor?.unit?.symbol?.value || descriptor?.unit?.symbol || descriptor?.unit?.label || 'af').toLowerCase();
  if (!['af','acre-feet','acre feet','acre foot'].includes(unit)) throw new TypeError('RISE reservoir unit is not acre-feet');
  const rows=[];
  for (let i=0;i<times.length;i++) {
    const time=timestamp(times[i]);
    if (!time) throw new TypeError('RISE response contains invalid timestamps');
    const day=time.day;
    // Allow one day on either edge to tolerate hydromet local-day UTC representation,
    // but preserve timestamp and do not claim local-day reconciliation.
    const min=Date.parse(beginDate+'T00:00:00Z')-86400000;
    const max=Date.parse(endDate+'T23:59:59Z')+86400000;
    const nominal=Date.parse(day+'T00:00:00Z');
    if (nominal < min || nominal>max) throw new TypeError('RISE observation outside bounded window');
    const v=range.values[i];
    const value=v === null || v === undefined || v === '' ? null : Number(v);
    if (value !== null && (!Number.isFinite(value) || value < 0)) throw new TypeError('RISE reservoir value invalid');
    rows.push({
      station_id:site.code,
      station_name:site.name,
      kind:'reservoir_storage',
      time:time.time,
      source_day_reported:day,
      source_time_zone:time.timezone,
      value,
      unit:'af',
      state:value === null ? 'missing' : 'provisional_observed',
      freshness:'not_assessed',
      catalog_item_id:site.catalog_item_id,
      location_id:site.location_id,
      provenance:'https://data.usbr.gov/catalog/'+site.catalog_record_id+'/item/'+site.catalog_item_id
    });
  }
  return rows;
}

export function parseRiseReservoirCoverage(payload, code, window) {
  const site=byCode.get(checkedCode(code));
  if (!window || !window.beginDate || !window.endDate) throw new TypeError('verified request window required');
  boundedWindow(window.beginDate,window.endDate);
  return parseValues(payload,site,window);
}

export async function fetchRiseReservoirStorage({
  code, beginDate, endDate, fetchImpl=globalThis.fetch
}={}) {
  const site=byCode.get(checkedCode(code));
  const {a,b}=boundedWindow(beginDate,endDate);
  if (typeof fetchImpl!=='function') throw new TypeError('fetch implementation required');
  const url=new URL('/api/ogc/collections/rise/locations/'+site.location_id,USBR_RISE_EDR_ORIGIN);
  url.searchParams.set('f','json');
  url.searchParams.set('parameter-name',USBR_RISE_RESERVOIR_PARAMETER);
  // Official RISE EDR usage documents calendar-day intervals.
  url.searchParams.set('datetime',a+'/'+b);
  const res=await fetchImpl(url,{
    headers:{Accept:'application/json','User-Agent':'Evercraft-Watershed-Research/0.2 (https://github.com/jgaethle10/forge-operator)'}
  });
  if (res?.status === 204) return [];
  if (!res?.ok) throw new Error('USBR RISE source status '+String(res?.status ?? 'unknown'));
  return parseRiseReservoirCoverage(await res.json(),site.code,{beginDate:a,endDate:b});
}

export async function collectRiseYakimaReservoirs({
  asOf=new Date().toISOString(),fetchImpl=globalThis.fetch,codes=YAKIMA_RESERVOIR_SITES.map(x=>x.code)
}={}) {
  const now=new Date(asOf);
  if (!Number.isFinite(now.getTime())) throw new TypeError('asOf timestamp invalid');
  const wanted=[...new Set(codes.map(checkedCode))];
  const endDate=now.toISOString().slice(0,10);
  const beginDate=new Date(now.getTime()-7*86400000).toISOString().slice(0,10);
  const resolved=await Promise.allSettled(wanted.map(code=>fetchRiseReservoirStorage({code,beginDate,endDate,fetchImpl})));
  const failures=[];
  const readings=[];
  for(let i=0;i<resolved.length;i++) {
    const result=resolved[i];
    if(result.status==='fulfilled') readings.push(...result.value);
    else failures.push({station_id:wanted[i], source:'usbr-rise', error:String(result.reason?.message||result.reason).slice(0,140)});
  }
  const latest=[];
  for (const code of wanted) {
    const ordered=readings.filter(r=>r.station_id===code).sort((a,b)=>b.time.localeCompare(a.time));
    const record=ordered.find(r=>r.value!==null) || ordered[0];
    if(record) latest.push({
      ...record,
      freshness:record.value===null ? 'missing' :
        (Date.parse(record.source_day_reported+'T00:00:00Z')-Date.parse(now.toISOString().slice(0,10)+'T00:00:00Z'))>86400000 ? 'invalid_future' :
        (Date.parse(now.toISOString().slice(0,10)+'T00:00:00Z')-Date.parse(record.source_day_reported+'T00:00:00Z'))>3*86400000 ? 'stale' :
        record.source_time_zone==='unspecified' ? 'recent_daily_time_zone_unresolved' : 'current'
    });
  }
  const current=latest.filter(r=>['current','recent_daily_time_zone_unresolved'].includes(r.freshness));
  const commonReportedDay=current.length===5 && new Set(current.map(r=>r.source_day_reported)).size===1
    ? current[0].source_day_reported : null;
  const comparable= !failures.length && wanted.length===5 && current.length===5 &&
    new Set(current.map(r=>r.station_id)).size===5 &&
    current.every(r=>r.unit==='af' && Number.isFinite(r.value)) && commonReportedDay;
  const derivedObservedSum=comparable ? current.reduce((sum,row)=>sum+row.value,0) : null;
  return {
    source_id:'usbr-rise-edr-reservoir-storage',
    source_family:'usbr-rise',
    as_of:now.toISOString(),
    requested_stations:wanted,
    observed_stations:latest.map(r=>r.station_id),
    current_station_count:current.length,
    time_zone_unresolved_count:current.filter(r=>r.source_time_zone==='unspecified').length,
    observations:latest,
    failures,
    status:failures.length || current.length!==wanted.length ? 'partial' : 'recent_five_station_observations_needing_time_zone_review',
    unit:'af',
    // Simple arithmetic for comparable five-site provisional readings, NOT an official basin assessment.
    derived_provisional_sum_af: derivedObservedSum,
    derived_sum_source_reported_day: comparable ? commonReportedDay : null,
    derived_sum_status: comparable ? 'five_site_arithmetic_same_source_reported_day' : 'held_incomplete_or_nonmatching_source_days',
    // The five source timestamps must be reconciled to a single hydrologic reporting day
    // before a total is offered. No basin fill/capacity ratio inferred here.
    total_storage_af:null,
    total_status:'not_computed_pending_local_day_and_completeness_check',
    publication_authorized:false
  };
}
