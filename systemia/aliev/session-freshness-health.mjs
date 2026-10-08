import fs from 'node:fs';
import path from 'node:path';
import {validateRefreshEndpoint} from './session-freshness-resident.mjs';

const iso=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value)&&Number.isFinite(Date.parse(value));
const clean=value=>String(value??'').trim();
export const HEALTH_SCHEMA='evercraft.rivet.owned-session-freshness-health.v1';

export function freshnessDeploymentPreflight({
  endpoint=process.env.ALIEV_SESSION_REFRESH_URL,
  trustedOrigin=process.env.ALIEV_SESSION_REFRESH_TRUSTED_ORIGIN,
  machineKey=process.env.SYSTEMIA_MACHINE_KEY,
  ledgerPath=process.env.EVERCRAFT_FRESHNESS_RECEIPT_LEDGER,
  slotStateDir=process.env.EVERCRAFT_FRESHNESS_SLOT_DIR,
  enabled=process.env.EVERCRAFT_FRESHNESS_RESIDENT_ENABLE==='1'
}={}){
  const missing=[];
  if(!clean(trustedOrigin))missing.push('trusted_refresh_origin_not_pinned');
  try{validateRefreshEndpoint(endpoint,{trustedOrigin})}catch{missing.push('refresh_endpoint_invalid_or_untrusted')}
  if(!clean(machineKey))missing.push('systemia_machine_identity_not_provisioned');
  if(!clean(ledgerPath)||!path.isAbsolute(clean(ledgerPath)))missing.push('absolute_receipt_ledger_required');
  if(!clean(slotStateDir)||!path.isAbsolute(clean(slotStateDir)))missing.push('absolute_slot_directory_required');
  if(!enabled)missing.push('resident_not_enabled');
  return {
    schema:'evercraft.rivet.owned-session-freshness-deployment-preflight.v1',
    state:missing.length?'HELD':'CONFIGURED_NOT_YET_LIVE_PROVEN',
    ready_for_live_canary:missing.length===0,
    gaps:missing,
    configured_endpoint_origin:missing.includes('refresh_endpoint_invalid_or_untrusted')?null:new URL(endpoint).origin,
    machine_credential_exposed:false,
    live_invocation_verified:false,
    deployment_attested:false
  };
}

function readLastLine(file){
  const fd=fs.openSync(file,'r');
  try{
    const size=fs.fstatSync(fd).size;
    if(size===0)throw new Error('empty_receipt_ledger');
    const start=Math.max(0,size-65536);
    const buf=Buffer.alloc(size-start);
    fs.readSync(fd,buf,0,buf.length,start);
    const text=buf.toString('utf8');
    // appendLocalReceipt writes a newline as the commit marker. Never treat a
    // torn or unterminated append as durable verification after a crash.
    if(!text.endsWith('\n'))throw new Error('unterminated_receipt_append');
    const lines=text.split('\n').filter(Boolean);
    if(!lines.length)throw new Error('receipt_line_missing');
    const last=lines.at(-1);
    if(last.length>16384)throw new Error('receipt_line_too_large');
    const receipt=JSON.parse(last);
    if(receipt?.schema!=='evercraft.rivet.owned-session-freshness-receipt.v1')throw new Error('receipt_schema_invalid');
    return receipt;
  }finally{fs.closeSync(fd)}
}

export function readFreshnessHealth({
  ledgerPath,
  slotStateDir,
  now=new Date(),
  maxReceiptAgeMinutes=90,
  startedGraceMinutes=10
}={}){
  if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw new Error('valid_clock_required');
  if(!Number.isFinite(maxReceiptAgeMinutes)||maxReceiptAgeMinutes<1)throw new Error('max_receipt_age_invalid');
  if(!Number.isFinite(startedGraceMinutes)||startedGraceMinutes<1)throw new Error('started_grace_invalid');
  const health={
    schema:HEALTH_SCHEMA,state:'NOT_PROVEN',ok:false,checked_at:now.toISOString(),
    last_verified_source_receipt_id:null,last_refreshed_at:null,
    latest_observed_at:null, // Never synthesize source observations from refresh receipts.
    receipt_age_minutes:null,unresolved_slot:null,
    deployment_attested:false,
    issues:[]
  };
  if(clean(slotStateDir)){
    try{
      const slots=fs.readdirSync(slotStateDir).filter(n=>/^\d{4}-\d\d-\d\dT\d\dZ\.json$/.test(n)).sort().reverse();
      for(const name of slots.slice(0,10000)){
        const claim=JSON.parse(fs.readFileSync(path.join(slotStateDir,name),'utf8'));
        if(claim?.state!=='STARTED')continue;
        if(!iso(claim.admitted_at)){health.issues.push('unparseable_started_slot');health.unresolved_slot=name;break}
        const age=(now.getTime()-Date.parse(claim.admitted_at))/60000;
        if(age>=startedGraceMinutes || age<0){health.issues.push('unresolved_started_slot');health.unresolved_slot=name;break}
      }
    }catch(error){if(error?.code!=='ENOENT')health.issues.push('slot_journal_unreadable')}
  }else health.issues.push('slot_journal_not_configured');
  if(!clean(ledgerPath)){health.issues.push('receipt_ledger_not_configured');return health}
  let receipt;
  try{receipt=readLastLine(ledgerPath)}
  catch(error){
    health.issues.push(error?.code==='ENOENT'?'receipt_ledger_missing':'receipt_ledger_invalid_or_unreadable');
    return health
  }
  if(!iso(receipt.received_at)){
    health.issues.push('receipt_timestamp_missing_or_invalid');
    return health;
  }
  const age=(now.getTime()-Date.parse(receipt.received_at))/60000;
  health.receipt_age_minutes=Number(age.toFixed(2));
  if(age<0||age>maxReceiptAgeMinutes)health.issues.push('receipt_stale_or_future');
  if(receipt.state!=='VERIFIED'||receipt.ok!==true)health.issues.push('latest_receipt_not_verified');
  if(!clean(receipt.source_receipt_id)||!iso(receipt.refreshed_at))health.issues.push('source_cycle_lineage_missing');
  health.last_verified_source_receipt_id=receipt.state==='VERIFIED'?receipt.source_receipt_id:null;
  health.last_refreshed_at=iso(receipt.refreshed_at)?receipt.refreshed_at:null;
  if(health.issues.length){
    health.state=health.issues.includes('unresolved_started_slot')?'HOLD_UNRESOLVED_SLOT':
      health.issues.includes('receipt_stale_or_future')?'STALE':'DEGRADED';
    return health;
  }
  health.state='CURRENT_VERIFIED_RECEIPT';
  health.ok=true;
  return health
}

if(process.argv[1] && import.meta.url===new URL('file://'+path.resolve(process.argv[1])).href){
  const command=process.argv[2];
  let result;
  if(command==='--doctor')result=freshnessDeploymentPreflight();
  else if(command==='--health')result=readFreshnessHealth({
    ledgerPath:process.env.EVERCRAFT_FRESHNESS_RECEIPT_LEDGER,
    slotStateDir:process.env.EVERCRAFT_FRESHNESS_SLOT_DIR
  });
  else throw new Error('usage: node session-freshness-health.mjs --doctor|--health');
  process.stdout.write(JSON.stringify(result)+'\n');
  if(command==='--doctor'?!result.ready_for_live_canary:!result.ok)process.exitCode=1;
}
