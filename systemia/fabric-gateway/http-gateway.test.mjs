import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { EvercraftFabricGateway } from './gateway.mjs';
import { executeFabricMcpRpc } from './http-gateway.mjs';

const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-fabric-mcp-'));

function gatewaySetup() {
  const root = temp();
  const gateway = new EvercraftFabricGateway({
    stateDir: path.join(root, 'fabric'),
    passportStateDir: path.join(root, 'passport'),
    contextStateDir: path.join(root, 'context'),
    verificationPepper: 'evercraft-fabric-http-test-pepper-32-bytes-minimum',
    authorityReceiptRef: 'identity:fabric-http-test',
    capabilityProvider: async (intent, limit) => ({
      ok: true,
      intent,
      limit,
      matches: [{ public_id: 'forensiscope-v1', name: 'ForensiScope' }],
    }),
  });
  return { root, gateway };
}

test('Fabric MCP initializes with five bounded tools', async () => {
  const init = await executeFabricMcpRpc({
    rpc: { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
  });
  assert.equal(init.result.serverInfo.name, 'evercraft-fabric');
  assert.equal(init.result.protocolVersion, '2025-03-26');

  const list = await executeFabricMcpRpc({
    rpc: { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
  });
  assert.deepEqual(
    list.result.tools.map((tool) => tool.name),
    [
      'discover_evercraft',
      'connect_evercraft_fabric',
      'query_evercraft_context',
      'emit_evercraft_event',
      'prepare_evercraft_action',
    ]
  );
  assert.equal(list.result.tools[0].annotations.readOnlyHint, true);
  assert.equal(list.result.tools.at(-1).annotations.destructiveHint, false);
});

test('public discovery works without a private Fabric credential', async () => {
  const response = await executeFabricMcpRpc({
    rpc: {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'discover_evercraft',
        arguments: { intent: 'I need help with a long video', limit: 3 },
      },
    },
    discoverPublic: async (intent, limit) => ({
      ok: true,
      intent,
      limit,
      matches: [{ public_id: 'forensiscope-v1' }],
    }),
  });

  assert.equal(response.result.structuredContent.public_only, true);
  assert.equal(response.result.structuredContent.private_authority_granted, false);
  assert.equal(response.result.structuredContent.result.matches[0].public_id, 'forensiscope-v1');
});

test('private Fabric tools fail closed without configured gateway or credential', async () => {
  const unconfigured = await executeFabricMcpRpc({
    rpc: {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'connect_evercraft_fabric',
        arguments: { host_instance_ref: 'host:test' },
      },
    },
    discoverPublic: async () => ({ ok: true }),
  });
  assert.equal(unconfigured.error.code, -32001);
  assert.match(unconfigured.error.message, /not_configured/);

  const { root, gateway } = gatewaySetup();
  try {
    const missingCredential = await executeFabricMcpRpc({
      rpc: {
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: {
          name: 'connect_evercraft_fabric',
          arguments: { host_instance_ref: 'host:test' },
        },
      },
      gateway,
    });
    assert.equal(missingCredential.error.code, -32001);
    assert.match(missingCredential.error.message, /credential_required/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('authenticated connection preserves install-is-not-authority boundary', async () => {
  const { root, gateway } = gatewaySetup();
  try {
    const issued = gateway.issueHostCredential({
      project_key: 'claude-host',
      tenant_key: 'evercraft-test',
      host_type: 'claude',
      scopes: ['fabric.connect'],
      context_scopes: [],
      expires_at: '2026-10-28T21:00:00Z',
    });

    const response = await executeFabricMcpRpc({
      rpc: {
        jsonrpc: '2.0',
        id: 6,
        method: 'tools/call',
        params: {
          name: 'connect_evercraft_fabric',
          arguments: {
            host_instance_ref: 'claude:workspace:test',
            adapter: 'mcp',
          },
        },
      },
      gateway,
      authorization: 'Bearer ' + issued.secret_once,
    });

    assert.equal(response.result.structuredContent.ok, true);
    assert.equal(
      response.result.structuredContent.connection.private_context_granted_by_install,
      false
    );
    assert.equal(
      response.result.structuredContent.connection.action_authority_granted_by_install,
      false
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('unknown Fabric MCP tools fail closed', async () => {
  const response = await executeFabricMcpRpc({
    rpc: {
      jsonrpc: '2.0',
      id: 7,
      method: 'tools/call',
      params: { name: 'take_over_everything', arguments: {} },
    },
  });
  assert.equal(response.error.code, -32602);
});
