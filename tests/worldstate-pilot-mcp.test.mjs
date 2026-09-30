import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  WORLDSTATE_PILOT_MCP,
  executeWorldstatePilotRpc
} from '../systemia/worldstate/pilot-mcp.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'worldstate-pilot-mcp-'));
const catalogPath = path.join(root, 'catalog.json');
fs.writeFileSync(catalogPath, JSON.stringify({
  offers: [{
    public_id: 'worldstate-reality-delta-v1',
    name: 'Worldstate Reality Delta',
    commercial_state: 'verification_required',
    machine_state: 'discovery_only',
    pricing: 'Custom pilot packaging pending approval.',
    offers: []
  }]
}));

test('Worldstate pilot MCP initializes and exposes only two non-destructive tools', async () => {
  const init = await executeWorldstatePilotRpc({
    jsonrpc:'2.0', id:1, method:'initialize', params:{}
  }, { catalogPath });
  assert.equal(init.result.serverInfo.name, WORLDSTATE_PILOT_MCP.server_name);

  const listed = await executeWorldstatePilotRpc({
    jsonrpc:'2.0', id:2, method:'tools/list', params:{}
  }, { catalogPath });
  assert.deepEqual(
    listed.result.tools.map((row) => row.name),
    ['get_worldstate_offer', 'prepare_worldstate_pilot_handoff']
  );
  assert.ok(listed.result.tools.every((row) => row.annotations.readOnlyHint === true));
  assert.ok(listed.result.tools.every((row) => row.annotations.destructiveHint === false));
});

test('offer inspection is local-catalog based and creates no authority or payment', async () => {
  const response = await executeWorldstatePilotRpc({
    jsonrpc:'2.0',
    id:3,
    method:'tools/call',
    params:{name:'get_worldstate_offer',arguments:{}}
  }, { catalogPath });

  const payload = response.result.structuredContent;
  assert.equal(payload.public_id, 'worldstate-reality-delta-v1');
  assert.equal(payload.offer.commercial_state, 'verification_required');
  assert.equal(payload.monitoring_started, false);
  assert.equal(payload.payment_created, false);
  assert.equal(payload.payment_obligation_created, false);
});

test('pilot handoff preserves bounded scope and creates no monitoring authority', async () => {
  const response = await executeWorldstatePilotRpc({
    jsonrpc:'2.0',
    id:4,
    method:'tools/call',
    params:{
      name:'prepare_worldstate_pilot_handoff',
      arguments:{
        scope_name:'Yakima operating portfolio',
        pilot_archetype:'asset_portfolio',
        region_keys:['yakima'],
        domains:['water','energy'],
        facilities:['Warehouse A'],
        dependencies:['grid'],
        cadence_preference:'hourly',
        delivery_surface:'mcp',
        requested_outcome:'Surface material external changes around operating assets.'
      }
    }
  }, { catalogPath });

  const payload = response.result.structuredContent;
  assert.equal(payload.scope.region_keys[0], 'yakima');
  assert.equal(payload.scope.domains.includes('water'), true);
  assert.equal(payload.scope.facilities[0], 'Warehouse A');
  assert.equal(payload.monitoring_started, false);
  assert.equal(payload.passport_grant_created, false);
  assert.equal(payload.source_access_granted, false);
  assert.equal(payload.payment_obligation_created, false);
  assert.equal(payload.production_authority_granted, false);
  assert.equal(payload.external_action_taken, false);
});

test('empty and person-targeted scope requests fail closed', async () => {
  const empty = await executeWorldstatePilotRpc({
    jsonrpc:'2.0',
    id:5,
    method:'tools/call',
    params:{name:'prepare_worldstate_pilot_handoff',arguments:{scope_name:'Empty'}}
  }, { catalogPath });
  assert.equal(empty.error.code, -32602);
  assert.match(empty.error.message, /at_least_one_criterion/);

  const person = await executeWorldstatePilotRpc({
    jsonrpc:'2.0',
    id:6,
    method:'tools/call',
    params:{
      name:'prepare_worldstate_pilot_handoff',
      arguments:{scope_name:'Bad',people:['person-1'],domains:['water']}
    }
  }, { catalogPath });
  assert.equal(person.error.code, -32602);
});

test('unknown tools fail closed', async () => {
  const response = await executeWorldstatePilotRpc({
    jsonrpc:'2.0',
    id:7,
    method:'tools/call',
    params:{name:'start_monitoring_now',arguments:{}}
  }, { catalogPath });
  assert.equal(response.error.code, -32602);
});

test.after(() => fs.rmSync(root, { recursive:true, force:true }));
