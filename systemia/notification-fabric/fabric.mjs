import crypto from 'node:crypto';
import path from 'node:path';
import { emptyState, ingest } from '../signal-fabric/engine.mjs';
import { createNotificationStore } from './store.mjs';
import { createRealtimeHub } from './realtime-hub.mjs';
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
    schema: 'systemia.notification.intent.v2',
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
    schema: 'systemia.notification.payload.v2',
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

function minutesOfDay(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(String(value || ''));
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function localMinutes(timeZone, now = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone || 'UTC',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(now);
    const hour = Number(parts.find((part) => part.type === 'hour')?.value);
    const minute = Number(parts.find((part) => part.type === 'minute')?.value);
    return hour * 60 + minute;
  } catch {
    return now.getUTCHours() * 60 + now.getUTCMinutes();
  }
}

function isQuietHours(subscription, now = new Date()) {
  const quiet = subscription.quiet_hours;
  if (!quiet || quiet.enabled === false) return false;
  const start = minutesOfDay(quiet.start);
  const end = minutesOfDay(quiet.end);
  if (start === null || end === null || start === end) return false;
  const current = localMinutes(quiet.timezone || subscription.timezone || 'UTC', now);
  return start < end ? current >= start && current < end : current >= start || current < end;
}

function routeStrategy(intent, realtimeDelivered, subscription, now = new Date()) {
  const urgent = intent.priority === 'critical' || intent.purpose === 'safety';
  if (!urgent && isQuietHours(subscription, now)) {
    return { push: false, reason: 'quiet_hours_inbox_only' };
  }
  if (urgent) return { push: true, reason: 'critical_fanout' };
  if (realtimeDelivered) return { push: false, reason: 'realtime_present_suppress_push' };
  return { push: true, reason: 'offline_push_fallback' };
}

