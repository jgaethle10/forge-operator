import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

function clean(value) {
  return String(value ?? '').trim();
}

function nowIso(now = new Date()) {
  return (now instanceof Date ? now : new Date(now)).toISOString();
}

function stable(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + stable(value[key])).join(',') + '}';
}

function digest(value) {
  return 'sha256:' + crypto.createHash('sha256').update(stable(value)).digest('hex');
}

function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive:true });
  const temp = file + '.' + process.pid + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(value, null, 2) + '\n');
  fs.renameSync(temp, file);
}

function defaultTower() {
  return {
    schema:'evercraft.shipping.control-tower.v3',
    revision:0,
    orders:[]
  };
}

function loadTower(file) {
  const resolved = path.resolve(file);
  if (!fs.existsSync(resolved)) return defaultTower();
  const parsed = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  if (parsed?.schema !== 'evercraft.shipping.control-tower.v3' || !Array.isArray(parsed.orders)) {
    throw new Error('unsupported_shipping_control_tower');
  }
  return parsed;
}

function saveTower(file, tower) {
  tower.revision = Number(tower.revision || 0) + 1;
  atomicJson(path.resolve(file), tower);
}

function idFor(parts) {
  return crypto.createHash('sha256').update(parts.join('|')).digest('hex');
}

function orderFingerprint({ logical_package_key, package_digest, recipient_ref, channel }) {
  return 'shiporder:' + idFor([
    clean(logical_package_key),
    clean(package_digest),
    clean(recipient_ref).toLowerCase(),
    clean(channel).toLowerCase()
  ]);
}

function getOrder(tower, orderKey) {
  return tower.orders.find((row) => row.order_key === orderKey) || null;
}

function activeOrderStates() {
  return new Set([
    'admitted',
    'release_ready',
    'dispatch_ready',
    'dispatching',
    'provider_accepted_unverified',
    'verification_required_before_retry',
    'exception'
  ]);
}

export function admitShippingOrder({
  tower_file = 'state/shipping/control-tower.json',
  release_plan,
  recipient_ref,
  subject,
  body_digest,
  authorization_ref,
  priority = 'normal',
  due_at = null,
  now = new Date()
} = {}) {
  if (!release_plan?.ready || release_plan?.package_manifest?.pass !== true) {
    throw new Error('release_plan_not_ready');
  }
  if (!clean(release_plan.release_key)) throw new Error('release_key_required');
  if (!clean(release_plan.package_manifest.package_digest)) throw new Error('package_digest_required');

  const recipient = clean(recipient_ref || release_plan.recipient_ref);
  if (!recipient) throw new Error('recipient_ref_required');
  if (clean(release_plan.recipient_ref) && recipient !== clean(release_plan.recipient_ref)) {
    throw new Error('recipient_release_plan_mismatch');
  }

  const auth = clean(authorization_ref || release_plan.authorization_ref);
  if (release_plan.channel_contract?.external_send && !auth) throw new Error('external_send_authorization_required');

  const tower = loadTower(tower_file);
  const logicalKey = clean(release_plan.release_key);
  const packageDigest = clean(release_plan.package_manifest.package_digest);
  const fingerprint = orderFingerprint({
    logical_package_key:logicalKey,
    package_digest:packageDigest,
    recipient_ref:recipient,
    channel:release_plan.channel
  });

  const exact = tower.orders.find((row) => row.order_fingerprint === fingerprint && row.reissue_of == null);
  if (exact) {
    return {
      admitted:false,
      duplicate_suppressed:true,
      order:exact,
      tower
    };
  }

  const priorVersions = tower.orders
    .filter((row) => row.logical_package_key === logicalKey && row.recipient_ref === recipient && row.reissue_of == null)
    .sort((a,b) => Number(b.version || 0) - Number(a.version || 0));
  const version = (priorVersions[0]?.version || 0) + 1;

  for (const prior of priorVersions) {
    if (activeOrderStates().has(prior.state)) {
      prior.state = 'superseded';
      prior.superseded_at = nowIso(now);
      prior.superseded_by_version = version;
      prior.updated_at = nowIso(now);
      prior.events = prior.events || [];
      prior.events.push({
        event:'superseded',
        at:nowIso(now),
        evidence_ref:release_plan.release_fingerprint || packageDigest
      });
    }
  }

  const admittedAt = nowIso(now);
  const order = {
    schema:'evercraft.shipping.order.v3',
    order_key:'shipping-order:' + crypto.randomUUID(),
    order_fingerprint:fingerprint,
    logical_package_key:logicalKey,
    release_fingerprint:release_plan.release_fingerprint || null,
    package_digest:packageDigest,
    version,
    reissue_of:null,
    reissue_count:0,
    channel:release_plan.channel,
    recipient_ref:recipient,
    subject:clean(subject) || null,
    body_digest:clean(body_digest) || null,
    authorization_ref:auth || null,
    priority:clean(priority) || 'normal',
    due_at:clean(due_at) || null,
    state:'admitted',
    latest_release:true,
    shipment_key:null,
    provider_message_id:null,
    sent_copy_verification_ref:null,
    delivery_receipt_ref:null,
    exception:null,
    events:[{
      event:'admitted',
      at:admittedAt,
      evidence_ref:release_plan.release_fingerprint || packageDigest
    }],
    created_at:admittedAt,
    updated_at:admittedAt
  };

  for (const prior of priorVersions) prior.latest_release = false;
  tower.orders.push(order);
  saveTower(tower_file, tower);

  return {
    admitted:true,
    duplicate_suppressed:false,
    order,
    tower
  };
}

