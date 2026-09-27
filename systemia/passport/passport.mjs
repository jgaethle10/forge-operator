import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const TRUSTED_GRANT_AUTHORITY_STATES = new Set([
  'verified_identity_authority',
  'manual_authorized',
  'system_policy_authorized',
]);

const TRUSTED_REVOCATION_AUTHORITY_STATES = new Set([
  'verified_identity_authority',
  'manual_authorized',
  'system_policy_authorized',
  'subject_self_revocation',
]);

const LOCK_STALE_MS = 30_000;
const LOCK_TIMEOUT_MS = 5_000;
const LOCK_POLL_MS = 10;
const waitBuffer = new Int32Array(new SharedArrayBuffer(4));

const sha256 = (value) =>
  'sha256:' +
  createHash('sha256')
    .update(typeof value === 'string' ? value : JSON.stringify(value))
    .digest('hex');

function stableReceipt(body) {
  return { ...body, receipt_hash: sha256(body) };
}

function requiredString(value, field) {
  const text = String(value || '').trim();
  if (!text) throw new Error(field + '_required');
  return text;
}

function iso(value, field) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(field + '_invalid');
  return date.toISOString();
}

function normalizeList(values, field) {
  const list = [...new Set((Array.isArray(values) ? values : [values])
    .map((value) => String(value || '').trim())
    .filter(Boolean))].sort();
  if (list.length === 0) throw new Error(field + '_required');
  return list;
}

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function appendJsonl(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.appendFileSync(file, JSON.stringify(value) + '\n', { mode: 0o600 });
}

function sleep(ms) {
  Atomics.wait(waitBuffer, 0, 0, ms);
}

function scopeAllows(granted, requested) {
  if (granted === requested) return true;
  if (!granted.endsWith('.*')) return false;
  const prefix = granted.slice(0, -2);
  return requested.startsWith(prefix + '.');
}

function setCovers(granted, requested) {
  return requested.every((need) => granted.some((have) => scopeAllows(have, need)));
}

function resourceAllows(grantResources, resourceRef) {
  if (!resourceRef) return true;
  if (!Array.isArray(grantResources) || grantResources.length === 0) return true;
  return grantResources.includes(resourceRef);
}

export class EvercraftPassport {
  constructor({ stateDir } = {}) {
    if (!stateDir) throw new Error('passport_state_dir_required');
    this.stateDir = path.resolve(stateDir);
    this.grantsFile = path.join(this.stateDir, 'grants.jsonl');
    this.revocationsFile = path.join(this.stateDir, 'revocations.jsonl');
    this.lockDir = path.join(this.stateDir, '.mutation-lock');

    this.grants = new Map();
    this.grantIdempotency = new Map();
    this.revocations = new Map();
    this.revocationIdempotency = new Map();
    this.#reload();
  }

  #reload() {
    this.grants.clear();
    this.grantIdempotency.clear();
    this.revocations.clear();
    this.revocationIdempotency.clear();

