/**
 * Synthetic irreversible-side-effect recovery laboratory.
 * This module does not reach any payment provider or charge anyone.
 * Its stateful fake provider models "commit succeeded, acknowledgment lost".
 */
import { createHash } from 'node:crypto';

const DEMO_NAMESPACE = 'EVERCRAFT-SYNTHETIC-NOT-REAL';
const keyFor = ({ orderId }) => {
  if (!/^DEMO-[0-9]{4}$/.test(orderId)) throw new TypeError('Synthetic DEMO order IDs only');
  return createHash('sha256').update(DEMO_NAMESPACE + ':' + orderId).digest('hex');
};
function fingerprint(request) {
  return createHash('sha256').update(JSON.stringify(request)).digest('hex');
}
function safeRequest({ orderId, cents, currency = 'USD' }) {
  keyFor({ orderId });
  if (!Number.isSafeInteger(cents) || cents <= 0 || cents > 100_00)
    throw new TypeError('Synthetic cents must be a positive integer <= 10000');
  if (currency !== 'USD') throw new TypeError('Synthetic USD only');
  return { orderId, cents, currency };
}

export class SyntheticProvider {
  constructor({ loseFirstAck = false, lookupUnavailable = false } = {}) {
    this.receipts = new Map();
    this.effects = 0;
    this.attempts = 0;
    this.lookups = 0;
    this.loseFirstAck = loseFirstAck;
    this.lookupUnavailable = lookupUnavailable;
  }
  execute(request, idempotencyKey) {
    this.attempts++;
    if (keyFor(request) !== idempotencyKey) throw new Error('IDEMPOTENCY_KEY_MISMATCH');
    const checksum = fingerprint(request);
    let state = this.receipts.get(idempotencyKey);
    if (state && state.checksum !== checksum) throw new Error('IDEMPOTENCY_PAYLOAD_CONFLICT');
    if (!state) {
      this.effects++;
      state = {
        checksum,
        receipt: {
          id: 'SYNTHETIC-RECEIPT-' + String(this.effects).padStart(3, '0'),
          orderId: request.orderId,
          settled: true,
          synthetic: true,
        },
      };
      this.receipts.set(idempotencyKey, state);
      if (this.loseFirstAck) {
        this.loseFirstAck = false;
        throw new Error('ACK_LOST_AFTER_COMMIT');
      }
    }
    return state.receipt;
  }
  lookup(idempotencyKey) {
    this.lookups++;
    if (this.lookupUnavailable) throw new Error('RECEIPT_LOOKUP_UNAVAILABLE');
    return this.receipts.get(idempotencyKey)?.receipt ?? null;
  }
}

export function decideSyntheticFulfillment(provider, input, { retryAfterLookupFailure = false } = {}) {
  const request = safeRequest(input);
  const key = keyFor(request);
  const journal = [];
  const evidence = {
    synthetic: true,
    idempotencyKey: key,
    orderId: request.orderId,
    fulfillmentAuthorized: false,
    authoritativeReceipt: null,
    state: 'NOT_ATTEMPTED',
  };
  try {
    const receipt = provider.execute(request, key);
    journal.push({ event: 'provider.execute', status: 'OK', output: { receipt: receipt.id, synthetic: true } });
    evidence.authoritativeReceipt = receipt;
    evidence.state = 'SETTLED_VERIFIED';
    evidence.fulfillmentAuthorized = true;
  } catch (e) {
    journal.push({ event: 'provider.execute', status: 'ERROR', error: e.message });
    if (e.message !== 'ACK_LOST_AFTER_COMMIT') {
      evidence.state = 'HOLD_UNKNOWN';
      journal.push({ event: 'fulfillment.block', status: 'OK', output: 'Unknown external state; do not retry with a new key' });
      return { evidence, journal };
    }
    try {
      const receipt = provider.lookup(key);
      journal.push({ event: 'provider.lookup', status: 'OK', output: receipt ? { receipt: receipt.id, synthetic: true } : { receipt: null } });
      if (receipt?.settled) {
        evidence.state = 'SETTLED_VERIFIED_AFTER_RECONCILIATION';
        evidence.authoritativeReceipt = receipt;
        evidence.fulfillmentAuthorized = true;
      } else {
        evidence.state = 'HOLD_UNKNOWN';
      }
    } catch (lookupError) {
      journal.push({ event: 'provider.lookup', status: 'ERROR', error: lookupError.message });
      evidence.state = 'HOLD_UNKNOWN';
      if (retryAfterLookupFailure) {
        try {
          const receipt = provider.execute(request, key); // SAME key; deduplicated by provider.
          journal.push({ event: 'provider.retry_same_key', status: 'OK', output: { receipt: receipt.id, synthetic: true } });
          evidence.state = 'SETTLED_VERIFIED_AFTER_IDEMPOTENT_RETRY';
          evidence.authoritativeReceipt = receipt;
          evidence.fulfillmentAuthorized = true;
        } catch (retryError) {
          journal.push({ event: 'provider.retry_same_key', status: 'ERROR', error: retryError.message });
        }
      }
    }
  }
  journal.push({ event: 'fulfillment.decision', status: 'OK', output: {
    state: evidence.state,
    fulfillmentAuthorized: evidence.fulfillmentAuthorized,
    receipt: evidence.authoritativeReceipt?.id ?? null,
  } });
  return { evidence, journal };
}

export function exampleCases() {
  const request = { orderId: 'DEMO-1001', cents: 4200 };
  const providerA = new SyntheticProvider({ loseFirstAck: true });
  const reconcilable = decideSyntheticFulfillment(providerA, request);

  const providerB = new SyntheticProvider({ loseFirstAck: true, lookupUnavailable: true });
  const blocked = decideSyntheticFulfillment(providerB, request);

  const providerC = new SyntheticProvider({ loseFirstAck: true, lookupUnavailable: true });
  const retriedSameKey = decideSyntheticFulfillment(providerC, request, { retryAfterLookupFailure: true });

  return [
    { name: 'ack_lost_reconciled', ...reconcilable, providerEffects: providerA.effects, providerAttempts: providerA.attempts },
    { name: 'ack_lost_unresolved', ...blocked, providerEffects: providerB.effects, providerAttempts: providerB.attempts },
    { name: 'ack_lost_idempotent_retry', ...retriedSameKey, providerEffects: providerC.effects, providerAttempts: providerC.attempts },
  ];
}

export function toNeatrootsTrace(episode) {
  const message = episode.evidence.fulfillmentAuthorized
    ? 'Synthetic authoritative receipt verified; simulated fulfillment decision may proceed.'
    : 'External outcome unknown. Fulfillment blocked pending authoritative reconciliation.';
  return {
    name: 'ambiguous-external-effect-synthetic',
    project: 'evercraft-ack-loss-recovery-lab',
    kind: 'AGENT',
    input: 'Did simulated order DEMO-1001 settle after provider acknowledgment loss?',
    output: message,
    status: 'OK',
    metadata: { synthetic: true, scenario: episode.name, providerEffects: episode.providerEffects,
      providerAttempts: episode.providerAttempts, status: episode.evidence.state,
      note: 'Stateful fake provider only. No payment or customer data.' },
    children: episode.journal.map(step => ({
      name: step.event,
      kind: 'TOOL',
      tool_name: step.event,
      status: step.status,
      ...(step.error ? { error: step.error } : {}),
      ...(step.output ? { output: step.output } : {}),
      metadata: { synthetic: true },
      duration_ms: 1,
    })),
  };
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  for (const sample of exampleCases()) {
    console.log(JSON.stringify(toNeatrootsTrace(sample)));
  }
}
