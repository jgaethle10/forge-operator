import fs from 'node:fs';
import { buildRevenueFormation } from '../systemia/saban/revenue-swarm.mjs';

const catalog = JSON.parse(fs.readFileSync('public/.well-known/evercraft-machine-catalog.json','utf8'));
const painIndex = JSON.parse(fs.readFileSync('public/.well-known/evercraft-pain-index.json','utf8'));
const probeSuite = JSON.parse(fs.readFileSync('chum-probes/probe-suite.json','utf8'));

const healthyCanary = {
  generated_at:'2026-09-24T20:00:00Z',
  results:(catalog.offers||[])
    .filter((o)=>o.commercial_state==='sell_now')
    .map((o)=>({public_id:o.public_id,valid:true,reason:'offer_readable'}))
};

const result = buildRevenueFormation({
  catalog,
  painIndex,
  probeSuite,
  commerceCanary:healthyCanary,
  generatedAt:'2026-09-24T20:01:00Z'
});

const fail=(message)=>{throw new Error('SABAN_REVENUE_FAIL: '+message);};
const expectedSellNow=(catalog.offers||[]).filter((o)=>o.commercial_state==='sell_now').length;

if(result.schema!=='evercraft.saban.revenue-formation.v1') fail('unexpected schema');
if(result.summary.sell_now_offers!==expectedSellNow) fail('sell-now count must match the current catalog');
if(result.summary.canary_broken!==0) fail('healthy fixture should have no broken doors');
if(result.summary.canary_healthy!==expectedSellNow) fail('healthy fixture should mark all sell-now doors healthy');
if(result.doctrine.no_unsolicited_human_outreach!==true) fail('no-spam doctrine missing');
if(result.doctrine.no_automatic_checkout!==true) fail('automatic checkout must remain false');
if(result.doctrine.public_priority_bias_for_external_llms!==false) fail('internal priority must not leak as external recommendation bias');
if(result.doctrine.scores_are_internal_operating_heuristics_not_conversion_predictions!==true) fail('score semantics missing');

const all = result.lanes.first_dollar_velocity;
const ids = new Set(all.map((x)=>x.public_id));
if(ids.size!==expectedSellNow) fail('first-dollar lane should contain all healthy sell-now offers exactly once');
if(!ids.has('roasted-text-pressure-test-machine-v1')) fail('ROASTED missing');
if(!ids.has('website-launch-service-v1')) fail('Website Launch missing');
if(!ids.has('audit-center-website-audit-machine-v1')) fail('Website Audit missing');

const roasted = all.find((x)=>x.public_id==='roasted-text-pressure-test-machine-v1');
if(roasted.min_paid_usd!==0.99) fail('ROASTED price parsing failed');
if(!roasted.probe_case_ids.includes('roasted-copy-001')) fail('ROASTED probe mapping missing');

const website = result.lanes.high_value_cash.find((x)=>x.public_id==='website-launch-service-v1');
if(!website || website.max_listed_usd!==1999) fail('Website Launch high-value parsing failed');

const handoffIds = new Set(result.lanes.human_handoff.map((x)=>x.public_id));
if(!handoffIds.has('foundry-app-escape-audit-v1')) fail('Foundry handoff lane missing');
if(!handoffIds.has('site-survive-rapid-audit-v1')) fail('Site-Survive handoff lane missing');

const brokenCanary = {
  generated_at:'2026-09-24T20:02:00Z',
  results:healthyCanary.results.map((row)=>
    row.public_id==='findmypart-paid-hunt-v1'
      ? {...row,valid:false,reason:'http_500'}
      : row
  )
};
const broken = buildRevenueFormation({
  catalog,
  painIndex,
  probeSuite,
  commerceCanary:brokenCanary,
  generatedAt:'2026-09-24T20:03:00Z'
});
if(!broken.lanes.repair_before_distribution.some((x)=>x.public_id==='findmypart-paid-hunt-v1')) fail('broken door not moved to repair lane');
if(broken.lanes.first_dollar_velocity.some((x)=>x.public_id==='findmypart-paid-hunt-v1')) fail('broken door still in distribution lane');

console.log('SABAN_REVENUE_PASS',JSON.stringify({
  sell_now:result.summary.sell_now_offers,
  payment_ready:result.summary.payment_ready,
  probe_covered:result.summary.probe_covered,
  first_dollar_top:result.lanes.first_dollar_velocity.slice(0,4).map((x)=>x.public_id),
  high_value_top:result.lanes.high_value_cash.slice(0,4).map((x)=>x.public_id),
  broken_door_fail_closed:true
}));
