import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes, randomUUID } from 'node:crypto';

const LOCK_STALE_MS = 30_000;
const LOCK_TIMEOUT_MS = 8_000;
const LOCK_POLL_MS = 10;
const waitBuffer = new Int32Array(new SharedArrayBuffer(4));

function clean(value) { return String(value ?? '').trim(); }
function safeKey(value, field) {
  const key = clean(value);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(key)) throw new Error(`${field}_invalid`);
  return key;
}
function sha(value) {
  return 'sha256:' + createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
}
function sleep(ms) { Atomics.wait(waitBuffer, 0, 0, ms); }
function streamHash(appKey, entity) { return createHash('sha256').update(`${appKey}\n${entity}`).digest('hex'); }
function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, file);
}

export class EvercraftRealtimeBus {
  constructor({ stateDir, maxEventBytes = 2 * 1024 * 1024 } = {}) {
    if (!stateDir) throw new Error('realtime_state_dir_required');
    this.stateDir = path.resolve(stateDir);
    this.maxEventBytes = Math.max(1024, Number(maxEventBytes));
    this.streamsDir = path.join(this.stateDir, 'streams');
    this.locksDir = path.join(this.stateDir, '.locks');
  }

  #location(appKeyInput, entityInput) {
    const appKey = safeKey(appKeyInput, 'app_key');
    const entity = safeKey(entityInput, 'entity');
    const hash = streamHash(appKey, entity);
    const dir = path.join(this.streamsDir, hash.slice(0, 2), hash);
    return {
      appKey,
      entity,
      hash,
      log: path.join(dir, 'events.jsonl'),
      state: path.join(dir, 'state.json'),
      lock: path.join(this.locksDir, hash)
    };
  }

  #acquire(location) {
    fs.mkdirSync(path.dirname(location.lock), { recursive: true, mode: 0o700 });
    const deadline = Date.now() + LOCK_TIMEOUT_MS;
    while (Date.now() < deadline) {
      try {
        fs.mkdirSync(location.lock, { mode: 0o700 });
        fs.writeFileSync(path.join(location.lock, 'owner.json'), JSON.stringify({ pid: process.pid, acquired_at: new Date().toISOString() }) + '\n', { mode: 0o600 });
        return;
      } catch (error) {
        if (error?.code !== 'EEXIST') throw error;
        try {
          const stat = fs.statSync(location.lock);
          if (Date.now() - stat.mtimeMs > LOCK_STALE_MS) {
            fs.rmSync(location.lock, { recursive: true, force: true });
            continue;
          }
        } catch (statError) {
          if (statError?.code !== 'ENOENT') throw statError;
        }
        sleep(LOCK_POLL_MS);
      }
    }
    throw new Error('realtime_lock_timeout');
  }

  #release(location) { fs.rmSync(location.lock, { recursive: true, force: true }); }

  #state(location) {
    if (!fs.existsSync(location.state)) {
      return {
        schema: 'evercraft.realtime.stream-state.v1',
        app_key_hash: sha(location.appKey),
        entity: location.entity,
        last_sequence: 0,
        last_event_hash: null,
        updated_at: null
      };
    }
    const state = JSON.parse(fs.readFileSync(location.state, 'utf8'));
    if (state?.schema !== 'evercraft.realtime.stream-state.v1') throw new Error('realtime_state_schema_invalid');
    if (state.app_key_hash !== sha(location.appKey) || state.entity !== location.entity) throw new Error('realtime_state_identity_mismatch');
    return state;
  }

  publish(appKey, entity, {
    type = 'change',
    data = null,
    revision = null,
    mutationReceiptHash = null,
    now = new Date()
  } = {}) {
    const location = this.#location(appKey, entity);
    const eventType = safeKey(type, 'event_type');
    const payloadBytes = Buffer.byteLength(JSON.stringify(data));
    if (payloadBytes > this.maxEventBytes) throw new Error('realtime_event_too_large');
    this.#acquire(location);
    try {
      const state = this.#state(location);
      const sequence = Number(state.last_sequence || 0) + 1;
      const body = {
        schema: 'evercraft.realtime.event.v1',
        event_id: `event_${randomUUID()}`,
        app_key_hash: sha(location.appKey),
        entity: location.entity,
        sequence,
        type: eventType,
        data: structuredClone(data),
        revision: revision == null ? null : Number(revision),
        mutation_receipt_hash: mutationReceiptHash || null,
        previous_event_hash: state.last_event_hash || null,
        occurred_at: new Date(now).toISOString()
      };
      const event = { ...body, event_hash: sha(body) };
      fs.mkdirSync(path.dirname(location.log), { recursive: true, mode: 0o700 });
      fs.appendFileSync(location.log, JSON.stringify(event) + '\n', { mode: 0o600 });
      atomicJson(location.state, {
        schema: 'evercraft.realtime.stream-state.v1',
        app_key_hash: sha(location.appKey),
        entity: location.entity,
        last_sequence: sequence,
        last_event_hash: event.event_hash,
        updated_at: event.occurred_at
      });
      return structuredClone(event);
    } finally {
      this.#release(location);
    }
  }

  read(appKey, entity, { afterSequence = 0, limit = 1000 } = {}) {
    const location = this.#location(appKey, entity);
    if (!fs.existsSync(location.log)) return [];
    const rows = fs.readFileSync(location.log, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
    let expectedSequence = 1;
    let previousHash = null;
    for (const event of rows) {
      if (event?.schema !== 'evercraft.realtime.event.v1') throw new Error('realtime_event_schema_invalid');
      if (event.app_key_hash !== sha(location.appKey) || event.entity !== location.entity) throw new Error('realtime_event_identity_mismatch');
      if (event.sequence !== expectedSequence) throw new Error('realtime_sequence_gap');
      if (event.previous_event_hash !== previousHash) throw new Error('realtime_hash_chain_broken');
      const { event_hash, ...body } = event;
      if (sha(body) !== event_hash) throw new Error('realtime_event_hash_mismatch');
      previousHash = event_hash;
      expectedSequence += 1;
    }
    const after = Math.max(0, Number(afterSequence || 0));
    const boundedLimit = Math.max(0, Math.min(10000, Number(limit || 1000)));
    return rows.filter((event) => event.sequence > after).slice(0, boundedLimit).map((event) => structuredClone(event));
  }

  cursor(appKey, entity) {
    const location = this.#location(appKey, entity);
    const state = this.#state(location);
    return {
      schema: 'evercraft.realtime.cursor.v1',
      entity: location.entity,
      sequence: state.last_sequence,
      event_hash: state.last_event_hash,
      updated_at: state.updated_at
    };
  }

  health() {
    fs.mkdirSync(this.stateDir, { recursive: true, mode: 0o700 });
    const probe = path.join(this.stateDir, `.health-${process.pid}-${randomBytes(4).toString('hex')}`);
    fs.writeFileSync(probe, 'ok', { mode: 0o600 });
    fs.unlinkSync(probe);
    return {
      schema: 'evercraft.realtime.health.v1',
      state: 'healthy',
      durable_event_log: true,
      hash_chained: true,
      resumable_sequence: true,
      cross_process_publish_lock: true
    };
  }
}
