import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {runSessionFreshnessOnce,validateRefreshEndpoint} from '../systemia/organism/rivet-session-freshness-runner.mjs';
import {runCanary as forensiScopeCanary} from '../systemia/distribution/forensiscope-commerce-canary.mjs';

const read=p=>fs.readFileSync(p,'utf8');
const json=p=>JSON.parse(read(p));
test('RIVET resident supervisor no longer schedules the old hourly refresh bridge',()=>{
 const services=json('systemia/core/resident-services.json');
 assert.equal(services.services.some(s=>s.service_key==='rivet-session-freshness'),false);
 const supervisor=json('systemia/core/supervisor.evercraft.compute.json');
 assert.equal(supervisor.supervised_workflows.includes('rivet-session-freshness'),false);
 const manifest=json('systemia/organism/rivet-session-freshness.workflow.json');
 assert.equal(manifest.authority.use_base44_as_temporary_compatibility_bridge,false);
 assert.equal(manifest.operational_network_requests_allowed,false);
 assert.equal(manifest.compatibility_bridge_retired,true);
 assert.match(manifest.hold_state,/FROZEN_BY_FOUNDER/);
});
test('RIVET cannot transmit a machine key to either an old URL or an unverified replacement',async()=>{
 let calls=0;
 for(const url of [
  'https://aliev.base44.app/api/functions/refreshSessionFreshness',
  'https://fabric.systemiacommandcenters.com/unknown-refresh',
  'https://bad.example/extract'
 ]){
  assert.equal(validateRefreshEndpoint(url),null);
  const receipt=await runSessionFreshnessOnce({url,token:'HIDDEN',
   fetchImpl:async()=>{calls++;throw Error('Forbidden outbound call')}});
  assert.equal(receipt.ok,false);
  assert.equal(receipt.external_requests,0);
  assert.equal(receipt.state,'held_owned_freshness_source_required');
  assert.equal(receipt.receipt_verified,false);
  assert.equal(JSON.stringify(receipt).includes('HIDDEN'),false);
 }
 assert.equal(calls,0);
});
test('ForensiScope scheduled probe never requests a legacy site, quote or customer content',async()=>{
 let calls=0;
 const result=await forensiScopeCanary(async()=>{calls++;throw Error('Forbidden outbound call')});
 assert.equal(calls,0);
 assert.equal(result.network_requests,0);
 assert.equal(result.customer_ready,false);
 assert.equal(result.revenue_verified,false);
 assert.equal(result.status,'HELD_LEGACY_PROVIDER_EGRESS_FROZEN');
});
test('Website commercial canary generates a held receipt without a browser or outbound calls',()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-no-legacy-'));
 try{
  const out=path.join(temp,'receipt.json');
  const run=spawnSync(process.execPath,['systemia/evercraft-web/browser-worker/website-commerce-acceptance.mjs'],
   {encoding:'utf8',env:{...process.env,EVERCRAFT_CHECKOUT_RECEIPT:out},timeout:10000});
  assert.equal(run.status,0,run.stderr);
  const receipt=json(out);
  assert.equal(receipt.buyer_ready,false);
  assert.equal(receipt.public_promotion_authorized,false);
  assert.equal(receipt.legacy_provider_requests,0);
  assert.equal(receipt.provider_checkout_attempts,0);
  assert.equal(receipt.origin,null);
  assert.equal(receipt.payment_attempted,false);
 }finally{fs.rmSync(temp,{recursive:true,force:true})}
});
test('Frozen old-provider entry points contain no outgoing legacy URLs or HTTP initiation',()=>{
 const paths=[
  'systemia/distribution/forensiscope-commerce-canary.mjs',
  'systemia/organism/rivet-session-freshness-runner.mjs',
  'systemia/evercraft-web/browser-worker/website-commerce-acceptance.mjs'
 ];
 for(const p of paths){
  const s=read(p);
  assert.doesNotMatch(s,/https?:\/\/[^\s"'`<>]*base44\.app/i,p);
  assert.doesNotMatch(s,/\bfetch\s*\(|\bpage\.goto\s*\(|\bhttps\.request\s*\(/i,p);
 }
 const workflow=read('.github/workflows/forensiscope-commerce-canary.yml');
 assert.doesNotMatch(workflow,/public surface and payment quote probes/i);
 const website=read('.github/workflows/website-commerce-browser-gate.yml');
 assert.doesNotMatch(website,/npx playwright install|Inspect public buyer forms/i);
});
