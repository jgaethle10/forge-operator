#!/usr/bin/env node
// External readback from an independently operated location. This never mutates Systemia.
import {pathToFileURL} from 'node:url';
import {assessPublicPulse} from '../public/kaidance/pulse-source.mjs';
const MAX_BODY=16384;
export function approvedPublicPulseUrl(origin){
 if(typeof origin!=='string')throw Error('origin_required');
 const url=new URL(origin);
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||
   url.pathname!=='/'||!url.hostname||url.port){
   throw Error('approved_https_origin_required');
 }
 return new URL('/kaidance/pulse.json',url).href;
}
export async function readbackPublicKaidance({origin,fetchImpl=fetch,now=Date.now(),timeoutMs=8000}={}){
 const url=approvedPublicPulseUrl(origin);
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),timeoutMs);
 let body;
 try{
  const result=await fetchImpl(url,{
    method:'GET',cache:'no-store',credentials:'omit',redirect:'error',
    signal:controller.signal,headers:{accept:'application/json'},
  });
  if(!result.ok)throw Error('pulse_http_unavailable');
  const length=Number(result.headers?.get?.('content-length')||0);
  if(length>MAX_BODY)throw Error('pulse_too_large');
  body=await result.text();
  if(body.length>MAX_BODY)throw Error('pulse_too_large');
 }finally{clearTimeout(timeout)}
 let parsed;
 try{parsed=JSON.parse(body)}catch{throw Error('pulse_json_invalid')}
 const pulse=assessPublicPulse(parsed,now);
 if(!pulse.ok||!pulse.verified)throw Error('public_pulse_not_verified_live');
 return {
   schema:'evercraft.kaidance.public-external-readback.v1',
   ok:true,verified:true,
   origin:new URL(url).origin,
   cycle_number:pulse.cycle_number,
   heartbeat_age_seconds:pulse.age_seconds,
   observed_at:parsed.observed_at,
   published_at:parsed.published_at,
 };
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const i=process.argv.indexOf('--origin');
 const origin=i>=0?process.argv[i+1]:null;
 try{
  const report=await readbackPublicKaidance({origin});
  console.log(JSON.stringify(report,null,2));
 }catch{
  console.error('KAIDANCE public external readback: HOLD (no independently verified live heartbeat)');
  process.exitCode=1;
 }
}
