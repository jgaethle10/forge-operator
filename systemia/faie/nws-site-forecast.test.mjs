import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collectNwsPointForecast,
  nwsPointCoordinates,
  verifiedNwsForecastUrl,
  weatherOperatingFlags
} from './nws-site-forecast.mjs';

const NOW='2026-11-19T20:15:00.000Z';
const forecastUrl='https://api.weather.gov/gridpoints/PDT/11,42/forecast';
const basePeriods=[
  {
    name:'Thursday',startTime:'2026-11-19T21:00:00Z',endTime:'2026-11-20T05:00:00Z',
    isDaytime:true,temperature:98,temperatureUnit:'F',
    probabilityOfPrecipitation:{value:72},windSpeed:'15 to 28 mph',windDirection:'SW',
    shortForecast:'Hot and gusty'
  },
  {
    name:'Thursday Night',startTime:'2026-11-20T05:00:00Z',endTime:'2026-11-20T15:00:00Z',
    isDaytime:false,temperature:30,temperatureUnit:'F',
    probabilityOfPrecipitation:{value:null},windSpeed:'5 mph',windDirection:'N',
    shortForecast:'Cold'
  }
];
function stub({issued='2026-11-19T20:10:00Z',periods=basePeriods,forecastLink=forecastUrl,status=200}={}){
  const calls=[];
  const fetchImpl=async(url,options)=>{
    calls.push({url,options});
    assert.equal(options.redirect,'error');
    assert.equal(options.headers.accept,'application/geo+json');
    if(url.includes('/points/'))return {ok:true,status:200,json:async()=>({properties:{forecast:forecastLink,gridId:'PDT'}})};
    if(url===forecastUrl)return {
      ok:status===200,status,
      json:async()=>({properties:{generatedAt:issued,periods}})
    };
    throw new Error('unexpected_destination_'+url);
  };
  return {fetchImpl,calls};
}

test('NWS forecast reads only canonical NOAA host and preserves forecast evidence type',async()=>{
  const {fetchImpl,calls}=stub();
  const data=await collectNwsPointForecast({
    latitude:46.6021,longitude:-120.5059,retrievedAt:NOW,fetchImpl
  });
  assert.equal(data.schema,'evercraft.faie.nws-point-forecast.v1');
  assert.equal(data.status,'forecast_available');
  assert.equal(data.evidence_state,'MODELED');
  assert.equal(data.forecast_freshness,'current');
  assert.equal(data.forecast_issued_at,'2026-11-19T20:10:00.000Z');
  assert.equal(data.point_url,'https://api.weather.gov/points/46.6021,-120.5059');
  assert.equal(data.forecast_url,forecastUrl);
  assert.equal(data.periods[0].temperature_f,98);
  assert.equal(data.periods[0].precipitation_probability_percent,72);
  assert.equal(data.periods[0].wind_max_mph,28);
  assert.equal(data.periods[1].precipitation_probability_percent,null);
  assert.deepEqual(data.screening_flags.map(x=>x.trigger).sort(),['freeze','heat','rain_chance','wind']);
  assert.equal(data.decision_authority,false);
  assert.equal(data.field_verification_required,true);
  assert.equal(calls.length,2);
});

test('NWS upstream forecast link is constrained to exact NWS gridpoint path, no SSRF',async()=>{
  for(const bad of [
    'http://api.weather.gov/gridpoints/PDT/11,42/forecast',
    'https://evil.example/gridpoints/PDT/11,42/forecast',
    'https://api.weather.gov.evil.example/gridpoints/PDT/11,42/forecast',
    'https://api.weather.gov@evil.example/gridpoints/PDT/11,42/forecast',
    'https://api.weather.gov/alerts/active',
    'https://api.weather.gov/gridpoints/PDT/11,42/forecast?private=1',
    'https://api.weather.gov/gridpoints/PDT/11,42/forecast#redirect'
  ]){
    assert.throws(()=>verifiedNwsForecastUrl(bad),/untrusted|invalid/);
    const {fetchImpl,calls}=stub({forecastLink:bad});
    await assert.rejects(collectNwsPointForecast({
      latitude:46.6021,longitude:-120.5059,retrievedAt:NOW,fetchImpl
    }),/untrusted|invalid/);
    assert.equal(calls.length,1,'an untrusted next-hop URL must never be requested');
  }
});

test('NWS no source timestamp or stale issue is marked unverified, never made current by retrieval',async()=>{
  for(const issued of [null,'2026-11-17T00:00:00Z']){
    const {fetchImpl}=stub({issued});
    const data=await collectNwsPointForecast({latitude:46.6021,longitude:-120.5059,retrievedAt:NOW,fetchImpl});
    assert.equal(data.status,'forecast_freshness_not_verified');
    assert.notEqual(data.forecast_freshness,'current');
    assert.equal(data.evidence_state,'MODELED');
  }
});

test('NWS rejects missing forecast periods or a broken official response',async()=>{
  const empty=stub({periods:[]});
  await assert.rejects(collectNwsPointForecast({
    latitude:46.6021,longitude:-120.5059,retrievedAt:NOW,fetchImpl:empty.fetchImpl
  }),/no_valid_forecast_periods/);
  const bad=stub({status:503});
  await assert.rejects(collectNwsPointForecast({
    latitude:46.6021,longitude:-120.5059,retrievedAt:NOW,fetchImpl:bad.fetchImpl
  }),/nws_http_503/);
  assert.throws(()=>nwsPointCoordinates(47,-220),/coordinates/);
  assert.throws(()=>nwsPointCoordinates(0,0),/coordinates/);
});

test('operational flags are transparent heuristics and do not infer safety from missing data',()=>{
  assert.deepEqual(weatherOperatingFlags([{temperature_f:null,precipitation_probability_percent:null,wind_max_mph:null}]),[]);
  const flags=weatherOperatingFlags([
    {name:'Day 1',start_time:NOW,temperature_f:96,precipitation_probability_percent:65,wind_max_mph:25},
    {name:'Day 2',start_time:NOW,temperature_f:99,precipitation_probability_percent:90,wind_max_mph:40}
  ]);
  assert.equal(flags.length,3,'one first-window cue per type, not one per period');
  assert.ok(flags.every(x=>x.interpretation.includes('Forecast-based screening cue')));
});
