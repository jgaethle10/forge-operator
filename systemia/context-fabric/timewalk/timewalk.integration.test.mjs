import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { EvercraftPassport } from '../../passport/passport.mjs';
import { EvercraftContextFabric } from '../fabric.mjs';
import { queryTimewalk } from './timewalk.mjs';

const iso = (millis) => new Date(millis).toISOString();

test('native Context Fabric + Passport: current grant, clocks, retraction, and tamper rejection', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-timewalk-native-'));
  try {
    const passportDir = path.join(root, 'passport');
    const contextDir = path.join(root, 'context');
    const passport = new EvercraftPassport({ stateDir: passportDir });
    const now = Date.now();
    const observed = iso(now - 2 * 86400000);
    const start = iso(now - 30 * 86400000);
    const end = iso(now + 7 * 86400000);
    const addGrant = (id, scopes, expires = end) => passport.issueGrant({
      idempotency_key: 'native:' + id,
      grant_id: 'native:' + id,
      subject_ref: 'agent:' + id,
      issuer_ref: 'test:trusted-identity',
      product: 'evercraft-context',
      scopes,
      starts_at: start,
      ends_at: expires,
      authority_state: 'verified_identity_authority',
      authority_receipt_ref: 'test:verified-identity',
    });
    addGrant('writer', ['context.write.systemia']);
    addGrant('reader', ['context.read.systemia']);
    addGrant('expired', ['context.read.systemia'], iso(now - 86400000));

    const fabric = new EvercraftContextFabric({
      stateDir: contextDir, passportStateDir: passportDir,
    });
    const write = fabric.ingestRecord({
      record_id: 'native_fact_1',
      idempotency_key: 'native:fact1',
      actor_ref: 'agent:writer',
      namespace: 'systemia',
      kind: 'fact',
      title: 'Synthetic payments health state',
      text: 'Synthetic data only; no external payment evidence.',
      tags: ['synthetic', 'payments'],
      entity_ref: 'service:synthetic-payments',
      predicate: 'health',
      claim_value: 'degraded',
      evidence_state: 'modeled',
      content_trust_state: 'derived_summary',
      visibility: 'internal',
      source_ref: 'fixture:payments-health',
      observed_at: observed,
    });
    assert.equal(write.state, 'recorded');
    const query = (overrides = {}) => queryTimewalk(fabric, {
      actor_ref: 'agent:reader',
      known_at: iso(now + 60_000),
      valid_at: observed,
      entity_ref: 'service:synthetic-payments',
      ...overrides,
    });

    const visible = query();
    assert.equal(visible.facts.length, 1);
    assert.equal(visible.facts[0].evidence_state, 'modeled');
    assert.equal(visible.facts[0].source_ref, 'fixture:payments-health');
    assert.equal(visible.facts[0].status, 'active');
    assert.equal(visible.execution_authority_granted, false);
    assert.equal(visible.authorization_time_source, 'context_fabric_server_clock');

    // Backdating the world-time observation cannot cause the system to claim
    // the fact was already known before it was actually stored.
    const beforeIngestion = query({ known_at: iso(now - 86400000) });
    assert.equal(beforeIngestion.facts.length, 0);

    // An expired reader cannot use a historical as-of date to revive access.
    const expired = query({ actor_ref: 'agent:expired' });
    assert.equal(expired.facts.length, 0);
    assert.equal(query({ actor_ref: 'agent:unauthorized' }).facts.length, 0);
    assert.throws(() => query({ authorization_at: observed }), /cannot_be_overridden/);

    const retract = fabric.retractRecord({
      idempotency_key: 'native:retract1',
      actor_ref: 'agent:writer',
      record_id: 'native_fact_1',
      reason: 'Fixture withdrawal',
      evidence_ref: 'fixture:audit-retraction',
    });
    assert.equal(retract.state, 'retracted');
    assert.match(retract.retraction.created_at, /^\d{4}-/);
    assert.equal(query().facts[0].status, 'retracted');

    // Rewrites of the on-disk record without a new receipt are rejected.
    const file = path.join(contextDir, 'records.jsonl');
    const records = fs.readFileSync(file, 'utf8').trimEnd().split('\n');
    const tampered = JSON.parse(records[0]);
    tampered.claim_value = 'healthy';
    records[0] = JSON.stringify(tampered);
    fs.writeFileSync(file, records.join('\n') + '\n');
    assert.throws(() => query(), /timewalk_receipt_integrity_failure/);

    // Current revocation must remove even the metadata of past authorized facts.
    passport.revokeGrant({
      idempotency_key: 'native:revoke-reader',
      grant_id: 'native:reader',
      actor_ref: 'test:trusted-identity',
      authority_state: 'verified_identity_authority',
      authority_receipt_ref: 'test:revocation-evidence',
      reason: 'native test',
    });
    assert.equal(query().facts.length, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('native Passport resource grants do not leak other entities in the same namespace', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-timewalk-resource-'));
  try {
    const passportDir = path.join(root, 'passport');
    const contextDir = path.join(root, 'context');
    const passport = new EvercraftPassport({ stateDir: passportDir });
    const now = Date.now();
    const grantedAt = iso(now - 3 * 86400000);
    const expiresAt = iso(now + 3 * 86400000);
    for (const [id, scopes, resources] of [
      ['writer', ['context.write.systemia'], []],
      ['limited', ['context.read.systemia'], ['site:allowed']],
    ]) {
      passport.issueGrant({
        idempotency_key: 'resource:' + id,
        grant_id: 'resource:' + id,
        subject_ref: 'agent:' + id,
        issuer_ref: 'test:identity',
        product: 'evercraft-context',
        scopes,
        ...(resources.length ? { resource_refs: resources } : {}),
        starts_at: grantedAt, ends_at: expiresAt,
        authority_state: 'verified_identity_authority',
        authority_receipt_ref: 'test:authority',
      });
    }
    const fabric = new EvercraftContextFabric({
      stateDir: contextDir, passportStateDir: passportDir,
    });
    for (const [id, entity] of [['allowed', 'site:allowed'], ['denied', 'site:denied']]) {
      fabric.ingestRecord({
        record_id: 'resource_' + id,
        idempotency_key: 'resource:fact:' + id,
        actor_ref: 'agent:writer',
        namespace: 'systemia',
        kind: 'fact',
        title: 'Synthetic resource fixture ' + id,
        text: 'This is an isolated test record.',
        entity_ref: entity, predicate: 'state', claim_value: id,
        evidence_state: 'modeled', visibility: 'internal',
        source_ref: 'fixture:resource:' + id,
        observed_at: iso(now - 30_000),
      });
    }
    const out = queryTimewalk(fabric, {
      actor_ref: 'agent:limited',
      known_at: iso(now + 60_000),
      valid_at: iso(now),
      namespaces: ['systemia'],
    });
    assert.deepEqual(out.facts.map((fact) => fact.record_id), ['resource_allowed']);
    assert.equal(out.total_authorized_matching, 1);
    assert.equal(JSON.stringify(out).includes('site:denied'), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
