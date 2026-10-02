import { createHash } from 'node:crypto';

const sha = (value) => 'sha256:' + createHash('sha256')
  .update(typeof value === 'string' ? value : JSON.stringify(value))
  .digest('hex');

const uniq = (values) => [...new Set((values || []).map((value) => String(value).trim()).filter(Boolean))];

const SOURCE_PRIORITY = Object.freeze({
  owned_node: 0,
  owned_bootstrap_target: 1,
  enrolled_peer: 2,
  partner_node: 3,
  provisionable_machine: 4,
  provider_instance: 5,
  rental_capacity: 6,
});

const AUTHORIZED = new Set([
  'owned',
  'explicit_grant',
  'approved_partner',
  'approved_provider',
]);

function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function nonNegative(value) {
  return Math.max(0, finite(value, 0));
}

function normalizeResources(input = {}) {
  return {
    cpu_units: nonNegative(input.cpu_units),
    memory_mb: nonNegative(input.memory_mb),
    storage_gb: nonNegative(input.storage_gb),
    gpu_units: nonNegative(input.gpu_units),
    vram_mb: nonNegative(input.vram_mb),
    gpu_models: uniq(input.gpu_models).map((value) => value.toLowerCase()),
  };
}

function normalizePerNode(input = {}) {
  return {
    cpu_units: nonNegative(input.cpu_units),
    memory_mb: nonNegative(input.memory_mb),
    storage_gb: nonNegative(input.storage_gb),
    gpu_units: nonNegative(input.gpu_units),
    vram_mb: nonNegative(input.vram_mb),
  };
}

export function normalizeResourceNeed(input = {}) {
  const need = {
    need_id: String(input.need_id || 'resource-need').trim(),
    workload_class: String(input.workload_class || '').trim(),
    topology: input.topology === 'sharded' ? 'sharded' : 'single_node',
    memory_semantics: ['local', 'distributed', 'object', 'vector'].includes(input.memory_semantics)
      ? input.memory_semantics
      : 'local',
    resources: normalizeResources(input.resources),
    min_per_node: normalizePerNode(input.min_per_node),
    required_labels: uniq(input.required_labels).map((value) => value.toLowerCase()),
    forbidden_labels: uniq(input.forbidden_labels).map((value) => value.toLowerCase()),
    required_transports: uniq(input.required_transports),
    max_hourly_usd: input.max_hourly_usd == null ? null : nonNegative(input.max_hourly_usd),
    max_ready_seconds: input.max_ready_seconds == null ? null : nonNegative(input.max_ready_seconds),
    external_spend_requires_human_approval: input.external_spend_requires_human_approval !== false,
  };
  if (!need.need_id) throw new Error('resource_need_id_required');
  if (!need.workload_class) throw new Error('resource_workload_class_required');
  return need;
}

export function normalizeResourceCandidate(input = {}) {
  const candidate = {
    candidate_id: String(input.candidate_id || '').trim(),
    source_kind: String(input.source_kind || 'owned_node').trim(),
    authority: String(input.authority || 'unknown').trim(),
    connected: input.connected === true,
    attested: input.attested === true,
    spawn_capable: input.spawn_capable === true,
    resources: normalizeResources(input.resources),
    workloads: uniq(input.workloads),
    labels: uniq(input.labels).map((value) => value.toLowerCase()),
    transports: uniq(input.transports),
    ready_seconds: nonNegative(input.ready_seconds),
    hourly_usd: nonNegative(input.hourly_usd),
    acquisition_usd: nonNegative(input.acquisition_usd),
    failure_domain: String(input.failure_domain || input.candidate_id || 'unknown').trim(),
    bootstrap: input.bootstrap && typeof input.bootstrap === 'object'
      ? { ...input.bootstrap }
      : null,
    metadata: input.metadata && typeof input.metadata === 'object'
      ? { ...input.metadata }
      : {},
  };
  if (!candidate.candidate_id) throw new Error('resource_candidate_id_required');
  return candidate;
}

function includesAll(setLike, required) {
  const set = new Set(setLike || []);
  return required.every((value) => set.has(value));
}

