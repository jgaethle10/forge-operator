import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { verifyMailDeliveryEvidence } from './mail-delivery.mjs';

function clean(value) {
  return String(value ?? '').trim();
}

function now() {
  return new Date().toISOString();
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function key(prefix) {
  return `${prefix}:${Date.now()}:${crypto.randomUUID().slice(0, 8)}`;
}

const PERSON_TYPES=new Set(['athlete','creator','superfan','coach','staff','other']);
const MEMORY_TYPES=new Set(['goal','preference','career','performance','relationship','story','commitment','logistics','collection','fan_history','other']);
const SENSITIVITY_TYPES=new Set(['private','trusted_circle','shareable','public_safe']);
const EVIDENCE_TYPES=new Set(['person_stated','imported','observed','inferred','verified','reported','unknown']);
const COUNTERPART_TYPES=new Set(['agent','team','coach','trainer','family','sponsor','brand','creator','fan_group','vendor','advisor','other']);
const OPPORTUNITY_TYPES=new Set(['sponsorship','appearance','camp','content','travel','collectible','community','business','education','charity','career','other']);
const FORBIDDEN_SCOPES=new Set(['*','all','everything','blanket','full_access','unrestricted']);

function enumValue(value,allowed,fallback,errorKey){
  const candidate=clean(value)||fallback;
  if(!allowed.has(candidate))throw new Error(errorKey);
  return candidate;
}

function normalizeScopes(values,{allowEmpty=false}={}){
  const scopes=Array.isArray(values)?[...new Set(values.map(clean).filter(Boolean))]:[];
  if(!scopes.length&&!allowEmpty)throw new Error('share_scopes_required');
  if(scopes.some((scope)=>FORBIDDEN_SCOPES.has(scope.toLowerCase())))throw new Error('blanket_share_scope_forbidden');
  return scopes;
}

function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = file + '.tmp-' + crypto.randomUUID();
  fs.writeFileSync(temp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(temp, file);
}

function safeBrain(brain) {
  if (!brain) return null;
  return {
    brain_key: brain.brain_key,
    display_name: brain.display_name,
    person_type: brain.person_type,
    sport_or_domain: brain.sport_or_domain || '',
    anchor_organization: brain.anchor_organization || '',
    ownership_model: brain.ownership_model,
    portability_state: brain.portability_state,
    consent_state: brain.consent_state,
    identity_assurance: brain.identity_assurance,
    domains_enabled: Array.isArray(brain.domains_enabled) ? brain.domains_enabled : [],
    lifecycle_state: brain.lifecycle_state,
    goals: Array.isArray(brain.goals) ? brain.goals : [],
    created_at: brain.created_at,
    updated_at: brain.updated_at,
  };
}

function publicConsentBrain(brain) {
  if (!brain) return null;
  return {
    brain_key: brain.brain_key,
    display_name: brain.display_name,
    person_type: brain.person_type,
    sport_or_domain: brain.sport_or_domain || '',
    anchor_organization: brain.anchor_organization || '',
    ownership_model: brain.ownership_model,
    portability_state: brain.portability_state,
    consent_state: brain.consent_state,
    identity_assurance: brain.identity_assurance,
  };
}

export function createPeopleRuntime({
  stateDir = process.env.PEOPLE_STATE_DIR || path.resolve('.runtime', 'people-layer'),
  trustedMailDeliveryPublicKeys = {},
} = {}) {
  const stateFile = path.join(stateDir, 'state.json');
  const auditFile = path.join(stateDir, 'audit.jsonl');

  function emptyState() {
    return {
      schema: 'evercraft.people.owned-state.v1',
      brains: [],
      memories: [],
      relationships: [],
      opportunities: [],
      invites: [],
      identity_challenges: [],
      identity_delivery_receipts: [],
      consent_events: [],
      share_receipts: [],
      data_requests: [],
      updated_at: now(),
    };
  }

  function load() {
    if (!fs.existsSync(stateFile)) return emptyState();
    const parsed = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    return { ...emptyState(), ...parsed };
  }

  function save(state, event = null) {
    state.updated_at = now();
    atomicJson(stateFile, state);
    if (event) {
      fs.mkdirSync(path.dirname(auditFile), { recursive: true, mode: 0o700 });
      fs.appendFileSync(auditFile, JSON.stringify({ ...event, at: now() }) + '\n', { mode: 0o600 });
    }
    return state;
  }

  function findBrain(state, brainKey) {
    return state.brains.find((row) => row.brain_key === clean(brainKey)) || null;
  }

  function activeInvite(state, token) {
    const tokenHash = sha256(token);
    return state.invites.find((row) => row.token_hash === tokenHash) || null;
  }

  function activeChallenge(state, token) {
    const tokenHash = sha256(token);
    return state.identity_challenges.find((row) => row.token_hash === tokenHash) || null;
  }

  function expireIfNeeded(row) {
    if (!row || row.status !== 'active') return row;
    if (Date.parse(row.expires_at) <= Date.now()) row.status = 'expired';
    return row;
  }

  function health() {
    const state = load();
    return {
      ok: true,
      service: 'evercraft-people-layer',
      runtime: 'Forge Operator / Systemia owned runtime',
      schema: state.schema,
      state_dir_configured: Boolean(stateDir),
      brain_count: state.brains.filter((row) => row.lifecycle_state !== 'archived').length,
      memory_count: state.memories.length,
      relationship_count: state.relationships.length,
      opportunity_count: state.opportunities.length,
      consent_event_count: state.consent_events.length,
      invite_count: state.invites.length,
      identity_challenge_count: state.identity_challenges.length,
      identity_delivery_receipt_count: state.identity_delivery_receipts.length,
      base44_runtime_dependency: false,
      updated_at: state.updated_at,
    };
  }

  function listBrains() {
    return load().brains
      .filter((row) => row.lifecycle_state !== 'archived')
      .map(safeBrain);
  }

  function brainSnapshot(brainKey) {
    const state = load();
    const brain = findBrain(state, brainKey);
    if (!brain) throw new Error('brain_not_found');
    return {
      brain: safeBrain(brain),
      memories: state.memories.filter((row) => row.brain_key === brain.brain_key),
      relationships: state.relationships.filter((row) => row.brain_key === brain.brain_key),
      opportunities: state.opportunities.filter((row) => row.brain_key === brain.brain_key),
      consent_events: state.consent_events.filter((row) => row.brain_key === brain.brain_key),
      share_receipts: state.share_receipts.filter((row) => row.brain_key === brain.brain_key),
      data_requests: state.data_requests.filter((row) => row.brain_key === brain.brain_key),
      identity_delivery_receipts: state.identity_delivery_receipts.filter((row) => row.brain_key === brain.brain_key),
    };
  }

  function createBrain(input = {}) {
    const displayName = clean(input.display_name);
    if (!displayName) throw new Error('display_name_required');

    const state = load();
    const stamp = now();
    const brain = {
      brain_key: clean(input.brain_key) || key('brain'),
      display_name: displayName,
      person_type: enumValue(input.person_type, PERSON_TYPES, 'athlete', 'person_type_invalid'),
      sport_or_domain: clean(input.sport_or_domain),
      anchor_organization: clean(input.anchor_organization),
      ownership_model: 'person_sovereign',
      portability_state: 'portable',
      consent_state: 'not_invited',
      identity_assurance: 'unverified',
      domains_enabled: [],
      lifecycle_state: 'pilot',
      goals: Array.isArray(input.goals) ? input.goals.map(clean).filter(Boolean) : [],
      owner_identity_ref: '',
      created_at: stamp,
      updated_at: stamp,
    };
    if (state.brains.some((row) => row.brain_key === brain.brain_key)) throw new Error('brain_key_exists');
    state.brains.push(brain);
    save(state, { event: 'brain_created', brain_key: brain.brain_key });
    return safeBrain(brain);
  }

  function createMemory(brainKey, input = {}) {
    const state = load();
    const brain = findBrain(state, brainKey);
    if (!brain) throw new Error('brain_not_found');
    const title = clean(input.title);
    if (!title) throw new Error('memory_title_required');
    const memory = {
      memory_key: key('memory'),
      brain_key: brain.brain_key,
      title,
      body: clean(input.body),
      memory_type: enumValue(input.memory_type, MEMORY_TYPES, 'other', 'memory_type_invalid'),
      sensitivity: enumValue(input.sensitivity, SENSITIVITY_TYPES, 'private', 'memory_sensitivity_invalid'),
      evidence_state: enumValue(input.evidence_state, EVIDENCE_TYPES, 'person_stated', 'memory_evidence_state_invalid'),
      source_refs: Array.isArray(input.source_refs) ? input.source_refs.map(clean).filter(Boolean) : [],
      created_at: now(),
    };
    state.memories.push(memory);
    save(state, { event: 'memory_created', brain_key: brain.brain_key, memory_key: memory.memory_key });
    return structuredClone(memory);
  }

  function createRelationship(brainKey, input = {}) {
    const state = load();
    const brain = findBrain(state, brainKey);
    if (!brain) throw new Error('brain_not_found');
    const counterpartName = clean(input.counterpart_name);
    if (!counterpartName) throw new Error('counterpart_name_required');
    const stamp = now();
    const relationship = {
      relationship_key: key('relationship'),
      brain_key: brain.brain_key,
      counterpart_name: counterpartName,
      counterpart_type: enumValue(input.counterpart_type, COUNTERPART_TYPES, 'other', 'counterpart_type_invalid'),
      purpose: clean(input.purpose),
      access_scope: [],
      access_state: 'proposed',
      expires_at: null,
      created_at: stamp,
      updated_at: stamp,
    };
    state.relationships.push(relationship);
    save(state, { event: 'relationship_created', brain_key: brain.brain_key, relationship_key: relationship.relationship_key });
    return structuredClone(relationship);
  }

  function grantShare(brainKey, relationshipKey, input = {}) {
    const state = load();
    const brain = findBrain(state, brainKey);
    if (!brain) throw new Error('brain_not_found');
    if (brain.consent_state !== 'consented') throw new Error('brain_not_consented');
    const relationship = state.relationships.find((row) =>
      row.brain_key === brain.brain_key && row.relationship_key === clean(relationshipKey)
    );
    if (!relationship) throw new Error('relationship_not_found');
    const confirmationRef = clean(input.person_confirmation_ref);
    if (!confirmationRef) throw new Error('person_confirmation_ref_required');
    const scopes = normalizeScopes(input.scopes);

    const stamp = now();
    relationship.access_scope = [...new Set(scopes)];
    relationship.access_state = 'granted';
    relationship.purpose = clean(input.purpose) || relationship.purpose;
    relationship.expires_at = clean(input.expires_at) || null;
    relationship.updated_at = stamp;
    const receipt = {
      share_receipt_key: key('share'),
      brain_key: brain.brain_key,
      relationship_key: relationship.relationship_key,
      action: 'grant',
      scopes: [...relationship.access_scope],
      purpose: relationship.purpose,
      expires_at: relationship.expires_at,
      person_confirmation_ref: confirmationRef,
      actor: 'person-authorized',
      occurred_at: stamp,
    };
    state.share_receipts.push(receipt);
    save(state, { event: 'share_granted', brain_key: brain.brain_key, relationship_key: relationship.relationship_key, share_receipt_key: receipt.share_receipt_key });
    return { relationship: structuredClone(relationship), receipt: structuredClone(receipt) };
  }

  function revokeShare(brainKey, relationshipKey, input = {}) {
    const state = load();
    const brain = findBrain(state, brainKey);
    if (!brain) throw new Error('brain_not_found');
    const relationship = state.relationships.find((row) =>
      row.brain_key === brain.brain_key && row.relationship_key === clean(relationshipKey)
    );
    if (!relationship) throw new Error('relationship_not_found');
    const confirmationRef = clean(input.person_confirmation_ref);
    if (!confirmationRef) throw new Error('person_confirmation_ref_required');
    const priorScopes = Array.isArray(relationship.access_scope) ? [...relationship.access_scope] : [];
    const stamp = now();
    relationship.access_scope = [];
    relationship.access_state = 'revoked';
    relationship.expires_at = null;
    relationship.updated_at = stamp;
    const receipt = {
      share_receipt_key: key('share'),
      brain_key: brain.brain_key,
      relationship_key: relationship.relationship_key,
      action: 'revoke',
      scopes: priorScopes,
      purpose: relationship.purpose,
      expires_at: null,
      person_confirmation_ref: confirmationRef,
      actor: 'person-authorized',
      occurred_at: stamp,
    };
    state.share_receipts.push(receipt);
    save(state, { event: 'share_revoked', brain_key: brain.brain_key, relationship_key: relationship.relationship_key, share_receipt_key: receipt.share_receipt_key });
    return { relationship: structuredClone(relationship), receipt: structuredClone(receipt) };
  }

  function revokeConsent(brainKey, input = {}) {
    const state = load();
    const brain = findBrain(state, brainKey);
    if (!brain) throw new Error('brain_not_found');
    const confirmationRef = clean(input.person_confirmation_ref);
    if (!confirmationRef) throw new Error('person_confirmation_ref_required');
    const stamp = now();
    const revokedRelationships = [];

    for (const relationship of state.relationships.filter((row) => row.brain_key === brain.brain_key && row.access_state === 'granted')) {
      const priorScopes = Array.isArray(relationship.access_scope) ? [...relationship.access_scope] : [];
      relationship.access_scope = [];
      relationship.access_state = 'revoked';
      relationship.expires_at = null;
      relationship.updated_at = stamp;
      revokedRelationships.push(relationship.relationship_key);
      state.share_receipts.push({
        share_receipt_key: key('share'),
        brain_key: brain.brain_key,
        relationship_key: relationship.relationship_key,
        action: 'revoke',
        scopes: priorScopes,
        purpose: relationship.purpose,
        expires_at: null,
        person_confirmation_ref: confirmationRef,
        actor: 'consent-revocation-cascade',
        occurred_at: stamp,
      });
    }

    brain.consent_state = 'revoked';
    brain.domains_enabled = [];
    brain.updated_at = stamp;
    const event = {
      consent_event_key: key('consent'),
      brain_key: brain.brain_key,
      event_type: 'consent_revoked',
      scopes: [],
      policy_version: clean(input.policy_version) || 'people-layer-consent-v1',
      person_confirmation_ref: confirmationRef,
      actor: 'person-authorized',
      occurred_at: stamp,
    };
    state.consent_events.push(event);
    save(state, { event: 'consent_revoked', brain_key: brain.brain_key, consent_event_key: event.consent_event_key, revoked_relationships: revokedRelationships });
    return { brain: safeBrain(brain), event: structuredClone(event), revoked_relationships: revokedRelationships };
  }

  function createOpportunity(brainKey, input = {}) {
    const state = load();
    const brain = findBrain(state, brainKey);
    if (!brain) throw new Error('brain_not_found');
    const title = clean(input.title);
    if (!title) throw new Error('opportunity_title_required');
    const stamp = now();
    const opportunity = {
      opportunity_key: key('opportunity'),
      brain_key: brain.brain_key,
      title,
      opportunity_type: enumValue(input.opportunity_type, OPPORTUNITY_TYPES, 'other', 'opportunity_type_invalid'),
      summary: clean(input.summary),
      fit_rationale: clean(input.fit_rationale),
      evidence_state: enumValue(input.evidence_state, EVIDENCE_TYPES, 'unknown', 'opportunity_evidence_state_invalid'),
      authority_state: 'discover_only',
      status: 'new',
      source_refs: Array.isArray(input.source_refs) ? input.source_refs.map(clean).filter(Boolean) : [],
      person_confirmation_ref: '',
      created_at: stamp,
      updated_at: stamp,
    };
    state.opportunities.push(opportunity);
    save(state, { event: 'opportunity_discovered', brain_key: brain.brain_key, opportunity_key: opportunity.opportunity_key });
    return structuredClone(opportunity);
  }

  function setOpportunityAuthority(brainKey, opportunityKey, input = {}) {
    const state = load();
    const brain = findBrain(state, brainKey);
    if (!brain) throw new Error('brain_not_found');
    const opportunity = state.opportunities.find((row) =>
      row.brain_key === brain.brain_key && row.opportunity_key === clean(opportunityKey)
    );
    if (!opportunity) throw new Error('opportunity_not_found');
    const authorityState = clean(input.authority_state);
    if (!['authorized', 'declined'].includes(authorityState)) throw new Error('opportunity_authority_state_invalid');
    const confirmationRef = clean(input.person_confirmation_ref);
    if (!confirmationRef) throw new Error('person_confirmation_ref_required');
    opportunity.authority_state = authorityState;
    opportunity.status = authorityState === 'authorized' ? 'accepted' : 'declined';
    opportunity.person_confirmation_ref = confirmationRef;
    opportunity.updated_at = now();
    save(state, { event: 'opportunity_authority_changed', brain_key: brain.brain_key, opportunity_key: opportunity.opportunity_key, authority_state: authorityState });
    return structuredClone(opportunity);
  }

  function createInvite(brainKey, input = {}) {
    const state = load();
    const brain = findBrain(state, brainKey);
    if (!brain) throw new Error('brain_not_found');

    const scopes = input.scopes === undefined
      ? ['memory', 'relationships', 'opportunities', 'export']
      : normalizeScopes(input.scopes);

    const rawToken = crypto.randomUUID() + crypto.randomUUID();
    const ttlHours = Math.min(168, Math.max(1, Number(input.ttl_hours || 48)));
    const stamp = now();
    const invite = {
      invite_key: key('invite'),
      brain_key: brain.brain_key,
      token_hash: sha256(rawToken),
      scopes,
      policy_version: clean(input.policy_version) || 'people-layer-consent-v1',
      status: 'active',
      expires_at: new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString(),
      created_at: stamp,
    };
    state.invites.push(invite);
    brain.consent_state = 'invited';
    brain.updated_at = stamp;
    state.consent_events.push({
      consent_event_key: key('consent'),
      brain_key: brain.brain_key,
      event_type: 'invited',
      scopes,
      policy_version: invite.policy_version,
      actor: 'systemia-owned-runtime',
      occurred_at: stamp,
    });
    save(state, { event: 'invite_created', brain_key: brain.brain_key, invite_key: invite.invite_key });
    return {
      invite_key: invite.invite_key,
      raw_token: rawToken,
      scopes,
      expires_at: invite.expires_at,
      consent_path: '/people/consent?token=' + encodeURIComponent(rawToken),
    };
  }

  function inspectInvite(token) {
    const state = load();
    const invite = expireIfNeeded(activeInvite(state, clean(token)));
    if (!invite) throw new Error('invite_not_found');
    if (invite.status === 'expired') {
      save(state, { event: 'invite_expired', invite_key: invite.invite_key });
      throw new Error('invite_expired');
    }
    if (invite.status === 'revoked') throw new Error('invite_revoked');
    const brain = findBrain(state, invite.brain_key);
    if (!brain) throw new Error('brain_not_found');
    return {
      invite: {
        invite_key: invite.invite_key,
        scopes: invite.scopes,
        policy_version: invite.policy_version,
        status: invite.status,
        expires_at: invite.expires_at,
      },
      brain: publicConsentBrain(brain),
      promises: [
        'You own the brain and may take your data with you.',
        'A team, agent, sponsor, employer or fan group receives no blanket access.',
        'Sharing requires an explicit scope grant that can later be revoked.',
        'Opportunity discovery does not authorize outreach, booking, payment or disclosure.',
        'Invite acceptance proves possession of this invitation, not high-assurance identity verification.',
      ],
    };
  }

  function acceptInvite(token, input = {}) {
    const state = load();
    const invite = expireIfNeeded(activeInvite(state, clean(token)));
    if (!invite) throw new Error('invite_not_found');
    if (invite.status === 'expired') throw new Error('invite_expired');
    if (invite.status === 'revoked') throw new Error('invite_revoked');

    const brain = findBrain(state, invite.brain_key);
    if (!brain) throw new Error('brain_not_found');
    if (invite.status === 'accepted') return { already_accepted: true, brain: safeBrain(brain) };

    if (input.accept_ownership !== true || input.accept_scopes !== true) throw new Error('explicit_acceptance_required');
    if (clean(input.confirmation_text) !== 'I ACCEPT') throw new Error('exact_confirmation_required');

    const stamp = now();
    invite.status = 'accepted';
    invite.accepted_at = stamp;
    brain.consent_state = 'consented';
    brain.domains_enabled = [...invite.scopes];
    brain.identity_assurance = 'invite_possession';
    brain.owner_identity_ref = 'invite:' + invite.invite_key;
    brain.updated_at = stamp;

    const event = {
      consent_event_key: key('consent'),
      brain_key: brain.brain_key,
      event_type: 'consent_granted',
      scopes: [...invite.scopes],
      policy_version: invite.policy_version,
      person_confirmation_ref: 'invite:' + invite.invite_key,
      actor: 'person-invite',
      occurred_at: stamp,
    };
    state.consent_events.push(event);
    save(state, { event: 'invite_accepted', brain_key: brain.brain_key, invite_key: invite.invite_key });
    return { consent_event_key: event.consent_event_key, brain: safeBrain(brain) };
  }

  function createEmailChallenge(brainKey, input = {}) {
    const state = load();
    const brain = findBrain(state, brainKey);
    if (!brain) throw new Error('brain_not_found');
    if (brain.consent_state !== 'consented') throw new Error('brain_not_consented');

    const email = clean(input.email).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('valid_email_required');

    const rawToken = crypto.randomUUID() + crypto.randomUUID();
    const [local = '', domain = ''] = email.split('@');
    const ttlMinutes = Math.min(120, Math.max(10, Number(input.ttl_minutes || 30)));
    const challenge = {
      challenge_key: key('email-verify'),
      brain_key: brain.brain_key,
      token_hash: sha256(rawToken),
      email_hash: sha256(email),
      email_hint: (local.slice(0, 2) || '*') + '***@' + domain,
      status: 'active',
      delivery_state: 'not_sent',
      expires_at: new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString(),
      created_at: now(),
    };
    state.identity_challenges.push(challenge);
    save(state, { event: 'email_challenge_created', brain_key: brain.brain_key, challenge_key: challenge.challenge_key });
    return {
      challenge_key: challenge.challenge_key,
      email_hint: challenge.email_hint,
      raw_token: rawToken,
      expires_at: challenge.expires_at,
      verification_path: '/people/verify-email?token=' + encodeURIComponent(rawToken),
    };
  }

  function recordEmailDelivery(challengeKey, input = {}) {
    const state = load();
    const challenge = state.identity_challenges.find((row) => row.challenge_key === clean(challengeKey));
    if (!challenge) throw new Error('challenge_not_found');
    if (challenge.status !== 'active' || Date.parse(challenge.expires_at) <= Date.now()) throw new Error('challenge_not_active');
    const provider = clean(input.provider);
    if (!['gmail_agent', 'resend_agent', 'manual_other'].includes(provider)) throw new Error('email_delivery_provider_invalid');
    const status = clean(input.status);
    if (!['sent', 'failed'].includes(status)) throw new Error('email_delivery_status_invalid');
    const stamp = now();
    const messageRef = clean(input.message_ref);
    const trustedMailboxDelivery = status === 'sent' && ['gmail_agent', 'resend_agent'].includes(provider);
    if (trustedMailboxDelivery && !messageRef) throw new Error('trusted_email_message_ref_required');
    if (trustedMailboxDelivery) {
      if (clean(input.destination_hash) !== challenge.email_hash) throw new Error('mail_delivery_destination_mismatch');
      const evidence = {
        challenge_key: challenge.challenge_key,
        destination_hash: challenge.email_hash,
        provider,
        status,
        message_ref: messageRef,
      };
      if (!verifyMailDeliveryEvidence(evidence, input.evidence_signature, trustedMailDeliveryPublicKeys[provider])) {
        throw new Error('trusted_mail_attestation_required');
      }
      if (state.identity_delivery_receipts.some((row) => row.challenge_key === challenge.challenge_key && row.trusted_mailbox_delivery === true)) {
        throw new Error('trusted_mail_delivery_already_recorded');
      }
    }
    const receipt = {
      delivery_receipt_key: key('identity-delivery'),
      challenge_key: challenge.challenge_key,
      brain_key: challenge.brain_key,
      channel: 'email',
      provider,
      destination_hint: challenge.email_hint,
      destination_hash: challenge.email_hash,
      status,
      trusted_mailbox_delivery: trustedMailboxDelivery,
      attestation_verified: trustedMailboxDelivery,
      evidence_signature_hash: trustedMailboxDelivery ? sha256(input.evidence_signature) : '',
      message_ref: messageRef,
      failure_reason: status === 'failed' ? clean(input.failure_reason) : '',
      actor: clean(input.actor) || 'systemia-mail-adapter',
      occurred_at: stamp,
    };
    state.identity_delivery_receipts.push(receipt);
    challenge.delivery_state = status;
    challenge.delivery_provider = provider;
    challenge.last_delivery_at = stamp;
    challenge.last_message_ref = receipt.message_ref;
    save(state, {
      event: 'identity_email_delivery_recorded',
      brain_key: challenge.brain_key,
      challenge_key: challenge.challenge_key,
      delivery_receipt_key: receipt.delivery_receipt_key,
      provider,
      status,
      trusted_mailbox_delivery: trustedMailboxDelivery,
    });
    return structuredClone(receipt);
  }

  function abortEmailChallenge(challengeKey) {
    const state = load();
    const challenge = state.identity_challenges.find(row => row.challenge_key === clean(challengeKey));
    if (!challenge) throw new Error('challenge_not_found');
    if (challenge.status === 'active') {
      challenge.status = 'revoked';
      challenge.delivery_state = 'failed';
      save(state, {
        event: 'identity_email_challenge_dispatch_aborted',
        challenge_key: challenge.challenge_key,
        brain_key: challenge.brain_key,
      });
    }
    return { challenge_key: challenge.challenge_key, status: challenge.status };
  }

  function inspectEmailChallenge(token) {
    const state = load();
    const challenge = expireIfNeeded(activeChallenge(state, clean(token)));
    if (!challenge) throw new Error('challenge_not_found');
    if (challenge.status === 'expired') {
      save(state, { event: 'email_challenge_expired', challenge_key: challenge.challenge_key });
      throw new Error('challenge_expired');
    }
    if (challenge.status === 'revoked') throw new Error('challenge_revoked');
    const brain = findBrain(state, challenge.brain_key);
    if (!brain) throw new Error('brain_not_found');
    return {
      person: { display_name: brain.display_name },
      email_hint: challenge.email_hint,
      expires_at: challenge.expires_at,
      already_verified: challenge.status === 'verified',
      delivery_state: challenge.delivery_state || 'not_sent',
      delivery_provider: challenge.delivery_provider || null,
      trusted_delivery_required: true,
      assurance_after_success: 'verified_email',
    };
  }

  function verifyEmail(token, input = {}) {
    const state = load();
    const challenge = expireIfNeeded(activeChallenge(state, clean(token)));
    if (!challenge) throw new Error('challenge_not_found');
    if (challenge.status === 'expired') throw new Error('challenge_expired');
    if (challenge.status === 'revoked') throw new Error('challenge_revoked');
    const trustedDelivery = state.identity_delivery_receipts
      .filter((row) => row.challenge_key === challenge.challenge_key)
      .some((row) => row.status === 'sent' && row.trusted_mailbox_delivery === true);
    if (!trustedDelivery) throw new Error('trusted_email_delivery_required');
    if (clean(input.confirmation_text) !== 'VERIFY MY EMAIL') throw new Error('exact_confirmation_required');

    const brain = findBrain(state, challenge.brain_key);
    if (!brain) throw new Error('brain_not_found');
    const stamp = now();
    challenge.status = 'verified';
    challenge.verified_at = stamp;
    brain.owner_identity_ref = 'email_sha256:' + challenge.email_hash;
    brain.identity_assurance = 'verified_email';
    brain.updated_at = stamp;
    save(state, { event: 'email_verified', brain_key: brain.brain_key, challenge_key: challenge.challenge_key });
    return { verified: true, brain: safeBrain(brain) };
  }

  function exportBrain(brainKey, input = {}) {
    const state = load();
    const brain = findBrain(state, brainKey);
    if (!brain) throw new Error('brain_not_found');
    const confirmationRef = clean(input.person_confirmation_ref);
    if (!confirmationRef) throw new Error('person_confirmation_ref_required');

    const payload = {
      schema: 'evercraft-people-brain-export-v1',
      exported_at: now(),
      brain: safeBrain(brain),
      memories: state.memories.filter((row) => row.brain_key === brain.brain_key),
      relationships: state.relationships.filter((row) => row.brain_key === brain.brain_key),
      opportunities: state.opportunities.filter((row) => row.brain_key === brain.brain_key),
      consent_events: state.consent_events.filter((row) => row.brain_key === brain.brain_key),
      share_receipts: state.share_receipts.filter((row) => row.brain_key === brain.brain_key),
      data_requests: state.data_requests.filter((row) => row.brain_key === brain.brain_key),
      identity_delivery_receipts: state.identity_delivery_receipts.filter((row) => row.brain_key === brain.brain_key),
    };
    const serialized = JSON.stringify(payload);
    const artifactHash = sha256(serialized);
    const stamp = now();
    const request = {
      request_key: key('export'),
      brain_key: brain.brain_key,
      request_type: 'export',
      status: 'completed',
      artifact_hash: artifactHash,
      person_confirmation_ref: confirmationRef,
      requested_at: stamp,
      completed_at: stamp,
    };
    state.data_requests.push(request);
    save(state, { event: 'brain_exported', brain_key: brain.brain_key, request_key: request.request_key, artifact_hash: artifactHash });
    return {
      package: payload,
      artifact_hash: artifactHash,
      request: structuredClone(request),
    };
  }

  function requestDelete(brainKey, input = {}) {
    const state = load();
    const brain = findBrain(state, brainKey);
    if (!brain) throw new Error('brain_not_found');
    const confirmationRef = clean(input.person_confirmation_ref);
    const identityVerified = ['verified_email', 'verified_account'].includes(brain.identity_assurance);
    const approved = identityVerified && Boolean(confirmationRef);

    const request = {
      request_key: key('delete'),
      brain_key: brain.brain_key,
      request_type: 'delete',
      status: approved ? 'approved' : 'pending_person_confirmation',
      person_confirmation_ref: confirmationRef,
      identity_assurance_at_request: brain.identity_assurance,
      requested_at: now(),
    };
    state.data_requests.push(request);
    if (approved) {
      brain.lifecycle_state = 'paused';
      brain.updated_at = now();
    }
    save(state, {
      event: 'delete_requested',
      brain_key: brain.brain_key,
      request_key: request.request_key,
      status: request.status,
      identity_verified: identityVerified,
      person_confirmation_present: Boolean(confirmationRef),
    });
    return request;
  }

  function completeDelete(brainKey, confirmationText) {
    const state = load();
    const brain = findBrain(state, brainKey);
    if (!brain) throw new Error('brain_not_found');
    if (!['verified_email', 'verified_account'].includes(brain.identity_assurance)) throw new Error('verified_owner_identity_required');
    if (clean(confirmationText) !== 'DELETE ' + brain.brain_key) throw new Error('exact_delete_confirmation_required');

    const approved = state.data_requests.find((row) => row.brain_key === brain.brain_key && row.request_type === 'delete' && row.status === 'approved');
    if (!approved) throw new Error('approved_delete_request_required');

    state.brains = state.brains.filter((row) => row.brain_key !== brain.brain_key);
    state.memories = state.memories.filter((row) => row.brain_key !== brain.brain_key);
    state.relationships = state.relationships.filter((row) => row.brain_key !== brain.brain_key);
    state.opportunities = state.opportunities.filter((row) => row.brain_key !== brain.brain_key);
    state.invites = state.invites.filter((row) => row.brain_key !== brain.brain_key);
    state.identity_challenges = state.identity_challenges.filter((row) => row.brain_key !== brain.brain_key);
    approved.status = 'completed';
    approved.completed_at = now();
    save(state, { event: 'brain_deleted', brain_key: brain.brain_key, request_key: approved.request_key, audit_ledgers_retained: true });
    return { ok: true, brain_key: brain.brain_key, ledger_retained: true };
  }

  return {
    health,
    listBrains,
    brainSnapshot,
    createBrain,
    createMemory,
    createRelationship,
    grantShare,
    revokeShare,
    revokeConsent,
    createOpportunity,
    setOpportunityAuthority,
    createInvite,
    inspectInvite,
    acceptInvite,
    createEmailChallenge,
    recordEmailDelivery,
    abortEmailChallenge,
    inspectEmailChallenge,
    verifyEmail,
    exportBrain,
    requestDelete,
    completeDelete,
  };
}
