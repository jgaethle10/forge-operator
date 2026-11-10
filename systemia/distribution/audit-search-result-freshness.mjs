#!/usr/bin/env node
// Read-only search-result freshness audit. Observations are dated snapshots, NOT live search proof.
// This script never crawls search engines, alters public routes, deindexes pages or publishes anything.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCHEMA = 'evercraft.distribution.publisher-ownership.v1';
const LEGACY = /(^|\.)base44\.app$/i;

function safeHttps(value) {
  try { const url=new URL(value); return url.protocol==='https:' && !url.username && !url.password ? url : null; }
  catch { return null; }
}

export function assessSearchResults(ledger) {
  if (ledger?.schema!==SCHEMA || !Array.isArray(ledger.entries)) throw Error('invalid_publisher_ledger');
  if (!Array.isArray(ledger.search_observations)) throw Error('search_observations_missing');
  const seen=new Set(), findings=[], rows=[];
  for (const item of ledger.search_observations) {
    const key=item?.key;
    if (!key || typeof key!=='string' || seen.has(key)) {findings.push({key:key||null,issue:'MISSING_OR_DUPLICATE_KEY'});continue;}
    seen.add(key);
    const result=safeHttps(item.result_url);
    if (!result) findings.push({key,issue:'INVALID_RESULT_URL'});
    else if (!LEGACY.test(result.hostname)) findings.push({key,issue:'LEGACY_RESULT_MUST_HAVE_EXACT_BASE44_HOST'});
    if (item.status!=='LEGACY_INDEXED') findings.push({key,issue:'UNSUPPORTED_OBSERVATION_STATUS'});
    if (!item.query || typeof item.query!=='string') findings.push({key,issue:'SEARCH_QUERY_REQUIRED'});
    if (!/^20\d{2}-\d{2}-\d{2}$/.test(item.observed_on||'')) findings.push({key,issue:'OBSERVATION_DATE_REQUIRED'});
    if (item.replacement_url!==null) {
      const replacement=safeHttps(item.replacement_url);
      if (!replacement || LEGACY.test(replacement.hostname)) findings.push({key,issue:'INVALID_OWNED_REPLACEMENT'});
      const proof=item.replacement_proof;
      if (proof?.status!=='VERIFIED' || !safeHttps(proof.receipt_url) || !proof.verified_at) {
        findings.push({key,issue:'REPLACEMENT_NOT_INDEPENDENTLY_VERIFIED'});
      }
    }
    rows.push({
      key, product:item.product||null, observed_on:item.observed_on||null,
      query:item.query||null, indexed_url:result?.href||item.result_url||null,
      observation:'HISTORICAL_SEARCH_RESULT_NOT_CURRENT_INDEX_PROOF',
      legacy_host:result?LEGACY.test(result.hostname):null,
      replacement_url:item.replacement_url||null,
      replacement_status:item.replacement_url?'CLAIM_REQUIRES_RECEIPT':'NOT_VERIFIED',
      next_action:item.replacement_url?'REVALIDATE_REPLACEMENT_AND_REQUEST_AUTHORIZED_REINDEX':'VERIFY_OWNED_CANONICAL_BEFORE_REINDEX',
      provider_pickup_verified:false,
      buyer_conversion_verified:false
    });
  }
  return {
    schema:'evercraft.distribution.search-result-freshness.v1',
    source_ledger_schema:SCHEMA,
    snapshot_only:true,
    search_engine_live_query_performed:false,
    live_origin_reachability_verified:false,
    status:findings.length?'BLOCKED':rows.some(r=>r.legacy_host)?'HISTORICAL_LEGACY_RESULTS_OBSERVED':'NO_LEGACY_RESULTS_OBSERVED',
    summary:{observations:rows.length,legacy_indexed:rows.filter(r=>r.legacy_host).length,unverified_replacements:rows.filter(r=>!r.replacement_url).length,findings:findings.length},
    rows,findings,
    action_boundary:'No redirect, deindex, publication, checkout, or claims of current search pickup are authorized.'
  };
}

export function run(input='systemia/distribution/publisher-ownership.json',output='/tmp/evercraft-search-result-freshness.json'){
  const ledger=JSON.parse(readFileSync(input,'utf8'));
  const report={...assessSearchResults(ledger),generated_at:new Date().toISOString()};
  writeFileSync(output,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({status:report.status,summary:report.summary,receipt_path:output},null,2));
  if(report.findings.length) process.exitCode=1;
  return report;
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  run(process.argv[2],process.argv[3]);
}
