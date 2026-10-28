import test from 'node:test';
import assert from 'node:assert/strict';
import {stageBrokerCaddyText} from '../scripts/stage-remote-broker-caddy.mjs';

const original=[
  '{',
  '  http_port 18080',
  '  https_port 8443',
  '  admin off',
  '}',
  '',
  '{$EVERCRAFT_PUBLIC_HOST} {',
  '  handle_path /home/* {',
  '    reverse_proxy 127.0.0.1:4310',
  '  }',
  '  handle {',
  '    reverse_proxy 127.0.0.1:8787',
  '  }',
  '}',
  '',
].join('\n');

test('route is staged only, Fabric and Home handles preserved, /nodes never exposed',()=>{
  const {staged,summary}=stageBrokerCaddyText(original);
  assert.equal(summary.public_ingress_activated,false);
  assert.equal(summary.public_nodes_route_created,false);
  assert.equal(summary.caddy_validated,false);
  assert.equal(summary.fabric_restart_performed,false);
  assert.ok(staged.includes('handle_path /home/* {'));
  assert.ok(staged.includes('reverse_proxy 127.0.0.1:4310'));
  assert.ok(staged.includes('reverse_proxy 127.0.0.1:8787'));
  assert.ok(staged.includes('handle /v1/remote/* {'));
  assert.ok(staged.includes('respond "Not Found" 404'));
  assert.ok(!staged.includes('handle /nodes/*'));
  assert.ok(staged.indexOf('handle /v1/remote/*')<staged.indexOf('handle {'));
  assert.deepEqual(summary.agent_post_routes,[
    '/v1/remote/enrollment/challenge','/v1/remote/enrollment/request',
    '/v1/remote/challenge','/v1/remote/register',
    '/v1/remote/agent/poll','/v1/remote/agent/result',
  ]);
});
test('unknown host, absent fabric proxy, or existing broker route holds',()=>{
  assert.throws(()=>stageBrokerCaddyText(original.replace('{$EVERCRAFT_PUBLIC_HOST}','fabric.test')),/host_block/);
  assert.throws(()=>stageBrokerCaddyText(original.replace('127.0.0.1:8787','127.0.0.1:8001')),/proxy_missing/);
  assert.throws(()=>stageBrokerCaddyText(original+'/v1/remote/register'),/already_configured/);
  const staged=stageBrokerCaddyText(original).staged;
  assert.throws(()=>stageBrokerCaddyText(staged),/already_contains_broker/);
});
