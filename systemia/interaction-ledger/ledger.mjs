import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { EvercraftPassport } from '../passport/passport.mjs';

const LOCK_STALE_MS = 30_000;
const LOCK_TIMEOUT_MS = 5_000;
const LOCK_POLL_MS = 10;
const waitBuffer = new Int32Array(new SharedArrayBuffer(4));

const CHANNELS = new Set(['email', 'sms', 'phone', 'dm', 'push']);
const DIRECTIONS = new Set(['inbound', 'outbound', 'system']);
const EVENT_TYPES = new Set([
  'message',
  'reply',
  'opt_out',
  'opt_in_signal',
  'commitment_opened',
  'commitment_fulfilled',
  'commitment_cancelled',
  'note',
]);

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

function boundedInt(value, fallback, min, max, field) {
  const parsed = value === undefined || value === null ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(field + '_invalid');
  }
  return parsed;
}

function normalizeChannel(value) {
  const channel = requiredString(value, 'channel').toLowerCase();
  if (!CHANNELS.has(channel)) throw new Error('channel_invalid');
  return channel;
}

function normalizeDirection(value) {
  const direction = requiredString(value, 'direction').toLowerCase();
  if (!DIRECTIONS.has(direction)) throw new Error('direction_invalid');
  return direction;
}

function normalizeEventType(value) {
  const eventType = requiredString(value, 'event_type').toLowerCase();
  if (!EVENT_TYPES.has(eventType)) throw new Error('event_type_invalid');
  return eventType;
}

export class EvercraftInteractionLedger {
  constructor({ stateDir, passportStateDir } = {}) {
    if (!stateDir) throw new Error('interaction_ledger_state_dir_required');
    if (!passportStateDir) throw new Error('passport_state_dir_required');

    this.stateDir = path.resolve(stateDir);
    this.eventsFile = path.join(this.stateDir, 'interaction-events.jsonl');
    this.lockDir = path.join(this.stateDir, '.mutation-lock');
    this.passport = new EvercraftPassport({ stateDir: passportStateDir });

    this.events = [];
    this.idempotency = new Map();
    this.#reload();
  }