    for (const grant of readJsonl(this.grantsFile)) {
      this.grants.set(grant.grant_id, grant);
      this.grantIdempotency.set(grant.idempotency_key, grant);
    }
    for (const revocation of readJsonl(this.revocationsFile)) {
      this.revocations.set(revocation.grant_id, revocation);
      this.revocationIdempotency.set(revocation.idempotency_key, revocation);
    }
  }

  #acquireLock() {
    fs.mkdirSync(this.stateDir, { recursive: true, mode: 0o700 });
    const deadline = Date.now() + LOCK_TIMEOUT_MS;
    while (Date.now() < deadline) {
      try {
        fs.mkdirSync(this.lockDir, { mode: 0o700 });
        fs.writeFileSync(
          path.join(this.lockDir, 'owner.json'),
          JSON.stringify({ pid: process.pid, acquired_at: new Date().toISOString() }) + '\n',
          { mode: 0o600 }
        );
        return;
      } catch (error) {
        if (error?.code !== 'EEXIST') throw error;
        try {
          const stat = fs.statSync(this.lockDir);
          if (Date.now() - stat.mtimeMs > LOCK_STALE_MS) {
            fs.rmSync(this.lockDir, { recursive: true, force: true });
            continue;
          }
        } catch (statError) {
          if (statError?.code !== 'ENOENT') throw statError;
        }
        sleep(LOCK_POLL_MS);
      }
    }
    throw new Error('passport_mutation_lock_timeout');
  }

  #releaseLock() {
    fs.rmSync(this.lockDir, { recursive: true, force: true });
  }

  #mutate(fn) {
    this.#acquireLock();
    try {
      this.#reload();
      return fn();
    } finally {
      this.#releaseLock();
    }
  }

  #lineage(grantId) {
    const lineage = [];
    const visited = new Set();
    let current = this.grants.get(grantId);

    while (current) {
      if (visited.has(current.grant_id)) throw new Error('grant_lineage_cycle_detected');
      visited.add(current.grant_id);
      lineage.push(current);
      current = current.parent_grant_id
        ? this.grants.get(current.parent_grant_id)
        : null;
      if (lineage.at(-1)?.parent_grant_id && !current) {
        throw new Error('grant_parent_missing');
      }
    }
    return lineage;
  }

  #grantStateUnlocked(grantId, at) {
    const grant = this.grants.get(grantId);
    if (!grant) throw new Error('grant_not_found');
    const lineage = this.#lineage(grantId);
    const revokedGrant = lineage.find((entry) => this.revocations.has(entry.grant_id)) || null;
    const activeByTime = lineage.every(
      (entry) =>
        new Date(at) >= new Date(entry.starts_at) &&
        new Date(at) < new Date(entry.ends_at)
    );

    return {
      schema: 'evercraft.passport.grant-state.v1',
      grant_id: grantId,
      subject_ref: grant.subject_ref,
      product: grant.product,
      scopes: grant.scopes,
      resource_refs: grant.resource_refs,
      active: activeByTime && !revokedGrant,
      revoked: Boolean(revokedGrant),
      revoked_grant_id: revokedGrant?.grant_id || null,
      lineage: lineage.map((entry) => entry.grant_id),
      starts_at: grant.starts_at,
      ends_at: grant.ends_at,
      observed_at: at,
    };
  }

  issueGrant(input) {
    return this.#mutate(() => {
      const idempotencyKey = requiredString(input?.idempotency_key, 'idempotency_key');
      const existing = this.grantIdempotency.get(idempotencyKey);
      if (existing) {
        return {
          state: 'duplicate',
          grant: existing,
          receipt: stableReceipt({
            schema: 'evercraft.passport.grant-receipt.v1',
            state: 'duplicate',
            grant_id: existing.grant_id,
            idempotency_key: idempotencyKey,
          }),
        };
      }

      const authorityState = requiredString(input?.authority_state, 'authority_state');
      if (!TRUSTED_GRANT_AUTHORITY_STATES.has(authorityState)) {
        throw new Error('grant_authority_not_verified');
      }

      const subjectRef = requiredString(input?.subject_ref, 'subject_ref');
      const issuerRef = requiredString(input?.issuer_ref, 'issuer_ref');
      const product = requiredString(input?.product, 'product');
      const scopes = normalizeList(input?.scopes, 'scopes');
      const resourceRefs = input?.resource_refs
        ? normalizeList(input.resource_refs, 'resource_refs')
        : [];
      const startsAt = iso(input?.starts_at || new Date().toISOString(), 'starts_at');
      const endsAt = iso(input?.ends_at, 'ends_at');
      if (new Date(endsAt) <= new Date(startsAt)) throw new Error('grant_window_invalid');

      const maxDelegationDepth = Number(input?.max_delegation_depth ?? 0);
      if (!Number.isInteger(maxDelegationDepth) || maxDelegationDepth < 0 || maxDelegationDepth > 8) {
        throw new Error('max_delegation_depth_invalid');
      }

      const grant = stableReceipt({
        schema: 'evercraft.passport.grant.v1',
        grant_id: input?.grant_id
          ? requiredString(input.grant_id, 'grant_id')
          : 'grant_' + randomUUID(),
        idempotency_key: idempotencyKey,
        subject_ref: subjectRef,
        issuer_ref: issuerRef,
        product,
        scopes,
        resource_refs: resourceRefs,
        starts_at: startsAt,
        ends_at: endsAt,
        delegation_depth: 0,
        max_delegation_depth: maxDelegationDepth,
        parent_grant_id: null,
        authority_state: authorityState,
        authority_receipt_ref: requiredString(
          input?.authority_receipt_ref,
          'authority_receipt_ref'
        ),
        purpose: input?.purpose ? String(input.purpose) : null,
        created_at: new Date().toISOString(),
      });

      this.grants.set(grant.grant_id, grant);
      this.grantIdempotency.set(idempotencyKey, grant);
      appendJsonl(this.grantsFile, grant);

      return {
        state: 'granted',
        grant,
        receipt: stableReceipt({
          schema: 'evercraft.passport.grant-receipt.v1',
          state: 'granted',
          grant_id: grant.grant_id,
          subject_ref: grant.subject_ref,
          issuer_ref: grant.issuer_ref,
          product: grant.product,
          scopes: grant.scopes,
          authority_receipt_ref: grant.authority_receipt_ref,
        }),
      };
    });
  }

  delegateGrant(input) {
    return this.#mutate(() => {
      const idempotencyKey = requiredString(input?.idempotency_key, 'idempotency_key');
      const existing = this.grantIdempotency.get(idempotencyKey);
      if (existing) {
        return {
          state: 'duplicate',
          grant: existing,
          receipt: stableReceipt({
            schema: 'evercraft.passport.delegation-receipt.v1',
            state: 'duplicate',
            grant_id: existing.grant_id,
            idempotency_key: idempotencyKey,
          }),
        };
      }

      const parentId = requiredString(input?.parent_grant_id, 'parent_grant_id');
      const parent = this.grants.get(parentId);
      if (!parent) throw new Error('parent_grant_not_found');

      const delegatedAt = iso(input?.delegated_at || new Date().toISOString(), 'delegated_at');
      const parentState = this.#grantStateUnlocked(parentId, delegatedAt);
      if (!parentState.active) throw new Error('parent_grant_not_active');

      const delegatorRef = requiredString(input?.delegator_ref, 'delegator_ref');
      if (delegatorRef !== parent.subject_ref) {
        throw new Error('delegator_not_parent_subject');
      }

      const childDepth = parent.delegation_depth + 1;
      if (childDepth > parent.max_delegation_depth) {
        throw new Error('delegation_depth_exceeded');
      }

      const scopes = normalizeList(input?.scopes, 'scopes');
      if (!setCovers(parent.scopes, scopes)) throw new Error('delegation_scope_amplification');

      const resourceRefs = input?.resource_refs
        ? normalizeList(input.resource_refs, 'resource_refs')
        : [...parent.resource_refs];
      if (
        parent.resource_refs.length > 0 &&
        !resourceRefs.every((resource) => parent.resource_refs.includes(resource))
      ) {
        throw new Error('delegation_resource_amplification');
      }

      const startsAt = iso(input?.starts_at || delegatedAt, 'starts_at');
      const endsAt = iso(input?.ends_at, 'ends_at');
      if (new Date(startsAt) < new Date(parent.starts_at)) {
        throw new Error('delegation_starts_before_parent');
      }
      if (new Date(endsAt) > new Date(parent.ends_at)) {
        throw new Error('delegation_ends_after_parent');
      }
      if (new Date(endsAt) <= new Date(startsAt)) throw new Error('grant_window_invalid');

      const childMaxDepth = Number(
        input?.max_delegation_depth ?? parent.max_delegation_depth
      );
      if (
        !Number.isInteger(childMaxDepth) ||
        childMaxDepth < childDepth ||
        childMaxDepth > parent.max_delegation_depth
      ) {
        throw new Error('delegation_max_depth_amplification');
      }

      const grant = stableReceipt({
        schema: 'evercraft.passport.grant.v1',
        grant_id: input?.grant_id
          ? requiredString(input.grant_id, 'grant_id')
          : 'grant_' + randomUUID(),
        idempotency_key: idempotencyKey,
        subject_ref: requiredString(input?.subject_ref, 'subject_ref'),
        issuer_ref: delegatorRef,
        product: parent.product,
        scopes,
        resource_refs: resourceRefs,
        starts_at: startsAt,
        ends_at: endsAt,
        delegation_depth: childDepth,
        max_delegation_depth: childMaxDepth,
        parent_grant_id: parentId,
        authority_state: 'delegated_from_active_grant',
        authority_receipt_ref: parent.receipt_hash,
        purpose: input?.purpose ? String(input.purpose) : parent.purpose,
        created_at: new Date().toISOString(),
      });

      this.grants.set(grant.grant_id, grant);
      this.grantIdempotency.set(idempotencyKey, grant);
      appendJsonl(this.grantsFile, grant);

      return {
        state: 'delegated',
        grant,
        receipt: stableReceipt({
          schema: 'evercraft.passport.delegation-receipt.v1',
          state: 'delegated',
          parent_grant_id: parentId,
          grant_id: grant.grant_id,
          delegator_ref: delegatorRef,
          subject_ref: grant.subject_ref,
          product: grant.product,
          scopes: grant.scopes,
          lineage: this.#lineage(grant.grant_id).map((entry) => entry.grant_id),
        }),
      };
    });
  }

  revokeGrant(input) {
    return this.#mutate(() => {
      const idempotencyKey = requiredString(input?.idempotency_key, 'idempotency_key');
      const duplicate = this.revocationIdempotency.get(idempotencyKey);
      if (duplicate) {
        return {
          state: 'duplicate',
          revocation: duplicate,
          receipt: stableReceipt({
            schema: 'evercraft.passport.revocation-receipt.v1',
            state: 'duplicate',
            grant_id: duplicate.grant_id,
            idempotency_key: idempotencyKey,
          }),
        };
      }

      const grantId = requiredString(input?.grant_id, 'grant_id');
      const grant = this.grants.get(grantId);
      if (!grant) throw new Error('grant_not_found');
      const actorRef = requiredString(input?.actor_ref, 'actor_ref');
      const authorityState = requiredString(input?.authority_state, 'authority_state');
      if (!TRUSTED_REVOCATION_AUTHORITY_STATES.has(authorityState)) {
        throw new Error('revocation_authority_not_verified');
      }

      const actorCanRevoke =
        actorRef === grant.issuer_ref ||
        actorRef === grant.subject_ref ||
        authorityState === 'system_policy_authorized';
      if (!actorCanRevoke) throw new Error('revocation_actor_not_authorized');

      const revocation = stableReceipt({
        schema: 'evercraft.passport.revocation.v1',
        revocation_id: 'revoke_' + randomUUID(),
        idempotency_key: idempotencyKey,
        grant_id: grantId,
        actor_ref: actorRef,
        authority_state: authorityState,
        authority_receipt_ref: requiredString(
          input?.authority_receipt_ref,
          'authority_receipt_ref'
        ),
        reason: input?.reason ? String(input.reason) : null,
        revoked_at: iso(input?.revoked_at || new Date().toISOString(), 'revoked_at'),
      });

      this.revocations.set(grantId, revocation);
      this.revocationIdempotency.set(idempotencyKey, revocation);
      appendJsonl(this.revocationsFile, revocation);

      return {
        state: 'revoked',
        revocation,
        receipt: stableReceipt({
          schema: 'evercraft.passport.revocation-receipt.v1',
          state: 'revoked',
          grant_id: grantId,
          actor_ref: actorRef,
          authority_receipt_ref: revocation.authority_receipt_ref,
        }),
      };
    });
  }

  getGrantState(grantId, { at = new Date().toISOString() } = {}) {
    this.#reload();
    return this.#grantStateUnlocked(
      requiredString(grantId, 'grant_id'),
      iso(at, 'at')
    );
  }

  authorize(input) {
    this.#reload();
    const subjectRef = requiredString(input?.subject_ref, 'subject_ref');
    const product = requiredString(input?.product, 'product');
    const scope = requiredString(input?.scope, 'scope');
    const resourceRef = input?.resource_ref
      ? requiredString(input.resource_ref, 'resource_ref')
      : null;
    const at = iso(input?.at || new Date().toISOString(), 'at');

    const candidates = [...this.grants.values()]
      .filter(
        (grant) =>
          grant.subject_ref === subjectRef &&
          grant.product === product &&
          grant.scopes.some((granted) => scopeAllows(granted, scope)) &&
          resourceAllows(grant.resource_refs, resourceRef)
      )
      .map((grant) => ({
        grant,
        state: this.#grantStateUnlocked(grant.grant_id, at),
      }))
      .filter((entry) => entry.state.active)
      .sort((a, b) => {
        const scopeSpecificity =
          Number(!a.grant.scopes.includes(scope)) - Number(!b.grant.scopes.includes(scope));
        if (scopeSpecificity !== 0) return scopeSpecificity;
        return new Date(a.grant.ends_at) - new Date(b.grant.ends_at);
      });

    const selected = candidates[0] || null;
    return stableReceipt({
      schema: 'evercraft.passport.authorization-decision.v1',
      decision: selected ? 'allow' : 'deny',
      subject_ref: subjectRef,
      product,
      scope,
      resource_ref: resourceRef,
      grant_id: selected?.grant.grant_id || null,
      grant_lineage: selected?.state.lineage || [],
      evaluated_at: at,
      mutation_performed: false,
    });
  }

  getSubjectPassport(subjectRef, { at = new Date().toISOString() } = {}) {
    this.#reload();
    const subject = requiredString(subjectRef, 'subject_ref');
    const instant = iso(at, 'at');

    const grants = [...this.grants.values()]
      .filter((grant) => grant.subject_ref === subject)
      .map((grant) => ({
        grant_id: grant.grant_id,
        product: grant.product,
        scopes: grant.scopes,
        resource_refs: grant.resource_refs,
        starts_at: grant.starts_at,
        ends_at: grant.ends_at,
        parent_grant_id: grant.parent_grant_id,
        active: this.#grantStateUnlocked(grant.grant_id, instant).active,
      }))
      .sort((a, b) => a.product.localeCompare(b.product) || a.grant_id.localeCompare(b.grant_id));

    return {
      schema: 'evercraft.passport.subject-view.v1',
      subject_ref: subject,
      active_grant_count: grants.filter((grant) => grant.active).length,
      grants,
      observed_at: instant,
      raw_identifiers_included: false,
    };
  }

  exportCapabilityEnvelope(grantId, { at = new Date().toISOString() } = {}) {
    this.#reload();
    const id = requiredString(grantId, 'grant_id');
    const instant = iso(at, 'at');
    const grant = this.grants.get(id);
    if (!grant) throw new Error('grant_not_found');
    const state = this.#grantStateUnlocked(id, instant);

    return stableReceipt({
      schema: 'evercraft.passport.capability-envelope.v1',
      grant_id: id,
      subject_ref: grant.subject_ref,
      issuer_ref: grant.issuer_ref,
      product: grant.product,
      scopes: grant.scopes,
      resource_refs: grant.resource_refs,
      starts_at: grant.starts_at,
      ends_at: grant.ends_at,
      active_at_export: state.active,
      lineage: state.lineage,
      exported_at: instant,
      authenticity_boundary:
        'Receipt hash is tamper evidence only. Receiving systems must verify current grant state with the authoritative Evercraft Passport service before consequential use.',
    });
  }
}

export { scopeAllows };
