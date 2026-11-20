// External, read-only KAIDANCE published-pulse canary. Never treats source tests as field proof.
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {assessPublicPulse} from '../../public/kaidance/pulse-source.mjs';

export async function verifyPublicKaidanceReadback({url,fetchImpl=fetch,now=Date.now()}={}){
 let target;
 try{target=new URL(url)}catch{throw Error('public_url_invalid')}
 if(target.protocol!=='https:'||target.username||target.password||target.search||target.hash||
    target.pathname!=='/kaidance/pulse.json')throw Error('public_url_must_be_owned_https_kaidance_pulse');
 if(typeof fetchImpl!=='function')throw Error('fetcher_required');
 const response=await fetchImpl(target.href,{
  method:'GET',redirect:'error',credentials:'omit',cache:'no-store',
  headers:{accept:'application/json'},signal:AbortSignal.timeout(10_000)
 });
 if(!response.ok)throw Error('public_pulse_http_'+response.status);
 const type=response.headers.get('content-type')||'';
 if(!/application\/(?:json|[a-z0-9.+-]+\+json)/i.test(type))throw Error('unexpected_content_type');
 const body=await response.text();
 if(body.length>8192)throw Error('public_pulse_too_large');
 const parsed=JSON.parse(body);
 const check=assessPublicPulse(parsed,now);
 if(!check.ok||!check.verified)throw Error('public_pulse_not_current_and_verified');
 return {
  schema:'evercraft.kaidance.external-readback.v1',
  status:'verified',
  cycle_number:check.cycle_number,
  cycle_age_seconds:check.age_seconds,
  source_observed_at:new Date(check.observed_at).toISOString(),
  public_published_at:new Date(check.published_at).toISOString(),
  checked_at:new Date(now).toISOString(),
  source_url:target.href
 };
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const i=process.argv.indexOf('--url');
 const url=i>=0?process.argv[i+1]:null;
 if(!url){console.error('usage: node systemia/collider/public-readback.mjs --url https://OWNED-ORIGIN/kaidance/pulse.json');process.exitCode=2}
 else{
  try{console.log(JSON.stringify(await verifyPublicKaidanceReadback({url})))}
  catch(error){console.error('PUBLIC_READBACK_HELD:',String(error.message).replace(/[\r\n]/g,' '));process.exitCode=1}
 }
}
