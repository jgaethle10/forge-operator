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

function defaultLedger() {
  return {
    schema:'evercraft.shipping.ledger.v2',
    revision:0,
    shipments:[]
  };
}

function atomicWrite(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive:true });
  const temp = file + '.' + process.pid + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(value, null, 2) + '\n');
  fs.renameSync(temp, file);
}

export function loadShippingLedger(file = 'state/shipping/shipping-ledger.json') {
  const resolved = path.resolve(file);
  if (!fs.existsSync(resolved)) return defaultLedger();
  const parsed = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  if (parsed?.schema !== 'evercraft.shipping.ledger.v2' || !Array.isArray(parsed.shipments)) {
    throw new Error('unsupported_shipping_ledger');
  }
  return parsed;
}

export function shipmentIdempotencyKey({
  recipient_ref,
  subject,
  package_digest,
  logical_package_key = ''
} = {}) {
  const recipient = clean(recipient_ref).toLowerCase();
  const normalizedSubject = clean(subject).replace(/\s+/g, ' ');
  const packageDigest = clean(package_digest);
  if (!recipient) throw new Error('recipient_ref_required');
  if (!normalizedSubject) throw new Error('subject_required');
  if (!packageDigest) throw new Error('package_digest_required');
  return 'shipidem:' + crypto.createHash('sha256')
    .update([recipient, normalizedSubject, packageDigest, clean(logical_package_key)].join('|'))
    .digest('hex');
}

export function reserveShipment({
  ledger_file = 'state/shipping/shipping-ledger.json',
  recipient_ref,
  subject,
  package_digest,
  logical_package_key = '',
  authorization_ref,
  preferred_route = 'thread_reply',
  now = new Date()
} = {}) {
  if (!clean(authorization_ref)) throw new Error('send_authorization_ref_required');
  const ledger = loadShippingLedger(ledger_file);
  const idempotencyKey = shipmentIdempotencyKey({ recipient_ref, subject, package_digest, logical_package_key });
  const existing = ledger.shipments.find((row) => row.idempotency_key === idempotencyKey);
  if (existing) {
    return {
      ledger,
      shipment:existing,
      duplicate_suppressed:true,
      dispatch_allowed:false
    };
  }

  const createdAt = nowIso(now);
  const shipment = {
    schema:'evercraft.shipping.shipment.v2',
    shipment_key:'shipment:' + crypto.randomUUID(),
    idempotency_key:idempotencyKey,
    logical_package_key:clean(logical_package_key) || null,
    recipient_ref:clean(recipient_ref),
    subject:clean(subject),
    package_digest:clean(package_digest),
    authorization_ref:clean(authorization_ref),
    state:'reserved',
    preferred_route:clean(preferred_route) || 'thread_reply',
    attempts:[],
    provider_message_id:null,
    sent_copy_verification:null,
    created_at:createdAt,
    updated_at:createdAt
  };
  ledger.shipments.push(shipment);
  ledger.revision = Number(ledger.revision || 0) + 1;
  atomicWrite(path.resolve(ledger_file), ledger);

  return {
    ledger,
    shipment,
    duplicate_suppressed:false,
    dispatch_allowed:true
  };
}

function mutateShipment({ ledger_file, shipment_key, mutate, now = new Date() }) {
  const ledger = loadShippingLedger(ledger_file);
  const shipment = ledger.shipments.find((row) => row.shipment_key === shipment_key);
  if (!shipment) throw new Error('unknown_shipment_key');
  mutate(shipment);
  shipment.updated_at = nowIso(now);
  ledger.revision = Number(ledger.revision || 0) + 1;
  atomicWrite(path.resolve(ledger_file), ledger);
  return { ledger, shipment };
}

export function recordDeliveryAttempt({
  ledger_file = 'state/shipping/shipping-ledger.json',
  shipment_key,
  route,
  provider,
  outcome,
  provider_message_id = null,
  error_code = null,
  ambiguous_provider_acceptance = false,
  now = new Date()
} = {}) {
  const normalizedOutcome = clean(outcome);
  if (!['sent','failed','unknown'].includes(normalizedOutcome)) throw new Error('invalid_delivery_attempt_outcome');

  return mutateShipment({
    ledger_file,
    shipment_key,
    now,
    mutate(shipment) {
      if (shipment.state === 'verified_delivered') throw new Error('shipment_already_verified_delivered');
      const attempt = {
        attempt_key:'attempt:' + crypto.randomUUID(),
        route:clean(route) || 'unknown',
        provider:clean(provider) || 'unknown',
        outcome:normalizedOutcome,
        provider_message_id:clean(provider_message_id) || null,
        error_code:clean(error_code) || null,
        ambiguous_provider_acceptance:Boolean(ambiguous_provider_acceptance),
        attempted_at:nowIso(now)
      };
      shipment.attempts.push(attempt);

      if (normalizedOutcome === 'sent' && attempt.provider_message_id) {
        shipment.state = 'provider_accepted';
        shipment.provider_message_id = attempt.provider_message_id;
      } else if (normalizedOutcome === 'unknown' || ambiguous_provider_acceptance) {
        shipment.state = 'verification_required_before_retry';
      } else {
        shipment.state = 'send_failed_pre_acceptance';
      }
    }
  });
}

export function markSentCopyVerified({
  ledger_file = 'state/shipping/shipping-ledger.json',
  shipment_key,
  verification_ref,
  provider_message_id,
  attachment_names = [],
  recipient_verified = true,
  subject_verified = true,
  attachments_verified = true,
  now = new Date()
} = {}) {
  if (!clean(verification_ref)) throw new Error('verification_ref_required');
  return mutateShipment({
    ledger_file,
    shipment_key,
    now,
    mutate(shipment) {
      if (!clean(provider_message_id || shipment.provider_message_id)) throw new Error('provider_message_id_required');
      if (!recipient_verified || !subject_verified || !attachments_verified) throw new Error('sent_copy_verification_failed');
      shipment.provider_message_id = clean(provider_message_id || shipment.provider_message_id);
      shipment.sent_copy_verification = {
        verification_ref:clean(verification_ref),
        provider_message_id:shipment.provider_message_id,
        attachment_names:[...attachment_names],
        recipient_verified:true,
        subject_verified:true,
        attachments_verified:true,
        verified_at:nowIso(now)
      };
      shipment.state = 'verified_delivered';
    }
  });
}

export function shipmentSnapshot(shipment = {}) {
  return {
    shipment_key:shipment.shipment_key || null,
    idempotency_key:shipment.idempotency_key || null,
    state:shipment.state || null,
    attempt_count:Array.isArray(shipment.attempts) ? shipment.attempts.length : 0,
    provider_message_id:shipment.provider_message_id || null,
    sent_copy_verified:shipment.sent_copy_verification != null,
    integrity_digest:digest({
      shipment_key:shipment.shipment_key || null,
      idempotency_key:shipment.idempotency_key || null,
      state:shipment.state || null,
      attempts:shipment.attempts || [],
      sent_copy_verification:shipment.sent_copy_verification || null
    })
  };
}
