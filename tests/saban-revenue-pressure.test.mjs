import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildRevenuePressurePlan,
  scoreSellNowOffer,
  selectRevenueProbeCase
} from '../systemia/saban/revenue-pressure.mjs';

const revenue = JSON.parse(fs.readFileSync('public/chum/revenue.json', 'utf8'));
const probeSuite = JSON.parse(fs.readFileSync('chum-probes/probe-suite.json', 'utf8'));
const providerMatrix = JSON.parse(fs.readFileSync('chum-probes/provider-matrix.json', 'utf8'));

const plan = buildRevenuePressurePlan({
  revenue,
  probeSuite,
  providerCount: providerMatrix.providers.length,
  generatedAt: new Date('2026-09-24T20:00:00Z')
});

assert.equal(plan.schema, 'evercraft.saban.revenue-pressure.v1');
assert.equal(plan.doctrine.no_human_spam, true);
assert.equal(plan.doctrine.no_unsolicited_email_or_dm, true);
assert.equal(plan.doctrine.checkout_is_not_revenue, true);
assert.ok(plan.sell_now_offer_count >= 1);
assert.ok(plan.logical_work_cells >= plan.sell_now_offer_count);
assert.ok(plan.lanes.first_dollar.length >= 1);
assert.ok(plan.lanes.real_revenue.length >= 1);

const roasted = plan.lanes.first_dollar.find(x => x.public_id === 'roasted-text-pressure-test-machine-v1');
const career = plan.lanes.first_dollar.find(x => x.public_id === 'career-command-interview-practice-machine-v1');
const findMyPart = plan.lanes.first_dollar.find(x => x.public_id === 'findmypart-paid-hunt-v1');
assert.ok(roasted || career || findMyPart, 'a low-friction payment-ready offer should be in the first-dollar lane');

const handoff = scoreSellNowOffer({
  public_id: 'handoff',
  machine_state: 'human_handoff_ready',
  intent_terms: ['one'],
  human_ui_required: true,
  entry_paid_offer: { price_usd_normalized: 500 },
  public_url: 'https://example.com'
});
const direct = scoreSellNowOffer({
  public_id: 'direct',
  machine_state: 'payment_ready',
  intent_terms: ['one','two','three','four'],
  human_ui_required: false,
  entry_paid_offer: { price_usd_normalized: 19 },
  public_url: 'https://example.com'
});
assert.ok(direct.first_dollar_score > handoff.first_dollar_score);

const firstDollarRotation = selectRevenueProbeCase({
  plan,
  probeSuite,
  now: new Date('2026-09-24T20:00:00Z')
});
assert.equal(firstDollarRotation.lane, 'first_dollar');
assert.ok(firstDollarRotation.case?.case_id);

const realRevenueRotation = selectRevenueProbeCase({
  plan,
  probeSuite,
  now: new Date('2026-09-24T23:00:00Z')
});
assert.equal(realRevenueRotation.lane, 'real_revenue');
assert.ok(realRevenueRotation.case?.case_id);

console.log(JSON.stringify({
  ok: true,
  schema: plan.schema,
  sell_now_offer_count: plan.sell_now_offer_count,
  logical_work_cells: plan.logical_work_cells,
  first_dollar_top: plan.lanes.first_dollar[0]?.public_id,
  real_revenue_top: plan.lanes.real_revenue[0]?.public_id,
  no_human_spam: plan.doctrine.no_human_spam
}, null, 2));
