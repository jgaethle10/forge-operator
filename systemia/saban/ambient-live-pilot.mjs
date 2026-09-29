#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { resolveAmbientCapabilities } from './ambient-capability-resolver.mjs';

const sha=(value)=>'sha256:'+createHash('sha256').update(
  typeof value==='string'?value:JSON.stringify(value)
).digest('hex');

function arg(name,fallback=null){
  const prefix=name+'=';
  const found=process.argv.slice(2).find((item)=>item.startsWith(prefix));
  return found?found.slice(prefix.length):fallback;
}

async function getText(url,{timeoutMs=12000}={}){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetch(url,{
      signal:controller.signal,
      headers:{
        'user-agent':'Evercraft-Saban-Ambient-Pilot/1.0 (+https://github.com/jgaethle10/forge-operator)',
        'accept':'text/plain',
      },
    });
    if(!response.ok) return {ok:false,status:response.status,error:'http_'+response.status};
    return {ok:true,status:response.status,data:await response.text()};
  }catch(error){
    return {ok:false,status:0,error:String(error?.name||error?.message||error)};
  }finally{
    clearTimeout(timer);
  }
}

async function getJson(url,{timeoutMs=12000}={}){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetch(url,{
      signal:controller.signal,
      headers:{
        'user-agent':'Evercraft-Saban-Ambient-Pilot/1.0 (+https://github.com/jgaethle10/forge-operator)',
        'accept':'application/json',
      },
    });
    if(response.status===204) return {ok:true,status:204,data:null};
    if(!response.ok) return {ok:false,status:response.status,error:'http_'+response.status};
    return {ok:true,status:response.status,data:await response.json()};
  }catch(error){
    return {ok:false,status:0,error:String(error?.name||error?.message||error)};
  }finally{
    clearTimeout(timer);
  }
}

function finite(value){
  const n=Number(value);
  return Number.isFinite(n)?n:null;
}

function aircraftCapability(ac){
  const hex=String(ac?.hex||'').trim().toLowerCase();
  if(!hex) return null;
  return {
    id:'adsb:'+hex,
    source_type:'aircraft',
    access_class:'open_protocol',
    kind:'observation',
    operations:['observe','receive'],
    protocol:'ADS-B',
    terms_ref:'https://www.adsb.lol/docs/open-data/api/',
    observed_at:new Date().toISOString(),
    metadata:{
      callsign:String(ac?.flight||'').trim()||null,
      registration:String(ac?.r||'').trim()||null,
      aircraft_type:String(ac?.t||'').trim()||null,
      latitude:finite(ac?.lat),
      longitude:finite(ac?.lon),
      altitude_baro:ac?.alt_baro??null,
      ground_speed_knots:finite(ac?.gs),
      track_degrees:finite(ac?.track),
      squawk:String(ac?.squawk||'').trim()||null,
      distance_nm:finite(ac?.dst),
      seconds_since_seen:finite(ac?.seen),
    },
  };
}

function metarCapability(row){
  const station=String(row?.icaoId||row?.stationId||'KSEA').trim();
  return {
    id:'metar:'+station,
    source_type:'aviation_weather_station',
    access_class:'public_observation',
    kind:'observation',
    operations:['observe'],
    protocol:'METAR HTTPS',
    terms_ref:'https://aviationweather.gov/data/api/',
    observed_at:new Date().toISOString(),
    metadata:{
      station,
      observation_time:row?.reportTime||row?.obsTime||null,
      raw_observation:row?.rawOb||row?.raw_text||null,
      temperature_c:finite(row?.temp),
      dewpoint_c:finite(row?.dewp),
      wind_direction_degrees:finite(row?.wdir),
      wind_speed_knots:finite(row?.wspd),
      visibility_miles:finite(row?.visib),
      altimeter_hpa:finite(row?.altim),
    },
  };
}

