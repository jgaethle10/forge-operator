import assert from 'node:assert/strict';
import { RemoteOperatorGateway, executeRemoteOperatorMcpRpc } from './mcp-gateway.mjs';

const seen = [];
const controlToken = 'control-' + 'c'.repeat(40);
const clientToken = 'client-' + 'd'.repeat(40);

const fakeFetch = async (url, options = {}) => {
  seen.push({
    url,
    method: options.method,
    authorization: options.headers?.authorization,
    body: options.body ? JSON.parse(options.body) : null,
  });
  if (options.headers?.authorization !== 'Bearer ' + controlToken) {
    return new Response(JSON.stringify({ error: 'bad_control_token' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }
  const route = new URL(url).pathname;
  if (route.endsWith('/v1/operator/status')) {
    return new Response(JSON.stringify({
      ok: true,
      roots: ['home'],
      network_observation: {
        ok: true,
        schema: 'evercraft.node-network-observation.v1',
        authority: { read_only: true },
      },
    }), { status: 200 });
  }
  if (route.endsWith('/v1/operator/host-capabilities')) {
    return new Response(JSON.stringify({
      ok: true,
      schema: 'evercraft.host-boundary-capability-status.v1',
      registry_version: '1.0.0',
      capability_count: 1,
      capabilities: [{
        capability_id: 'chromeos.crostini.port-forwarding.read.v1',
        host_os: 'chromeos',
        operation: 'read',
        mutation_authority: false,
        arbitrary_desktop_control: false,
      }],
    }), { status: 200 });
  }
  if (route.endsWith('/v1/operator/host-boundary')) {
    return new Response(JSON.stringify({
      ok: true,
      schema: 'evercraft.chromeos-host-boundary-status.v1',
      state: 'fresh',
      fresh: true,
      mutation_supported: false,
      ports: [
        { port: 8443, protocol: 'TCP', present: true, enabled: true },
        { port: 18080, protocol: 'TCP', present: true, enabled: true },
      ],
    }), { status: 200 });
  }
  if (route.endsWith('/v1/operator/host-capabilities/check')) {
    return new Response(JSON.stringify({
      ok: true,
      schema: 'evercraft.host-boundary-capability-check-result.v1',
      capability_id: 'chromeos.crostini.port-forwarding.read.v1',
      adapter: 'chromeos_crostini_port_forwarding',
      request_id: 'hostcheck_0123456789abcdef01234567',
      request_state: 'pending',
      pending: true,
      fulfilled: false,
      mutation_authority: false,
      arbitrary_desktop_control: false,
    }), { status: 200 });
  }
  if (route.endsWith('/v1/operator/host-boundary/check')) {
    return new Response(JSON.stringify({
      ok: true,
      schema: 'evercraft.chromeos-host-boundary-check-result.v1',
      request_id: 'hostcheck_0123456789abcdef01234567',
      request_state: 'pending',
      pending: true,
      fulfilled: false,
      mutation_supported: false,
    }), { status: 200 });
  }
  if (route.endsWith('/v1/operator/fs/read')) {
    return new Response(JSON.stringify({ ok: true, content: 'hello' }), { status: 200 });
  }
  if (route.endsWith('/v1/operator/exec')) {
    return new Response(JSON.stringify({ ok: true, stdout: 'git version 2.x\n' }), { status: 200 });
  }
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};

const gateway = new RemoteOperatorGateway({
  capacityEndpoint: 'http://127.0.0.1:43210/nodes/proof-node',
  controlToken,
  clientToken,
  fetchImpl: fakeFetch,
});

const initialized = await executeRemoteOperatorMcpRpc({
  rpc: { jsonrpc: '2.0', id: 1, method: 'initialize' },
  gateway,
});
assert.equal(initialized.result.serverInfo.name, 'evercraft-remote-operator');

const listed = await executeRemoteOperatorMcpRpc({
  rpc: { jsonrpc: '2.0', id: 2, method: 'tools/list' },
  gateway,
});
assert.equal(listed.result.tools.length, 10);

const denied = await executeRemoteOperatorMcpRpc({
  rpc: {
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: { name: 'remote_operator_status', arguments: {} },
  },
  gateway,
  authorization: 'Bearer wrong',
});
assert.equal(denied.error.code, -32001);
assert.equal(seen.length, 0);

const status = await executeRemoteOperatorMcpRpc({
  rpc: {
    jsonrpc: '2.0',
    id: 4,
    method: 'tools/call',
    params: { name: 'remote_operator_status', arguments: {} },
  },
  gateway,
  authorization: 'Bearer ' + clientToken,
});
assert.equal(status.result.structuredContent.ok, true);
assert.equal(seen[0].authorization, 'Bearer ' + controlToken);

const network = await executeRemoteOperatorMcpRpc({
  rpc: {
    jsonrpc: '2.0',
    id: 41,
    method: 'tools/call',
    params: { name: 'remote_network_status', arguments: {} },
  },
  gateway,
  authorization: 'Bearer ' + clientToken,
});
assert.equal(
  network.result.structuredContent.schema,
  'evercraft.node-network-observation.v1'
);
assert.equal(network.result.structuredContent.authority.read_only, true);

const hostCapabilities = await executeRemoteOperatorMcpRpc({
  rpc: {
    jsonrpc: '2.0',
    id: 40,
    method: 'tools/call',
    params: { name: 'remote_host_capabilities', arguments: {} },
  },
  gateway,
  authorization: 'Bearer ' + clientToken,
});
assert.equal(
  hostCapabilities.result.structuredContent.schema,
  'evercraft.host-boundary-capability-status.v1'
);
assert.equal(hostCapabilities.result.structuredContent.capability_count, 1);
assert.equal(
  hostCapabilities.result.structuredContent.capabilities[0].mutation_authority,
  false
);

const genericHostCheck = await executeRemoteOperatorMcpRpc({
  rpc: {
    jsonrpc: '2.0',
    id: 400,
    method: 'tools/call',
    params: {
      name: 'remote_host_capability_check',
      arguments: {
        capability_id: 'chromeos.crostini.port-forwarding.read.v1',
        wait_ms: 0,
      },
    },
  },
  gateway,
  authorization: 'Bearer ' + clientToken,
});
assert.equal(
  genericHostCheck.result.structuredContent.schema,
  'evercraft.host-boundary-capability-check-result.v1'
);
assert.equal(
  genericHostCheck.result.structuredContent.capability_id,
  'chromeos.crostini.port-forwarding.read.v1'
);
assert.equal(genericHostCheck.result.structuredContent.mutation_authority, false);

const hostBoundary = await executeRemoteOperatorMcpRpc({
  rpc: {
    jsonrpc: '2.0',
    id: 42,
    method: 'tools/call',
    params: { name: 'remote_host_boundary_status', arguments: {} },
  },
  gateway,
  authorization: 'Bearer ' + clientToken,
});
assert.equal(
  hostBoundary.result.structuredContent.schema,
  'evercraft.chromeos-host-boundary-status.v1'
);
assert.equal(hostBoundary.result.structuredContent.fresh, true);
assert.equal(hostBoundary.result.structuredContent.mutation_supported, false);

const hostCheck = await executeRemoteOperatorMcpRpc({
  rpc: {
    jsonrpc: '2.0',
    id: 43,
    method: 'tools/call',
    params: { name: 'remote_host_boundary_check', arguments: { wait_ms: 5000 } },
  },
  gateway,
  authorization: 'Bearer ' + clientToken,
});
assert.equal(
  hostCheck.result.structuredContent.schema,
  'evercraft.chromeos-host-boundary-check-result.v1'
);
assert.equal(hostCheck.result.structuredContent.pending, true);
assert.equal(hostCheck.result.structuredContent.mutation_supported, false);
assert.equal(seen.at(-1).body.wait_ms, 5000);

const read = await executeRemoteOperatorMcpRpc({
  rpc: {
    jsonrpc: '2.0',
    id: 5,
    method: 'tools/call',
    params: {
      name: 'remote_read_file',
      arguments: { root_key: 'home', path: 'hello.txt' },
    },
  },
  gateway,
  authorization: 'Bearer ' + clientToken,
});
assert.equal(read.result.structuredContent.content, 'hello');

const exec = await executeRemoteOperatorMcpRpc({
  rpc: {
    jsonrpc: '2.0',
    id: 6,
    method: 'tools/call',
    params: {
      name: 'remote_exec',
      arguments: {
        root_key: 'home',
        program: 'git',
        args: ['--version'],
        approval_ref: 'proof:user-approved',
      },
    },
  },
  gateway,
  authorization: 'Bearer ' + clientToken,
});
assert.equal(exec.result.structuredContent.ok, true);
assert.equal(seen.at(-1).body.approval_ref, 'proof:user-approved');

for (const entry of seen) {
  assert.notEqual(entry.authorization, 'Bearer ' + clientToken);
  assert.equal(entry.authorization, 'Bearer ' + controlToken);
}

console.log(JSON.stringify({
  ok: true,
  schema: 'evercraft.remote-operator.mcp-gateway-proof.v1',
  client_token_separated_from_node_control_grant: true,
  unauthenticated_tool_calls_blocked: true,
  control_grant_not_returned_to_client: true,
  read_only_network_status_exposed: true,
  read_only_chromeos_host_boundary_exposed: true,
  on_demand_chromeos_host_check_exposed: true,
  typed_host_capability_registry_exposed: true,
  generic_typed_host_capability_dispatch_exposed: true,
}));
