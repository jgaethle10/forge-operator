import fs from 'node:fs';
import path from 'node:path';
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

function clean(value) { return String(value ?? '').trim(); }
function safeKey(value, field) {
  const key = clean(value);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(key)) throw new Error(`${field}_invalid`);
  return key;
}
function sha(value) { return 'sha256:' + createHash('sha256').update(Buffer.isBuffer(value) ? value : Buffer.from(typeof value === 'string' ? value : JSON.stringify(value))).digest('hex'); }
function routeHash(appKey, routeKey) { return createHash('sha256').update(`${appKey}\n${routeKey}`).digest('hex'); }
function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, file);
}
function headersLower(headers = {}) {
  const out = {};
  if (headers && typeof headers.entries === 'function') {
    for (const [key, value] of headers.entries()) out[String(key).toLowerCase()] = String(value);
  } else {
    for (const [key, value] of Object.entries(headers || {})) out[String(key).toLowerCase()] = Array.isArray(value) ? value.join(',') : String(value);
  }
  return out;
}
function timestampMs(value) {
  const raw = clean(value);
  if (!raw) throw new Error('webhook_timestamp_required');
  if (/^\d+$/.test(raw)) {
    const n = Number(raw);
    if (!Number.isFinite(n)) throw new Error('webhook_timestamp_invalid');
    return raw.length <= 10 ? n * 1000 : n;
  }
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) throw new Error('webhook_timestamp_invalid');
  return parsed;
}
function signatureHex(value) {
  const raw = clean(value).replace(/^sha256=/i, '');
  if (!/^[a-f0-9]{64}$/i.test(raw)) throw new Error('webhook_signature_invalid');
  return raw.toLowerCase();
}

export class EvercraftWebhookGateway {
  constructor({ stateDir, secretStore, maxSkewMs = 5 * 60 * 1000 } = {}) {
    if (!stateDir) throw new Error('webhook_state_dir_required');
    if (!secretStore) throw new Error('webhook_secret_store_required');
    this.stateDir = path.resolve(stateDir);
    this.secretStore = secretStore;
    this.maxSkewMs = Math.max(1000, Number(maxSkewMs));
    this.routes = new Map();
    this.eventsDir = path.join(this.stateDir, 'events');
    this.receiptsFile = path.join(this.stateDir, 'receipts.jsonl');
  }

  registerRoute({
    appKey: appKeyInput,
    routeKey: routeKeyInput,
    secretNamespace,
    secretName,
    handler,
    signatureHeader = 'x-evercraft-signature',
    timestampHeader = 'x-evercraft-timestamp',
    eventIdHeader = 'x-evercraft-event-id'
  } = {}) {
    const appKey = safeKey(appKeyInput, 'app_key');
    const routeKey = safeKey(routeKeyInput, 'webhook_route');
    if (typeof handler !== 'function') throw new Error('webhook_handler_required');
    const key = `${appKey}:${routeKey}`;
    this.routes.set(key, {
      appKey,
      routeKey,
      secretNamespace: safeKey(secretNamespace, 'secret_namespace'),
      secretName: safeKey(secretName, 'secret_name'),
      handler,
      signatureHeader: clean(signatureHeader).toLowerCase(),
      timestampHeader: clean(timestampHeader).toLowerCase(),
      eventIdHeader: clean(eventIdHeader).toLowerCase()
    });
    return this;
  }

