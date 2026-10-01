import test from 'node:test';
import assert from 'node:assert/strict';
import { startSpecialistHandoffRuntime } from '../systemia/mcp/specialist-handoff-runtime.mjs';

const catalog = [
  {
    public_id: 'ibmi-rescue-v1',
    name: 'Evercraft IBM i Rescue',
    description: 'IBM i estate assessment and modernization proof.',
    state: 'sell_now',
    connections: [
      {
        type: 'website',
        label: 'legacy frontage',
        url: 'https://example.base44.app/buy/ibmi-rescue-v1',
        state: 'legacy',
      },
      {
        type: 'docs',
        label: 'IBM i Rescue docs',
        url: 'https://github.com/jgaethle10/forge-operator/tree/main/registry/ibmi-rescue',
        state: 'public',
      },
    ],
  },
  {
    public_id: 'foundry-app-escape-audit-v1',
    name: 'Evercraft Foundry App Escape Audit',
    description: 'App portability and migration analysis.',
    state: 'human_handoff_ready',
    connections: [
      {
        type: 'docs',
        label: 'Foundry App Escape docs',
        url: 'https://github.com/jgaethle10/forge-operator',
        state: 'public',
      },
    ],
  },
  {
    public_id: 'site-survive-rapid-audit-v1',
    name: 'Site-Survive Rapid Audit',
    description: 'Site continuity and connectivity outage planning.',
    state: 'human_handoff_ready',
    connections: [
      {
        type: 'docs',
        label: 'Site-Survive docs',
        url: 'https://github.com/jgaethle10/forge-operator',
        state: 'public',
      },
    ],
  },
];

async function rpc(url, path, id, name) {
  const response = await fetch(url + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id,
      method: 'tools/call',
      params: { name, arguments: {} },
    }),
  });
  assert.equal(response.status, 200);
  return response.json();
}

test('specialist runtime defaults to native Fabric catalog with no Base44 transport', async () => {
  const runtime = await startSpecialistHandoffRuntime({
    host: '127.0.0.1',
    port: 0,
    fabricCatalog: catalog,
  });

  try {
    const health = await fetch(runtime.url + '/health').then((response) => response.json());
    assert.equal(health.ok, true);
    assert.equal(health.gateway_mode, 'native_fabric_catalog');
    assert.equal(health.external_gateway_configured, false);
    assert.equal(health.base44_transport_enabled, false);
    assert.equal(health.legacy_adapter, null);

    const offer = await rpc(
      runtime.url,
      '/mcp/ibmi-rescue',
      1,
      'get_ibmi_rescue_offer'
    );
    const offerPayload = offer.result.structuredContent;
    assert.equal(offerPayload.ok, true);
    assert.equal(offerPayload.source, 'evercraft.fabric.catalog');
    assert.equal(offerPayload.public_id, 'ibmi-rescue-v1');
    assert.equal(offerPayload.direct_specialist, true);
    assert.equal(offerPayload.payment_created, false);
    assert.equal(offerPayload.payment_obligation_created, false);
    assert.equal(offerPayload.base44_transport_enabled, false);
    assert.equal(JSON.stringify(offerPayload).includes('base44.app'), false);

    const handoff = await rpc(
      runtime.url,
      '/mcp/ibmi-rescue',
      2,
      'prepare_ibmi_rescue_handoff'
    );
    const handoffPayload = handoff.result.structuredContent;
    assert.equal(handoffPayload.human_action_required, true);
    assert.equal(handoffPayload.handoff_type, 'docs');
    assert.match(handoffPayload.handoff_url, /^https:\/\/github\.com\//);
    assert.equal(JSON.stringify(handoffPayload).includes('base44.app'), false);
  } finally {
    await runtime.close();
  }
});

test('explicit external gateway configuration is visible in health', async () => {
  const runtime = await startSpecialistHandoffRuntime({
    host: '127.0.0.1',
    port: 0,
    fabricCatalog: catalog,
    gatewayUrl: 'https://legacy.base44.app/functions/machineCommerceGateway',
  });

  try {
    const health = await fetch(runtime.url + '/health').then((response) => response.json());
    assert.equal(health.gateway_mode, 'external_https');
    assert.equal(health.external_gateway_configured, true);
    assert.equal(health.base44_transport_enabled, true);
    assert.equal(health.legacy_adapter, 'evercraft_machine_commerce_gateway');
  } finally {
    await runtime.close();
  }
});
