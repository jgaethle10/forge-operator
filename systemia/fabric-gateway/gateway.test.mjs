import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { EvercraftPassport } from '../passport/passport.mjs';
import { EvercraftContextFabric } from '../context-fabric/fabric.mjs';
import { EvercraftFabricGateway } from './gateway.mjs';

const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-fabric-gateway-'));
const pepper = 'evercraft-fabric-test-pepper-32-bytes-minimum-value';

function setup() {
  const root = temp();
  const passportStateDir = path.join(root, 'passport');
  const contextStateDir = path.join(root, 'context');
  const fabricStateDir = path.join(root, 'fabric');
  const passport = new EvercraftPassport({ stateDir: passportStateDir });

  passport.issueGrant({
    idempotency_key: 'seed-writer',
    grant_id: 'grant_seed_writer',
    subject_ref: 'agent:seed-indexer',
    issuer_ref: 'evercraft:identity-authority',
    product: 'evercraft-context',
    scopes: ['context.write.*'],
    starts_at: '2026-09-01T00:00:00Z',
    ends_at: '2026-12-01T00:00:00Z',
    authority_state: 'verified_identity_authority',
    authority_receipt_ref: 'identity:seed-indexer',
  });

  const context = new EvercraftContextFabric({
    stateDir: contextStateDir,
    passportStateDir,
  });

  context.ingestRecord({
    idempotency_key: 'seed:rivet',
    record_id: 'ctx_seed_rivet',
    actor_ref: 'agent:seed-indexer',
    namespace: 'rivet',
    kind: 'fact',
    title: 'RIVET authorized record',
    text: 'RIVET has a scoped internal record that Fabric may return only to authorized readers.',
    tags: ['rivet', 'fabric'],
    evidence_state: 'observed',
    visibility: 'internal',
    source_ref: 'test:rivet:receipt',
    observed_at: '2026-09-28T20:00:00Z',
  });

  context.ingestRecord({
    idempotency_key: 'seed:systemia',
    record_id: 'ctx_seed_systemia',
    actor_ref: 'agent:seed-indexer',
    namespace: 'systemia',
    kind: 'fact',
    title: 'Systemia private record',
    text: 'This Systemia internal record must not leak through a RIVET-only Fabric credential.',
    tags: ['systemia', 'private'],
    evidence_state: 'observed',
    visibility: 'internal',
    source_ref: 'test:systemia:receipt',
    observed_at: '2026-09-28T20:00:00Z',
  });

  const gateway = new EvercraftFabricGateway({
    stateDir: fabricStateDir,
    passportStateDir,
    contextStateDir,
    verificationPepper: pepper,
    authorityReceiptRef: 'identity:fabric-authority:test',
    capabilityProvider: async (intent, limit) => ({
      ok: true,
      intent,
      limit,
      matches: [{ public_id: 'forensiscope-v1', name: 'ForensiScope' }],
    }),
  });

  return { root, gateway, passport };
}

function issue(gateway, overrides = {}) {
  return gateway.issueHostCredential({
    project_key: 'chatgpt-host',
    tenant_key: 'evercraft-test',
    host_type: 'chatgpt',
    environment: 'test',
    scopes: [
      'fabric.connect',
      'fabric.discover',
      'fabric.context.read',
      'fabric.event.write',
      'fabric.action.prepare',
    ],
    context_scopes: [
      'context.read.rivet',
      'context.write.host.chatgpt',
      'context.read.host.chatgpt',
    ],
    expires_at: '2026-10-28T21:00:00Z',
    ...overrides,
  });
}

