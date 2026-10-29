#!/usr/bin/env node
/**
 * Read-only continuity verifier. The real roster and run receipts must arrive
 * from an authenticated Evercraft-owned source, not from a static code list.
 * This module never starts workers or grants execution authority.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DNA = ['juniper', 'sentinel'];
const norm = (value) => String(value ?? '').trim().toLowerCase();
const records = (value) => Array.isArray(value) ? value : [];
const unique = (items) => [...new Set(items)];

function fresh(iso, now, maxAgeMs) {
  const at = Date.parse(iso || '');
  return Number.isFinite(at) && at <= now && now - at <= maxAgeMs;
}

/**
 * Callback boundaries:
 * verifySnapshot(snapshot) MUST independently authenticate the producer and
 * integrity of a current registry export.
 * verifyDispatch(receipt) MUST independently verify a provider-issued,
 * mission-bound receipt. A `verified:true` field in JSON is never evidence.
 */
export function auditAgentContinuity({
  snapshot,
  baseline,
  now = new Date(),
  maxAgeMs = 15 * 60_000,
  verifySnapshot,
  verifyDispatch,
} = {}) {
  const holds = [];
  const addHold = (reason) => { if (!holds.includes(reason)) holds.push(reason); };
  const at = now instanceof Date ? now.getTime() : Date.parse(now);
  if (!Number.isFinite(at) || !(maxAgeMs > 0)) throw new Error('invalid_audit_clock');

  const profiles = records(snapshot?.role_profiles);
  const activeProfiles = profiles.filter((role) => norm(role?.status) === 'active');
  const profileIds = activeProfiles.map((role) => norm(role?.id)).filter(Boolean);
  if (profileIds.length !== activeProfiles.length || unique(profileIds).length !== profileIds.length) {
    addHold('role_identity_missing_or_duplicated');
  }
  if (activeProfiles.some((role) => DNA.includes(norm(role?.name || role?.id)))) {
    addHold('dna_protocol_incorrectly_counted_as_agent');
  }

  const expectedIds = records(baseline?.role_ids).map(norm).filter(Boolean);
  if (!expectedIds.length || unique(expectedIds).length !== expectedIds.length) {
    addHold('historical_role_identity_baseline_missing_or_invalid');
  } else {
    if (expectedIds.some((id) => !profileIds.includes(id))) addHold('previous_agent_role_missing');
  }
  if (Number.isInteger(baseline?.minimum_role_count) && activeProfiles.length < baseline.minimum_role_count) {
    addHold('role_count_below_last_verified_baseline');
  }
  if (activeProfiles.length === 0) addHold('no_active_role_profiles');

  const protocols = records(snapshot?.dna_protocols);
  for (const name of DNA) {
    const matches = protocols.filter((row) => norm(row?.name || row?.id) === name);
    if (matches.length !== 1 ||
        norm(matches[0]?.status) !== 'active' ||
        matches[0]?.counts_as_agent !== false ||
        (matches[0]?.kind != null && norm(matches[0]?.kind) !== 'embedded')) {
      addHold(name + '_embedded_protocol_missing_or_invalid');
    }
  }

  const lineups = records(snapshot?.lineups).filter((lineup) => norm(lineup?.status) === 'active');
  const lineupIds = lineups.map((row) => norm(row?.id)).filter(Boolean);
  if (lineupIds.length !== lineups.length || unique(lineupIds).length !== lineupIds.length) {
    addHold('formation_identity_missing_or_duplicated');
  }
  if (Number.isInteger(baseline?.minimum_lineup_count) && lineups.length < baseline.minimum_lineup_count) {
    addHold('formation_count_below_last_verified_baseline');
  }
  const roleSet = new Set(profileIds);
  for (const lineup of lineups) {
    const members = records(lineup.role_ids);
    if (members.some((member) => DNA.includes(norm(member)) || !roleSet.has(norm(member)))) {
      addHold('formation_references_missing_role_or_dna_protocol');
    }
  }

  if (!fresh(snapshot?.source?.observed_at, at, maxAgeMs)) {
    addHold('registry_observation_missing_or_stale');
  }
  let registryAuthenticated = false;
  try {
    registryAuthenticated = typeof verifySnapshot === 'function' && verifySnapshot(snapshot) === true;
  } catch { /* A verifier error must never become permission. */ }
  if (!registryAuthenticated) addHold('registry_origin_not_independently_authenticated');

  const dispatches = [];
  for (const receipt of records(snapshot?.dispatch_receipts)) {
    const actor = norm(receipt?.role_id);
    const mission = String(receipt?.mission_id || '').trim();
    const validDNA = receipt?.dna?.juniper?.preflight === 'passed' &&
      receipt?.dna?.juniper?.writeback === 'recorded' &&
      receipt?.dna?.sentinel?.preflight === 'passed';
    let authenticated = false;
    try {
      authenticated = typeof verifyDispatch === 'function' && verifyDispatch(receipt) === true;
    } catch { /* Fail closed. */ }
    if (registryAuthenticated && actor && mission && roleSet.has(actor) &&
        validDNA && fresh(receipt?.observed_at, at, maxAgeMs) && authenticated) {
      dispatches.push({ role_id: actor, mission_id: mission });
    }
  }
  if (!dispatches.length) addHold('no_independently_verified_dispatch_with_both_dna_protocols');
  const verifiedRoles = unique(dispatches.map((row) => row.role_id));

  return {
    schema: 'evercraft.systemia.agent-continuity-audit.v1',
    observed_at: new Date(at).toISOString(),
    state: holds.length ? 'held_unverified' : 'verified_observation_only',
    historic_baseline_declared_roles: Number.isInteger(baseline?.minimum_role_count)
      ? baseline.minimum_role_count : null,
    registered_active_role_count: activeProfiles.length,
    registered_active_lineup_count: lineups.length,
    dna_protocols_expected: [...DNA],
    snapshot_origin_authenticated: registryAuthenticated,
    verified_dispatch_count: dispatches.length,
    independently_observed_role_ids: verifiedRoles,
    all_roles_live: false, // This audit intentionally cannot prove universal liveness.
    execution_authority_granted: false,
    external_side_effects_performed: false,
    holds,
    evidence_note: 'A registered role is not a running worker. This is read-only proof; execution still requires Systemia admission, Passport and Execution Gate.',
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const args = process.argv.slice(2);
  const value = (flag) => args.includes(flag) ? args[args.indexOf(flag) + 1] : null;
  const snapshotPath = value('--snapshot');
  const baselinePath = value('--baseline');
  if (!snapshotPath || !baselinePath) {
    console.error('usage: node continuity-gate.mjs --snapshot OWNED_REGISTRY.json --baseline HISTORICAL_BASELINE.json');
    process.exitCode = 2;
  } else {
    try {
      const snapshot = JSON.parse(fs.readFileSync(path.resolve(snapshotPath), 'utf8'));
      const baseline = JSON.parse(fs.readFileSync(path.resolve(baselinePath), 'utf8'));
      // Local files alone are not independently authenticated evidence.
      const result = auditAgentContinuity({ snapshot, baseline });
      console.log(JSON.stringify(result, null, 2));
      if (result.state !== 'verified_observation_only') process.exitCode = 2;
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 2;
    }
  }
}