function basicEligibility(candidate, need, { allowSpawn = false } = {}) {
  const reasons = [];
  const labels = new Set(candidate.labels);

  if (!AUTHORIZED.has(candidate.authority)) reasons.push('authority_missing');
  if (!allowSpawn && candidate.connected !== true) reasons.push('candidate_not_connected');
  if (!allowSpawn && candidate.attested !== true) reasons.push('candidate_not_attested');
  if (allowSpawn && !candidate.spawn_capable && candidate.connected !== true) reasons.push('candidate_not_spawnable');

  if (candidate.connected && candidate.workloads.length && !candidate.workloads.includes(need.workload_class)) {
    reasons.push('workload_unsupported');
  }
  if (need.required_labels.some((label) => !labels.has(label))) reasons.push('required_label_missing');
  if (need.forbidden_labels.some((label) => labels.has(label))) reasons.push('forbidden_label_present');
  if (!includesAll(candidate.transports, need.required_transports)) reasons.push('required_transport_missing');
  if (need.max_hourly_usd != null && candidate.hourly_usd > need.max_hourly_usd) reasons.push('hourly_budget_exceeded');
  if (need.max_ready_seconds != null && candidate.ready_seconds > need.max_ready_seconds) reasons.push('readiness_window_exceeded');

  return reasons;
}

function resourceFits(candidateResources, required) {
  const requiredGpuModels = required.gpu_models || [];
  const candidateGpuModels = candidateResources.gpu_models || [];
  const gpuModelFits = requiredGpuModels.length === 0 ||
    requiredGpuModels.some((model) => candidateGpuModels.includes(model));
  return (
    candidateResources.cpu_units >= required.cpu_units &&
    candidateResources.memory_mb >= required.memory_mb &&
    candidateResources.storage_gb >= required.storage_gb &&
    candidateResources.gpu_units >= required.gpu_units &&
    candidateResources.vram_mb >= required.vram_mb &&
    gpuModelFits
  );
}

function perNodeFits(candidate, need) {
  return resourceFits(candidate.resources, need.min_per_node);
}

function rankCandidate(candidate) {
  return [
    SOURCE_PRIORITY[candidate.source_kind] ?? 99,
    candidate.connected ? 0 : 1,
    candidate.attested ? 0 : 1,
    candidate.ready_seconds,
    candidate.hourly_usd,
    candidate.acquisition_usd,
    candidate.candidate_id,
  ];
}

function tupleCompare(a, b) {
  const aa = rankCandidate(a);
  const bb = rankCandidate(b);
  for (let index = 0; index < aa.length; index += 1) {
    if (aa[index] < bb[index]) return -1;
    if (aa[index] > bb[index]) return 1;
  }
  return 0;
}

function aggregateResources(candidates) {
  return candidates.reduce((total, candidate) => ({
    cpu_units: total.cpu_units + candidate.resources.cpu_units,
    memory_mb: total.memory_mb + candidate.resources.memory_mb,
    storage_gb: total.storage_gb + candidate.resources.storage_gb,
    gpu_units: total.gpu_units + candidate.resources.gpu_units,
    vram_mb: total.vram_mb + candidate.resources.vram_mb,
  }), normalizeResources());
}

function shardedSatisfied(selected, need) {
  if (!selected.length) return false;
  if (selected.some((candidate) => !perNodeFits(candidate, need))) return false;

  const total = aggregateResources(selected);
  if (total.cpu_units < need.resources.cpu_units) return false;
  if (total.storage_gb < need.resources.storage_gb) return false;
  if (total.gpu_units < need.resources.gpu_units) return false;
  if (total.vram_mb < need.resources.vram_mb) return false;

  if (need.memory_semantics === 'distributed') {
    return total.memory_mb >= need.resources.memory_mb;
  }

  // Local RAM is not magically pooled. For sharded local-memory work, every shard
  // must satisfy the declared per-node floor. The total memory requirement is
  // intentionally not treated as one contiguous address space.
  return true;
}

function singleNodeSatisfied(candidate, need) {
  return resourceFits(candidate.resources, need.resources);
}

function chooseCandidates(candidates, need) {
  const sorted = [...candidates].sort(tupleCompare);

  if (need.topology === 'single_node') {
    const selected = sorted.find((candidate) => singleNodeSatisfied(candidate, need));
    return selected ? [selected] : [];
  }

  const selected = [];
  for (const candidate of sorted) {
    if (!perNodeFits(candidate, need)) continue;
    selected.push(candidate);
    if (shardedSatisfied(selected, need)) return selected;
  }
  return [];
}