test('credential secret is shown once and never persisted as plaintext', () => {
  const { root, gateway } = setup();
  try {
    const issued = issue(gateway);
    assert.match(issued.secret_once, /^ecf_test_/);
    assert.equal(issued.credential.verifier, undefined);
    assert.equal(issued.credential.secret_material_stored, false);
    assert.deepEqual(issued.passport_grant.scopes, [
      'context.read.host.chatgpt',
      'context.read.rivet',
      'context.write.host.chatgpt',
    ]);

    const stored = fs.readFileSync(path.join(root, 'fabric', 'credentials.jsonl'), 'utf8');
    assert.equal(stored.includes(issued.secret_once), false);
    assert.equal(stored.includes('"verifier"'), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('wildcard private context requires explicit approval at credential issuance', () => {
  const { root, gateway } = setup();
  try {
    assert.throws(
      () => issue(gateway, { context_scopes: ['context.read.*'] }),
      /context_wildcard_requires_explicit_approval/
    );

    const issued = issue(gateway, {
      context_scopes: ['context.read.*'],
      allow_wildcard_context: true,
    });
    assert.deepEqual(issued.passport_grant.scopes, ['context.read.*']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('install and host connection grant no extra private or action authority', () => {
  const { root, gateway } = setup();
  try {
    const issued = issue(gateway, {
      scopes: ['fabric.connect'],
      context_scopes: [],
    });
    const connected = gateway.connectHost(issued.secret_once, {
      host_instance_ref: 'chatgpt:workspace:test',
      host_type: 'chatgpt',
      adapter: 'mcp',
    });

    assert.equal(connected.connection.private_context_granted_by_install, false);
    assert.equal(connected.connection.action_authority_granted_by_install, false);
    assert.throws(
      () => gateway.queryContext(issued.secret_once, { query: 'RIVET' }),
      /fabric_authorization_denied/
    );
    assert.throws(
      () => gateway.prepareAction(issued.secret_once, {
        capability_key: 'forensiscope.inspect',
        intent: 'inspect a video',
      }),
      /fabric_authorization_denied/
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Passport filtering reveals authorized RIVET context but not Systemia context', () => {
  const { root, gateway } = setup();
  try {
    const issued = issue(gateway);
    const packet = gateway.queryContext(issued.secret_once, {
      query: 'internal record Fabric',
      max_results: 20,
    });

    assert.equal(packet.results.some((row) => row.record_id === 'ctx_seed_rivet'), true);
    assert.equal(packet.results.some((row) => row.record_id === 'ctx_seed_systemia'), false);
    assert.equal(JSON.stringify(packet).includes('must not leak'), false);
    assert.equal(packet.authority_filter_applied, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('host events are namespace-scoped evidence and never become instructions', () => {
  const { root, gateway } = setup();
  try {
    const issued = issue(gateway);
    const recorded = gateway.emitEvent(issued.secret_once, {
      event_id: 'evt-001',
      namespace: 'host.chatgpt',
      title: 'Host context changed',
      text: 'A host-side document was updated.',
      tags: ['host', 'document'],
      evidence_state: 'user_supplied',
    });

    assert.equal(recorded.ok, true);
    assert.equal(recorded.receipt.host_content_became_instruction, false);
    assert.equal(recorded.receipt.source_authority_inherited, false);
    assert.equal(recorded.record.content_is_instruction, false);
    assert.equal(recorded.record.source_authority_inherited, false);

    const packet = gateway.queryContext(issued.secret_once, {
      query: 'host document updated',
      namespaces: ['host.chatgpt'],
    });
    assert.equal(packet.results.some((row) => row.record_id === recorded.record.record_id), true);

    assert.throws(
      () => gateway.emitEvent(issued.secret_once, {
        event_id: 'evt-unauthorized',
        namespace: 'systemia',
        title: 'Attempted cross-namespace write',
        text: 'This must fail closed.',
      }),
      /context_write_not_authorized/
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('action preparation produces a receipt but no execution, payment, or side effect', () => {
  const { root, gateway } = setup();
  try {
    const issued = issue(gateway);
    const prepared = gateway.prepareAction(issued.secret_once, {
      idempotency_key: 'action-001',
      capability_key: 'forensiscope.media.inspect.v1',
      intent: 'Inspect the supplied recording and return evidence.',
      resource_refs: ['host:file:123'],
    });

    assert.equal(prepared.state, 'prepared_not_executed');
    assert.equal(prepared.receipt.systemia_admission_required, true);
    assert.equal(prepared.receipt.execution_gate_required, true);
    assert.equal(prepared.receipt.execution_authorized, false);
    assert.equal(prepared.receipt.payment_authorized, false);
    assert.equal(prepared.receipt.external_side_effect_created, false);

    const duplicate = gateway.prepareAction(issued.secret_once, {
      idempotency_key: 'action-001',
      capability_key: 'forensiscope.media.inspect.v1',
      intent: 'Inspect the supplied recording and return evidence.',
      resource_refs: ['host:file:123'],
    });
    assert.equal(duplicate.state, 'duplicate_prepared_not_executed');
    assert.equal(duplicate.receipt.action_intent_id, prepared.receipt.action_intent_id);
    assert.equal(duplicate.receipt.receipt_hash, prepared.receipt.receipt_hash);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('revoking a Fabric credential also revokes its Passport grant', () => {
  const { root, gateway, passport } = setup();
  try {
    const issued = issue(gateway);
    const grantId = issued.passport_grant.grant_id;

    const revoked = gateway.revokeHostCredential({
      credential_id: issued.credential.credential_id,
      reason: 'test rotation',
    });

    assert.equal(revoked.state, 'revoked');
    assert.equal(gateway.authenticate(issued.secret_once).ok, false);
    assert.equal(gateway.authenticate(issued.secret_once).reason, 'credential_revoked');

    const grantState = passport.getGrantState(grantId, { at: '2026-09-28T22:00:00Z' });
    assert.equal(grantState.active, false);
    assert.equal(grantState.revoked, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
