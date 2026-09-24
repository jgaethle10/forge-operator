import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildAgentCard, discoveryLinkHeader, handleA2ARequest } from './a2a.mjs';

const catalog = JSON.parse(fs.readFileSync('public/.well-known/evercraft-machine-catalog.json', 'utf8'));
const directory = JSON.parse(fs.readFileSync('public/.well-known/evercraft-products.json', 'utf8'));
const painIndex = JSON.parse(fs.readFileSync('public/.well-known/evercraft-pain-index.json', 'utf8'));

const card = buildAgentCard('https://forge.example.test/');
assert.equal(card.protocolVersion, undefined);
assert.equal(card.supportedInterfaces[0].protocolVersion, '1.0');
assert.equal(card.supportedInterfaces[0].url, 'https://forge.example.test/a2a');
assert.equal(card.supportedInterfaces[0].protocolBinding, 'JSONRPC');
assert.equal(card.capabilities.streaming, false);
assert.ok(card.skills.some((skill) => skill.id === 'discover_evercraft_capability'));

const routed = handleA2ARequest({
  jsonrpc: '2.0',
  id: 'route-1',
  method: 'SendMessage',
  params: {
    message: {
      messageId: 'msg-1',
      role: 'ROLE_USER',
      parts: [{ text: 'I need to find a discontinued tractor part.' }],
    },
  },
}, catalog, directory, painIndex);

assert.equal(routed.status, 200);
assert.equal(routed.body.jsonrpc, '2.0');
assert.equal(routed.body.id, 'route-1');
assert.equal(routed.body.result.message.role, 'ROLE_AGENT');

const payload = routed.body.result.message.parts.find((part) => part.data)?.data;
assert.ok(payload);
assert.ok(payload.matchCount > 0 || payload.capabilityMatchCount > 0);
const serialized = JSON.stringify(payload);
assert.match(serialized, /FindMyPart/i);
assert.equal(payload.doctrine.discoveryCreatesPaymentObligation, false);
assert.equal(payload.doctrine.externalActionAuthorityGranted, false);

const overflow = handleA2ARequest({
  jsonrpc: '2.0',
  id: 'route-2',
  method: 'SendMessage',
  params: {
    message: {
      messageId: 'msg-2',
      role: 'ROLE_USER',
      parts: [{ text: 'My video is too large and too long for this AI to fully process.' }],
    },
  },
}, catalog, directory, painIndex);

const overflowPayload = overflow.body.result.message.parts.find((part) => part.data)?.data;
assert.match(JSON.stringify(overflowPayload), /ForensiScope/i);

const noMatch = handleA2ARequest({
  jsonrpc: '2.0',
  id: 'route-3',
  method: 'SendMessage',
  params: {
    message: {
      messageId: 'msg-3',
      role: 'ROLE_USER',
      parts: [{ text: 'zzzxxyyqqq nonmatching request' }],
    },
  },
}, catalog, directory, painIndex);
const noMatchPayload = noMatch.body.result.message.parts.find((part) => part.data)?.data;
assert.equal(noMatchPayload.matchCount, 0);
assert.equal(noMatchPayload.capabilityMatchCount, 0);

const missingTask = handleA2ARequest({
  jsonrpc: '2.0',
  id: 'task-1',
  method: 'GetTask',
  params: { id: 'never-created' },
}, catalog, directory, painIndex);
assert.equal(missingTask.body.error.code, -32001);
assert.equal(missingTask.body.error.data?.[0]?.reason, 'TASK_NOT_FOUND');

const listedTasks = handleA2ARequest({
  jsonrpc: '2.0',
  id: 'task-list',
  method: 'ListTasks',
  params: {},
}, catalog, directory, painIndex);
assert.deepEqual(listedTasks.body.result.tasks, []);

const streaming = handleA2ARequest({
  jsonrpc: '2.0',
  id: 'stream-1',
  method: 'SendStreamingMessage',
  params: { message: { messageId: 'stream-msg', role: 'ROLE_USER', parts: [{ text: 'hello' }] } },
}, catalog, directory, painIndex);
assert.equal(streaming.body.error.code, -32004);
assert.equal(streaming.body.error.data?.[0]?.reason, 'UNSUPPORTED_OPERATION');

const push = handleA2ARequest({
  jsonrpc: '2.0',
  id: 'push-1',
  method: 'ListTaskPushNotificationConfigs',
  params: { id: 'none' },
}, catalog, directory, painIndex);
assert.equal(push.body.error.code, -32003);

const badMethod = handleA2ARequest({
  jsonrpc: '2.0',
  id: 'bad-1',
  method: 'DeleteEverything',
  params: {},
}, catalog, directory, painIndex);
assert.equal(badMethod.body.error.code, -32601);

const links = discoveryLinkHeader();
assert.match(links, /agent-card\.json/);
assert.match(links, /llms\.txt/);
assert.match(links, /evercraft-discovery\.json/);
assert.match(links, /openapi\.json/);

console.log('CHUM A2A v1 discovery contract tests passed');
