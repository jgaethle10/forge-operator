import fs from 'node:fs';
import path from 'node:path';
import {claimFreshnessSlot,finishFreshnessSlot} from './session-freshness-slot.mjs';

export const OWNED_FRESHNESS_SCHEMA='evercraft.rivet.owned-session-freshness-receipt.v1';
export const DEFAULT_MINUTE=32; // Base44 compatibility cron runs at :12 UTC.
const clean=value=>String(value??'').trim();

export function validateRefreshEndpoint(endpoint,{trustedOrigin}={}){
  let url;
  try{url=new URL(clean(endpoint))}catch{throw new Error('refresh_endpoint_invalid')}
  if(url.protocol!=='https:' || url.username || url.password || url.search || url.hash ||
     !url.pathname.endsWith('/functions/refreshSessionFreshness')){
    throw new Error('refresh_endpoint_must_be_https_exact_function');
  }
  if(!url.hostname || url.hostname==='localhost' || url.hostname.endsWith('.local') ||
     /^\d+\.\d+\.\d+\.\d+$/.test(url.hostname))throw new Error('refresh_endpoint_host_invalid');
  // Never send machine credentials to a host learned only from the request URL.
  if(!clean(trustedOrigin))throw new Error('trusted_refresh_origin_required');
  let trusted;
  try{trusted=new URL(clean(trustedOrigin))}catch{throw new Error('trusted_refresh_origin_invalid')}
  if(trusted.protocol!=='https:' || trusted.username || trusted.password || trusted.search || trusted.hash ||
     trusted.pathname!=='/' || trusted.origin!==clean(trustedOrigin).replace(/\/$/,'')){
    throw new Error('trusted_refresh_origin_invalid');
  }
  if(url.origin!==trusted.origin)throw new Error('refresh_endpoint_origin_not_admitted');
  return url.toString();
}
function requireIso(value,label){
  const s=clean(value);
  if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(s) ||
     !Number.isFinite(Date.parse(s)))throw new Error(label+'_missing_or_invalid');
  return s;
}
function receiptFromBody(body,{requestedAt,endpoint,receivedAt}){
  if(!body || typeof body!=='object')throw new Error('response_json_required');
  const state=clean(body.state);
  if(state==='skipped_recent_cycle')return {
    schema:OWNED_FRESHNESS_SCHEMA,state:'SKIPPED_NOT_NEW_EVIDENCE',ok:false,
    attempted_at:requestedAt,received_at:receivedAt,
    prior_refreshed_at:body.last_refreshed_at||null,
    reason:'A previously completed cycle already falls inside the upstream dedupe window.'
  };
  if(!['refreshed','completed_with_source_failures'].includes(state))throw new Error('unexpected_refresh_state_'+state);
  const refreshedAt=requireIso(body.refreshed_at,'refreshed_at');
  const receiptId=clean(body.receipt_source_record_id);
  if(!receiptId)throw new Error('source_cycle_receipt_id_required');
  if(Date.parse(refreshedAt)>Date.parse(receivedAt)+120000 ||
     Date.parse(refreshedAt)<Date.parse(requestedAt)-120000)throw new Error('refresh_timestamp_outside_invocation_window');
  if(!Array.isArray(body.failed_sources))throw new Error('failed_sources_contract_required');
  if(!Array.isArray(body.results) || body.results.length<4)throw new Error('dynamic_source_results_contract_required');
  const requiredDynamic=['ingestNYCPlugNYCObservedUsage','ingestNYCPlugNYCSessions','penndot_nevi_observed_usage','ingestCaryObservedUsage'];
  const operations=body.results.map(row=>({name:clean(row?.name),ok:row?.ok===true}));
  if(!requiredDynamic.every(name=>operations.some(row=>row.name===name)))throw new Error('required_dynamic_sources_not_reconciled');
  const sourceFailures=operations.filter(row=>!row.ok).map(row=>row.name||'unnamed_source');
  const watch=body.historical_watch;
  if(!watch || !Number.isSafeInteger(watch.warning_count) || watch.warning_count<0)throw new Error('historical_watch_contract_required');
  const failedSources=[...new Set([...body.failed_sources.map(clean).filter(Boolean),...sourceFailures])];
  const warningCount=watch.warning_count;
  const countValid=Number.isSafeInteger(watch.eligible_source_count)&&watch.eligible_source_count>0 &&
    Number.isSafeInteger(watch.probed_source_count)&&watch.probed_source_count>0 &&
    watch.probed_source_count<=watch.eligible_source_count;
  const sweepHours=watch.estimated_full_sweep_hours;
  const sweepValid=Number.isSafeInteger(sweepHours)&&sweepHours>=0;
  const inventoryUnknown=!countValid || !sweepValid;
  const missedSweepSla=sweepValid&&sweepHours>6;
  const degraded=body.ok!==true || state==='completed_with_source_failures' || failedSources.length>0 ||
    warningCount>0 || inventoryUnknown || missedSweepSla;
  return {
    schema:OWNED_FRESHNESS_SCHEMA, state:degraded?'DEGRADED':'VERIFIED',ok:!degraded,
    attempted_at:requestedAt,received_at:receivedAt,refreshed_at:refreshedAt,
    source_receipt_id:receiptId,
    critical_failed_sources:failedSources,
    historical_watch:{
      eligible_source_count:body.historical_watch?.eligible_source_count??null,
      probed_source_count:body.historical_watch?.probed_source_count??null,
      estimated_full_sweep_hours:body.historical_watch?.estimated_full_sweep_hours??null,
      warning_count:Number.isSafeInteger(warningCount)?warningCount:null
    },
    latest_observed_at:null,
    observation_semantics:'No observation vintage is inferred from this refresh receipt. Only source-native event/period dates can set latest_observed_at.',
    target_endpoint_origin:new URL(endpoint).origin
  };
}
export async function invokeSessionRefresh({
  endpoint,machineKey,trustedOrigin=process.env.ALIEV_SESSION_REFRESH_TRUSTED_ORIGIN,fetchImpl=fetch,now=()=>new Date().toISOString(),timeoutMs=90000
}={}){
  const url=validateRefreshEndpoint(endpoint,{trustedOrigin});
  if(!clean(machineKey))throw new Error('SYSTEMIA_MACHINE_KEY_required');
  if(!Number.isInteger(timeoutMs)||timeoutMs<1000||timeoutMs>110000)throw new Error('timeout_ms_invalid');
  const requestedAt=requireIso(now(),'request_time');
  const response=await fetchImpl(url,{
    method:'POST',
    redirect:'error',
    headers:{'content-type':'application/json','accept':'application/json','x-systemia-machine-key':machineKey},
    body:JSON.stringify({force:false}),
    signal:AbortSignal.timeout(timeoutMs)
  });
  if(!response.ok)throw new Error('refresh_http_'+response.status);
  const body=await response.json();
  return receiptFromBody(body,{requestedAt,endpoint:url,receivedAt:requireIso(now(),'response_time')});
}
export function appendLocalReceipt(ledgerPath,receipt){
  if(!clean(ledgerPath))throw new Error('receipt_ledger_path_required');
  const folder=path.dirname(path.resolve(ledgerPath));
  fs.mkdirSync(folder,{recursive:true,mode:0o700});
  fs.appendFileSync(path.resolve(ledgerPath),JSON.stringify(receipt)+'\n',{encoding:'utf8',mode:0o600,flag:'a'});
  return receipt;
}
export async function runOwnedFreshnessOnce({
  endpoint=process.env.ALIEV_SESSION_REFRESH_URL,
  trustedOrigin=process.env.ALIEV_SESSION_REFRESH_TRUSTED_ORIGIN,
  machineKey=process.env.SYSTEMIA_MACHINE_KEY,
  ledgerPath=process.env.EVERCRAFT_FRESHNESS_RECEIPT_LEDGER,
  fetchImpl=fetch,now=()=>new Date().toISOString()
}={}){
  if(!clean(ledgerPath))throw new Error('EVERCRAFT_FRESHNESS_RECEIPT_LEDGER_required');
  let result;
  try{
    result=await invokeSessionRefresh({endpoint,machineKey,trustedOrigin,fetchImpl,now});
  }catch(error){
    // Never serialize arbitrary network/SDK exception text: it may contain
    // response content, configuration values, credentials, or private URLs.
    const reason=clean(error instanceof Error?error.message:error);
    const safe=/^refresh_http_[1-5][0-9]{2}$/.test(reason)?reason:
      reason==='refresh_endpoint_origin_not_admitted'?'refresh_endpoint_origin_not_admitted':
      reason==='trusted_refresh_origin_required'?'trusted_refresh_origin_required':
      reason==='trusted_refresh_origin_invalid'?'trusted_refresh_origin_invalid':
      reason==='SYSTEMIA_MACHINE_KEY_required'?'machine_identity_unavailable':
      'owned_refresh_invocation_failed';
    result={schema:OWNED_FRESHNESS_SCHEMA,ok:false,state:'FAILED',
      attempted_at:now(),error_code:safe};
  }
  return appendLocalReceipt(ledgerPath,result);
}
export function utcSlot(now=new Date(),minute=DEFAULT_MINUTE){
  if(!Number.isInteger(minute)||minute<0||minute>59)throw new Error('scheduler_minute_invalid');
  if(now.getUTCMinutes()!==minute)return null;
  return now.toISOString().slice(0,13)+'Z';
}
export async function startOwnedSessionFreshnessResident({
  enabled=process.env.EVERCRAFT_FRESHNESS_RESIDENT_ENABLE==='1',
  minute=DEFAULT_MINUTE,
  periodMs=15000,
  slotStateDir=process.env.EVERCRAFT_FRESHNESS_SLOT_DIR,
  run=()=>runOwnedFreshnessOnce(),
  clock=()=>new Date(),
  onError=error=>console.error('owned_session_freshness_error',clean(error?.message||error))
}={}){
  if(!enabled)throw new Error('resident_disabled_until_explicit_enablement');
  if(!Number.isInteger(periodMs)||periodMs<1000)throw new Error('poll_period_invalid');
  if(!clean(slotStateDir))throw new Error('durable_slot_state_directory_required');
  let lastSlot=null,active=false,closed=false;
  const tick=async()=>{
    if(closed||active)return;
    const slot=utcSlot(clock(),minute);
    if(!slot||slot===lastSlot)return;
    let lease;
    try{lease=claimFreshnessSlot({stateDir:slotStateDir,slot})}
    catch(error){onError(error);return}
    lastSlot=slot;
    if(!lease.admitted)return;
    active=true;
    try{
      const receipt=await run();
      finishFreshnessSlot(lease,{receipt});
    }catch(error){
      onError(error);
      try{finishFreshnessSlot(lease,{receipt:{ok:false,state:'FAILED'}})}
      catch(finalizeError){onError(finalizeError)}
    }finally{active=false}
  };
  const timer=setInterval(()=>{void tick()},periodMs);
  timer.unref?.();
  await tick();
  return {close:()=>{closed=true;clearInterval(timer)},tick,get lastSlot(){return lastSlot}};
}
if(process.argv[1] && import.meta.url===new URL('file://'+path.resolve(process.argv[1])).href){
  const mode=process.argv[2]||'';
  if(mode==='--once'){
    if(process.env.EVERCRAFT_FRESHNESS_RUN_ENABLED!=='1')throw new Error('owned_freshness_execution_disabled');
    const result=await runOwnedFreshnessOnce();
    console.log(JSON.stringify({schema:result.schema,state:result.state,source_receipt_id:result.source_receipt_id||null}));
    if(!result.ok)process.exitCode=1;
  }else if(mode==='--resident'){
    const handle=await startOwnedSessionFreshnessResident();
    // Keep resident alive until explicitly terminated; no production service is implied.
    process.on('SIGTERM',()=>{handle.close();process.exit(0)});
    process.on('SIGINT',()=>{handle.close();process.exit(0)});
    setInterval(()=>{},60000);
  }else throw new Error('usage: node session-freshness-resident.mjs --once|--resident');
}
