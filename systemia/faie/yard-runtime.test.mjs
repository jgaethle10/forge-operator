import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  resolveFaieYardCollectorConfig,
  startFaieYardRuntime
} from './yard-runtime.mjs';

const TOKEN = 'faie-yard-test-token';

function observation() {
  return {
    observation_id: 'obs:yard-water-1',
    source_system: 'yard-test',
    source_family: 'Official Water Test',
    observed_at: '2026-09-30T18:00:00.000Z',
    region_keys: ['yakima-wa'],
    domains: ['water', 'agriculture'],
    kind: 'irrigation_supply',
    evidence_state: 'verified',
    reliability: 0.95,
    anomaly_score: 0.8,
    summary: 'Yakima irrigation supply is below the seasonal baseline.',
    provenance_refs: ['https://example.gov/yard-water'],
    facts: { severity: 0.8 }
  };
}

async function json(origin, pathname, init = undefined) {
  const response = await fetch(origin + pathname, init);
  const body = await response.json();
  return { response, body };
}

test('FAIE Yard config can inherit the verified Yakima Basin profile', () => {
  const config = resolveFaieYardCollectorConfig({
    officialCollectorsEnabled: true,
    regionProfile: 'yakima-basin-wa'
  });
  assert.equal(config.region_profile.profile_id, 'yakima-basin-wa');
  assert.equal(config.nws_area, 'WA');
  assert.equal(config.usgs_water_sites.length, 4);
});

test('FAIE runs as a receipt-bindable Evercraft Compute resident', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'faie-yard-runtime-'));
  const runtime = await startFaieYardRuntime({
    stateDir: dir,
    host: '127.0.0.1',
    port: 0,
    officialCollectorsEnabled: false,
    internalToken: TOKEN
  });

  try {
    const health = await json(runtime.url, '/health');
    assert.equal(health.response.status, 200);
    assert.equal(health.body.ok, true);
    assert.equal(health.body.service, 'faie-yard-runtime');
    assert.equal(health.body.runtime, 'Evercraft Compute');
    assert.equal(health.body.workload_class, 'systemia.faie.v1');
    assert.equal(health.body.base44_required, false);
    assert.equal(health.body.external_ai_required, false);
    assert.equal(health.body.public_investigations_persisted, false);
    assert.equal(health.body.deployment_receipt_bound, false);

    const bound = runtime.setDeploymentReceipt('sha256:' + 'a'.repeat(64));
    assert.equal(bound.deployment_receipt_bound, true);
    assert.equal(bound.deployment_receipt_ref, 'sha256:' + 'a'.repeat(64));

    const page = await fetch(runtime.url + '/faie/');
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Evidence for the physical world/);

    const ingest = await json(runtime.url, '/api/faie/ingest', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer ' + TOKEN
      },
      body: JSON.stringify({ observation: observation() })
    });
    assert.equal(ingest.response.status, 200);
    assert.equal(ingest.body.decision.action, 'admitted');

    const signals = await json(runtime.url, '/api/faie/signals?limit=10');
    assert.equal(signals.response.status, 200);
    assert.equal(signals.body.signal_count, 1);

    const before = await json(runtime.url, '/api/faie/health');
    assert.equal(before.body.investigation_count, 0);

    const preview = await json(runtime.url, '/api/faie/investigate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        question: 'What current evidence affects Yakima irrigation resilience?',
        region_keys: ['yakima-wa'],
        horizon_days: 7
      })
    });
    assert.equal(preview.response.status, 200);
    assert.equal(preview.body.status, 'evidence_available');

    const after = await json(runtime.url, '/api/faie/health');
    assert.equal(after.body.investigation_count, 0);

    const mcpHealth = await json(runtime.url, '/mcp/faie?action=health');
    assert.equal(mcpHealth.body.server, 'evercraft-faie');

    const mcp = await json(runtime.url, '/mcp/faie', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'investigate_faie_evidence',
          arguments: {
            question: 'Investigate current Yakima irrigation evidence.',
            region_keys: ['yakima-wa'],
            horizon_days: 7
          }
        }
      })
    });
    assert.equal(mcp.response.status, 200);
    assert.equal(mcp.body.result.structuredContent.persisted, false);
    assert.equal(mcp.body.result.structuredContent.investigation.status, 'evidence_available');
  } finally {
    await runtime.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
