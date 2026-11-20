// Official National Weather Service point forecast. Forecasts are modeled future
// conditions, never measured site weather, climate normals, or a site verdict.
const NWS_ORIGIN = 'https://api.weather.gov';
const UA = 'Evercraft-FAIE/1.0 (https://fabric.systemiacommandcenters.com/faie/)';
const clamp = (v, lo, hi) => Number.isFinite(v) && v >= lo && v <= hi;
const txt = (v, max = 280) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

export function nwsPointCoordinates(latitude, longitude) {
  const lat = Number(latitude), lon = Number(longitude);
  if (!clamp(lat, 24, 50) || !clamp(lon, -125, -66)) {
    throw new TypeError('NWS point forecast requires explicit contiguous-US coordinates');
  }
  return {latitude:lat,longitude:lon};
}

// An upstream property is untrusted, even when the /points URL was fixed.
export function verifiedNwsForecastUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('nws_forecast_url_invalid'); }
  if(url.protocol !== 'https:' || url.origin !== NWS_ORIGIN ||
     url.username || url.password || url.search || url.hash ||
     !/^\/gridpoints\/[A-Z0-9]{3,5}\/\d+,\d+\/forecast$/.test(url.pathname)) {
    throw new Error('nws_forecast_url_untrusted');
  }
  return url.href;
}

function timestampOrNull(value) {
  if (!value) return null;
  const date=new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
function numericOrNull(value, min, max) {
  if (value === null || value === undefined || value === '') return null;
  const num=Number(value);
  return clamp(num,min,max) ? num : null;
}
function tempFahrenheit(value,unit) {
  const number=numericOrNull(value,-100,150);
  if(number===null)return null;
  if(unit==='F')return number;
  if(unit==='C')return Number((number*9/5+32).toFixed(1));
  return null;
}
function windMph(value) {
  const wind=txt(value,90).toLowerCase();
  if(!/(mph|miles per hour)/.test(wind))return null;
  const nums=(wind.match(/\d+(?:\.\d+)?/g)||[]).map(Number);
  return nums.length ? Math.max(...nums) : null;
}
function periodSummary(item) {
  const start=timestampOrNull(item?.startTime),end=timestampOrNull(item?.endTime);
  if(!start || !end || new Date(end)<=new Date(start))return null;
  return {
    name:txt(item?.name,70),
    start_time:start,
    end_time:end,
    is_daytime:item?.isDaytime===true,
    temperature_f:tempFahrenheit(item?.temperature,item?.temperatureUnit),
    precipitation_probability_percent:numericOrNull(item?.probabilityOfPrecipitation?.value,0,100),
    wind_speed:txt(item?.windSpeed,70)||null,
    wind_direction:txt(item?.windDirection,30)||null,
    wind_max_mph:windMph(item?.windSpeed),
    summary:txt(item?.shortForecast,160)
  };
}

// Transparent thresholds are screening cues for possible operating constraints.
// No formula here estimates crop loss, flight risk, irrigation rights, or buildability.
export function weatherOperatingFlags(periods=[]) {
  const flags=[], seen=new Set();
  const rules=[
    {key:'heat',threshold:'forecast temperature >= 95°F',check:p=>p.temperature_f!==null&&p.temperature_f>=95},
    {key:'freeze',threshold:'forecast temperature <= 32°F',check:p=>p.temperature_f!==null&&p.temperature_f<=32},
    {key:'rain_chance',threshold:'forecast precipitation probability >= 60%',check:p=>p.precipitation_probability_percent!==null&&p.precipitation_probability_percent>=60},
    {key:'wind',threshold:'forecast wind max >= 25 mph',check:p=>p.wind_max_mph!==null&&p.wind_max_mph>=25}
  ];
  for(const period of periods)for(const rule of rules){
    const prior=[...seen].filter(x=>x===rule.key).length;
    if(prior>=1)continue; // only the first period for each trigger
    if(rule.check(period)){
      flags.push({
        trigger:rule.key,
        threshold:rule.threshold,
        period:period.name,
        start_time:period.start_time,
        interpretation:'Forecast-based screening cue; confirm with current NWS updates and site/operator checks.'
      });
      seen.add(rule.key);
    }
  }
  return flags;
}
async function fetchNws(url,fetchImpl) {
  const response=await fetchImpl(url,{
    method:'GET',
    headers:{'accept':'application/geo+json','user-agent':UA},
    redirect:'error',
    signal:AbortSignal.timeout(12000)
  });
  if(!response?.ok)throw new Error('nws_http_'+String(response?.status??'unknown'));
  let data;
  try {
    if(typeof response.json==='function')data=await response.json();
    else data=JSON.parse(await response.text());
  } catch {
    throw new Error('nws_invalid_json');
  }
  if(!data || typeof data!=='object'||!data.properties ||typeof data.properties!=='object'){
    throw new Error('nws_invalid_properties');
  }
  return data.properties;
}

export async function collectNwsPointForecast({
  latitude,longitude,
  fetchImpl=globalThis.fetch,
  retrievedAt=new Date().toISOString()
}={}) {
  const point=nwsPointCoordinates(latitude,longitude);
  if(typeof fetchImpl!=='function')throw new TypeError('fetchImpl required');
  const checked=timestampOrNull(retrievedAt);
  if(!checked)throw new TypeError('retrievedAt must be a valid timestamp');
  const pointUrl=NWS_ORIGIN+'/points/'+point.latitude.toFixed(4)+','+point.longitude.toFixed(4);
  const metadata=await fetchNws(pointUrl,fetchImpl);
  const forecastUrl=verifiedNwsForecastUrl(metadata.forecast);
  const forecast=await fetchNws(forecastUrl,fetchImpl);
  const issuedAt=timestampOrNull(forecast.generatedAt||forecast.updateTime);
  const periods=(Array.isArray(forecast.periods)?forecast.periods:[])
    .map(periodSummary)
    .filter(Boolean)
    .filter(p=>new Date(p.end_time).getTime()>new Date(checked).getTime()-60*60*1000)
    .slice(0,14);
  if(!periods.length)throw new Error('nws_no_valid_forecast_periods');
  const ageHours=issuedAt ? (new Date(checked).getTime()-new Date(issuedAt).getTime())/3600000 : null;
  const freshness=ageHours===null?'unknown':ageHours< -1?'invalid':ageHours>24?'stale':'current';
  const flags=weatherOperatingFlags(periods);
  return {
    schema:'evercraft.faie.nws-point-forecast.v1',
    status:freshness==='current'?'forecast_available':'forecast_freshness_not_verified',
    source:'NOAA National Weather Service',
    source_family:'nws-point-forecast',
    evidence_state:'MODELED',
    point,
    retrieved_at:checked,
    forecast_issued_at:issuedAt,
    forecast_freshness:freshness,
    forecast_office:txt(metadata.gridId||forecast.gridId,20)||null,
    forecast_url:forecastUrl,
    point_url:pointUrl,
    periods,
    screening_flags:flags,
    threshold_rules:{
      heat_f:95,freeze_f:32,rain_chance_percent:60,wind_max_mph:25
    },
    provenance_urls:[pointUrl,forecastUrl],
    limitations:[
      'A grid forecast is not a weather measurement at a property.',
      'Forecast conditions can change. A clear flag list does not establish low risk.',
      'Screening thresholds are transparent heuristics, not crop-specific agronomic thresholds.'
    ],
    field_verification_required:true,
    decision_authority:false,
    publication_authority:false
  };
}
