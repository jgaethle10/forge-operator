import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { EvercraftPassport } from '../passport/passport.mjs';
import { EvercraftContextFabric } from '../context-fabric/fabric.mjs';
import {
  authorizeCapability,
  issueApiKey,
  normalizeScopes,
  parseApiKey,
  revokeCredential,
  safeCredentialRecord,
  verifyApiKey,
} from './access-core.mjs';

const DEFAULT_CREDENTIAL_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const sha256 = (value) =>
  'sha256:' +
  createHash('sha256')
    .update(typeof value === 'string' ? value : JSON.stringify(value))
    .digest('hex');

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, canonical(child)])
    );
  }
  return value;
}

function stableReceipt(body) {
  const normalized = canonical(body);
  return { ...normalized, receipt_hash: sha256(JSON.stringify(normalized)) };
}

function requiredString(value, field) {
  const text = String(value || '').trim();
  if (!text) throw new Error(field + '_required');
  return text;
}

function optionalString(value) {
  const text = String(value || '').trim();
  return text || null;
}

function normalizedList(values = []) {
  return [...new Set(
    (Array.isArray(values) ? values : [values])
      .map((value) => String(value || '').trim())
      .filter(Boolean)
  )].sort();
}

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function appendJsonl(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.appendFileSync(file, JSON.stringify(value) + '\n', { mode: 0o600 });
}

function iso(value, field) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(field + '_invalid');
  return date.toISOString();
}

function contextScopes(values, allowWildcard = false) {
  const scopes = normalizeScopes(values);
  for (const scope of scopes) {
    if (!/^context\.(read|write)\.[a-z0-9*._-]+$/i.test(scope)) {
      throw new Error('context_scope_invalid');
    }
    if (!allowWildcard && scope.includes('*')) {
      throw new Error('context_wildcard_requires_explicit_approval');
    }
  }
  return scopes;
}

function bearerCredential(value) {
  const text = String(value || '').trim();
  return text.toLowerCase().startsWith('bearer ') ? text.slice(7).trim() : text;
}

export function buildFabricPublicManifest() {
  return {
    schema: 'evercraft.fabric.gateway-manifest.v1',
    name: 'Evercraft Fabric Gateway',
    provider: 'Evercraft LLC',
    architecture: 'host-neutral Systemia fabric gateway',
    protocol: {
      mcp_path: '/mcp/evercraft-fabric',
      health_path: '/api/fabric/health',
      manifest_path: '/api/fabric/manifest',
    },
    capabilities: [
      {
        key: 'fabric.discover',
        public: true,
        description: 'Match a plain-language need to truthful public Evercraft capabilities.',
      },
      {
        key: 'fabric.connect',
        public: false,
        description: 'Attach an authenticated host instance to the fabric and return a connection receipt.',
      },
      {
        key: 'fabric.context.read',
        public: false,
        description: 'Retrieve only Passport-authorized Context Fabric records.',
      },
      {
        key: 'fabric.event.write',
        public: false,
        description: 'Project a host event into Context Fabric without turning it into instruction or authority.',
      },
      {
        key: 'fabric.action.prepare',
        public: false,
        description: 'Prepare a receipt-bearing action intent for later Systemia admission and execution gating.',
      },
    ],
    truth_boundary: {
      install_is_not_authority: true,
      credentials_are_scoped: true,
      plaintext_secrets_are_not_persisted: true,
      context_is_passport_filtered: true,
      host_content_is_not_instruction_by_default: true,
      actions_are_not_executed_by_prepare: true,
      systemia_admission_required_before_execution: true,
    },
  };
}

