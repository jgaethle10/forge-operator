import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createFaieRuntime } from './runtime.mjs';
import { executeFaieMcpRpc, faieMcpTools } from './mcp.mjs';

function observation() {
  return {
    observation_id: 'obs:mcp-water-1',
    source_system: 'official-water-feed',
    source_family: 'Yakima Basin Authority',
    observed_at: '2026-09-30T18:00:00.000Z',
    region_keys: ['yakima-wa'],
    domains: ['water', 'agriculture'],
    kind: 'irrigation_supply',
    evidence_state: 'verified',
    reliability: 0.94,
    anomaly_score: 0.78,
    summary: 'Yakima irrigation water availability is below the seasonal baseline.',
    provenance_refs: [
      'https://example.gov/yakima-water',
      'internal://private-receipt'
    ],
    facts: { severity: 0.82 }
  };
}

test('FAIE MCP exposes only read-only engine tools', () => {
  assert.deepEqual(
    faieMcpTools().map((tool) => tool.name),
    [
      'investigate_faie_evidence',
      'get_faie_signal_snapshot',
      'get_faie_health'
    ]
  );
  assert.ok(faieMcpTools().every((tool) => tool.annotations.readOnlyHint === true));
  assert.ok(faieMcpTools().every((tool) => tool.annotations.destructiveHint === false));
});

test('FAIE MCP initialize identifies the native owned runtime', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'faie-mcp-init-'));
  const runtime = createFaieRuntime({
    stateDir: dir,
    collectorConfig: { enabled: false }
  });
  try {
    const response = await executeFaieMcpRpc(runtime, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'test', version: '1' }
      }
    });
    assert.equal(response.result.serverInfo.name, 'evercraft-faie');
    assert.match(response.result.instructions, /ephemeral/i);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('FAIE MCP investigation uses preview path and does not persist the caller question', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'faie-mcp-preview-'));
  try {
    const runtime = createFaieRuntime({
      stateDir: dir,
      collectorConfig: { enabled: false }
    });
    runtime.ingest(observation(), { now: '2026-09-30T20:00:00.000Z' });

    const before = runtime.health().investigation_count;
    const response = await executeFaieMcpRpc(runtime, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'investigate_faie_evidence',
        arguments: {
          question: 'What current evidence affects Yakima irrigation resilience?',
          region_keys: ['yakima-wa'],
          horizon_days: 7
        }
      }
    });

    const payload = response.result.structuredContent;
    assert.equal(payload.ok, true);
    assert.equal(payload.persisted, false);
    assert.equal(payload.decision_authority, false);
    assert.equal(payload.publication_authority, false);
    assert.equal(payload.investigation.status, 'evidence_available');
    assert.equal(runtime.health().investigation_count, before);

    const finding = payload.investigation.findings[0];
    assert.deepEqual(finding.provenance_refs, ['https://example.gov/yakima-water']);
    assert.equal(finding.provenance_ref_count, 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('FAIE MCP signal and health tools return bounded runtime views', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'faie-mcp-health-'));
  try {
    const runtime = createFaieRuntime({
      stateDir: dir,
      collectorConfig: { enabled: false }
    });
    runtime.ingest(observation(), { now: '2026-09-30T20:00:00.000Z' });

    const signals = await executeFaieMcpRpc(runtime, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'get_faie_signal_snapshot', arguments: { limit: 5 } }
    });
    assert.equal(signals.result.structuredContent.snapshot.signal_count, 1);
    assert.equal(signals.result.structuredContent.snapshot.signals[0].decision_authority, false);

    const health = await executeFaieMcpRpc(runtime, {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'get_faie_health', arguments: {} }
    });
    assert.equal(health.result.structuredContent.health.signal_count, 1);
    assert.equal(health.result.structuredContent.external_action_taken, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