export function createNotificationFabric(options = {}) {
  const dataDir = options.dataDir || process.env.EVERCRAFT_NOTIFICATION_DATA_DIR || path.resolve('.systemia-state/notifications');
  const receiptSecret = options.receiptSecret ?? process.env.EVERCRAFT_NOTIFICATION_RECEIPT_SECRET ?? '';
  const store = options.store || createNotificationStore({ dataDir, receiptSecret });
  const realtimeHub = options.realtimeHub || createRealtimeHub(options.realtimeOptions);
  const sendPush = options.sendPush || sendWebPush;
  const vapidPublicKey = options.vapidPublicKey ?? process.env.EVERCRAFT_VAPID_PUBLIC_KEY ?? '';
  const vapidPrivateKey = options.vapidPrivateKey ?? process.env.EVERCRAFT_VAPID_PRIVATE_KEY ?? '';
  const vapidSubject = options.vapidSubject ?? process.env.EVERCRAFT_VAPID_SUBJECT ?? '';
  const immediateBudgetPerHour = Number(options.immediateBudgetPerHour ?? process.env.EVERCRAFT_NOTIFICATION_IMMEDIATE_BUDGET ?? 4);

  async function dispatchIntent(rawIntent) {
    const intent = validateIntent(rawIntent);
    const dedupeKey = intent.dedupe_key ? `${intent.product}|${intent.dedupe_key}` : null;
    if (dedupeKey && store.seenDedupe(dedupeKey, intent.dedupe_window_seconds)) {
      const event = store.recordDelivery({ schema: 'systemia.notification.delivery.v2', notification_id: intent.id, status: 'deduped', at: new Date().toISOString(), intent });
      return { intent, matched: 0, accepted: 0, realtime_delivered: 0, inboxed: 0, deduped: true, receipts: [event] };
    }

    const matched = store.listSubscriptions().filter((sub) => matchesSubscription(sub, intent));
    const livePrincipals = realtimeHub.matchPrincipals({
      recipient_ids: intent.recipient_ids,
      audiences: intent.audiences,
      product: intent.product,
    });
    const principals = new Set();
    for (const sub of matched) principals.add(sub.principal_id);
    for (const principal of livePrincipals) principals.add(principal);
    if (intent.purpose !== 'marketing') {
      for (const principal of intent.recipient_ids) principals.add(principal);
    }

    const payload = safeNotificationPayload(intent);
    const receipts = [];
    let inboxed = 0;
    let realtimeDelivered = 0;
    const realtimeByPrincipal = new Map();

    for (const principal of principals) {
      const inboxItem = store.appendInbox(principal, payload);
      inboxed += 1;
      receipts.push(store.recordDelivery({
        schema: 'systemia.notification.delivery.v2',
        notification_id: intent.id,
        principal_id: principal,
        product: intent.product,
        purpose: intent.purpose,
        status: 'inboxed',
        inboxed_at: inboxItem.inboxed_at,
        at: new Date().toISOString(),
      }));
      const realtime = realtimeHub.deliver(principal, payload);
      realtimeByPrincipal.set(principal, realtime.delivered);
      realtimeDelivered += realtime.delivered;
      if (realtime.delivered > 0) {
        receipts.push(store.recordDelivery({
          schema: 'systemia.notification.delivery.v2',
          notification_id: intent.id,
          principal_id: principal,
          product: intent.product,
          purpose: intent.purpose,
          status: 'delivered_realtime',
          connections: realtime.delivered,
          at: new Date().toISOString(),
        }));
      }
    }

    if (!matched.length && !principals.size) {
      receipts.push(store.recordDelivery({
        schema: 'systemia.notification.delivery.v2',
        notification_id: intent.id,
        status: 'no_target',
        at: new Date().toISOString(),
        intent,
      }));
      return { intent, matched: 0, accepted: 0, realtime_delivered: 0, inboxed: 0, deduped: false, receipts };
    }

    const maxAttempts = Math.max(1, Math.min(Number(options.pushAttempts ?? process.env.EVERCRAFT_NOTIFICATION_PUSH_ATTEMPTS ?? 3), 5));
    const sleep = options.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    let accepted = 0;
    let pushSuppressed = 0;
    const attentionByPrincipal = new Map();

    for (const subscription of matched) {
      const strategy = routeStrategy(intent, Number(realtimeByPrincipal.get(subscription.principal_id) || 0), subscription, options.now ? new Date(options.now) : new Date());
      if (!strategy.push) {
        pushSuppressed += 1;
        receipts.push(store.recordDelivery({
          schema: 'systemia.notification.delivery.v2',
          notification_id: intent.id,
          subscription_id: subscription.id,
          principal_id: subscription.principal_id,
          product: intent.product,
          purpose: intent.purpose,
          status: 'push_suppressed',
          reason: strategy.reason,
          at: new Date().toISOString(),
        }));
        continue;
      }

      const budgetExempt = intent.priority === 'critical' || intent.purpose === 'safety';
      if (!budgetExempt) {
        let budget = attentionByPrincipal.get(subscription.principal_id);
        if (!budget) {
          budget = store.consumeAttentionBudget(subscription.principal_id, intent.purpose, {
            now: options.now ? new Date(options.now).getTime() : Date.now(),
            limits: options.attentionLimits,
          });
          attentionByPrincipal.set(subscription.principal_id, budget);
        }
        if (!budget.allowed) {
          pushSuppressed += 1;
          receipts.push(store.recordDelivery({
            schema: 'systemia.notification.delivery.v2',
            notification_id: intent.id,
            subscription_id: subscription.id,
            principal_id: subscription.principal_id,
            product: intent.product,
            purpose: intent.purpose,
            status: 'push_suppressed',
            reason: 'attention_budget',
            attention_budget: budget,
            at: new Date().toISOString(),
          }));
          continue;
        }
      }

      let result = { ok: false, status: 0, responseBody: 'No delivery attempt completed.' };
      let attempts = 0;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        attempts = attempt;
        try {
          result = await sendPush(subscription, payload, {
            vapidPublicKey,
            vapidPrivateKey,
            vapidSubject,
            ttlSeconds: intent.ttl_seconds,
            urgency: urgency(intent.priority),
          });
        } catch (error) {
          result = { ok: false, status: 0, responseBody: String(error?.message || error) };
        }
        if (result.ok || result.status === 404 || result.status === 410) break;
        const retryable = result.status === 0 || result.status === 429 || result.status >= 500;
        if (!retryable || attempt === maxAttempts) break;
        const retryAfterSeconds = /^\d+$/.test(String(result.retryAfter || '')) ? Number(result.retryAfter) : null;
        const delayMs = retryAfterSeconds !== null
          ? Math.min(retryAfterSeconds * 1000, 5000)
          : Math.min(250 * (2 ** (attempt - 1)), 2000);
        await sleep(delayMs);
      }
      if (result.status === 404 || result.status === 410) {
        store.disableSubscription(subscription.id, `push_endpoint_${result.status}`);
      }
      const receipt = store.recordDelivery({
        schema: 'systemia.notification.delivery.v2',
        notification_id: intent.id,
        subscription_id: subscription.id,
        principal_id: subscription.principal_id,
        product: intent.product,
        purpose: intent.purpose,
        status: result.ok ? 'accepted_by_push_gateway' : 'delivery_failed',
        http_status: result.status,
        retry_after: result.retryAfter || null,
        attempts,
        route_reason: strategy.reason,
        at: new Date().toISOString(),
      });
      receipts.push(receipt);
      if (result.ok) accepted += 1;
    }

    return {
      intent,
      matched: matched.length,
      targeted_principals: principals.size,
      accepted,
      delivered: accepted,
      realtime_delivered: realtimeDelivered,
      inboxed,
      push_suppressed: pushSuppressed,
      deduped: false,
      receipts,
    };
  }

  async function dispatchSignal(rawSignal) {
    const priorState = store.loadSignalState(emptyState());
    const { state, decision } = ingest(priorState, rawSignal, { immediateBudgetPerHour });
    store.saveSignalState(state);
    store.recordDelivery({ schema: 'systemia.notification.signal-receipt.v2', decision, at: new Date().toISOString() });

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

  function acknowledge(principalId, notificationId) {
    const item = store.acknowledgeInbox(principalId, notificationId);
    if (!item) return null;
    store.recordDelivery({
      schema: 'systemia.notification.delivery.v2',
      notification_id: notificationId,
      principal_id: principalId,
      product: item.product,
      purpose: item.purpose,
      status: 'human_acknowledged',
      at: item.acknowledged_at,
    });
    return item;
  }

  function seen(principalId, notificationId) {
    const item = store.markInboxSeen(principalId, notificationId);
    if (!item) return null;
    store.recordDelivery({
      schema: 'systemia.notification.delivery.v2',
      notification_id: notificationId,
      principal_id: principalId,
      product: item.product,
      purpose: item.purpose,
      status: 'human_seen',
      at: item.seen_at,
    });
    return item;
  }

  return {
    store,
    realtimeHub,
    config() {
      return {
        schema: 'systemia.notification.config.v2',
        brand: 'Evercraft Relay',
        web_push_enabled: Boolean(vapidPublicKey && vapidPrivateKey && vapidSubject),
        vapid_public_key: vapidPublicKey || null,
        transports: {
          realtime_sse: true,
          durable_inbox: true,
          web_push_vapid: Boolean(vapidPublicKey && vapidPrivateKey && vapidSubject),
        },
        receipt_ledger: store.deliveryLedgerHead(),
        realtime_presence: realtimeHub.snapshot(),
      };
    },
    subscribe(input) {
      if (!String(input?.principal_id || '').trim()) throw new Error('principal_id is required.');
      if (!String(input?.endpoint || '').startsWith('https://')) throw new Error('HTTPS push endpoint is required.');
      if (!input?.keys?.p256dh || !input?.keys?.auth) throw new Error('Push subscription keys are required.');
      return store.upsertSubscription(input);
    },
    unsubscribe(id, principalId = null) {
      if (principalId) {
        const subscription = store.getSubscription(id);
        if (!subscription || subscription.principal_id !== principalId) return false;
      }
      return store.removeSubscription(String(id || ''));
    },
    listInbox(principalId, options = {}) { return store.listInbox(principalId, options); },
    acknowledge,
    seen,
    dispatchIntent,
    dispatchSignal,
  };
}
