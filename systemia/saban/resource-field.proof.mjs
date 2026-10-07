import assert from 'node:assert/strict';
import { planResourceField, resourceFieldDoctrine } from './resource-field.mjs';

const candidates = [
  {
    candidate_id: 'owned-workstation',
    source_kind: 'owned_node',
    authority: 'owned',
    connected: true,
    attested: true,
    workloads: ['systemia.batch.v1'],
    labels: ['ground', 'worker'],
    transports: ['evercraft.outbound-capacity.v1'],
    resources: {
      cpu_units: 16,
      memory_mb: 32768,
      storage_gb: 512,
      gpu_units: 0,
      vram_mb: 0,
    },
    ready_seconds: 1,
  },
  {
    candidate_id: 'partner-gpu',
    source_kind: 'partner_node',
    authority: 'explicit_grant',
    connected: true,
    attested: true,
    workloads: ['systemia.inference.v1', 'systemia.batch.v1'],
    labels: ['worker', 'gpu'],
    transports: ['evercraft.outbound-capacity.v1'],
    resources: {
      cpu_units: 12,
      memory_mb: 65536,
      storage_gb: 1000,
      gpu_units: 1,
      vram_mb: 24576,
    },
    ready_seconds: 3,
  },
  {
    candidate_id: 'bare-metal-spawn-target',
    source_kind: 'provisionable_machine',
    authority: 'approved_provider',
    connected: false,
    attested: false,
    spawn_capable: true,
    workloads: [],
    labels: ['worker', 'gpu'],
    transports: ['evercraft.outbound-capacity.v1'],
    resources: {
      cpu_units: 64,
      memory_mb: 524288,
      storage_gb: 4000,
      gpu_units: 4,
      vram_mb: 384000,
    },
    ready_seconds: 180,
    hourly_usd: 0,
    acquisition_usd: 0,
    bootstrap: {
      adapter: 'evercraft-node-seed',
      target: 'bare-metal-spawn-target',
    },
  },
  {
    candidate_id: 'unauthorized-monster',
    source_kind: 'enrolled_peer',
    authority: 'unknown',
    connected: true,
    attested: true,
    workloads: ['systemia.inference.v1'],
    labels: ['worker', 'gpu'],
    transports: ['evercraft.outbound-capacity.v1'],
    resources: {
      cpu_units: 256,
      memory_mb: 1048576,
      storage_gb: 10000,
      gpu_units: 16,
      vram_mb: 1536000,
    },
    ready_seconds: 1,
  },
];

const inference = planResourceField({
  need: {
    need_id: 'inference-now',
    workload_class: 'systemia.inference.v1',
    topology: 'single_node',
    memory_semantics: 'local',
    required_labels: ['gpu'],
    required_transports: ['evercraft.outbound-capacity.v1'],
    resources: {
      cpu_units: 8,
      memory_mb: 32768,
      storage_gb: 100,
      gpu_units: 1,
      vram_mb: 20000,
    },
  },
  candidates,
});

assert.equal(inference.state, 'ready');
assert.deepEqual(inference.selected_candidates, ['partner-gpu']);
assert.equal(
  inference.rejected.find((row) => row.candidate_id === 'unauthorized-monster')
    ?.reasons.includes('authority_missing'),
  true
);

const giant = planResourceField({
  need: {
    need_id: 'giant-model',
    workload_class: 'systemia.inference.v1',
    topology: 'single_node',
    memory_semantics: 'local',
    required_labels: ['gpu'],
    required_transports: ['evercraft.outbound-capacity.v1'],
    resources: {
      cpu_units: 48,
      memory_mb: 262144,
      storage_gb: 1000,
      gpu_units: 4,
      vram_mb: 320000,
    },
  },
  candidates,
});

assert.equal(giant.state, 'spawn_required');
assert.deepEqual(giant.selected_candidates, ['bare-metal-spawn-target']);
assert.equal(giant.assimilation[0].steps[0].action, 'bootstrap_evercraft_compute');

const sharded = planResourceField({
  need: {
    need_id: 'batch-wave',
    workload_class: 'systemia.batch.v1',
    topology: 'sharded',
    memory_semantics: 'distributed',
    required_transports: ['evercraft.outbound-capacity.v1'],
    resources: {
      cpu_units: 24,
      memory_mb: 80000,
      storage_gb: 1000,
      gpu_units: 0,
      vram_mb: 0,
    },
    min_per_node: {
      cpu_units: 8,
      memory_mb: 16000,
      storage_gb: 100,
    },
  },
  candidates,
});

assert.equal(sharded.state, 'ready');
assert.deepEqual(sharded.selected_candidates, ['owned-workstation', 'partner-gpu']);
assert.equal(sharded.memory_contract.cross_node_ram_is_contiguous, false);
assert.equal(sharded.memory_contract.distributed_memory_allowed, true);

const impossible = planResourceField({
  need: {
    need_id: 'unknown-accelerator',
    workload_class: 'systemia.quantum-unicorn.v1',
    topology: 'single_node',
    resources: {
      cpu_units: 1,
      memory_mb: 1024,
      storage_gb: 1,
      gpu_units: 32,
      vram_mb: 9999999,
    },
  },
  candidates,
});

assert.equal(impossible.state, 'scarcity');
assert.equal(impossible.engineering_required, true);
assert.equal(
  impossible.scarcity_signal.next_action,
  'expand_discovery_or_create_new_capacity_adapter'
);

const doctrine = resourceFieldDoctrine();
assert.ok(doctrine.invariants.includes('no_single_vendor_is_the_control_plane'));
assert.ok(doctrine.invariants.includes('authority_before_execution'));

console.log(JSON.stringify({
  ok: true,
  schema: 'evercraft.saban.resource-field-proof.v1',
  ready_capacity_selected: inference.selected_candidates,
  spawn_path_selected: giant.selected_candidates,
  distributed_wave_selected: sharded.selected_candidates,
  unauthorized_capacity_rejected: true,
  scarcity_becomes_engineering_signal: true,
  no_fake_cross_node_ram: true,
  receipt_hashes: [
    inference.receipt_hash,
    giant.receipt_hash,
    sharded.receipt_hash,
    impossible.receipt_hash,
  ],
}, null, 2));
