import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

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

export function createPeopleRuntime({
  stateDir = process.env.PEOPLE_STATE_DIR || path.resolve('.runtime', 'people-layer'),
} = {}) {
  const stateFile = path.join(stateDir, 'state.json');
  const auditFile = path.join(stateDir, 'audit.jsonl');

  function emptyState() {
    return {
      schema: 'evercraft.people.owned-state.v1',
      brains: [],
      invites: [],
      identity_challenges: [],
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
      consent_event_count: state.consent_events.length,
      invite_count: state.invites.length,
      identity_challenge_count: state.identity_challenges.length,
      base44_runtime_dependency: false,
      updated_at: state.updated_at,
    };
  }

  function listBrains() {
    return load().brains
      .filter((row) => row.lifecycle_state !== 'archived')
      .map(safeBrain);
  }

  function createBrain(input = {}) {
    const displayName = clean(input.display_name);
    if (!displayName) throw new Error('display_name_required');

    const state = load();
    const stamp = now();
    const brain = {
      brain_key: clean(input.brain_key) || key('brain'),
      display_name: displayName,
      person_type: clean(input.person_type) || 'athlete',
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

  function createInvite(brainKey, input = {}) {
    const state = load();
    const brain = findBrain(state, brainKey);
    if (!brain) throw new Error('brain_not_found');

    const scopes = Array.isArray(input.scopes)
      ? input.scopes.map(clean).filter(Boolean)
      : ['memory', 'relationships', 'opportunities', 'export'];

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
      brain: safeBrain(brain),
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
      assurance_after_success: 'verified_email',
    };
  }

  function verifyEmail(token, input = {}) {
    const state = load();
    const challenge = expireIfNeeded(activeChallenge(state, clean(token)));
    if (!challenge) throw new Error('challenge_not_found');
    if (challenge.status === 'expired') throw new Error('challenge_expired');
    if (challenge.status === 'revoked') throw new Error('challenge_revoked');
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

  function exportBrain(brainKey) {
    const state = load();
    const brain = findBrain(state, brainKey);
    if (!brain) throw new Error('brain_not_found');

    const payload = {
      schema: 'evercraft-people-brain-export-v1',
      exported_at: now(),
      brain: safeBrain(brain),
      consent_events: state.consent_events.filter((row) => row.brain_key === brain.brain_key),
      share_receipts: state.share_receipts.filter((row) => row.brain_key === brain.brain_key),
      data_requests: state.data_requests.filter((row) => row.brain_key === brain.brain_key),
    };
    const serialized = JSON.stringify(payload);
    return {
      package: payload,
      artifact_hash: sha256(serialized),
    };
  }

  function requestDelete(brainKey) {
    const state = load();
    const brain = findBrain(state, brainKey);
    if (!brain) throw new Error('brain_not_found');

    const request = {
      request_key: key('delete'),
      brain_key: brain.brain_key,
      request_type: 'delete',
      status: ['verified_email', 'verified_account'].includes(brain.identity_assurance)
        ? 'approved'
        : 'pending_person_confirmation',
      requested_at: now(),
    };
    state.data_requests.push(request);
    if (request.status === 'approved') {
      brain.lifecycle_state = 'paused';
      brain.updated_at = now();
    }
    save(state, { event: 'delete_requested', brain_key: brain.brain_key, request_key: request.request_key, status: request.status });
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
    createBrain,
    createInvite,
    inspectInvite,
    acceptInvite,
    createEmailChallenge,
    inspectEmailChallenge,
    verifyEmail,
    exportBrain,
    requestDelete,
    completeDelete,
  };
}