  #reload() {
    this.events = readJsonl(this.eventsFile);
    this.idempotency.clear();
    for (const event of this.events) {
      this.idempotency.set(event.idempotency_key, event);
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

    throw new Error('interaction_ledger_mutation_lock_timeout');
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

  recordEvent(input) {
    return this.#mutate(() => {
      const idempotencyKey = requiredString(input?.idempotency_key, 'idempotency_key');
      const existing = this.idempotency.get(idempotencyKey);
      if (existing) {
        return {
          state: 'duplicate',
          event: existing,
          receipt: stableReceipt({
            schema: 'evercraft.interaction-ledger.event-receipt.v1',
            state: 'duplicate',
            event_id: existing.event_id,
            idempotency_key: idempotencyKey,
          }),
        };
      }

      const eventType = normalizeEventType(input?.event_type);
      const subjectRef = requiredString(input?.subject_ref, 'subject_ref');
      const channel = normalizeChannel(input?.channel);
      const direction = normalizeDirection(input?.direction);
      const occurredAt = iso(input?.occurred_at || new Date().toISOString(), 'occurred_at');
      const evidenceRef = requiredString(input?.evidence_ref, 'evidence_ref');

      if (eventType === 'opt_out' && direction !== 'inbound' && direction !== 'system') {
        throw new Error('opt_out_direction_invalid');
      }
      if (eventType === 'reply' && direction !== 'inbound') {
        throw new Error('reply_direction_invalid');
      }

      const commitmentRef = input?.commitment_ref
        ? requiredString(input.commitment_ref, 'commitment_ref')
        : null;

      if (
        ['commitment_opened', 'commitment_fulfilled', 'commitment_cancelled'].includes(eventType) &&
        !commitmentRef
      ) {
        throw new Error('commitment_ref_required');
      }

      const contentFingerprint = input?.content_fingerprint
        ? requiredString(input.content_fingerprint, 'content_fingerprint')
        : input?.content
          ? sha256(String(input.content))
          : null;

      const event = stableReceipt({
        schema: 'evercraft.interaction-ledger.event.v1',
        event_id: input?.event_id
          ? requiredString(input.event_id, 'event_id')
          : 'ix_' + randomUUID(),
        idempotency_key: idempotencyKey,
        subject_ref: subjectRef,
        channel,
        direction,
        event_type: eventType,
        content_fingerprint: contentFingerprint,
        commitment_ref: commitmentRef,
        due_at: input?.due_at ? iso(input.due_at, 'due_at') : null,
        evidence_ref: evidenceRef,
        occurred_at: occurredAt,
        recorded_at: new Date().toISOString(),
        raw_message_body_stored: false,
      });

      this.events.push(event);
      this.idempotency.set(idempotencyKey, event);
      appendJsonl(this.eventsFile, event);

      return {
        state: 'recorded',
        event,
        receipt: stableReceipt({
          schema: 'evercraft.interaction-ledger.event-receipt.v1',
          state: 'recorded',
          event_id: event.event_id,
          subject_ref: subjectRef,
          channel,
          event_type: eventType,
          evidence_ref: evidenceRef,
        }),
      };
    });
  }

  getRelationshipState(subjectRef, { at = new Date().toISOString() } = {}) {
    this.#reload();
    const subject = requiredString(subjectRef, 'subject_ref');
    const instant = iso(at, 'at');

    const events = this.events
      .filter((event) => event.subject_ref === subject)
      .filter((event) => new Date(event.occurred_at) <= new Date(instant))
      .sort((a, b) => new Date(a.occurred_at) - new Date(b.occurred_at));

    const optedOutChannels = new Set();
    const openCommitments = new Map();

    for (const event of events) {
      if (event.event_type === 'opt_out') optedOutChannels.add(event.channel);
      if (event.event_type === 'opt_in_signal') optedOutChannels.delete(event.channel);

      if (event.event_type === 'commitment_opened') {
        openCommitments.set(event.commitment_ref, event);
      }
      if (
        event.event_type === 'commitment_fulfilled' ||
        event.event_type === 'commitment_cancelled'
      ) {
        openCommitments.delete(event.commitment_ref);
      }
    }

    const lastInbound = [...events]
      .reverse()
      .find((event) => event.direction === 'inbound') || null;
    const lastOutbound = [...events]
      .reverse()
      .find((event) => event.direction === 'outbound') || null;

    return {
      schema: 'evercraft.interaction-ledger.relationship-state.v1',
      subject_ref: subject,
      event_count: events.length,
      opted_out_channels: [...optedOutChannels].sort(),
      open_commitments: [...openCommitments.values()].map((event) => ({
        commitment_ref: event.commitment_ref,
        due_at: event.due_at,
        opened_at: event.occurred_at,
        evidence_ref: event.evidence_ref,
      })),
      last_inbound_at: lastInbound?.occurred_at || null,
      last_outbound_at: lastOutbound?.occurred_at || null,
      observed_at: instant,
      raw_identifiers_included: false,
      raw_message_bodies_included: false,
    };
  }

  preflightContact(input) {
    this.#reload();

    const subjectRef = requiredString(input?.subject_ref, 'subject_ref');
    const channel = normalizeChannel(input?.channel);
    const actorRef = requiredString(input?.actor_ref, 'actor_ref');
    const at = iso(input?.at || new Date().toISOString(), 'at');
    const product = input?.passport_product
      ? requiredString(input.passport_product, 'passport_product')
      : 'evercraft-relationship';
    const scope = 'contact.' + channel;

    const minimumCooldownMinutes = boundedInt(
      input?.minimum_cooldown_minutes,
      60,
      0,
      30 * 24 * 60,
      'minimum_cooldown_minutes'
    );
    const unansweredWindowHours = boundedInt(
      input?.unanswered_window_hours,
      168,
      1,
      24 * 90,
      'unanswered_window_hours'
    );
    const maxUnansweredOutbound = boundedInt(
      input?.max_unanswered_outbound,
      2,
      0,
      20,
      'max_unanswered_outbound'
    );
    const duplicateWindowHours = boundedInt(
      input?.duplicate_window_hours,
      720,
      1,
      24 * 365,
      'duplicate_window_hours'
    );

    const contentFingerprint = input?.content_fingerprint
      ? requiredString(input.content_fingerprint, 'content_fingerprint')
      : input?.content
        ? sha256(String(input.content))
        : null;

    const authorization = this.passport.authorize({
      subject_ref: actorRef,
      product,
      scope,
      resource_ref: subjectRef,
      at,
    });

    const history = this.events
      .filter((event) => event.subject_ref === subjectRef && event.channel === channel)
      .filter((event) => new Date(event.occurred_at) <= new Date(at))
      .sort((a, b) => new Date(a.occurred_at) - new Date(b.occurred_at));

    const reasons = [];
    if (authorization.decision !== 'allow') reasons.push('passport_contact_scope_missing');

    const latestOptEvent = [...history]
      .reverse()
      .find((event) => event.event_type === 'opt_out' || event.event_type === 'opt_in_signal');
    if (latestOptEvent?.event_type === 'opt_out') reasons.push('channel_opted_out');

    const lastOutbound = [...history]
      .reverse()
      .find((event) => event.direction === 'outbound') || null;

    if (lastOutbound && minimumCooldownMinutes > 0) {
      const elapsedMs = new Date(at) - new Date(lastOutbound.occurred_at);
      if (elapsedMs < minimumCooldownMinutes * 60_000) {
        reasons.push('outbound_cooldown_active');
      }
    }

    const windowStart = new Date(new Date(at).getTime() - unansweredWindowHours * 3_600_000);
    const recent = history.filter((event) => new Date(event.occurred_at) >= windowStart);

    let unansweredOutbound = 0;
    for (const event of recent) {
      if (event.direction === 'inbound' && (event.event_type === 'reply' || event.event_type === 'message')) {
        unansweredOutbound = 0;
      }
      if (event.direction === 'outbound' && event.event_type === 'message') {
        unansweredOutbound += 1;
      }
    }
    if (unansweredOutbound >= maxUnansweredOutbound && maxUnansweredOutbound >= 0) {
      reasons.push('unanswered_outbound_limit_reached');
    }

    if (contentFingerprint) {
      const duplicateStart = new Date(new Date(at).getTime() - duplicateWindowHours * 3_600_000);
      const duplicate = history.find(
        (event) =>
          event.direction === 'outbound' &&
          event.content_fingerprint === contentFingerprint &&
          new Date(event.occurred_at) >= duplicateStart
      );
      if (duplicate) reasons.push('duplicate_content_detected');
    }

    const openCommitments = this.getRelationshipState(subjectRef, { at }).open_commitments;
    const overdueCommitments = openCommitments.filter(
      (commitment) => commitment.due_at && new Date(commitment.due_at) < new Date(at)
    );
    if (overdueCommitments.length > 0 && input?.block_if_commitment_overdue !== false) {
      reasons.push('relationship_commitment_overdue');
    }

    const allowed = reasons.length === 0;
    return stableReceipt({
      schema: 'evercraft.interaction-ledger.contact-preflight.v1',
      decision: allowed ? 'allow' : 'deny',
      subject_ref: subjectRef,
      channel,
      actor_ref: actorRef,
      passport_product: product,
      passport_scope: scope,
      passport_grant_id: authorization.grant_id,
      reasons,
      policy: {
        minimum_cooldown_minutes: minimumCooldownMinutes,
        unanswered_window_hours: unansweredWindowHours,
        max_unanswered_outbound: maxUnansweredOutbound,
        duplicate_window_hours: duplicateWindowHours,
        block_if_commitment_overdue: input?.block_if_commitment_overdue !== false,
      },
      signals: {
        unanswered_outbound: unansweredOutbound,
        last_outbound_at: lastOutbound?.occurred_at || null,
        duplicate_content_checked: Boolean(contentFingerprint),
        overdue_commitment_count: overdueCommitments.length,
      },
      evaluated_at: at,
      send_performed: false,
      mutation_performed: false,
    });
  }
}
