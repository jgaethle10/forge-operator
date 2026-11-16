// Read-only LIVE directory observation for Worlds radio launch review.
// Actual stream playback, legal rights, and physical-device audio are NOT tested.
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {
  RADIO_PRESETS,RADIO_BROWSER_MIRRORS,radioQuery,radioRegionalQuery,
  normalizeRadioStations
} from '../public/worlds/world-radio-core.mjs';

const out=resolve('artifacts/evercraft-worlds-radio');
await mkdir(out,{recursive:true});
const receipt={
  schema:'evercraft.worlds.radio.live-directory-probe.v1',
  observed_at_utc:new Date().toISOString(),
  live_directory_attempted:true,
  stream_playback_verified:false,
  physical_mobile_verified:false,
  production_deployed:false,
  results:[]
};
const targetNames=['Yakima, Washington','Seattle, Washington','London'];
let failures=0;

async function oneAttempt(host,query,searchKind,place){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),10000);
  try{
    const response=await fetch(host+query,{
      headers:{'User-Agent':'EvercraftWorldsRadioProbe/0.2','Accept':'application/json'},
      signal:controller.signal
    });
    if(!response.ok)throw Error('HTTP '+response.status);
    const rows=await response.json();
    if(!Array.isArray(rows))throw Error('non-array response');
    const stations=normalizeRadioStations(rows,place.lat,place.lon,350);
    return {
      status:'response_received',
      search:searchKind,
      mirror_host:new URL(host).host,
      candidate_count:rows.length,
      geo_valid_https_count:stations.length,
      // For operator review only: no listener IPs, stream URLs or audio bytes.
      samples:stations.slice(0,5).map(s=>({
        name:s.name,region:s.region,country:s.country,distanceKm:s.distanceKm,codec:s.codec
      }))
    };
  }finally{clearTimeout(timer);}
}

for(const name of targetNames){
  const place=RADIO_PRESETS.find(p=>p.name===name);
  const result={place:name,lat:place.lat,lon:place.lon,attempts:[]};
  const queries=[{kind:'geo_radius',path:radioQuery(place.lat,place.lon,350)}];
  const fallback=radioRegionalQuery(place);
  if(fallback)queries.push({kind:'country_state_candidates',path:fallback});
  for(const query of queries){
    let gotResponse=false;
    for(const host of RADIO_BROWSER_MIRRORS){
      try{
        const observed=await oneAttempt(host,query.path,query.kind,place);
        result.attempts.push(observed);
        gotResponse=true;
        if(observed.geo_valid_https_count>0){
          result.status='nearby_metadata_observed';
          result.count=observed.geo_valid_https_count;
          break;
        }
        // A valid empty response is not a live station; try the fallback query.
        break;
      }catch(error){
        result.attempts.push({status:'error',mirror_host:new URL(host).host,
          search:query.kind,reason:String(error?.name||'Error').slice(0,80)});
      }
    }
    if(result.status==='nearby_metadata_observed')break;
    if(!gotResponse)continue;
  }
  if(!result.status){result.status='not_verified';failures++;}
  receipt.results.push(result);
}
receipt.status=failures===0?'DIRECTORY_METADATA_OBSERVED':'INCOMPLETE_DIRECTORY_OBSERVATION';
await writeFile(out+'/live-directory-receipt.json',JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify(receipt,null,2));
if(failures)process.exitCode=1;
