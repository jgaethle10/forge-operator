#!/usr/bin/env node
/**
 * Systemia-governed RIVET/AliEV session freshness bridge.
 * One cycle only. Systemia resident supervisor owns cadence and admission.
 * Compatibility target is allowed explicitly until the owned ingest route is verified.
 * No arbitrary URL targets, silent fallback, or claimed success without a source receipt.
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const SCHEMA='evercraft.rivet.session-freshness-owned-supervisor.v1';
const LEGACY_ENDPOINT='https://aliev.base44.app/api/functions/refreshSessionFreshness';

export function validateRefreshEndpoint(value){
  let url;
  try{url=new URL(String(value||''));}catch{return null;}
  if(url.toString()!==LEGACY_ENDPOINT || url.username || url.password || url.hash || url.search)return null;
  return url.toString();
}

export function assessFreshnessReceipt(payload,nowMs=Date.now()){
  const body=payload&&typeof payload==='object'?payload:{};
  if(body.ok!==true)return {ok:false,state:'held_source_refresh_failed',error:'source_returned_failure'};
  if(body.state==='skipped_recent_cycle'){
    const lastMs=Date.parse(String(body.last_refreshed_at||''));
    if(Number.isFinite(lastMs) && lastMs<=nowMs+60000 && nowMs-lastMs<=90*60000){
      return {ok:true,state:'recent_cycle_skipped',receipt_verified:false,last_refreshed_at:body.last_refreshed_at};
    }
    return {ok:false,state:'held_recent_cycle_unverifiable',error:'recent_skip_missing_or_stale_timestamp'};
  }
  if(body.state!=='refreshed')return {ok:false,state:'held_unrecognized_refresh_state',error:String(body.state||'missing_state')};
  const sourceMs=Date.parse(String(body.refreshed_at||''));
  if(!Number.isFinite(sourceMs)||sourceMs>nowMs+60000||nowMs-sourceMs>90*60000){
    return {ok:false,state:'held_bad_refresh_timestamp',error:'missing_future_or_stale_refresh_time'};
  }
  const receiptId=String(body.receipt_source_record_id||'').trim();
  if(!receiptId)return {ok:false,state:'held_missing_receipt_id',error:'no_source_receipt_id'};
  if(!Array.isArray(body.results)||!body.results.length||body.results.some(x=>x?.ok!==true)){
    return {ok:false,state:'held_partial_dynamic_refresh',error:'source_operations_missing_or_failed'};
  }
  const history=body.historical_watch;
  if(!history||!Number.isInteger(history.probed_source_count)||history.probed_source_count<1){
    return {ok:false,state:'held_historical_scan_unverified',error:'historical_watch_no_probe_receipt'};
  }
  if(history.inventory_may_be_truncated===true){
    return {ok:false,state:'held_historical_inventory_truncated',error:'library_scan_limit_reached'};
  }
  return {
    ok:true,state:history.warning_count>0?'verified_with_historical_warnings':'verified',
    receipt_verified:true,receipt_source_record_id:receiptId,
    refreshed_at:body.refreshed_at,
    dynamic_source_operations:body.results.length,
    historical_source_eligible:history.eligible_source_count??null,
    historical_source_probed:history.probed_source_count,
    historical_sweep_hours:history.estimated_full_sweep_hours??null,
    historical_watch_warnings:history.warning_count??0,
    source_semantics:'source scan freshness is distinct from source observation vintage'
  };
}

export async function runSessionFreshnessOnce({url,token,fetchImpl=fetch,now=()=>Date.now()}={}){
  if(!url)return {ok:false,state:'held_missing_refresh_url'};
  const target=validateRefreshEndpoint(url);
  if(!target)return {ok:false,state:'held_unapproved_refresh_origin'};
  if(!token)return {ok:false,state:'held_missing_systemia_machine_key'};
  try{
    const response=await fetchImpl(target,{
      method:'POST',redirect:'manual',
      headers:{
        'Content-Type':'application/json',
        'Accept':'application/json',
        'x-systemia-machine-key':String(token)
      },
      body:JSON.stringify({}),
      signal:AbortSignal.timeout(120000)
    });
    if(!response.ok)return {ok:false,state:'held_refresh_http_error',http_status:response.status};
    const body=await response.json();
    return assessFreshnessReceipt(body,now());
  }catch(error){
    return {ok:false,state:'held_refresh_transport_error',error:error instanceof Error?error.message:String(error)};
  }
}

function argument(name,fallback=''){
  const index=process.argv.indexOf(name);
  return index>=0?String(process.argv[index+1]||''):fallback;
}
async function main(){
  const secretFile=argument('--secret-file');
  let key=String(process.env.SYSTEMIA_MACHINE_KEY||'').trim();
  if(secretFile){
    try{key=readFileSync(secretFile,'utf8').trim();}catch{
      process.stdout.write(JSON.stringify({schema:SCHEMA,ok:false,state:'held_secret_file_unreadable'})+'\n');
      process.exitCode=1;return;
    }
  }
  const result=await runSessionFreshnessOnce({
    url:argument('--url',process.env.ALIEV_SESSION_REFRESH_URL||''),
    token:key
  });
  process.stdout.write(JSON.stringify({schema:SCHEMA,owner:'systemia',runtime:'Evercraft Compute',...result})+'\n');
  if(!result.ok)process.exitCode=1;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  await main();
}
