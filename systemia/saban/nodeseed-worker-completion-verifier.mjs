import { createHash } from 'node:crypto';

// The registered worker's canonical receipt format is deliberately shared by
// NodeSeed, Yard and Saban. These checks prove integrity and consistency with
// the authorized node/payload, not an independent cryptographic signature.
const stable = value => Array.isArray(value)
  ? value.map(stable)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]))
    : value;

const digest = value => 'sha256:' + createHash('sha256')
  .update(JSON.stringify(stable(value)))
  .digest('hex');

function requireReceipt(value, reason) {
  if (!value) throw new Error('nodeseed_receipt_' + reason);
}

function expectedContentHash(payload) {
  const value = payload?.bytes_base64
    ? Buffer.from(String(payload.bytes_base64), 'base64')
    : Buffer.from(JSON.stringify(stable(payload?.value ?? payload ?? null)));
  return {
    digest: 'sha256:' + createHash('sha256').update(value).digest('hex'),
    byte_count: value.length,
  };
}

export function verifyNodeSeedWorkerCompletion({
  response,
  nodeId,
  workloadClass,
  idempotencyKey,
  payload,
} = {}) {
  const node = String(nodeId || '');
  const workload = String(workloadClass || '');
  const idempotency = String(idempotencyKey || '');
  const worker = response?.worker_receipt;

  requireReceipt(response?.ok === true, 'compute_not_successful');
  requireReceipt(node && response?.node_id === node, 'compute_node_mismatch');
  requireReceipt(workload && response?.workload_class === workload, 'compute_workload_mismatch');
  requireReceipt(idempotency && response?.idempotency_key === idempotency, 'compute_idempotency_mismatch');
  requireReceipt(
    worker?.schema === 'evercraft.compute.registered-worker-receipt.v1',
    'registered_worker_required',
  );
  requireReceipt(worker?.registered_workload_only === true, 'unregistered_worker');
  requireReceipt(worker?.node_id === node, 'worker_node_mismatch');
  requireReceipt(worker?.workload_class === workload, 'worker_workload_mismatch');
  requireReceipt(worker?.idempotency_key === idempotency, 'worker_idempotency_mismatch');

  requireReceipt(
    worker?.request_hash === digest({
      node_id: node,
      workload_class: workload,
      idempotency_key: idempotency,
      payload: payload ?? null,
    }),
    'payload_binding_mismatch',
  );

  // A deduplicated result reports "deduplicated: true" but the persisted
  // worker receipt was hashed at original execution with the flag false.
  const reused = response?.deduplicated === true;
  requireReceipt(worker?.deduplicated === reused, 'replay_state_mismatch');
  const { receipt_hash: receiptHash, ...receiptBody } = worker;
  requireReceipt(
    /^sha256:[a-f0-9]{64}$/.test(String(receiptHash || '')),
    'worker_hash_missing',
  );
  const originalBody = reused ? { ...receiptBody, deduplicated: false } : receiptBody;
  requireReceipt(receiptHash === digest(originalBody), 'worker_integrity_mismatch');
  requireReceipt(
    digest(worker.result ?? null) === digest(response?.result ?? null),
    'worker_result_mismatch',
  );
  requireReceipt(
    /^sha256:[a-f0-9]{64}$/.test(String(response?.receipt?.receipt_hash || '')),
    'compute_receipt_missing',
  );

  // Independently recompute the deterministic SHA-256 workload result.
  // Other registered workloads are bound to their stored worker receipt, but
  // their domain-specific correctness must be checked by their own verifier.
  if (workload === 'systemia.content-hash.v1') {
    const expected = expectedContentHash(payload);
    requireReceipt(response?.result?.ok === true, 'hash_result_not_successful');
    requireReceipt(response?.result?.algorithm === 'sha256', 'hash_algorithm_mismatch');
    requireReceipt(response?.result?.digest === expected.digest, 'hash_digest_mismatch');
    requireReceipt(response?.result?.byte_count === expected.byte_count, 'hash_byte_count_mismatch');
  }

  return {
    schema: 'evercraft.saban.nodeseed-worker-completion-verification.v1',
    verified: true,
    node_id: node,
    workload_class: workload,
    idempotency_key: idempotency,
    worker_receipt_hash: receiptHash,
    compute_receipt_hash: response.receipt.receipt_hash,
    content_hash_verified: workload === 'systemia.content-hash.v1',
    authority_material_persisted: false,
  };
}