  #route(appKeyInput, routeKeyInput) {
    const appKey = safeKey(appKeyInput, 'app_key');
    const routeKey = safeKey(routeKeyInput, 'webhook_route');
    const route = this.routes.get(`${appKey}:${routeKey}`);
    if (!route) throw new Error('webhook_route_not_registered');
    return route;
  }

  #eventFile(route, eventId) {
    const hash = routeHash(route.appKey, route.routeKey);
    const eventHash = createHash('sha256').update(eventId).digest('hex');
    return path.join(this.eventsDir, hash, `${eventHash}.json`);
  }

  #appendReceipt(body) {
    const receipt = { ...body, receipt_hash: sha(body) };
    fs.mkdirSync(this.stateDir, { recursive: true, mode: 0o700 });
    fs.appendFileSync(this.receiptsFile, JSON.stringify(receipt) + '\n', { mode: 0o600 });
    return receipt;
  }

  async handle({ appKey, routeKey, headers = {}, body = Buffer.alloc(0), now = new Date() } = {}) {
    const route = this.#route(appKey, routeKey);
    const normalized = headersLower(headers);
    const eventId = safeKey(normalized[route.eventIdHeader], 'webhook_event_id');
    const timestampRaw = normalized[route.timestampHeader];
    const observedTimestampMs = timestampMs(timestampRaw);
    const nowMs = new Date(now).getTime();
    if (Math.abs(nowMs - observedTimestampMs) > this.maxSkewMs) throw new Error('webhook_timestamp_outside_replay_window');
    const payload = Buffer.isBuffer(body) ? Buffer.from(body) : Buffer.from(String(body ?? ''));
    const provided = Buffer.from(signatureHex(normalized[route.signatureHeader]), 'hex');
    const secret = this.secretStore.getSecretText(route.secretNamespace, route.secretName);
    const expectedHex = createHmac('sha256', secret).update(`${timestampRaw}.`).update(payload).digest('hex');
    const expected = Buffer.from(expectedHex, 'hex');
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) throw new Error('webhook_signature_mismatch');

    const bodyHash = sha(payload);
    const eventFile = this.#eventFile(route, eventId);
    fs.mkdirSync(path.dirname(eventFile), { recursive: true, mode: 0o700 });
    if (fs.existsSync(eventFile)) {
      const prior = JSON.parse(fs.readFileSync(eventFile, 'utf8'));
      if (prior.body_sha256 !== bodyHash) throw new Error('webhook_event_id_body_conflict');
      if (prior.status === 'delivered') {
        return {
          replayed: true,
          status: 'delivered',
          event_id: eventId,
          delivery_receipt_hash: prior.delivery_receipt_hash || null
        };
      }
      if (prior.status === 'processing') {
        return { replayed: true, status: 'processing', event_id: eventId };
      }
    }

    const attempt = fs.existsSync(eventFile)
      ? Number(JSON.parse(fs.readFileSync(eventFile, 'utf8')).attempt || 0) + 1
      : 1;
    const processing = {
      schema: 'evercraft.webhook.event-state.v1',
      app_key_hash: sha(route.appKey),
      route_key: route.routeKey,
      event_id_hash: sha(eventId),
      body_sha256: bodyHash,
      status: 'processing',
      attempt,
      updated_at: new Date(now).toISOString()
    };
    atomicJson(eventFile, processing);

    try {
      const result = await route.handler({
        appKey: route.appKey,
        routeKey: route.routeKey,
        eventId,
        timestamp: timestampRaw,
        headers: normalized,
        body: payload,
        bodySha256: bodyHash,
        attempt
      });
      const receipt = this.#appendReceipt({
        schema: 'evercraft.webhook.delivery-receipt.v1',
        receipt_id: `webhook_receipt_${randomUUID()}`,
        app_key_hash: sha(route.appKey),
        route_key: route.routeKey,
        event_id_hash: sha(eventId),
        body_sha256: bodyHash,
        attempt,
        delivered_at: new Date(now).toISOString(),
        payload_emitted: false
      });
      atomicJson(eventFile, {
        ...processing,
        status: 'delivered',
        delivery_receipt_hash: receipt.receipt_hash,
        updated_at: new Date(now).toISOString()
      });
      return { replayed: false, status: 'delivered', event_id: eventId, result, receipt };
    } catch (error) {
      atomicJson(eventFile, {
        ...processing,
        status: 'failed',
        error_code: String(error?.message || error),
        updated_at: new Date(now).toISOString()
      });
      throw error;
    }
  }

  health() {
    fs.mkdirSync(this.stateDir, { recursive: true, mode: 0o700 });
    return {
      schema: 'evercraft.webhook.health.v1',
      state: 'healthy',
      registered_routes: this.routes.size,
      signature_verification: 'hmac-sha256',
      replay_window_ms: this.maxSkewMs,
      idempotent_event_ledger: true,
      payloads_in_receipts: false
    };
  }
}
