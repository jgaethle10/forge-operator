// AAAR owned HTTPS readback. Read-only, never creates deployment state or modifies routes.
// A successful public readback is NOT equivalent to physical Safari acceptance.
import {resolve4} from 'node:dns/promises';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

export const ORIGIN='https://worlds.systemiacommandcenters.com';
const HOST='worlds.systemiacommandcenters.com';
const flightPath='/worlds/flight/';
const healthPath='/worlds/api/health';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const sourcePath=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../public/worlds/flight/index.html');

export async function inspectAaarPublic({sourceBytes=null,dnsLookup=resolve4,fetchFn=fetch,clock=()=>new Date().toISOString()}={}){
  const receipt={
    schema:'evercraft.aaar.public-flight-readback.v1',
    inspected_at_utc:clock(),origin:ORIGIN,route:flightPath,mode:'read_only',
    checks:{source:'not_checked',dns:'not_checked',health:'not_checked',flight:'not_checked'},
    verified_readonly:false,live_flight_controls_verified:false,physical_safari_verified:false,
    deployment_approved:false,source_sha256:null,served_sha256:null,reason:'not_checked'
  };
  let expected;
  try {
    expected=sourceBytes===null?await readFile(sourcePath):Buffer.from(sourceBytes);
    if(expected.length<10000||!expected.toString('utf8').includes('id="beginFlight"')){
      receipt.checks.source='invalid';receipt.reason='source_page_invalid';return receipt;
    }
    receipt.source_sha256=sha(expected);receipt.checks.source='pass';
  } catch {receipt.checks.source='unavailable';receipt.reason='source_page_unavailable';return receipt;}
  try {
    const addresses=await dnsLookup(HOST);
    if(!Array.isArray(addresses)||!addresses.length)throw Error('no_records');
    receipt.checks.dns='pass';
  } catch {
    receipt.checks.dns='blocked';receipt.reason='public_dns_resolution_failed';
    return receipt;
  }
  const get=async(path)=>{
    const response=await fetchFn(ORIGIN+path,{method:'GET',cache:'no-store',
      redirect:'error',signal:AbortSignal.timeout(10000)});
    return response;
  };
  try {
    const health=await get(healthPath);
    if(health.status!==200){receipt.checks.health='http_'+health.status;receipt.reason='owned_vault_health_unavailable';return receipt;}
    const body=await health.json();
    if(body?.ok!==true||body?.schema!=='evercraft.worlds.vault.v1'||body?.mode!=='owned-durable-vault'){
      receipt.checks.health='identity_mismatch';receipt.reason='wrong_worlds_health_identity';return receipt;
    }
    receipt.checks.health='pass';
  } catch(e) {
    receipt.checks.health='unreachable';receipt.reason='health_https_'+String(e?.cause?.code||e?.name||'failure').slice(0,50);return receipt;
  }
  try {
    const response=await get(flightPath);
    if(response.status!==200){receipt.checks.flight='http_'+response.status;receipt.reason='flight_route_unavailable';return receipt;}
    if(!/^text\/html\b/i.test(response.headers.get('content-type')||'')){
      receipt.checks.flight='wrong_content_type';receipt.reason='flight_route_not_html';return receipt;
    }
    const body=Buffer.from(await response.arrayBuffer());
    receipt.served_sha256=sha(body);
    if(receipt.served_sha256!==receipt.source_sha256){
      receipt.checks.flight='stale_or_modified';receipt.reason='served_source_mismatch';return receipt;
    }
    receipt.checks.flight='pass';receipt.verified_readonly=true;
    receipt.reason='static_route_verified_browser_and_device_acceptance_pending';
    return receipt;
  } catch(e) {
    receipt.checks.flight='unreachable';receipt.reason='flight_https_'+String(e?.cause?.code||e?.name||'failure').slice(0,50);return receipt;
  }
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const result=await inspectAaarPublic();
  console.log(JSON.stringify(result,null,2));
  if(!result.verified_readonly)process.exitCode=2;
}
