import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
}

function safeReadJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) {
    if (error?.code === 'ENOENT') return structuredClone(fallback);
    throw error;
  }
}

function atomicWriteJson(file, value) {
  ensureDir(path.dirname(file));
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(temp, file);
  try { fs.chmodSync(file, 0o600); } catch {}
}

function appendJsonLine(file, value) {
  ensureDir(path.dirname(file));
  fs.appendFileSync(file, JSON.stringify(value) + '\n', { mode: 0o600 });
  try { fs.chmodSync(file, 0o600); } catch {}
}

function stableId(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 24);
}

export function createNotificationStore({ dataDir }) {
  const root = path.resolve(dataDir);
  const subscriptionsFile = path.join(root, 'subscriptions.json');
  const signalStateFile = path.join(root, 'signal-state.json');
  const dedupeFile = path.join(root, 'notification-dedupe.json');
  const ledgerFile = path.join(root, 'delivery-ledger.ndjson');
  const digestFile = path.join(root, 'digest-queue.ndjson');
  const ownerQueueFile = path.join(root, 'owner-queue.ndjson');

  return {
    root,
    listSubscriptions() {
      const state = safeReadJson(subscriptionsFile, { schema: 'systemia.notification-subscriptions.v1', subscriptions: {} });
      return Object.values(state.subscriptions || {});
    },
    upsertSubscription(input) {
      const endpoint = String(input.endpoint || '').trim();
      const id = input.id || stableId(endpoint);
      const state = safeReadJson(subscriptionsFile, { schema: 'systemia.notification-subscriptions.v1', subscriptions: {} });
      const prior = state.subscriptions[id];
      const now = new Date().toISOString();
      const record = {
        schema: 'systemia.push-subscription.v1',
        id,
        principal_id: String(input.principal_id || '').trim(),
        endpoint,
        keys: { p256dh: String(input.keys?.p256dh || ''), auth: String(input.keys?.auth || '') },
        audiences: [...new Set((input.audiences || ['company-ops']).map(String))],
        products: [...new Set((input.products || []).map(String))],
        preferences: {
          transactional: input.preferences?.transactional !== false,
          operational: input.preferences?.operational !== false,
          safety: input.preferences?.safety !== false,
          reminder: input.preferences?.reminder === true,
          marketing: input.preferences?.marketing === true,
        },
        locale: input.locale || prior?.locale || null,
        user_agent: input.user_agent || prior?.user_agent || null,
        created_at: prior?.created_at || now,
        updated_at: now,
        disabled_at: null,
      };
      state.subscriptions[id] = record;
      atomicWriteJson(subscriptionsFile, state);
      return record;
    },
    disableSubscription(id, reason = 'disabled') {
      const state = safeReadJson(subscriptionsFile, { schema: 'systemia.notification-subscriptions.v1', subscriptions: {} });
      const record = state.subscriptions[id];
      if (!record) return null;
      record.disabled_at = new Date().toISOString();
      record.disabled_reason = reason;
      record.updated_at = record.disabled_at;
      atomicWriteJson(subscriptionsFile, state);
      return record;
    },
    removeSubscription(id) {
      const state = safeReadJson(subscriptionsFile, { schema: 'systemia.notification-subscriptions.v1', subscriptions: {} });
      const existed = Boolean(state.subscriptions[id]);
      delete state.subscriptions[id];
      atomicWriteJson(subscriptionsFile, state);
      return existed;
    },
    loadSignalState(fallback) { return safeReadJson(signalStateFile, fallback); },
    saveSignalState(state) { atomicWriteJson(signalStateFile, state); },
    seenDedupe(key, windowSeconds, now = Date.now()) {
      if (!key) return false;
      const state = safeReadJson(dedupeFile, { schema: 'systemia.notification-dedupe.v1', keys: {} });
      const cutoff = now - Math.max(0, windowSeconds) * 1000;
      for (const [existing, ts] of Object.entries(state.keys || {})) {
        if (Number(ts) < cutoff) delete state.keys[existing];
      }
      const seen = Number(state.keys[key] || 0) >= cutoff;
      if (!seen) state.keys[key] = now;
      atomicWriteJson(dedupeFile, state);
      return seen;
    },
    recordDelivery(event) { appendJsonLine(ledgerFile, event); },
    queueDigest(event) { appendJsonLine(digestFile, event); },
    queueOwner(event) { appendJsonLine(ownerQueueFile, event); },
  };
}
