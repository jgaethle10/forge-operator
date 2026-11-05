import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSignalFabricCandidates } from '../systemia/signal-publication/signal-fabric-bridge.mjs';

function receipt(patch={}) {
  return {
    schema: 'evercraft.signal.official-source-watch.v1',
    checked_at: '2026-10-30T16:00:00.000Z',
    incident_id: 'us-sc-savannah-river-laboratory-fire-2026-10-28',
    source_coverage: 'fresh',
    review_required: false,
    ...patch
  };
}

test('healthy official source watch emits zero operator noise', () => {
  assert.deepEqual(buildSignalFabricCandidates(receipt()), []);
});

test('a broken source creates a notice about blind spots, not emergency or radiation', () => {
  const events=buildSignalFabricCandidates(receipt({source_coverage:'degraded'}));
  assert.equal(events.length,1);
  assert.equal(events[0].schema,'systemia.signal.v1');
  assert.equal(events[0].product,'signal');
  assert.equal(events[0].severity,'notice');
  assert.equal(events[0].public_warning_authorized,false);
  assert.equal(events[0].sent,false);
  assert.ok(!events[0].immediate_allowed);
  assert.match(events[0].summary,/Do not infer/i);
});

test('changed official assertion triggers editorial candidate, not critical life-safety claim', () => {
  const events=buildSignalFabricCandidates(receipt({review_required:true}));
  assert.equal(events.length,1);
  assert.equal(events[0].human_action_required,true);
  assert.equal(events[0].severity,'notice');
  assert.equal(events[0].evidence_state,'official_source_change_not_hazard_confirmation');
  assert.equal(events[0].public_warning_authorized,false);
});

test('degraded plus changed yields two deduplicable independent intents', () => {
  const events=buildSignalFabricCandidates(receipt({review_required:true,source_coverage:'degraded'}));
  assert.equal(events.length,2);
  assert.notEqual(events[0].fingerprint,events[1].fingerprint);
  assert.ok(events.every(e => e.sent===false && e.public_warning_authorized===false));
});

test('the bridge rejects generic untrusted objects', () => {
  assert.throws(()=>buildSignalFabricCandidates({review_required:true}),/receipt is required/);
});
