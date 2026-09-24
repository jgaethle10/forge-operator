const GB = 1024 ** 3;

const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const array = (value) => Array.isArray(value) ? value.map(String) : [];

export function safeHeadroom(sample = {}, snapshot = {}, policy = {}) {
  const cpuTotal = Math.max(0, number(snapshot.cpu_logical_count));
  const cpuNow = clamp(number(sample.cpu_pct, 100), 0, 100);
  const cpuCeiling = clamp(number(policy.host_cpu_ceiling_pct, 70), 1, 100);
  const vcpu = Math.max(0, Math.floor(Math.min(
    number(policy.max_vcpu, 4),
    cpuTotal * Math.max(0, cpuCeiling - cpuNow) / 100,
  )));

  const memTotalBytes = Math.max(0, number(sample.memory_total_bytes, number(snapshot.memory_total_bytes)));
  const memUsedBytes = Math.max(0, number(
    sample.memory_used_bytes,
    memTotalBytes * clamp(number(sample.memory_pct, 100), 0, 100) / 100,
  ));
  const memNowPct = memTotalBytes > 0 ? clamp(memUsedBytes / memTotalBytes * 100, 0, 100) : 100;
  const memFreeGb = Math.max(0, (memTotalBytes - memUsedBytes) / GB);
  const memByCeilingGb = (memTotalBytes / GB) * Math.max(
    0,
    clamp(number(policy.host_memory_ceiling_pct, 70), 1, 100) - memNowPct,
  ) / 100;
  const memoryGb = Math.max(0, Math.min(
    number(policy.max_memory_gb, 8),
    memByCeilingGb,
    Math.max(0, memFreeGb - number(policy.reserve_memory_gb, 2)),
  ));

  const storageTotalBytes = Math.max(0, number(snapshot.storage_total_bytes));
  const diskNowPct = clamp(number(sample.disk_used_pct, 100), 0, 100);
  const storageFreeGb = storageTotalBytes / GB * Math.max(0, 100 - diskNowPct) / 100;
  const storageByCeilingGb = storageTotalBytes / GB * Math.max(
    0,
    clamp(number(policy.host_disk_ceiling_pct, 80), 1, 100) - diskNowPct,
  ) / 100;
  const storageGb = Math.max(0, Math.min(
    number(policy.max_storage_gb, 20),
    storageByCeilingGb,
    Math.max(0, storageFreeGb - number(policy.reserve_storage_gb, 5)),
  ));

  return {
    vcpu,
    memory_gb: Math.floor(memoryGb * 10) / 10,
    storage_gb: Math.floor(storageGb * 10) / 10,
  };
}

export function ephemeralWorkspaceProven(attestation = {}) {
  return attestation.type === 'nodeseed.workspace.attestation.v1'
    && attestation.isolation === 'tenant'
    && attestation.arbitrary_host_shell === false
    && attestation.host_secret_access === false
    && attestation.public_ingress === false
    && Boolean(attestation.runtime_identity_ref)
    && Boolean(attestation.observed_at);
}

export function advertiseCapabilityTags({ linuxProven = false, workspaceAttestation = null, extraTags = [] } = {}) {
  const tags = new Set(array(extraTags));
  tags.add('borrowed_compute');
  if (linuxProven) tags.add('linux_runtime');
  if (linuxProven && ephemeralWorkspaceProven(workspaceAttestation || {})) tags.add('ephemeral_workspace');
  return [...tags].sort();
}

function hasAll(haystack, needles) {
  const set = new Set(array(haystack));
  return array(needles).every((item) => set.has(item));
}

function resourcesEnough(offer = {}, minimum = {}) {
  for (const key of ['vcpu', 'memory_gb', 'storage_gb']) {
    const need = number(minimum[key]);
    const have = number(offer[key]);
    if (need > 0 && have < need) return false;
  }
  return true;
}

