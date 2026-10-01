import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { registerHouseholdFabricGateway } from '../systemia/household-fabric/http-gateway.mjs';

async function start(artifactPath) {
  const app = express();
  registerHouseholdFabricGateway(app, { artifactPath });
  const server = await new Promise((resolve, reject) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
    s.once('error', reject);
  });
  const address = server.address();
  return {
    url: 'http://127.0.0.1:' + address.port,
    close: () => new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve())),
  };
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'household-fabric-gateway-'));
const artifact = path.join(dir, 'today.json');

{
  const runtime = await start(artifact);
  try {
    const response = await fetch(runtime.url + '/api/household-fabric/yakima/today');
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(body.error, 'household_fabric_today_unavailable');
  } finally {
    await runtime.close();
  }
}

fs.writeFileSync(artifact, JSON.stringify({
  schema: 'systemia.household-fabric.surface.v1',
  generated_at: '2026-09-28T19:00:00.000Z',
  geography: 'yakima-wa',
  mode: 'holiday_pressure',
  status: 'degraded',
  coverage: {
    healthy: false,
    degraded_categories: ['fuel', 'grocery'],
    categories: {
      fuel: { healthy: false, internal_detail: 'do-not-project' },
    },
    conflicts_open: 0,
  },
  headline: {
    money_kept_cents: 500,
    money_earned_cents: 0,
    opportunities_shown: 1,
  },
  opportunities: [{
    id: 'event-1',
    title: 'Family Storytime',
    category: 'event',
    value_basis: 'save',
    net_value_cents: 0,
    confidence: 0.98,
    evidence_label: 'public',
    requires_eligibility_check: false,
    observed_at: '2026-09-28T18:55:00.000Z',
    expires_at: null,
    source_name: 'Yakima Valley Libraries Events',
    source_url: 'https://www.yvl.org/events/',
    location: { label: 'Yakima Central Library' },
    actions: [{ type: 'view_source', label: 'View event', url: 'https://www.yvl.org/events/' }],
    sponsored: false,
    sponsor_label: '',
    raw_metadata: { secret_internal_receipt: 'must-not-leak' },
  }],
  message: 'Some local lanes are thin or stale.',
  guardrails: {
    sponsorship_affects_rank: false,
    poverty_score_used: false,
    personal_data_sale_required: false,
    stale_money_claims_allowed: false,
  },
  internal_ledger: { secret: true },
}, null, 2));

{
  const runtime = await start(artifact);
  try {
    const health = await fetch(runtime.url + '/api/household-fabric/health').then(r => r.json());
    assert.equal(health.artifact_valid, true);

    const response = await fetch(runtime.url + '/api/household-fabric/yakima/today');
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('access-control-allow-origin'), '*');
    const body = await response.json();

    assert.equal(body.ok, true);
    assert.equal(body.schema, 'evercraft.household-fabric.public-today.v1');
    assert.equal(body.opportunities.length, 1);
    assert.equal(body.opportunities[0].title, 'Family Storytime');
    assert.equal('raw_metadata' in body.opportunities[0], false);
    assert.equal('categories' in body.coverage, false);
    assert.equal('internal_ledger' in body, false);
    assert.equal(body.guardrails.poverty_score_used, false);
  } finally {
    await runtime.close();
  }
}

console.log('HOUSEHOLD_FABRIC_GATEWAY_PASS');


{
  const manifest = JSON.parse(fs.readFileSync(
    path.resolve('public/.well-known/evercraft-household-fabric.json'),
    'utf8'
  ));
  assert.equal(manifest.current_capability_state.ranking_engine, 'merged');
  assert.equal(manifest.current_capability_state.google_places_fuel_client, 'implemented_candidate_credentials_required_not_live');
  assert.equal(manifest.current_capability_state.kroger_grocery_client, 'implemented_candidate_credentials_required_not_live');
  assert.equal(manifest.current_capability_state.provider_credential_mode, 'vault_reference_first');
  assert.equal(manifest.evidence_rules.includes('Source existence does not imply collector execution or fresh user-facing data.'), true);
}