function ndbcCapability(text,station='46041'){
  const lines=String(text||'').split(/\r?\n/).map((line)=>line.trim()).filter(Boolean);
  const header=lines.find((line)=>line.startsWith('#YY'))||'';
  const units=lines.find((line)=>line.startsWith('#yr'))||'';
  const data=lines.find((line)=>!line.startsWith('#'))||'';
  if(!header||!data) return null;
  const keys=header.replace(/^#/,'').trim().split(/\s+/);
  const values=data.split(/\s+/);
  const row=Object.fromEntries(keys.map((key,index)=>[key,values[index]??null]));
  return {
    id:'ndbc:'+station,
    source_type:'ocean_buoy',
    access_class:'public_observation',
    kind:'observation',
    operations:['observe'],
    protocol:'NDBC realtime text',
    terms_ref:'https://www.ndbc.noaa.gov/faq/realtime.shtml',
    observed_at:new Date().toISOString(),
    metadata:{
      station,
      observation_year:row.YY||null,
      observation_month:row.MM||null,
      observation_day:row.DD||null,
      observation_hour:row.hh||null,
      observation_minute:row.mm||null,
      wind_direction_degrees:finite(row.WDIR),
      wind_speed_mps:finite(row.WSPD),
      gust_mps:finite(row.GST),
      wave_height_m:finite(row.WVHT),
      dominant_wave_period_s:finite(row.DPD),
      pressure_hpa:finite(row.PRES),
      air_temperature_c:finite(row.ATMP),
      water_temperature_c:finite(row.WTMP),
      header_units:units||null,
    },
  };
}

export async function runAmbientLivePilot({
  latitude=47.4502,
  longitude=-122.3088,
  radiusNm=50,
  station='KSEA',
}={}){
  const startedAt=new Date().toISOString();
  const adsbUrl=`https://api.adsb.lol/v2/point/${latitude}/${longitude}/${radiusNm}`;
  const metarUrl=`https://aviationweather.gov/api/data/metar?ids=${encodeURIComponent(station)}&format=json`;
  const ndbcStation='46041';
  const ndbcUrl=`https://www.ndbc.noaa.gov/data/realtime2/${ndbcStation}.txt`;

  const [adsb,metar,ndbc]=await Promise.all([
    getJson(adsbUrl),
    getJson(metarUrl),
    getText(ndbcUrl),
  ]);

  const aircraft=adsb.ok&&Array.isArray(adsb.data?.ac)?adsb.data.ac:[];
  const metars=metar.ok&&Array.isArray(metar.data)?metar.data:[];
  const buoy=ndbc.ok?ndbcCapability(ndbc.data,ndbcStation):null;

  const capabilities=[
    ...aircraft.map(aircraftCapability).filter(Boolean),
    ...metars.slice(0,1).map(metarCapability),
    ...(buoy?[buoy]:[]),
  ];

  const observation=resolveAmbientCapabilities({
    capabilities,
    requestedOperation:'observe',
    requestedKinds:['observation'],
  });
  const computeAttempt=resolveAmbientCapabilities({
    capabilities,
    requestedOperation:'compute',
    requestedKinds:['compute'],
  });

  const sourceState={
    adsb_lol:{
      ok:adsb.ok,
      http_status:adsb.status,
      aircraft_count:aircraft.length,
      provider:'adsb.lol',
      license:'ODbL-1.0',
      query_scope:{radius_nm:radiusNm},
      error:adsb.error||null,
    },
    aviation_weather:{
      ok:metar.ok,
      http_status:metar.status,
      metar_count:metars.length,
      provider:'NOAA Aviation Weather Center',
      station,
      error:metar.error||null,
    },
    ndbc_buoy:{
      ok:ndbc.ok&&Boolean(buoy),
      http_status:ndbc.status,
      station:ndbcStation,
      provider:'NOAA National Data Buoy Center',
      error:ndbc.error||(!buoy?'parse_failed':null),
    },
  };

  const body={
    schema:'evercraft.saban.ambient-live-pilot.v1',
    live_network_requests:true,
    synthetic_data:false,
    started_at:startedAt,
    completed_at:new Date().toISOString(),
    source_state:sourceState,
    discovered_capability_count:capabilities.length,
    admitted_observation_count:observation.eligible.length,
    rejected_observation_count:observation.rejected.length,
    compute_eligible_count:computeAttempt.eligible.length,
    control_or_compute_inferred_from_visibility:false,
    sample_aircraft:aircraft.slice(0,10).map((ac)=>({
      hex:String(ac?.hex||'').trim().toLowerCase()||null,
      callsign:String(ac?.flight||'').trim()||null,
      registration:String(ac?.r||'').trim()||null,
      aircraft_type:String(ac?.t||'').trim()||null,
      altitude_baro:ac?.alt_baro??null,
      ground_speed_knots:finite(ac?.gs),
      distance_nm:finite(ac?.dst),
      seconds_since_seen:finite(ac?.seen),
    })),
    metar_sample:metars[0]?metarCapability(metars[0]).metadata:null,
    buoy_sample:buoy?.metadata||null,
    observation_resolution_receipt:observation.receipt,
    compute_rejection_receipt:computeAttempt.receipt,
  };
  const result={...body,receipt_hash:sha(body)};

  if(!adsb.ok) throw Object.assign(new Error('live_adsb_source_failed'),{result});
  if(aircraft.length<1) throw Object.assign(new Error('live_adsb_returned_no_aircraft'),{result});
  if(!metar.ok || metars.length<1) throw Object.assign(new Error('live_metar_source_failed_or_empty'),{result});
  if(!ndbc.ok || !buoy) throw Object.assign(new Error('live_ndbc_buoy_source_failed_or_empty'),{result});
  if(observation.eligible.length<3) throw Object.assign(new Error('ambient_observation_admission_failed'),{result});
  if(computeAttempt.eligible.length!==0) throw Object.assign(new Error('ambient_visibility_incorrectly_granted_compute'),{result});

  return result;
}

if(import.meta.url===`file://${process.argv[1]}`){
  const out=arg('--out',null);
  try{
    const result=await runAmbientLivePilot();
    if(out){
      const file=path.resolve(out);
      fs.mkdirSync(path.dirname(file),{recursive:true});
      fs.writeFileSync(file,JSON.stringify(result,null,2)+'\n');
    }
    console.log(JSON.stringify(result,null,2));
  }catch(error){
    if(error?.result){
      if(out){
        const file=path.resolve(out);
        fs.mkdirSync(path.dirname(file),{recursive:true});
        fs.writeFileSync(file,JSON.stringify(error.result,null,2)+'\n');
      }
      console.error(JSON.stringify(error.result,null,2));
    }
    console.error(String(error?.message||error));
    process.exitCode=2;
  }
}