export function evaluateCapacityRequest(request = {}, offer = {}, { occupiedBy = null } = {}) {
  const reasons = [];
  const capabilityPass = hasAll(offer.capability_tags, request.required_capability_tags);
  const resourcePass = resourcesEnough(offer.resources || offer.resource_envelope || {}, request.minimum_resources || {});
  const isolation = offer.isolation || {};
  const isolationReq = request.isolation || {};
  const network = offer.network || {};
  const networkReq = request.network || {};
  const authorizationPass = offer.authorization_state === 'authorized';
  const availabilityPass = offer.availability_state === 'available';
  const occupancyPass = !occupiedBy || occupiedBy === request.request_key;
  const isolationPass = isolationReq.tenant_isolation !== true
    || isolation.tenant_isolation === true
    || isolation.isolation_scope === 'tenant';
  const networkPass =
    (networkReq.outbound_only !== true || network.outbound_only_enforceable === true)
    && (networkReq.internet_egress !== true || network.internet_egress === true)
    && (networkReq.lan_only !== true || network.lan_only === true)
    && (networkReq.no_peer_discovery !== true || network.peer_discovery_disableable === true)
    && (networkReq.public_ingress !== true || network.public_ingress === true)
    && (networkReq.public_ingress !== false || network.public_ingress !== true || network.public_ingress_disableable === true);
  const cost = offer.cost || {};
  const estimated = number(cost.estimated_cost_usd, number(cost.cost_usd));
  const spendRequired = cost.spend_required === true || estimated > 0 || ['paid', 'metered', 'subscription'].includes(String(cost.billing_mode || ''));
  const spendPass = !spendRequired || request.spend_authorized === true;

  if (!authorizationPass) reasons.push('capacity_not_authorized');
  if (!availabilityPass) reasons.push('capacity_not_available');
  if (!occupancyPass) reasons.push('capacity_offer_already_leased');
  if (!capabilityPass) reasons.push('capability_mismatch');
  if (!resourcePass) reasons.push('resource_floor_not_met');
  if (!isolationPass) reasons.push('isolation_contract_not_met');
  if (!networkPass) reasons.push('network_contract_not_met');
  if (!spendPass) reasons.push('spend_not_authorized');

  return {
    result: reasons.length === 0 ? 'pass' : 'fail',
    authorization_pass: authorizationPass,
    availability_pass: availabilityPass,
    occupancy_pass: occupancyPass,
    capability_pass: capabilityPass,
    resource_pass: resourcePass,
    isolation_pass: isolationPass,
    network_pass: networkPass,
    spend_pass: spendPass,
    reasons,
  };
}

export function selectCapacityOffer(request, offers = [], occupiedOffers = new Map(), preferredBackingClasses = []) {
  const sorted = [...offers].sort((a, b) => {
    const ar = preferredBackingClasses.indexOf(a.backing_class);
    const br = preferredBackingClasses.indexOf(b.backing_class);
    const aa = ar < 0 ? 999 : ar;
    const bb = br < 0 ? 999 : br;
    if (aa !== bb) return aa - bb;
    return String(b.observed_at || '').localeCompare(String(a.observed_at || ''));
  });

  for (const offer of sorted) {
    const occupiedBy = occupiedOffers.get(String(offer.offer_key || '')) || null;
    const evaluation = evaluateCapacityRequest(request, offer, { occupiedBy });
    if (evaluation.result === 'pass') return { offer, evaluation };
  }
  return null;
}

export function planSabanCells({ requestedCapacity, maxAgentsPerCell = 10, maxParallelCells = 1, logicalCeiling = 10000 } = {}) {
  const requested = Math.max(1, Math.floor(number(requestedCapacity, 1)));
  if (requested > logicalCeiling) {
    throw new RangeError(`logical_agent_ceiling_exceeded:${requested}>${logicalCeiling}`);
  }
  const agentsPerCell = Math.max(1, Math.min(100, Math.floor(number(maxAgentsPerCell, 10))));
  const totalCells = Math.ceil(requested / agentsPerCell);
  const parallelCells = Math.max(1, Math.min(totalCells, Math.floor(number(maxParallelCells, 1))));
  const cells = Array.from({ length: totalCells }, (_, index) => {
    const remaining = requested - index * agentsPerCell;
    return {
      index: index + 1,
      target_agent_count: Math.max(1, Math.min(agentsPerCell, remaining)),
      physical_capacity_claimed: false,
    };
  });
  return {
    logical_agents_requested: requested,
    logical_agent_ceiling: logicalCeiling,
    agents_per_cell: agentsPerCell,
    total_cells_required: totalCells,
    parallel_cells_admitted: parallelCells,
    cells,
  };
}
