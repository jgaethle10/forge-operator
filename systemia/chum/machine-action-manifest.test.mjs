import assert from 'node:assert/strict';
import test from 'node:test';
import {
  auditCapabilityContractsAgainstActionManifest,
  buildMachineActionManifest,
  findObservedTool,
} from './machine-action-manifest.mjs';

const receipt = {
  schema: 'evercraft.chum.mcp-canary.v2',
  checked_at: '2026-09-30T20:00:00.000Z',
  targets: 3,
  failed_mcp: 1,
  registry_missing: 0,
  rows: [
    {
      product_key: 'aliev',
      name: 'AliEV',
      mcp: 'https://example.com/aliev',
      registry_name: 'io.github.jgaethle10/aliev',
      initialize: { ok: true, status: 200, valid: true },
      tools_list: {
        ok: true,
        status: 200,
        valid: true,
        names: ['quote_site', 'analyze_ev_site', 'analyze_ev_site'],
        commerce_signals: [],
      },
      registry: {
        checked: true,
        present: true,
        active: true,
        latest: true,
        version: '1.0.0',
        published_at: '2026-09-29T00:00:00Z',
      },
    },
    {
      product_key: 'roasted',
      name: 'ROASTED',
      mcp: 'https://example.com/roasted',
      registry_name: 'io.github.jgaethle10/roasted',
      initialize: { ok: true, status: 200, valid: true },
      tools_list: {
        ok: true,
        status: 200,
        valid: true,
        names: ['get_result', 'create_checkout'],
        commerce_signals: ['create_checkout'],
      },
      registry: {
        checked: true,
        present: true,
        active: true,
        latest: true,
        version: '1.0.0',
      },
    },
    {
      product_key: 'failed-product',
      name: 'Failed Product',
      mcp: 'https://example.com/failed',
      registry_name: 'io.github.jgaethle10/failed',
      initialize: { ok: false, status: 500, valid: false },
      tools_list: {
        ok: false,
        status: 0,
        valid: false,
        names: ['hallucinated_tool_must_not_survive'],
      },
      registry: {
        checked: true,
        present: true,
        active: true,
        latest: true,
      },
    },
  ],
};

test('builds exact observed tool names from live tools/list evidence', () => {
  const manifest = buildMachineActionManifest(receipt);
  assert.equal(manifest.schema, 'evercraft.machine-action-manifest.v1');
  assert.equal(manifest.summary.target_count, 3);
  assert.equal(manifest.summary.verified_tools_list_count, 2);
  assert.equal(manifest.summary.unverified_count, 1);
  assert.equal(manifest.summary.observed_tool_count, 4);

  const aliev = manifest.rows.find((row) => row.product_key === 'aliev');
  assert.deepEqual(aliev.tool_names, ['analyze_ev_site', 'quote_site']);
  assert.equal(aliev.tools_list_verified, true);
  assert.equal(aliev.tool_call_verified, false);
  assert.equal(aliev.evidence_state, 'observed_live_tools_list');
});

test('failed targets never leak claimed tool names into the manifest', () => {
  const manifest = buildMachineActionManifest(receipt);
  const failed = manifest.rows.find((row) => row.product_key === 'failed-product');
  assert.equal(failed.observation_state, 'unverified');
  assert.deepEqual(failed.tool_names, []);
  assert.equal(failed.tool_count, 0);
});

test('tool lookup distinguishes observed listing from successful invocation', () => {
  const manifest = buildMachineActionManifest(receipt);
  const observed = findObservedTool(manifest, {
    product_key: 'aliev',
    tool_name: 'analyze_ev_site',
  });
  assert.equal(observed.observed, true);
  assert.equal(observed.tool_call_verified, false);

  const absent = findObservedTool(manifest, {
    product_key: 'aliev',
    tool_name: 'invented_tool',
  });
  assert.equal(absent.observed, false);
});

test('commerce-like names remain evidence, not payment authority', () => {
  const manifest = buildMachineActionManifest(receipt);
  const roasted = manifest.rows.find((row) => row.product_key === 'roasted');
  assert.deepEqual(roasted.commerce_signals, ['create_checkout']);
  assert.equal(manifest.truth_boundary.tools_list_presence_is_not_payment_or_entitlement, true);
  assert.equal(manifest.truth_boundary.machine_action_manifest_grants_authority, false);
});

test('manifest receipt digest is deterministic and tamper-sensitive', () => {
  const first = buildMachineActionManifest(receipt);
  const second = buildMachineActionManifest(JSON.parse(JSON.stringify(receipt)));
  assert.equal(first.source_receipt_sha256, second.source_receipt_sha256);

  const changed = JSON.parse(JSON.stringify(receipt));
  changed.rows[0].tools_list.names.push('new_tool');
  const third = buildMachineActionManifest(changed);
  assert.notEqual(first.source_receipt_sha256, third.source_receipt_sha256);
});

test('invalid canary receipts fail closed', () => {
  assert.throws(
    () => buildMachineActionManifest({ schema: 'something.else' }),
    /mcp_canary_receipt_schema_invalid/
  );
});


test('shared-runtime contract audit requires exact observed machine tool bindings', () => {
  const manifest = buildMachineActionManifest(receipt);
  const contracts = {
    schema: 'evercraft.capability-mesh.contracts.v1',
    contracts: [
      {
        product_key: 'aliev',
        adoption_stage: 'shared_runtime',
        execution: {
          actions: [
            {
              scope: 'report.generate',
              machine_tool: 'analyze_ev_site',
              machine_tool_evidence_refs: ['proof:aliev'],
            },
          ],
        },
      },
      {
        product_key: 'roasted',
        adoption_stage: 'shared_runtime',
        execution: {
          actions: [
            {
              scope: 'result.read',
              machine_tool: 'get_result',
            },
          ],
        },
      },
      {
        product_key: 'private-product',
        adoption_stage: 'private_runtime',
        execution: {
          actions: [{ scope: 'private.run' }],
        },
      },
    ],
  };

  const audit = auditCapabilityContractsAgainstActionManifest({
    contracts,
    manifest,
  });
  assert.equal(audit.state, 'pass');
  assert.equal(audit.summary.shared_runtime_action_count, 2);
  assert.equal(audit.summary.verified_binding_count, 2);
  assert.equal(audit.summary.failed_binding_count, 0);
  assert.equal(
    audit.bindings.find((row) => row.product_key === 'aliev').machine_tool,
    'analyze_ev_site'
  );
  assert.equal(
    audit.truth_boundary.verified_binding_means_exact_tool_was_listed_not_called,
    true
  );
});

test('contract audit blocks missing or invented machine tool bindings', () => {
  const manifest = buildMachineActionManifest(receipt);
  const contracts = {
    schema: 'evercraft.capability-mesh.contracts.v1',
    contracts: [
      {
        product_key: 'aliev',
        adoption_stage: 'shared_runtime',
        execution: {
          actions: [
            { scope: 'report.generate', machine_tool: 'invented_tool' },
            { scope: 'report.preview' },
          ],
        },
      },
    ],
  };

  const audit = auditCapabilityContractsAgainstActionManifest({
    contracts,
    manifest,
  });
  assert.equal(audit.state, 'blocked');
  assert.equal(audit.summary.failed_binding_count, 2);
  assert.deepEqual(
    audit.bindings.map((row) => row.reason).sort(),
    ['machine_tool_missing', 'machine_tool_not_observed']
  );
  assert.equal(
    audit.truth_boundary.failed_binding_must_not_fall_back_to_inferred_tool_name,
    true
  );
});
