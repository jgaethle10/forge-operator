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

function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  }
  return JSON.stringify(value);
}

function receiptHash(previous, event, secret = '') {
  const input = String(previous || '') + '\n' + canonical(event);
  return secret
    ? crypto.createHmac('sha256', secret).update(input).digest('hex')
    : crypto.createHash('sha256').update(input).digest('hex');
}

function boundedLimit(value, fallback = 50, max = 500) {
  return Math.max(1, Math.min(Number(value ?? fallback), max));
}

export function createNotificationStore({ dataDir, receiptSecret = '' }) {
  const root = path.resolve(dataDir);
  const subscriptionsFile = path.join(root, 'subscriptions.json');
  const signalStateFile = path.join(root, 'signal-state.json');
  const dedupeFile = path.join(root, 'notification-dedupe.json');
  const ledgerFile = path.join(root, 'delivery-ledger.ndjson');
  const ledgerHeadFile = path.join(root, 'delivery-ledger-head.json');
  const digestFile = path.join(root, 'digest-queue.ndjson');
  const ownerQueueFile = path.join(root, 'owner-queue.ndjson');
  const attentionFile = path.join(root, 'attention-budget.json');
  const inboxDir = path.join(root, 'inbox');

  function inboxFile(principalId) {
    return path.join(inboxDir, stableId(principalId) + '.json');
  }

  return {
    root,
    listSubscriptions() {
      const state = safeReadJson(subscriptionsFile, { schema: 'systemia.notification-subscriptions.v1', subscriptions: {} });
      return Object.values(state.subscriptions || {});
    },
    getSubscription(id) {
      const state = safeReadJson(subscriptionsFile, { schema: 'systemia.notification-subscriptions.v1', subscriptions: {} });
      return state.subscriptions?.[String(id || '')] || null;
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
        timezone: input.timezone || prior?.timezone || null,
        quiet_hours: input.quiet_hours || prior?.quiet_hours || null,
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
    appendInbox(principalId, notification, options = {}) {
      const principal = String(principalId || '').trim();
      if (!principal) throw new Error('Inbox principal is required.');
      const file = inboxFile(principal);
      const state = safeReadJson(file, { schema: 'systemia.notification-inbox.v1', principal_id: principal, items: [] });
      const existing = state.items.find((item) => item.id === notification.id);
      if (existing) return existing;
      const item = {
        ...notification,
        principal_id: principal,
        inboxed_at: new Date().toISOString(),
        seen_at: null,
        acknowledged_at: null,
      };
      state.items.unshift(item);
      state.items = state.items.slice(0, boundedLimit(options.maxItems, 500, 2000));
      atomicWriteJson(file, state);
      return item;
    },
    listInbox(principalId, options = {}) {
      const principal = String(principalId || '').trim();
      const state = safeReadJson(inboxFile(principal), { schema: 'systemia.notification-inbox.v1', principal_id: principal, items: [] });
      const unreadOnly = options.unreadOnly === true;
      const items = unreadOnly ? state.items.filter((item) => !item.seen_at) : state.items;
      return items.slice(0, boundedLimit(options.limit, 50, 500));
    },
    acknowledgeInbox(principalId, notificationId, options = {}) {
      const principal = String(principalId || '').trim();
      const file = inboxFile(principal);
      const state = safeReadJson(file, { schema: 'systemia.notification-inbox.v1', principal_id: principal, items: [] });
      const item = state.items.find((entry) => entry.id === String(notificationId || ''));
      if (!item) return null;
      const now = options.at || new Date().toISOString();
      item.seen_at = item.seen_at || now;
      item.acknowledged_at = item.acknowledged_at || now;
      atomicWriteJson(file, state);
      return item;
    },
    markInboxSeen(principalId, notificationId, options = {}) {
      const principal = String(principalId || '').trim();
      const file = inboxFile(principal);
      const state = safeReadJson(file, { schema: 'systemia.notification-inbox.v1', principal_id: principal, items: [] });
      const item = state.items.find((entry) => entry.id === String(notificationId || ''));
      if (!item) return null;
      item.seen_at = item.seen_at || options.at || new Date().toISOString();
      atomicWriteJson(file, state);
      return item;
    },
    recordDelivery(event) {
      const head = safeReadJson(ledgerHeadFile, { schema: 'systemia.notification-ledger-head.v1', last_hash: null, count: 0 });
      const base = { ...event };
      delete base.prev_hash;
      delete base.receipt_hash;
      const hash = receiptHash(head.last_hash, base, receiptSecret);
      const receipt = { ...base, prev_hash: head.last_hash, receipt_hash: hash };
      appendJsonLine(ledgerFile, receipt);
      atomicWriteJson(ledgerHeadFile, {
        schema: 'systemia.notification-ledger-head.v1',
        last_hash: hash,
        count: Number(head.count || 0) + 1,
        mode: receiptSecret ? 'hmac-sha256' : 'sha256',
        updated_at: new Date().toISOString(),
      });
      return receipt;
    },
    verifyDeliveryLedger() {
      if (!fs.existsSync(ledgerFile)) return { valid: true, count: 0, last_hash: null };
      const lines = fs.readFileSync(ledgerFile, 'utf8').split('\n').filter(Boolean);
      let previous = null;
      let count = 0;
      for (const line of lines) {
        const receipt = JSON.parse(line);
        const { prev_hash, receipt_hash, ...base } = receipt;
        const expected = receiptHash(previous, base, receiptSecret);
        if (prev_hash !== previous || receipt_hash !== expected) {
          return { valid: false, count, last_hash: previous, broken_at: count + 1 };
        }
        previous = receipt_hash;
        count += 1;
      }
      const head = safeReadJson(ledgerHeadFile, { last_hash: null, count: 0, mode: receiptSecret ? 'hmac-sha256' : 'sha256' });
      return {
        valid: head.last_hash === previous && Number(head.count || 0) === count,
        count,
        last_hash: previous,
        mode: receiptSecret ? 'hmac-sha256' : 'sha256',
      };
    },
    deliveryLedgerHead() {
      const head = safeReadJson(ledgerHeadFile, {
        schema: 'systemia.notification-ledger-head.v1',
        last_hash: null,
        count: 0,
        mode: receiptSecret ? 'hmac-sha256' : 'sha256',
      });
      return {
        count: Number(head.count || 0),
        last_hash: head.last_hash || null,
        mode: head.mode || (receiptSecret ? 'hmac-sha256' : 'sha256'),
      };
    },
    consumeAttentionBudget(principalId, purpose, options = {}) {
      const principal = String(principalId || '').trim();
      if (!principal) return { allowed: false, used: 0, limit: 0 };
      const now = Number(options.now ?? Date.now());
      const windowMs = Math.max(60000, Number(options.windowMs ?? 60 * 60 * 1000));
      const limits = {
        transactional: 8,
        operational: 6,
        reminder: 4,
        marketing: 2,
        ...(options.limits || {}),
      };
      const limit = Math.max(0, Number(limits[purpose] ?? 6));
      const state = safeReadJson(attentionFile, { schema: 'systemia.notification-attention-budget.v1', principals: {} });
      const key = stableId(principal);
      const bucket = state.principals[key] || { principal_id: principal, events: [] };
      const cutoff = now - windowMs;
      bucket.events = (bucket.events || []).filter((event) => Number(event.at_ms) >= cutoff);
      const used = bucket.events.filter((event) => event.purpose === purpose).length;
      const allowed = used < limit;
      if (allowed) bucket.events.push({ purpose, at_ms: now });
      state.principals[key] = bucket;
      atomicWriteJson(attentionFile, state);
      return { allowed, used: allowed ? used + 1 : used, limit, window_ms: windowMs };
    },
    deliverySnapshot(options = {}) {
      const sinceMs = Number(options.sinceMs ?? 24 * 60 * 60 * 1000);
      if (!fs.existsSync(ledgerFile)) return { window_ms: sinceMs, total: 0, statuses: {} };
      const cutoff = Date.now() - sinceMs;
      const statuses = {};
      let total = 0;
      for (const line of fs.readFileSync(ledgerFile, 'utf8').split('\n').filter(Boolean)) {
        try {
          const event = JSON.parse(line);
          const at = Date.parse(event.at || event.created_at || '');
          if (Number.isFinite(at) && at < cutoff) continue;
          const status = event.status || event.schema || 'unknown';
          statuses[status] = (statuses[status] || 0) + 1;
          total += 1;
        } catch {}
      }
      return { window_ms: sinceMs, total, statuses };
    },
    queueDigest(event) { appendJsonLine(digestFile, event); },
    queueOwner(event) { appendJsonLine(ownerQueueFile, event); },
  };
}
