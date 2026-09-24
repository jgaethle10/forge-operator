import assert from 'node:assert/strict';
import {
  advertiseCapabilityTags,
  ephemeralWorkspaceProven,
  evaluateCapacityRequest,
  planSabanCells,
  safeHeadroom,
  selectCapacityOffer,
} from '../lib/compute-fabric.mjs';

const GB = 1024 ** 3;

const headroom = safeHeadroom(
  { cpu_pct: 20, memory_total_bytes: 16 * GB, memory_used_bytes: 4 * GB, disk_used_pct: 25 },
  { cpu_logical_count: 8, storage_total_bytes: 200 * GB },
  { max_vcpu: 4, max_memory_gb: 8, max_storage_gb: 20, reserve_memory_gb: 2, reserve_storage_gb: 5 },
);
assert.deepEqual(headroom, { vcpu: 4, memory_gb: 7.2, storage_gb: 20 });

const attestation = {
  type: 'nodeseed.workspace.attestation.v1',
  isolation: 'tenant',
  arbitrary_host_shell: false,
  host_secret_access: false,
  public_ingress: false,
  runtime_identity_ref: 'nodeseed:proof-a',
  observed_at: '2026-09-24T16:00:00Z',
};
assert.equal(ephemeralWorkspaceProven(attestation), true);
assert.deepEqual(advertiseCapabilityTags({ linuxProven: true, workspaceAttestation: attestation }), [
  'borrowed_compute',
  'ephemeral_workspace',
  'linux_runtime',
]);
assert.deepEqual(advertiseCapabilityTags({ linuxProven: true }), ['borrowed_compute', 'linux_runtime']);

const offer = {
  offer_key: 'borrow:node-a',
  backing_class: 'local_runtime',
  authorization_state: 'authorized',
  availability_state: 'available',
  capability_tags: ['borrowed_compute', 'linux_runtime', 'ephemeral_workspace'],
  resources: { vcpu: 2, memory_gb: 2, storage_gb: 5 },
  isolation: { tenant_isolation: true, isolation_scope: 'tenant' },
  network: {
    outbound_only_enforceable: true,
    internet_egress: false,
    public_ingress: false,
    public_ingress_disableable: true,
    lan_only: false,
    peer_discovery_disableable: true,
  },
  cost: { billing_mode: 'internal_borrowed', spend_required: false, estimated_cost_usd: 0 },
  observed_at: '2026-09-24T16:00:00Z',
};
const request = {
  request_key: 'capacity:cell-1',
  required_capability_tags: ['linux_runtime', 'ephemeral_workspace'],
  minimum_resources: { vcpu: 1, memory_gb: 0.5, storage_gb: 2 },
  isolation: { tenant_isolation: true },
  network: { outbound_only: true, internet_egress: false, public_ingress: false, no_peer_discovery: true },
  spend_authorized: false,
};
assert.equal(evaluateCapacityRequest(request, offer).result, 'pass');
assert.equal(evaluateCapacityRequest(request, offer, { occupiedBy: 'capacity:cell-2' }).result, 'fail');
assert.deepEqual(evaluateCapacityRequest(request, offer, { occupiedBy: 'capacity:cell-2' }).reasons, ['capacity_offer_already_leased']);

const egressRequest = { ...request, network: { ...request.network, internet_egress: true } };
assert.equal(evaluateCapacityRequest(egressRequest, offer).network_pass, false);

const occupied = new Map([['borrow:node-a', 'capacity:other-cell']]);
assert.equal(selectCapacityOffer(request, [offer], occupied, ['local_runtime']), null);
occupied.clear();
assert.equal(selectCapacityOffer(request, [offer], occupied, ['local_runtime']).offer.offer_key, 'borrow:node-a');

const plan = planSabanCells({ requestedCapacity: 10000, maxAgentsPerCell: 10, maxParallelCells: 250 });
assert.equal(plan.total_cells_required, 1000);
assert.equal(plan.parallel_cells_admitted, 250);
assert.equal(plan.cells.reduce((sum, cell) => sum + cell.target_agent_count, 0), 10000);
assert.equal(plan.cells.every((cell) => cell.physical_capacity_claimed === false), true);
assert.throws(() => planSabanCells({ requestedCapacity: 10001 }), /logical_agent_ceiling_exceeded/);

console.log(JSON.stringify({
  status: 'PASS',
  tests: 13,
  logical_10k_cell_count: plan.total_cells_required,
  parallel_cells_admitted: plan.parallel_cells_admitted,
  overbooking_guard: 'PASS',
  workspace_attestation_gate: 'PASS',
  network_policy_gate: 'PASS',
}, null, 2));
