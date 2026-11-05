// Read-only projection of persisted One-Body event routing into the Living Graph contract.
// The exported graph is an observation of stored intent, not a live health assertion.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const hash = (value) => createHash('sha256').update(String(value)).digest('hex').slice(0, 16);
const timestamp = (value) => {
  if (typeof value !== 'string') return NaN;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : NaN;
};
const laneName = (lane) => String(lane).replaceAll('_', ' ').replace(/\b[a-z]/g, x => x.toUpperCase());

/**
 * Read-only snapshot for the Systemia Living Graph import contract.
 *
 * receiptObservations are untrusted until verifyReceipt explicitly validates them.
 * The verifier must come from an authenticated upstream receipt adapter; a JSON
 * file, a field named "verified", or an arbitrary receipt reference is not proof.
 * Even accepted receipts only demonstrate a lane-consumer acknowledgement, not
 * provider outcomes, payment authority, completed work, or execution permission.
 */
export function buildOneBodyVisualSnapshot({
  state,
  receiptObservations = [],
  verifyReceipt = null,
  observedAt = new Date().toISOString(),
  overdueAfterMs = 60 * 60 * 1000,
  maxEvents = 12,
} = {}) {
  if (!state || state.schema !== 'evercraft.one-body.state.v1' ||
      !state.events || typeof state.events !== 'object' || Array.isArray(state.events)) {
    throw new Error('invalid_one_body_state');
  }
  const now = timestamp(observedAt);
  if (!Number.isFinite(now)) throw new Error('invalid_observed_at');
  if (!Number.isSafeInteger(overdueAfterMs) || overdueAfterMs < 1) throw new Error('invalid_overdue_threshold');
  if (!Number.isSafeInteger(maxEvents) || maxEvents < 1 || maxEvents > 12) throw new Error('invalid_event_limit');
  if (!Array.isArray(receiptObservations)) throw new Error('invalid_receipt_observations');

  const events = Object.values(state.events)
    .filter(e => e && typeof e.event_id === 'string' &&
      Array.isArray(e.lanes) && typeof e.product_key === 'string')
    .sort((a,b) => (timestamp(b.occurred_at) || 0) - (timestamp(a.occurred_at) || 0) ||
      a.event_id.localeCompare(b.event_id));
  const selected = events.slice(0, maxEvents);
  const selectedById = new Map(selected.map(e => [e.event_id, e]));
  const eligibleReceipts = new Map();
  for (const receipt of receiptObservations) {
    if (!receipt || typeof receipt !== 'object') continue;
    const event = selectedById.get(receipt.event_id);
    if (!event || typeof receipt.lane !== 'string' || !event.lanes.includes(receipt.lane)) continue;
    if (typeof receipt.receipt_ref !== 'string' || !receipt.receipt_ref.trim()) continue;
    if (!Number.isFinite(timestamp(receipt.observed_at))) continue;
    if (timestamp(receipt.observed_at) > now || timestamp(receipt.observed_at) < timestamp(event.occurred_at)) continue;
    if (typeof verifyReceipt !== 'function' || verifyReceipt(receipt) !== true) continue;
    const key = receipt.event_id + '\0' + receipt.lane;
    const previous = eligibleReceipts.get(key);
    if (!previous || timestamp(receipt.observed_at) > timestamp(previous.observed_at)) {
      eligibleReceipts.set(key, receipt);
    }
  }

  const nodes = [{id:'systemia-body',name:'Systemia One-Body',kind:'coordinator',status:'persisted_state_projection'}];
  const edges = [];
  const receipts = [];
  const products = new Set(), lanes = new Set();
  const counts = {handoffs:0,unverified:0,unobserved_overdue:0,invalid_event_time:0,consumer_receipt_verified:0};
  const gapSamples = [];
  for (const [i,event] of selected.entries()) {
    const eventId='evt-'+hash(event.event_id);
    const productId='product-'+hash(event.product_key);
    if (!products.has(event.product_key)) {
      products.add(event.product_key);
      nodes.push({id:productId,name:event.product_key,kind:'product',status:'runtime_unverified'});
    }
    edges.push({from:'systemia-body',to:eventId,relationship:'persisted_route'});
    edges.push({from:productId,to:eventId,relationship:'registered_product'});
    const eventTime=timestamp(event.occurred_at);
    const eventStatus=Number.isFinite(eventTime)?'routed_unverified':'invalid_event_time';
    nodes.push({id:eventId,name:'Event '+(i+1),kind:'event',status:eventStatus});
    for (const lane of [...new Set(event.lanes.filter(v=>typeof v==='string'&&v.length>0))]) {
      const laneId='lane-'+hash(lane);
      if (!lanes.has(lane)) {
        lanes.add(lane);
        nodes.push({id:laneId,name:laneName(lane),kind:'lane',status:'runtime_unverified'});
      }
      const proof=eligibleReceipts.get(event.event_id+'\0'+lane);
      let status='planned_unverified';
      if (proof) {
        status='consumer_receipt_verified';
        receipts.push({id:'receipt-'+hash(proof.receipt_ref),event_id:eventId,lane:laneId,
          observed_at:proof.observed_at,verification:'trusted_adapter_callback'});
      } else if (!Number.isFinite(eventTime) || eventTime > now) {
        status='invalid_event_time';
      } else if (now-eventTime >= overdueAfterMs) {
        status='unobserved_overdue';
      }
      edges.push({from:eventId,to:laneId,relationship:status});
      counts.handoffs++;
      if (status==='consumer_receipt_verified') counts.consumer_receipt_verified++;
      else {
        counts.unverified++;
        if (status==='unobserved_overdue') counts.unobserved_overdue++;
        if (status==='invalid_event_time') counts.invalid_event_time++;
        if (gapSamples.length<20) gapSamples.push({event_id:eventId,lane:laneId,status});
      }
    }
  }
  return {
    schema:'evercraft.systemia.visual-snapshot.v1',
    observed_at:observedAt,
    source:'evercraft.one-body.state.v1 / read-only local projection',
    trust_note:'Persisted route is not delivery, execution, or payment proof. Only a trusted verifier callback may accept a lane receipt. Event IDs and receipt references are hashed.',
    nodes,edges,receipts,
    summary:{
      total_state_events:events.length,
      sampled_events:selected.length,
      sampled_lanes:lanes.size,
      counts,gap_samples:gapSamples,
      sample_truncated:events.length>selected.length,
      overdue_threshold_ms:overdueAfterMs,
      verified_runtime_health:false,
      payment_verified:false,
      execution_authority_granted:false
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const input = process.argv[2];
  if (!input || process.argv.length !== 3) {
    console.error('Usage: node systemia/organism/one-body-visibility.mjs <persisted-one-body-state.json>');
    process.exitCode = 2;
  } else {
    const state = JSON.parse(readFileSync(input,'utf8'));
    process.stdout.write(JSON.stringify(buildOneBodyVisualSnapshot({state}),null,2)+'\n');
  }
}
