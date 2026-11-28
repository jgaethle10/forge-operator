import fs from 'node:fs';
import { buildRevenueFormation, buildScopedPortfolio, commercialExclusion } from '../systemia/saban/revenue-swarm.mjs';

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
const expectedSellNow=(catalog.offers||[]).filter((o)=>o.commercial_state==='sell_now'&&!commercialExclusion(o)).length;

if(result.schema!=='evercraft.saban.revenue-formation.v1') fail('unexpected schema');
if(result.summary.sell_now_offers!==expectedSellNow) fail(`expected ${expectedSellNow} current sell-now offers`);
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

const registry = JSON.parse(fs.readFileSync('registry/catalog.json','utf8'));
const expanded = buildRevenueFormation({catalog, painIndex, probeSuite, registry, commerceCanary:healthyCanary});
const scoped = expanded.scoped_portfolio_review;
if(scoped.candidates.length<=expectedSellNow) fail('first-delivery consideration did not expand');
if(!scoped.candidates.some(x=>x.key==='findmypart-repair-shop-desk-v1'&&x.review_mode==='first_delivery_or_paid_discovery_scope_review')) fail('first-delivery FindMyPart missing');
if(!scoped.candidates.some(x=>x.key==='ai-boardroom'&&x.source==='registry_product')) fail('registry scope candidate missing');
if(scoped.candidates.some(x=>/^rivet(?:-|$)/.test(x.key)||/^aliev(?:-|$)/.test(x.key))) fail('retired or legacy held identity admitted');
if(expanded.focus_rotation.some(x=>/^rivet(?:-|$)/.test(x.public_id)||/^aliev(?:-|$)/.test(x.public_id))) fail('retired or legacy held identity in distribution');
if(!scoped.exclusions.some(x=>x.key==='rivet-site-underwriting-v1'&&x.reason==='retired_rivet')) fail('retirement not recorded');
if(!scoped.exclusions.some(x=>x.key==='income-war-map-v1')) fail('explicit hold bypassed');
if(scoped.candidates.some(x=>x.checkout_authorized||x.publication_authorized||x.outreach_authorized||x.commercial_commitment_authorized||x.buyer_need_verified||x.scope_confirmed||x.automation_required_for_consideration)) fail('review lane grants false authority');
if(scoped.distinct_sellable_offer_count!==null||scoped.cross_catalog_identity_reconciled!==false) fail('source overlap must not be counted as distinct sellable offers');
const synthetic=buildScopedPortfolio({catalog:{offers:[
 {public_id:'manual-first-v1',commercial_state:'verification_required'},
 {public_id:'legal-v1',commercial_state:'legal_hold'},
 {public_id:'manual-first-v1',commercial_state:'verification_required'}
]}});
if(synthetic.candidates.length!==1||synthetic.exclusions.length!==1) fail('explicit hold and dedupe failed');
console.log('SABAN_SCOPED_PORTFOLIO_PASS',JSON.stringify({source_counts:scoped.source_counts,excluded:scoped.exclusions.length,review_only:scoped.review_only}));