export class EvercraftFabricGateway {
  constructor({
    stateDir,
    passportStateDir,
    contextStateDir,
    verificationPepper,
    authorityReceiptRef,
    capabilityProvider = async () => ({ ok: true, matches: [] }),
  } = {}) {
    this.stateDir = path.resolve(requiredString(stateDir, 'fabric_state_dir'));
    this.passportStateDir = path.resolve(requiredString(passportStateDir, 'passport_state_dir'));
    this.contextStateDir = path.resolve(requiredString(contextStateDir, 'context_state_dir'));
    this.verificationPepper = requiredString(verificationPepper, 'verification_pepper');
    if (this.verificationPepper.length < 32) throw new Error('verification_pepper_required');
    this.authorityReceiptRef = requiredString(authorityReceiptRef, 'authority_receipt_ref');
    if (typeof capabilityProvider !== 'function') throw new Error('capability_provider_required');
    this.capabilityProvider = capabilityProvider;

    this.credentialsFile = path.join(this.stateDir, 'credentials.jsonl');
    this.connectionsFile = path.join(this.stateDir, 'connections.jsonl');
    this.actionIntentsFile = path.join(this.stateDir, 'action-intents.jsonl');

    this.passport = new EvercraftPassport({ stateDir: this.passportStateDir });
    this.context = new EvercraftContextFabric({
      stateDir: this.contextStateDir,
      passportStateDir: this.passportStateDir,
    });
  }

  publicManifest() {
    return buildFabricPublicManifest();
  }

