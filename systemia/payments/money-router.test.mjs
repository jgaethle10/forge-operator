import test from 'node:test';
import assert from 'node:assert/strict';
import { EvercraftMoneyRouter } from './money-router.mjs';

function router() {
  const r = new EvercraftMoneyRouter();
  r.registerRail({ rail_id: 'rail_card_a', provider: 'provider-a', currencies: ['USD'], capabilities: ['card'], fee_bps: 290, fixed_fee_minor: 30, settlement_minutes: 2880, priority: 20 });
  r.registerRail({ rail_id: 'rail_bank_b', provider: 'provider-b', currencies: ['USD'], capabilities: ['bank_debit'], fee_bps: 80, fixed_fee_minor: 0, settlement_minutes: 5760, priority: 10 });
  r.registerRail({ rail_id: 'rail_card_fast', provider: 'provider-c', currencies: ['USD'], capabilities: ['card'], fee_bps: 350, fixed_fee_minor: 20, settlement_minutes: 60, priority: 30 });
  r.registerRail({ rail_id: 'rail_disabled', provider: 'provider-d', currencies: ['USD'], capabilities: ['card'], fee_bps: 1, settlement_minutes: 1, enabled: false });
  return r;
}

test('lowest cost chooses the cheapest eligible rail', () => {
  const result = router().route({ amount_minor: 10000, currency: 'usd', required_capabilities: ['card'], strategy: 'lowest_cost' });
  assert.equal(result.selected_rail_id, 'rail_card_a');
  assert.equal(result.processor_role, 'replaceable_settlement_adapter');
});

test('fastest settlement chooses speed among eligible rails', () => {
  const result = router().route({ amount_minor: 10000, currency: 'USD', required_capabilities: ['card'], strategy: 'fastest_settlement' });
  assert.equal(result.selected_rail_id, 'rail_card_fast');
});

test('capability requirements filter rails before ranking', () => {
  const result = router().route({ amount_minor: 10000, currency: 'USD', required_capabilities: ['bank_debit'], strategy: 'lowest_cost' });
  assert.equal(result.selected_rail_id, 'rail_bank_b');
});

test('no eligible rail fails closed', () => {
  assert.throws(() => router().route({ amount_minor: 10000, currency: 'EUR', required_capabilities: ['card'] }), (error) => error.code === 'no_eligible_settlement_rail');
});