export function authorizeReissue({
  tower_file = 'state/shipping/control-tower.json',
  prior_order_key,
  authorization_ref,
  reason,
  now = new Date()
} = {}) {
  if (!clean(authorization_ref)) throw new Error('reissue_authorization_required');
  if (!clean(reason)) throw new Error('reissue_reason_required');

  const tower = loadTower(tower_file);
  const prior = getOrder(tower, prior_order_key);
  if (!prior) throw new Error('unknown_prior_order');
  if (prior.state !== 'verified_delivered') throw new Error('reissue_requires_verified_prior_delivery');

  const count = Number(prior.reissue_count || 0) + 1;
  const admittedAt = nowIso(now);
  const order = {
    ...JSON.parse(JSON.stringify(prior)),
    order_key:'shipping-order:' + crypto.randomUUID(),
    order_fingerprint:'shipreissue:' + idFor([
      prior.order_key,
      String(count),
      clean(authorization_ref),
      admittedAt
    ]),
    reissue_of:prior.order_key,
    reissue_count:count,
    authorization_ref:clean(authorization_ref),
    state:'admitted',
    shipment_key:null,
    provider_message_id:null,
    sent_copy_verification_ref:null,
    delivery_receipt_ref:null,
    exception:null,
    events:[{
      event:'reissue_authorized',
      at:admittedAt,
      reason:clean(reason),
      authorization_ref:clean(authorization_ref)
    }],
    created_at:admittedAt,
    updated_at:admittedAt
  };

  tower.orders.push(order);
  prior.reissue_count = count;
  prior.updated_at = admittedAt;
  prior.events = prior.events || [];
  prior.events.push({
    event:'reissue_created',
    at:admittedAt,
    reissue_order_key:order.order_key,
    reason:clean(reason)
  });
  saveTower(tower_file, tower);

  return { tower, order };
}

export function markShippingOrderState({
  tower_file = 'state/shipping/control-tower.json',
  order_key,
  state,
  shipment_key = null,
  provider_message_id = null,
  sent_copy_verification_ref = null,
  delivery_receipt_ref = null,
  exception = null,
  evidence_ref = null,
  now = new Date()
} = {}) {
  const allowed = new Set([
    'admitted',
    'release_ready',
    'dispatch_ready',
    'dispatching',
    'provider_accepted_unverified',
    'verification_required_before_retry',
    'exception',
    'verified_delivered',
    'cancelled',
    'superseded'
  ]);
  if (!allowed.has(clean(state))) throw new Error('invalid_shipping_order_state');

  const tower = loadTower(tower_file);
  const order = getOrder(tower, order_key);
  if (!order) throw new Error('unknown_shipping_order');
  if (order.state === 'verified_delivered' && state !== 'verified_delivered') throw new Error('verified_delivery_is_terminal');
  if (order.state === 'superseded' && !['superseded','cancelled'].includes(state)) throw new Error('superseded_order_cannot_dispatch');
  if (state === 'verified_delivered') {
    if (!clean(provider_message_id || order.provider_message_id)) throw new Error('provider_message_id_required');
    if (!clean(sent_copy_verification_ref || order.sent_copy_verification_ref)) throw new Error('sent_copy_verification_ref_required');
    if (!clean(delivery_receipt_ref || order.delivery_receipt_ref)) throw new Error('delivery_receipt_ref_required');
  }

  const at = nowIso(now);
  order.state = clean(state);
  if (shipment_key) order.shipment_key = clean(shipment_key);
  if (provider_message_id) order.provider_message_id = clean(provider_message_id);
  if (sent_copy_verification_ref) order.sent_copy_verification_ref = clean(sent_copy_verification_ref);
  if (delivery_receipt_ref) order.delivery_receipt_ref = clean(delivery_receipt_ref);
  order.exception = exception || (state === 'exception' ? order.exception : null);
  order.updated_at = at;
  order.events = order.events || [];
  order.events.push({
    event:'state_changed',
    state:order.state,
    at,
    evidence_ref:clean(evidence_ref) || null
  });
  saveTower(tower_file, tower);
  return { tower, order };
}

export function assertCurrentRelease({
  tower_file = 'state/shipping/control-tower.json',
  order_key
} = {}) {
  const tower = loadTower(tower_file);
  const order = getOrder(tower, order_key);
  if (!order) throw new Error('unknown_shipping_order');
  if (order.reissue_of) return { current:true, order };

  const newer = tower.orders
    .filter((row) =>
      row.logical_package_key === order.logical_package_key &&
      row.recipient_ref === order.recipient_ref &&
      row.reissue_of == null &&
      Number(row.version || 0) > Number(order.version || 0)
    )
    .sort((a,b) => Number(b.version || 0) - Number(a.version || 0))[0];

  if (newer) {
    return {
      current:false,
      order,
      newer_order_key:newer.order_key,
      newer_version:newer.version,
      newer_package_digest:newer.package_digest
    };
  }
  return { current:true, order };
}

