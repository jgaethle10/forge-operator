import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startEvercraftComputeNode } from '../compute/runtime-node.mjs';
import { startAliEvSourceRuntime } from '../aliev/source-runtime.mjs';
import { YardOperator } from './operator.mjs';

function response(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
}

function sourceFetch(url) {
  const parsed = new URL(url);
  if (parsed.hostname === 'geocoding.geo.census.gov') return Promise.resolve(response({
    result: { addressMatches: [{
      matchedAddress: '6405 W CHESTNUT AVE, YAKIMA, WA, 98908',
      coordinates: { x: -120.5942, y: 46.59655 },
      addressComponents: { state: 'WA', zip: '98908' },
      geographies: { Counties: [{ NAME: 'Yakima County', GEOID: '53077' }] }
    }] }
  }));
  if (parsed.hostname === 'developer.nlr.gov' && parsed.pathname.includes('alt-fuel-stations')) return Promise.resolve(response({
    fuel_stations: [{
      id: 101,
      station_name: 'Owned Source Charger',
      ev_network: 'Owned Proof Network',
      latitude: 46.601,
      longitude: -120.591,
      ev_dc_fast_num: 6,
      ev_connector_types: ['J1772COMBO'],
      state: 'WA',
      zip: '98908',
      status_code: 'E'
    }]
  }));
  if (parsed.hostname === 'developer.nlr.gov' && parsed.pathname.includes('transportation-incentives-laws')) return Promise.resolve(response({
    result: [{ id: 8, title: 'Owned source program', jurisdiction: 'US-WA' }]
  }));
  if (parsed.hostname === 'api.openei.org') return Promise.resolve(response({
    items: [{ label: 'Owned source commercial rate', utility: 'Owned Proof Utility' }]
  }));
  if (parsed.hostname === 'data.wsdot.wa.gov') return Promise.resolve(response({
    features: [{ attributes: { AADT: 24800, RouteName: 'US 12', Year: 2025 }, geometry: { x: -120.59, y: 46.60 } }]
  }));
  if (parsed.hostname === 'gis.ecology.wa.gov') return Promise.resolve(response({
    features: [{ attributes: { UTILITY_NAME: 'Owned Proof Utility' } }]
  }));
  if (parsed.hostname === 'overpass-api.de') return Promise.resolve(response({
    elements: [{ type: 'node', id: 501, lat: 46.598, lon: -120.592, tags: { tourism: 'hotel', name: 'Owned Proof Hotel' } }]
  }));
  throw new Error('unexpected source fetch URL');
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rivet-owned-source-yard-'));
const computeRoot = path.join(root, 'compute');
const yardState = path.join(root, 'yard');

const oldMachine = process.env.SYSTEMIA_MACHINE_KEY;
const oldTeam = process.env.RIVET_YARD_TEAM_TOKEN;
const oldOpenEi = process.env.OPENEI_API_KEY;
process.env.SYSTEMIA_MACHINE_KEY = 'owned-source-machine';
process.env.RIVET_YARD_TEAM_TOKEN = 'owned-source-team';
process.env.OPENEI_API_KEY = 'owned-source-openei';

const node = await startEvercraftComputeNode({
  root: computeRoot,
  nodeId: 'rivet-owned-source-proof-node',
  alievSourceRuntimeFactory: (options) => startAliEvSourceRuntime({
    ...options,
    fetchImpl: sourceFetch,
    afdcApiKey: 'owned-source-afdc',
    openEiApiKey: 'owned-source-openei'
  })
});
const yard = new YardOperator({ stateDir: yardState });

try {
  const deployment = await yard.deployRelease({
    deploymentId: 'rivet-owned-source-proof',
    releaseRef: 'owned-source-proof-release',
    workloadClass: 'systemia.rivet-report-runtime.v1',
    capacityEndpoint: node.endpoint,
    input: { state_root: path.join(computeRoot, 'rivet-state') },
    rollbackTarget: 'proof:rivet-owned-source-previous',
    leaseTtlMs: 120000
  });

  assert.equal(deployment.state, 'ready');
  assert.equal(deployment.result.owned_source_embedded, true);
  assert.equal(deployment.result.source_runtime, 'systemia.aliev-source-runtime.v1');
  assert.equal(deployment.result.legacy_source_transport, false);

  const health = await fetch(deployment.result.local_url + '/health').then(r => r.json());
  assert.equal(health.ok, true);
  assert.equal(health.legacy_source_fallback, false);

  const created = await fetch(deployment.result.local_url + '/v1/reports', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer owned-source-team'
    },
    body: JSON.stringify({ address: '6405 W Chestnut Ave, Yakima, WA 98908' })
  });
  assert.equal(created.status, 201);
  const report = await created.json();
  assert.equal(report.generation_state, 'ready');
  assert.equal(report.verification.source_response_profile_verified, true);
  assert.equal(report.verification.full_source_snapshot_persisted, true);
  assert.equal(report.report.body.source.runtime, 'systemia.aliev-source-runtime.v1');
  assert.equal(report.report.body.source.evidence_state, 'SOURCE_BACKED_OWNED_RUNTIME');
  assert.equal(report.report.body.metrics.max_aadt, 24800);
  assert.equal(report.report.body.metrics.charger_count, 1);
  assert.equal(JSON.stringify(report).toLowerCase().includes('base44'), false);

  console.log(JSON.stringify({
    ok: true,
    schema: 'evercraft.rivet.owned-source-yard-proof.v1',
    owned_source_embedded: true,
    address_to_ready_report: true,
    legacy_source_transport: false,
    source_runtime: deployment.result.source_runtime,
    report_id: report.report_id
  }, null, 2));
} finally {
  await node.close();
  if (oldMachine === undefined) delete process.env.SYSTEMIA_MACHINE_KEY; else process.env.SYSTEMIA_MACHINE_KEY = oldMachine;
  if (oldTeam === undefined) delete process.env.RIVET_YARD_TEAM_TOKEN; else process.env.RIVET_YARD_TEAM_TOKEN = oldTeam;
  if (oldOpenEi === undefined) delete process.env.OPENEI_API_KEY; else process.env.OPENEI_API_KEY = oldOpenEi;
  fs.rmSync(root, { recursive: true, force: true });
}