function assimilationSteps(candidate, need) {
  const externalSpend = candidate.hourly_usd > 0 || candidate.acquisition_usd > 0;
  const steps = [];

  if (!candidate.connected) {
    steps.push({
      action: 'bootstrap_evercraft_compute',
      candidate_id: candidate.candidate_id,
      adapter: candidate.bootstrap?.adapter || candidate.source_kind,
      target: candidate.bootstrap?.target || candidate.candidate_id,
    });
  }

  steps.push(
    { action: 'attest_device', candidate_id: candidate.candidate_id },
    { action: 'benchmark_capacity', candidate_id: candidate.candidate_id },
    { action: 'publish_capacity_snapshot', candidate_id: candidate.candidate_id },
    { action: 'enroll_or_refresh_authority', candidate_id: candidate.candidate_id },
    { action: 'lease_capacity', candidate_id: candidate.candidate_id, workload_class: need.workload_class },
    { action: 'deploy_workload', candidate_id: candidate.candidate_id, workload_class: need.workload_class },
    { action: 'health_verify', candidate_id: candidate.candidate_id },
    { action: 'bind_receipts', candidate_id: candidate.candidate_id },
    { action: 'route_into_systemia', candidate_id: candidate.candidate_id },
  );

  return {
    candidate_id: candidate.candidate_id,
    external_spend: externalSpend,
    human_approval_required: externalSpend && need.external_spend_requires_human_approval,
    steps,
  };
}

export function planResourceField({
  need: needInput,
  candidates: candidateInputs = [],
} = {}) {
  const need = normalizeResourceNeed(needInput || {});
  const candidates = candidateInputs.map(normalizeResourceCandidate);

  const rejected = [];
  const ready = [];
  const spawnable = [];

  for (const candidate of candidates) {
    const readyReasons = basicEligibility(candidate, need, { allowSpawn: false });
    if (readyReasons.length === 0) {
      ready.push(candidate);
      continue;
    }

    const spawnReasons = basicEligibility(candidate, need, { allowSpawn: true });
    if (spawnReasons.length === 0 && candidate.spawn_capable) {
      spawnable.push(candidate);
      continue;
    }

    rejected.push({
      candidate_id: candidate.candidate_id,
      reasons: [...new Set([...readyReasons, ...spawnReasons])],
    });
  }

  const readySelection = chooseCandidates(ready, need);
  const spawnSelection = readySelection.length
    ? []
    : chooseCandidates([...ready, ...spawnable], need);

  const selected = readySelection.length ? readySelection : spawnSelection;
  const selectedIds = selected.map((candidate) => candidate.candidate_id);
  const spawnRequired = selected.some((candidate) => !candidate.connected || !candidate.attested);

  let state = 'scarcity';
  if (selected.length) state = spawnRequired ? 'spawn_required' : 'ready';

  const body = {
    schema: 'evercraft.saban.resource-field-plan.v1',
    need,
    state,
    selected_candidates: selectedIds,
    selected_failure_domains: [...new Set(selected.map((candidate) => candidate.failure_domain))],
    candidate_count: candidates.length,
    ready_candidate_count: ready.length,
    spawnable_candidate_count: spawnable.length,
    rejected,
    aggregate_selected_resources: aggregateResources(selected),
    memory_contract: {
      semantics: need.memory_semantics,
      cross_node_ram_is_contiguous: false,
      distributed_memory_allowed: need.memory_semantics === 'distributed',
      note: need.memory_semantics === 'local'
        ? 'RAM remains node-local. Scale the workload by shards, state replication, object storage, or an explicit distributed-memory runtime.'
        : 'The workload declared a distributed memory/state model and may aggregate eligible capacity at the application layer.',
    },
    assimilation: selected.map((candidate) => assimilationSteps(candidate, need)),
    engineering_required: selected.length === 0,
    scarcity_signal: selected.length === 0
      ? {
          need_id: need.need_id,
          workload_class: need.workload_class,
          missing_capability: true,
          next_action: 'expand_discovery_or_create_new_capacity_adapter',
        }
      : null,
  };

  return {
    ...body,
    receipt_hash: sha(body),
  };
}

export function resourceFieldDoctrine() {
  return {
    schema: 'evercraft.saban.resource-field-doctrine.v1',
    purpose: 'Turn any admitted workload need into verified execution capacity without binding Evercraft to one machine, cloud, vendor, or network path.',
    order: [
      'use_verified_ready_capacity',
      'bootstrap_owned_capacity',
      'enroll_authorized_peer_capacity',
      'activate_approved_partner_capacity',
      'provision_approved_external_capacity',
      'emit_scarcity_signal_and_engineer_a_new_adapter',
    ],
    invariants: [
      'authority_before_execution',
      'attestation_before_trust',
      'benchmark_before_placement',
      'receipts_before_claiming_success',
      'local_ram_is_not_falsely_reported_as_contiguous_cross_node_memory',
      'external_spend_remains_human_gated_unless_explicitly_preapproved',
      'no_single_vendor_is_the_control_plane',
    ],
  };
}
