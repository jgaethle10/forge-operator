#!/usr/bin/env node
/**
 * Read-only admission report from earlier Vast offer quote.
 * No key is read; no network or provider calls; cannot rent or destroy.
 */
import fs from 'node:fs';
import path from 'node:path';
import {evaluateRentalPreflight} from './fallen-vast-rental-guard.mjs';
const quotePath=new URL('./briefs/fallen-vast-readonly-offer-quote-20261027.json',import.meta.url);
const quote=JSON.parse(fs.readFileSync(quotePath,'utf8'));
if(quote.mode!=='READ_ONLY'||quote.rental_started!==false) throw Error('unexpected_source_state');
const selected=quote.cheapest_offers?.[0];
if(!selected)throw Error('no_quote_available');
const job={
  job:{mission:'evercraft-fallen-commercial-studio-flagship-20261027',ownerApproved:true,totalBudgetUsd:3,maxRuntimeHours:2,diskGb:24},
  source:{quotedAtUtc:quote.recorded_at_utc,provider:quote.provider,mode:quote.mode},
  offer:{id:selected.offer_id,gpu:selected.gpu,gpuCount:1,usdPerHour:selected.usd_per_hour,reliability:selected.reliability,gpuRamMb:selected.vram_mb,cpuRamMb:selected.ram_mb},
  pricing:{}, // No guess for rates not actually in the snapshot.
  controls:{
    noOtherActiveMissionInstance:false, // Not yet checked against provider instance list.
    hostVerificationCheckedAtRental:false,
    providerBillingReadback:false,
    independentWatchdogActive:false,
    destroyPathTested:false,
    destroyFailureAlertAndRetry:false,
    orphanReconciliationReady:false,
    missionInstanceIdentityGuard:false,
    artifactExportReady:false,
    assetRightsVerified:false,
  },
};
const result=evaluateRentalPreflight(job);
if(result.status!=='HOLD'||result.creationAuthorized!==false||result.rentalStarted!==false){
  throw Error('unexpected_preflight_admission');
}
const doc={...result,quote_source:quote.source_execution,checked_at_utc:new Date().toISOString(),actual_spend_usd:0,quote_offer_id:selected.offer_id};
const output=path.resolve('artifacts/fallen-flagship-council/vast-preflight-hold.json');
fs.mkdirSync(path.dirname(output),{recursive:true});
fs.writeFileSync(output,JSON.stringify(doc,null,2)+'\n');
console.log(JSON.stringify({status:doc.status,blockers:doc.blockers,offer_id:doc.quote_offer_id,estimated_total:doc.computedEstimateUsd.total,provider_mutations:0,artifact:output},null,2));
