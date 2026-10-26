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
  // Test-only trusted approval ledger stub. No production verifier is wired.
  approvalVerifier: async req => ({
    ...req, approved: req.approval_ref === 'proof:user-approved',
    one_time_consumed: req.approval_ref === 'proof:user-approved',
  }),
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
assert.equal(listed.result.tools.length, 6);

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


const withoutVerifier = new RemoteOperatorGateway({
  capacityEndpoint: 'http://127.0.0.1:43210/nodes/proof-node',
  controlToken, clientToken, fetchImpl: fakeFetch,
});
const beforeDenied = seen.length;
const deniedMutation = await executeRemoteOperatorMcpRpc({
  rpc: { jsonrpc:'2.0', id:61, method:'tools/call',
    params:{name:'remote_exec',arguments:{root_key:'home',program:'git',
      args:['--version'],approval_ref:'anything:even-if-present'}} },
  gateway: withoutVerifier, authorization:'Bearer '+clientToken,
});
assert.equal(deniedMutation.error.message,'remote_operator_scoped_approval_verifier_not_configured');
assert.equal(seen.length,beforeDenied);

const forgedApproval = await executeRemoteOperatorMcpRpc({
  rpc: { jsonrpc:'2.0',id:62,method:'tools/call',
    params:{name:'remote_write_file',arguments:{root_key:'home',path:'notes.txt',
      content:'changed',approval_ref:'unverified:fake-owner'}} },
  gateway,authorization:'Bearer '+clientToken,
});
assert.equal(forgedApproval.error.message,'remote_operator_scoped_approval_denied');
assert.equal(seen.length,beforeDenied);

const mismatchedVerifier = new RemoteOperatorGateway({
  capacityEndpoint:'http://127.0.0.1:43210/nodes/proof-node',
  controlToken,clientToken,fetchImpl:fakeFetch,
  approvalVerifier:async req=>({...req,approved:true,one_time_consumed:true,
    root_key:'different-root'}),
});
const wrongNodeVerifier = new RemoteOperatorGateway({
  capacityEndpoint:'http://127.0.0.1:43210/nodes/proof-node',
  controlToken,clientToken,fetchImpl:fakeFetch,
  approvalVerifier:async req=>({
    ...req,approved:true,one_time_consumed:true,
    node_id:'some-other-authorized-node',
  }),
});
const beforeWrongNode = seen.length;
const wrongNode = await executeRemoteOperatorMcpRpc({
  rpc:{jsonrpc:'2.0',id:64,method:'tools/call',
    params:{name:'remote_exec',arguments:{root_key:'home',program:'git',
      args:['--version'],approval_ref:'proof:owner-approved'}}},
  gateway:wrongNodeVerifier,authorization:'Bearer '+clientToken,
});
assert.equal(wrongNode.error.message,'remote_operator_scoped_approval_denied');
assert.equal(seen.length,beforeWrongNode);

const scopeMismatch = await executeRemoteOperatorMcpRpc({
  rpc:{jsonrpc:'2.0',id:63,method:'tools/call',
    params:{name:'remote_exec',arguments:{root_key:'home',program:'git',
      args:['--version'],approval_ref:'proof:owner-approved'}}},
  gateway:mismatchedVerifier,authorization:'Bearer '+clientToken,
});
assert.equal(scopeMismatch.error.message,'remote_operator_scoped_approval_denied');
assert.equal(seen.length,beforeDenied);

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
}));