  #latestCredentialMap() {
    const map = new Map();
    for (const record of readJsonl(this.credentialsFile)) {
      map.set(record.key_id, record);
    }
    return map;
  }

  issueHostCredential({
    project_key,
    tenant_key,
    host_type = 'external_host',
    environment = 'test',
    scopes = ['fabric.connect', 'fabric.discover'],
    context_scopes = [],
    allow_wildcard_context = false,
    expires_at = null,
    purpose = 'Evercraft Fabric host connection',
    principal_ref = null,
  } = {}) {
    const now = new Date();
    const endsAt = iso(
      expires_at || new Date(now.getTime() + DEFAULT_CREDENTIAL_TTL_MS).toISOString(),
      'expires_at'
    );
    const apiScopes = normalizeScopes(scopes);
    const ctxScopes = contextScopes(context_scopes, allow_wildcard_context === true);

    const issued = issueApiKey({
      projectKey: requiredString(project_key, 'project_key'),
      tenantKey: requiredString(tenant_key, 'tenant_key'),
      principalRef: principal_ref,
      hostType: host_type,
      environment,
      scopes: apiScopes,
      expiresAt: endsAt,
      pepper: this.verificationPepper,
      clock: () => now.toISOString(),
    });

    let passportGrant = null;
    if (ctxScopes.length > 0) {
      passportGrant = this.passport.issueGrant({
        idempotency_key: 'fabric-host-grant:' + issued.record.credential_id,
        subject_ref: issued.record.actor_ref,
        issuer_ref: 'evercraft:fabric-identity-authority',
        product: 'evercraft-context',
        scopes: ctxScopes,
        starts_at: issued.record.issued_at,
        ends_at: endsAt,
        authority_state: 'verified_identity_authority',
        authority_receipt_ref: this.authorityReceiptRef,
        purpose,
      });
    }

    const stored = {
      ...issued.record,
      passport_grant_id: passportGrant?.grant?.grant_id || null,
      context_scopes: ctxScopes,
      fabric_purpose: String(purpose || ''),
    };
    appendJsonl(this.credentialsFile, stored);

    return {
      state: 'issued',
      secret_once: issued.secret_once,
      credential: safeCredentialRecord(stored),
      passport_grant: passportGrant?.grant
        ? {
            grant_id: passportGrant.grant.grant_id,
            subject_ref: passportGrant.grant.subject_ref,
            scopes: passportGrant.grant.scopes,
            starts_at: passportGrant.grant.starts_at,
            ends_at: passportGrant.grant.ends_at,
          }
        : null,
      receipt: stableReceipt({
        schema: 'evercraft.fabric.credential-issuance-receipt.v1',
        state: 'issued',
        credential_id: stored.credential_id,
        actor_ref: stored.actor_ref,
        project_key: stored.project_key,
        tenant_key: stored.tenant_key,
        environment: stored.environment,
        api_scopes: stored.scope_keys,
        context_scopes: ctxScopes,
        secret_shown_once: true,
        secret_material_stored: false,
        passport_grant_id: stored.passport_grant_id,
        issued_at: stored.issued_at,
        expires_at: stored.expires_at,
      }),
    };
  }

  authenticate(authorization) {
    const credential = bearerCredential(authorization);
    const parsed = parseApiKey(credential);
    if (!parsed) return { ok: false, reason: 'credential_malformed' };
    const record = this.#latestCredentialMap().get(parsed.key_id);
    return verifyApiKey(credential, record, { pepper: this.verificationPepper });
  }

  #authorizedPrincipal(authorization, requiredScope, capabilityKey = requiredScope) {
    const verified = this.authenticate(authorization);
    if (!verified.ok) throw new Error(verified.reason || 'fabric_authentication_failed');
    const decision = authorizeCapability({
      principal: verified.principal,
      capabilityKey,
      environment: verified.principal.environment,
      requiredScopes: [requiredScope],
    });
    if (!decision.allowed) {
      const missing = decision.missing_scopes?.join(',') || decision.reason || 'scope_denied';
      throw new Error('fabric_authorization_denied:' + missing);
    }
    return verified.principal;
  }

  connectHost(authorization, input = {}) {
    const principal = this.#authorizedPrincipal(authorization, 'fabric.connect');
    const connectedAt = new Date().toISOString();
    const connection = stableReceipt({
      schema: 'evercraft.fabric.host-connection.v1',
      connection_id: 'fabric_conn_' + randomUUID(),
      actor_ref: principal.actor_ref,
      credential_id: principal.credential_id,
      project_key: principal.project_key,
      tenant_key: principal.tenant_key,
      environment: principal.environment,
      host_type: optionalString(input.host_type) || principal.host_type || 'external_host',
      host_instance_ref: requiredString(input.host_instance_ref, 'host_instance_ref'),
      adapter: optionalString(input.adapter) || 'generic_mcp',
      declared_capabilities: normalizedList(input.declared_capabilities || []),
      connected_at: connectedAt,
      authority_state: 'scoped_credential_verified',
      private_context_granted_by_install: false,
      action_authority_granted_by_install: false,
    });
    appendJsonl(this.connectionsFile, connection);
    return {
      ok: true,
      connection,
      manifest: this.publicManifest(),
    };
  }

  async discover(input = {}, authorization = null) {
    if (authorization) this.#authorizedPrincipal(authorization, 'fabric.discover');
    const intent = requiredString(input.intent, 'intent');
    const limit = Math.min(Math.max(Number(input.limit || 5), 1), 20);
    const result = await this.capabilityProvider(intent, limit);
    return {
      schema: 'evercraft.fabric.discovery-result.v1',
      intent,
      limit,
      result,
      public_only: true,
      private_authority_granted: false,
    };
  }

  queryContext(authorization, input = {}) {
    const principal = this.#authorizedPrincipal(authorization, 'fabric.context.read');
    return this.context.query({
      query: requiredString(input.query, 'query'),
      actor_ref: principal.actor_ref,
      namespaces: input.namespaces || undefined,
      evidence_states: input.evidence_states || undefined,
      include_history: input.include_history === true,
      max_results: input.max_results,
      max_chars: input.max_chars,
      at: input.at || new Date().toISOString(),
    });
  }

  emitEvent(authorization, input = {}) {
    const principal = this.#authorizedPrincipal(authorization, 'fabric.event.write');
    const eventId = requiredString(input.event_id, 'event_id');
    const namespace = requiredString(input.namespace, 'namespace');

    const recorded = this.context.ingestRecord({
      idempotency_key: 'fabric-event:' + principal.credential_id + ':' + eventId,
      actor_ref: principal.actor_ref,
      namespace,
      kind: optionalString(input.kind) || 'host_event',
      title: requiredString(input.title, 'title'),
      text: requiredString(input.text, 'text'),
      tags: normalizedList(input.tags || []),
      entity_ref: optionalString(input.entity_ref),
      predicate: optionalString(input.predicate),
      ...(Object.prototype.hasOwnProperty.call(input, 'claim_value')
        ? { claim_value: canonical(input.claim_value) }
        : {}),
      evidence_state: optionalString(input.evidence_state) || 'user_supplied',
      content_trust_state: optionalString(input.content_trust_state) || 'untrusted_external',
      visibility: optionalString(input.visibility) || 'internal',
      source_ref: optionalString(input.source_ref) || 'fabric-host:' + principal.actor_ref + ':' + eventId,
      source_sha256: optionalString(input.source_sha256),
      observed_at: input.observed_at || new Date().toISOString(),
    });

    return {
      ok: true,
      state: recorded.state,
      record: recorded.record,
      receipt: stableReceipt({
        schema: 'evercraft.fabric.host-event-receipt.v1',
        state: recorded.state,
        event_id: eventId,
        actor_ref: principal.actor_ref,
        namespace,
        context_record_id: recorded.record?.record_id || null,
        context_receipt_hash: recorded.receipt?.receipt_hash || null,
        host_content_became_instruction: false,
        source_authority_inherited: false,
      }),
    };
  }

  prepareAction(authorization, input = {}) {
    const principal = this.#authorizedPrincipal(authorization, 'fabric.action.prepare');
    const intentId = optionalString(input.idempotency_key) || randomUUID();

    const receipt = stableReceipt({
      schema: 'evercraft.fabric.action-intent.v1',
      action_intent_id: 'fabric_action_' + sha256(principal.credential_id + ':' + intentId).slice(-24),
      idempotency_key: intentId,
      actor_ref: principal.actor_ref,
      credential_id: principal.credential_id,
      capability_key: requiredString(input.capability_key, 'capability_key'),
      intent: requiredString(input.intent, 'intent'),
      resource_refs: normalizedList(input.resource_refs || []),
      host_context_refs: normalizedList(input.host_context_refs || []),
      prepared_at: new Date().toISOString(),
      human_confirmation_required: input.human_confirmation_required !== false,
      systemia_admission_required: true,
      execution_gate_required: true,
      execution_authorized: false,
      payment_authorized: false,
      external_side_effect_created: false,
    });
    appendJsonl(this.actionIntentsFile, receipt);

    return {
      ok: true,
      state: 'prepared_not_executed',
      receipt,
      next_boundary: 'Submit through Systemia admission and Execution Gate before any consequential action.',
    };
  }

  revokeHostCredential({ credential_id, reason = 'revoked', actor_ref = 'evercraft:fabric-identity-authority' } = {}) {
    const id = requiredString(credential_id, 'credential_id');
    const latest = [...this.#latestCredentialMap().values()].find((row) => row.credential_id === id);
    if (!latest) throw new Error('credential_not_found');
    const revoked = revokeCredential(latest, reason);
    appendJsonl(this.credentialsFile, revoked);

    let passportRevocation = null;
    if (latest.passport_grant_id) {
      passportRevocation = this.passport.revokeGrant({
        idempotency_key: 'fabric-host-revoke:' + id,
        grant_id: latest.passport_grant_id,
        actor_ref,
        reason,
        authority_state: 'system_policy_authorized',
        authority_receipt_ref: this.authorityReceiptRef,
      });
    }

    return {
      state: 'revoked',
      credential: safeCredentialRecord(revoked),
      passport_revocation: passportRevocation?.receipt || null,
      receipt: stableReceipt({
        schema: 'evercraft.fabric.credential-revocation-receipt.v1',
        state: 'revoked',
        credential_id: id,
        actor_ref,
        reason,
        passport_grant_id: latest.passport_grant_id || null,
        revoked_at: revoked.revoked_at,
      }),
    };
  }
}