export function findShippingExceptions({
  tower_file = 'state/shipping/control-tower.json',
  now = new Date(),
  stale_after_minutes = 30,
  verification_after_minutes = 10
} = {}) {
  const tower = loadTower(tower_file);
  const current = new Date(now).getTime();
  const staleMs = Number(stale_after_minutes) * 60 * 1000;
  const verifyMs = Number(verification_after_minutes) * 60 * 1000;
  const exceptions = [];

  for (const order of tower.orders) {
    if (['verified_delivered','cancelled','superseded'].includes(order.state)) continue;
    const updated = new Date(order.updated_at || order.created_at).getTime();
    const ageMs = Math.max(0, current - updated);

    if (order.state === 'provider_accepted_unverified' && ageMs >= verifyMs) {
      exceptions.push({
        order_key:order.order_key,
        severity:'high',
        code:'provider_acceptance_unverified',
        age_minutes:Math.floor(ageMs / 60000),
        repair_recipe:'Read the provider sent copy. Verify recipient, subject and attachments. Do not resend unless provider absence is proven.'
      });
      continue;
    }

    if (order.state === 'verification_required_before_retry' && ageMs >= verifyMs) {
      exceptions.push({
        order_key:order.order_key,
        severity:'high',
        code:'ambiguous_send_waiting_verification',
        age_minutes:Math.floor(ageMs / 60000),
        repair_recipe:'Check the sent mailbox/provider history before any retry. If absent is proven, resume on the fallback route.'
      });
      continue;
    }

    if (['admitted','release_ready','dispatch_ready','dispatching','exception'].includes(order.state) && ageMs >= staleMs) {
      exceptions.push({
        order_key:order.order_key,
        severity:order.priority === 'critical' ? 'critical' : 'normal',
        code:'shipping_order_stale',
        age_minutes:Math.floor(ageMs / 60000),
        repair_recipe:'Inspect the current release, authorization, transport state and blocking exception. Preserve the same order instead of creating a duplicate.'
      });
    }
  }

  return {
    schema:'evercraft.shipping.exception-scan.v3',
    generated_at:nowIso(now),
    exception_count:exceptions.length,
    exceptions
  };
}

export function buildShippingExceptionIntent({
  exception_scan,
  operator_recipient_ids = [],
  now = new Date()
} = {}) {
  if (!exception_scan?.exceptions?.length) return null;
  const critical = exception_scan.exceptions.filter((row) => ['high','critical'].includes(row.severity));
  const selected = critical.length ? critical : exception_scan.exceptions;
  const top = selected.slice(0, 5);
  const body = top.map((row) =>
    row.code + ' · ' + row.order_key + ' · ' + row.age_minutes + 'm'
  ).join('\n');

  return {
    schema:'systemia.notification.intent.v2',
    id:'shipping-exception:' + crypto.randomUUID(),
    product:'Evercraft Shipping',
    purpose:'operational',
    priority:critical.some((row) => row.severity === 'critical') ? 'critical' : (critical.length ? 'high' : 'normal'),
    title:'Evercraft Shipping needs attention',
    body,
    recipient_ids:[...new Set((operator_recipient_ids || []).map(clean).filter(Boolean))],
    topics:['shipping','delivery','operations'],
    data:{
      exception_count:exception_scan.exception_count,
      exceptions:top
    },
    evidence_state:'systemia_shipping_control_tower_v3',
    consent_basis:'operator_operational_notice',
    ttl_seconds:3600,
    dedupe_key:'shipping-exception:' + digest(top.map((row) => [row.order_key,row.code])),
    dedupe_window_seconds:1800,
    created_at:nowIso(now)
  };
}

export function shippingControlTowerSummary({
  tower_file = 'state/shipping/control-tower.json'
} = {}) {
  const tower = loadTower(tower_file);
  const byState = {};
  for (const row of tower.orders) byState[row.state] = (byState[row.state] || 0) + 1;
  const active = tower.orders.filter((row) => !['verified_delivered','cancelled','superseded'].includes(row.state));
  return {
    schema:'evercraft.shipping.control-tower-summary.v3',
    revision:tower.revision,
    total_orders:tower.orders.length,
    active_orders:active.length,
    by_state:byState,
    latest_active:active
      .slice()
      .sort((a,b) => String(b.updated_at).localeCompare(String(a.updated_at)))
      .slice(0, 20)
      .map((row) => ({
        order_key:row.order_key,
        logical_package_key:row.logical_package_key,
        version:row.version,
        recipient_ref:row.recipient_ref,
        channel:row.channel,
        priority:row.priority,
        state:row.state,
        due_at:row.due_at,
        updated_at:row.updated_at
      }))
  };
}
