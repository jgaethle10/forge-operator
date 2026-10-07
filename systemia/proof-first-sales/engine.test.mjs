import test from 'node:test';
import assert from 'node:assert/strict';
import {
  admitProofFirstOutreach,
  buildProofUrl,
  draftProofFirstMessage,
} from './engine.mjs';

const now=new Date('2026-10-07T05:30:00Z');

test('proof URL is HTTPS and business-personalized without hidden claims',()=>{
  const url=buildProofUrl({
    base_url:'https://fabric.systemiacommandcenters.com/demos/hvac-lead-recovery/',
    business:'Example HVAC',
    calls:8,
    ticket:450,
  });
  const parsed=new URL(url);
  assert.equal(parsed.protocol,'https:');
  assert.equal(parsed.searchParams.get('business'),'Example HVAC');
  assert.equal(parsed.searchParams.get('calls'),'8');
  assert.equal(parsed.searchParams.get('ticket'),'450');
});

test('proof-first lane refuses outreach before pain evidence and live proof exist',()=>{
  const missingEvidence=admitProofFirstOutreach({
    prospect_key:'example',
    business:'Example HVAC',
    pain_evidence_state:'unknown',
    proof_state:'public_https_verified',
  },now);
  assert.equal(missingEvidence.admitted,false);
  assert.equal(missingEvidence.reason,'pain_not_grounded');

  const missingProof=admitProofFirstOutreach({
    prospect_key:'example',
    business:'Example HVAC',
    pain_evidence_state:'source_grounded',
    proof_state:'repo_only',
  },now);
  assert.equal(missingProof.admitted,false);
  assert.equal(missingProof.reason,'proof_not_publicly_verified');
});

test('two unanswered messages block a third touch',()=>{
  const state=admitProofFirstOutreach({
    prospect_key:'example',
    business:'Example HVAC',
    pain_evidence_state:'source_grounded',
    proof_state:'public_https_verified',
    unanswered_outbound:2,
    max_unanswered_outbound:2,
    last_outbound_at:'2026-10-07T02:00:00Z',
  },now);
  assert.equal(state.admitted,false);
  assert.equal(state.state,'waiting_reply');
  assert.equal(state.reason,'unanswered_outbound_limit_reached');
  assert.equal(state.next_action,'wait_for_inbound_or_material_new_signal');
});

test('one unanswered message remains on cooldown rather than becoming a spam loop',()=>{
  const state=admitProofFirstOutreach({
    prospect_key:'example',
    business:'Example HVAC',
    pain_evidence_state:'source_grounded',
    proof_state:'public_https_verified',
    unanswered_outbound:1,
    max_unanswered_outbound:2,
    cooldown_hours:72,
    last_outbound_at:'2026-10-07T02:00:00Z',
  },now);
  assert.equal(state.admitted,false);
  assert.equal(state.state,'cooldown');
  assert.equal(state.reason,'outbound_cooldown_active');
});

test('opt-out always wins',()=>{
  const state=admitProofFirstOutreach({
    prospect_key:'example',
    business:'Example HVAC',
    pain_evidence_state:'owner_confirmed',
    proof_state:'public_https_verified',
    opted_out:true,
  },now);
  assert.equal(state.admitted,false);
  assert.equal(state.reason,'channel_opted_out');
});

test('message draft is proof-first, bounded and never self-authorizing',()=>{
  const proof=buildProofUrl({
    base_url:'https://fabric.systemiacommandcenters.com/demos/hvac-lead-recovery/',
    business:'Example HVAC',
  });
  const draft=draftProofFirstMessage({
    business:'Example HVAC',
    proof_url:proof,
    observed_problem:'Your public site routes after-hours service requests through phone/contact paths that may require office follow-up.',
  });
  assert.match(draft.body,/built the proof first/i);
  assert.match(draft.body,/not a forecast/i);
  assert.equal(draft.send_authority,false);
  assert.equal(draft.interaction_ledger_preflight_required,true);
  assert.match(draft.body_sha256,/^sha256:[a-f0-9]{64}$/);
});
