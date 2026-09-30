import crypto from 'node:crypto';
import path from 'node:path';
import { emptyState, ingest } from '../signal-fabric/engine.mjs';
import { createNotificationStore } from './store.mjs';
import { sendWebPush } from './web-push.mjs';

const PURPOSES = new Set(['transactional', 'operational', 'safety', 'reminder', 'marketing']);
const PRIORITIES = new Set(['low', 'normal', 'high', 'critical']);

function normArray(value) {
  return [...new Set((Array.isArray(value) ? value : []).map((x) => String(x).trim()).filter(Boolean))];
}

function urgency(priority) {
  if (priority === 'critical' || priority === 'high') return 'high';
  if (priority === 'low') return 'very-low';
  return 'normal';
}

function validateIntent(raw) {
  const purpose = String(raw?.purpose || 'transactional').trim().toLowerCase();
  const priority = String(raw?.priority || 'normal').trim().toLowerCase();
  if (!PURPOSES.has(purpose)) throw new Error(`Unsupported notification purpose: ${purpose}`);
  if (!PRIORITIES.has(priority)) throw new Error(`Unsupported notification priority: ${priority}`);
  const title = String(raw?.title || '').trim();
  const body = String(raw?.body || '').trim();
  if (!title) throw new Error('Notification title is required.');
  if (!body) throw new Error('Notification body is required.');
  if (purpose === 'marketing' && raw?.consent_basis !== 'explicit_opt_in') {
    throw new Error('Marketing notifications require consent_basis=explicit_opt_in.');
  }
  const now = new Date().toISOString();
  return {
    schema: 'systemia.notification.intent.v1',
    id: String(raw.id || crypto.randomUUID()),
    product: String(raw.product || 'unknown').trim(),
    purpose,
    priority,
    title: title.slice(0, 140),
    body: body.slice(0, 1200),
    url: raw.url ? String(raw.url) : null,
    icon: raw.icon ? String(raw.icon) : '/favicon.ico',
    badge: raw.badge ? String(raw.badge) : null,
    recipient_ids: normArray(raw.recipient_ids),
    audiences: normArray(raw.audiences),
    topics: normArray(raw.topics),
    data: raw.data && typeof raw.data === 'object' ? raw.data : {},
    evidence_state: String(raw.evidence_state || 'not_applicable'),
    consent_basis: raw.consent_basis || (purpose === 'safety' ? 'safety_service' : 'service_relationship'),
    ttl_seconds: Math.max(0, Math.min(Number(raw.ttl_seconds ?? 3600), 2419200)),
    dedupe_key: raw.dedupe_key ? String(raw.dedupe_key) : null,
    dedupe_window_seconds: Math.max(0, Number(raw.dedupe_window_seconds ?? 900)),
    created_at: raw.created_at || now,
  };
}

function matchesSubscription(subscription, intent) {
  if (subscription.disabled_at) return false;
  if (!subscription.preferences?.[intent.purpose]) return false;
  if (intent.recipient_ids.length && !intent.recipient_ids.includes(subscription.principal_id)) return false;
  if (intent.audiences.length && !intent.audiences.some((a) => subscription.audiences?.includes(a))) return false;
  if (subscription.products?.length && intent.product !== 'systemia' && !subscription.products.includes(intent.product)) return false;
  return true;
}

function safeNotificationPayload(intent) {
  return {
    schema: 'systemia.notification.payload.v1',
    id: intent.id,
    product: intent.product,
    purpose: intent.purpose,
    priority: intent.priority,
    title: intent.title,
    body: intent.body,
    url: intent.url,
    icon: intent.icon,
    badge: intent.badge,
    data: intent.data,
    created_at: intent.created_at,
  };
}

