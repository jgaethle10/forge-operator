import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SyntheticProvider, decideSyntheticFulfillment, exampleCases, toNeatrootsTrace,
} from '../integrations/neatroots/ambiguous-external-effect.mjs';

const demoOrder = { orderId: 'DEMO-1001', cents: 4200 };

test('acknowledgment loss after commit reconciles to exactly one synthetic effect', () => {
  const p = new SyntheticProvider({ loseFirstAck: true });
  const { evidence, journal } = decideSyntheticFulfillment(p, demoOrder);
  assert.equal(p.effects, 1);
  assert.equal(p.attempts, 1);
  assert.equal(p.lookups, 1);
  assert.equal(evidence.fulfillmentAuthorized, true);
  assert.match(evidence.state, /RECONCILIATION/);
  assert.ok(evidence.authoritativeReceipt?.settled);
  assert.equal(journal.find(s => s.event === 'provider.execute')?.status, 'ERROR');
  assert.equal(journal.find(s => s.event === 'provider.lookup')?.status, 'OK');
});
test('lost acknowledgment plus lookup outage blocks instead of claiming unpaid or paid', () => {
  const p = new SyntheticProvider({ loseFirstAck: true, lookupUnavailable: true });
  const { evidence } = decideSyntheticFulfillment(p, demoOrder);
  assert.equal(evidence.state, 'HOLD_UNKNOWN');
  assert.equal(evidence.fulfillmentAuthorized, false);
  assert.equal(evidence.authoritativeReceipt, null);
  assert.equal(p.effects, 1);
});
test('retrying with stable idempotency key never doubles synthetic charge', () => {
  const p = new SyntheticProvider({ loseFirstAck: true, lookupUnavailable: true });
  const { evidence, journal } = decideSyntheticFulfillment(p, demoOrder, { retryAfterLookupFailure: true });
  assert.equal(p.effects, 1);
  assert.equal(p.attempts, 2);
  assert.equal(evidence.fulfillmentAuthorized, true);
  assert.match(evidence.state, /IDEMPOTENT_RETRY/);
  assert.ok(journal.some(s => s.event === 'provider.retry_same_key' && s.status === 'OK'));
});
test('a restarted client with the original idempotency key cannot create a second effect', () => {
  const p = new SyntheticProvider({ loseFirstAck: true, lookupUnavailable: true });
  const first = decideSyntheticFulfillment(p, demoOrder);
  assert.equal(first.evidence.state, 'HOLD_UNKNOWN');
  const second = decideSyntheticFulfillment(p, demoOrder);
  assert.equal(second.evidence.state, 'SETTLED_VERIFIED');
  assert.equal(p.effects, 1);
  assert.equal(p.attempts, 2);
});
test('provider refuses changed amount with an identical idempotency key', () => {
  const p = new SyntheticProvider();
  const first = decideSyntheticFulfillment(p, demoOrder);
  assert.equal(first.evidence.fulfillmentAuthorized, true);
  assert.equal(p.effects, 1);
  const second = decideSyntheticFulfillment(p, { orderId:'DEMO-1001', cents: 4300 });
  assert.equal(second.evidence.fulfillmentAuthorized, false);
  assert.equal(second.evidence.state,'HOLD_UNKNOWN');
  assert.equal(p.effects,1);
});
test('provider does not accept arbitrary non-synthetic order references', () => {
  const p = new SyntheticProvider();
  assert.throws(() => decideSyntheticFulfillment(p,{orderId:'LIVE-123',cents:4200}),/Synthetic DEMO/);
  assert.throws(() => decideSyntheticFulfillment(p,{orderId:'DEMO-1001',cents:1.5}),/Synthetic cents/);
  assert.throws(() => decideSyntheticFulfillment(p,{orderId:'DEMO-1001',cents:0}),/Synthetic cents/);
  assert.throws(() => decideSyntheticFulfillment(p,{orderId:'DEMO-1001',cents:4200,currency:'EUR'}),/USD only/);
  assert.equal(p.effects,0);
});
test('all three deterministic cases preserve the invariant effects <= 1', () => {
  const samples=exampleCases();
  assert.deepEqual(samples.map(x=>x.name), ['ack_lost_reconciled','ack_lost_unresolved','ack_lost_idempotent_retry']);
  for(const s of samples) {
    assert.equal(s.providerEffects,1);
    assert.ok(s.providerAttempts<=2);
    assert.equal(s.evidence.authoritativeReceipt?.synthetic??true,true);
    if(s.evidence.fulfillmentAuthorized) assert.ok(s.evidence.authoritativeReceipt?.settled);
  }
  assert.equal(samples.filter(s=>!s.evidence.fulfillmentAuthorized).length,1);
});
test('traces encode actual simulated tool calls, not claimed provider API execution', () => {
  for(const s of exampleCases()){
    const t=toNeatrootsTrace(s);
    assert.equal(t.metadata.synthetic,true);
    assert.ok(t.children.some(x=>x.name==='provider.execute'));
    assert.equal(t.status,'OK');
    assert.equal(t.children.every(x=>x.metadata.synthetic),true);
    assert.match(JSON.stringify(t),/synthetic/i);
    if(s.evidence.state==='HOLD_UNKNOWN') assert.match(t.output,/Fulfillment blocked/i);
  }
});
test('CLI emits three parseable synthetic traces without network',()=>{
  const script=resolve(dirname(fileURLToPath(import.meta.url)),'../integrations/neatroots/ambiguous-external-effect.mjs');
  const p=spawnSync(process.execPath,[script],{encoding:'utf8'});
  assert.equal(p.status,0,p.stderr);
  const runs=p.stdout.trim().split('\n').map(JSON.parse);
  assert.equal(runs.length,3);
  assert.equal(runs.every(x=>x.metadata.synthetic),true);
});
