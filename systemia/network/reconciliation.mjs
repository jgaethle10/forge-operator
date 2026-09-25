import { createHash } from 'node:crypto';

function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function createCheckpoint({
  mission_id,
  generation,
  state,
  parent_hash = 'GENESIS',
  origin_node,
  committed_at = new Date().toISOString()
}) {
  const body = {
    schema: 'evercraft.checkpoint.v2',
    mission_id,
    generation: Number(generation),
    parent_hash,
    origin_node,
    committed_at,
    state
  };
  return {
    ...body,
    checkpoint_hash: digest(body)
  };
}

export function validateCheckpoint(checkpoint) {
  if (!checkpoint || checkpoint.schema !== 'evercraft.checkpoint.v2') {
    return { valid: false, reason: 'schema' };
  }
  if (!Number.isInteger(checkpoint.generation) || checkpoint.generation < 0) {
    return { valid: false, reason: 'generation' };
  }
  const body = {
    schema: checkpoint.schema,
    mission_id: checkpoint.mission_id,
    generation: checkpoint.generation,
    parent_hash: checkpoint.parent_hash,
    origin_node: checkpoint.origin_node,
    committed_at: checkpoint.committed_at,
    state: checkpoint.state
  };
  const expected = digest(body);
  return expected === checkpoint.checkpoint_hash
    ? { valid: true, reason: null }
    : { valid: false, reason: 'hash_mismatch', expected };
}

function hasValidLineage(checkpoint, byHash, memo = new Map()) {
  if (memo.has(checkpoint.checkpoint_hash)) return memo.get(checkpoint.checkpoint_hash);
  if (checkpoint.parent_hash === 'GENESIS') {
    memo.set(checkpoint.checkpoint_hash, true);
    return true;
  }
  const parent = byHash.get(checkpoint.parent_hash);
  if (!parent) {
    memo.set(checkpoint.checkpoint_hash, false);
    return false;
  }
  const ok =
    parent.mission_id === checkpoint.mission_id &&
    parent.generation === checkpoint.generation - 1 &&
    hasValidLineage(parent, byHash, memo);
  memo.set(checkpoint.checkpoint_hash, ok);
  return ok;
}

export function reconcileCheckpoints(replicas) {
  const valid = [];
  const invalid = [];

  for (const replica of replicas || []) {
    const check = validateCheckpoint(replica.checkpoint);
    if (!check.valid) {
      invalid.push({
        node_id: replica.node_id,
        reason: check.reason,
        checkpoint_hash: replica.checkpoint?.checkpoint_hash || null
      });
      continue;
    }
    valid.push({
      node_id: replica.node_id,
      checkpoint: replica.checkpoint
    });
  }

  const historyValid = [];
  const historyInvalid = [];
  for (const replica of replicas || []) {
    for (const checkpoint of replica.history || []) {
      const check = validateCheckpoint(checkpoint);
      if (check.valid) historyValid.push(checkpoint);
      else historyInvalid.push({
        node_id: replica.node_id,
        reason: `history_${check.reason}`,
        checkpoint_hash: checkpoint?.checkpoint_hash || null
      });
    }
  }

  const byHash = new Map();
  for (const checkpoint of historyValid) byHash.set(checkpoint.checkpoint_hash, checkpoint);
  for (const row of valid) byHash.set(row.checkpoint.checkpoint_hash, row.checkpoint);

  const lineageValid = [];
  const lineageInvalid = [];

  for (const row of valid) {
    if (hasValidLineage(row.checkpoint, byHash)) lineageValid.push(row);
    else lineageInvalid.push({
      node_id: row.node_id,
      reason: 'missing_or_invalid_lineage',
      checkpoint_hash: row.checkpoint.checkpoint_hash
    });
  }

  const forks = [];
  const forkGroups = new Map();
  for (const row of lineageValid) {
    const cp = row.checkpoint;
    const key = `${cp.mission_id}:${cp.generation}:${cp.parent_hash}`;
    const hashes = forkGroups.get(key) || new Map();
    hashes.set(cp.checkpoint_hash, [...(hashes.get(cp.checkpoint_hash) || []), row.node_id]);
    forkGroups.set(key, hashes);
  }

  for (const [key, hashes] of forkGroups.entries()) {
    if (hashes.size > 1) {
      forks.push({
        key,
        variants: [...hashes.entries()].map(([checkpoint_hash, nodes]) => ({
          checkpoint_hash,
          nodes
        }))
      });
    }
  }

  if (forks.length) {
    return {
      schema: 'evercraft.reconciliation.v1',
      status: 'HOLD_CONFLICT',
      canonical: null,
      forks,
      invalid: [...invalid, ...historyInvalid, ...lineageInvalid],
      refill_nodes: [],
      auto_resume_allowed: false
    };
  }

  if (!lineageValid.length) {
    return {
      schema: 'evercraft.reconciliation.v1',
      status: 'NO_VALID_CHECKPOINT',
      canonical: null,
      forks: [],
      invalid: [...invalid, ...historyInvalid, ...lineageInvalid],
      refill_nodes: [],
      auto_resume_allowed: false
    };
  }

  const sorted = [...lineageValid].sort((a, b) =>
    b.checkpoint.generation - a.checkpoint.generation ||
    String(b.checkpoint.committed_at).localeCompare(String(a.checkpoint.committed_at))
  );
  const canonical = sorted[0];
  const validatedLatestByNode = new Map(
    valid.map((row) => [row.node_id, row.checkpoint])
  );
  const refillNodes = (replicas || [])
    .filter((row) => row.node_id !== canonical.node_id)
    .filter((row) => {
      const validated = validatedLatestByNode.get(row.node_id);
      return !validated || validated.checkpoint_hash !== canonical.checkpoint.checkpoint_hash;
    })
    .map((row) => row.node_id);

  return {
    schema: 'evercraft.reconciliation.v1',
    status: 'READY',
    canonical: {
      node_id: canonical.node_id,
      checkpoint: canonical.checkpoint
    },
    forks: [],
    invalid: [...invalid, ...historyInvalid, ...lineageInvalid],
    stale: sorted.slice(1).map((row) => ({
      node_id: row.node_id,
      generation: row.checkpoint.generation,
      checkpoint_hash: row.checkpoint.checkpoint_hash
    })),
    refill_nodes: refillNodes,
    auto_resume_allowed: true
  };
}

export function classifyRecoveredEnvelopes({
  envelopes,
  executed_message_ids = [],
  now = Date.now()
}) {
  const executed = new Set(executed_message_ids);
  const seen = new Set();
  const auto_resume = [];
  const hold_for_review = [];
  const discard = [];

  for (const envelope of envelopes || []) {
    const id = envelope?.message_id;
    if (!id) {
      discard.push({ message_id: null, reason: 'missing_message_id' });
      continue;
    }
    if (seen.has(id) || executed.has(id)) {
      discard.push({ message_id: id, reason: 'duplicate_or_already_executed' });
      continue;
    }
    seen.add(id);

    const expiry = Date.parse(envelope.expires_at);
    if (!Number.isFinite(expiry) || expiry <= now) {
      discard.push({ message_id: id, reason: 'expired' });
      continue;
    }

    if (envelope.irreversible) {
      hold_for_review.push({ message_id: id, reason: 'irreversible_after_partition' });
      continue;
    }
    auto_resume.push({ message_id: id });
  }

  return {
    schema: 'evercraft.recovered-envelope-plan.v1',
    auto_resume,
    hold_for_review,
    discard
  };
}