export function createNotificationFabric(options = {}) {
  const dataDir = options.dataDir || process.env.EVERCRAFT_NOTIFICATION_DATA_DIR || path.resolve('.systemia-state/notifications');
  const store = options.store || createNotificationStore({ dataDir });
  const sendPush = options.sendPush || sendWebPush;
  const vapidPublicKey = options.vapidPublicKey ?? process.env.EVERCRAFT_VAPID_PUBLIC_KEY ?? '';
  const vapidPrivateKey = options.vapidPrivateKey ?? process.env.EVERCRAFT_VAPID_PRIVATE_KEY ?? '';
  const vapidSubject = options.vapidSubject ?? process.env.EVERCRAFT_VAPID_SUBJECT ?? '';
  const immediateBudgetPerHour = Number(options.immediateBudgetPerHour ?? process.env.EVERCRAFT_NOTIFICATION_IMMEDIATE_BUDGET ?? 4);

  async function dispatchIntent(rawIntent) {
    const intent = validateIntent(rawIntent);
    const dedupeKey = intent.dedupe_key ? `${intent.product}|${intent.dedupe_key}` : null;
    if (dedupeKey && store.seenDedupe(dedupeKey, intent.dedupe_window_seconds)) {
      const event = { schema: 'systemia.notification.delivery.v1', notification_id: intent.id, status: 'deduped', at: new Date().toISOString(), intent };
      store.recordDelivery(event);
      return { intent, matched: 0, delivered: 0, deduped: true, receipts: [event] };
    }

    const matched = store.listSubscriptions().filter((sub) => matchesSubscription(sub, intent));
    const receipts = [];
    if (!matched.length) {
      const event = { schema: 'systemia.notification.delivery.v1', notification_id: intent.id, status: 'no_target', at: new Date().toISOString(), intent };
      store.recordDelivery(event);
      return { intent, matched: 0, delivered: 0, deduped: false, receipts: [event] };
    }

    for (const subscription of matched) {
      let result;
      try {
        result = await sendPush(subscription, safeNotificationPayload(intent), {
          vapidPublicKey,
          vapidPrivateKey,
          vapidSubject,
          ttlSeconds: intent.ttl_seconds,
          urgency: urgency(intent.priority),
        });
      } catch (error) {
        result = { ok: false, status: 0, responseBody: String(error?.message || error) };
      }
      if (result.status === 404 || result.status === 410) {
        store.disableSubscription(subscription.id, `push_endpoint_${result.status}`);
      }
      const receipt = {
        schema: 'systemia.notification.delivery.v1',
        notification_id: intent.id,
        subscription_id: subscription.id,
        principal_id: subscription.principal_id,
        product: intent.product,
        purpose: intent.purpose,
        status: result.ok ? 'delivered_to_push_gateway' : 'delivery_failed',
        http_status: result.status,
        retry_after: result.retryAfter || null,
        at: new Date().toISOString(),
      };
      receipts.push(receipt);
      store.recordDelivery(receipt);
    }
    return { intent, matched: matched.length, delivered: receipts.filter((r) => r.status === 'delivered_to_push_gateway').length, deduped: false, receipts };
  }

  async function dispatchSignal(rawSignal) {
    const priorState = store.loadSignalState(emptyState());
    const { state, decision } = ingest(priorState, rawSignal, { immediateBudgetPerHour });
    store.saveSignalState(state);
    store.recordDelivery({ schema: 'systemia.notification.signal-receipt.v1', decision, at: new Date().toISOString() });

    if (decision.routes.includes('digest')) store.queueDigest({ decision, raw_signal: rawSignal, queued_at: new Date().toISOString() });
    if (decision.routes.includes('owner_queue')) store.queueOwner({ decision, raw_signal: rawSignal, queued_at: new Date().toISOString() });
    if (!decision.routes.includes('immediate') || decision.suppressed) return { decision, push: null };

    const push = await dispatchIntent({
      product: decision.product || 'systemia',
      purpose: 'operational',
      priority: 'critical',
      title: `${decision.product || 'Systemia'} needs attention`,
      body: decision.summary || 'A verified critical Systemia signal needs attention.',
      audiences: [String(rawSignal.recipient || 'company-ops')],
      evidence_state: decision.evidence_state,
      dedupe_key: `signal:${decision.fingerprint}`,
      dedupe_window_seconds: decision.dedupe_window_seconds,
      data: { signal_id: decision.id, fingerprint: decision.fingerprint, source: decision.source, severity: decision.severity },
      url: rawSignal.url || null,
    });
    return { decision, push };
  }

  return {
    store,
    config() {
      return {
        schema: 'systemia.notification.config.v1',
        web_push_enabled: Boolean(vapidPublicKey && vapidPrivateKey && vapidSubject),
        vapid_public_key: vapidPublicKey || null,
        transport: 'web_push_vapid',
      };
    },
    subscribe(input) {
      if (!String(input?.principal_id || '').trim()) throw new Error('principal_id is required.');
      if (!String(input?.endpoint || '').startsWith('https://')) throw new Error('HTTPS push endpoint is required.');
      if (!input?.keys?.p256dh || !input?.keys?.auth) throw new Error('Push subscription keys are required.');
      return store.upsertSubscription(input);
    },
    unsubscribe(id) { return store.removeSubscription(String(id || '')); },
    dispatchIntent,
    dispatchSignal,
  };
}
