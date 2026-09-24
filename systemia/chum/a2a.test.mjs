import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildAgentCard, discoveryLinkHeader, handleA2ARequest } from './a2a.mjs';

const catalog = JSON.parse(fs.readFileSync('public/.well-known/evercraft-machine-catalog.json', 'utf8'));

const card = buildAgentCard('https://forge.example.test/');
assert.equal(card.protocolVersion, '1.0');
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
}, catalog);

assert.equal(routed.status, 200);
assert.equal(routed.body.jsonrpc, '2.0');
assert.equal(routed.body.id, 'route-1');
assert.equal(routed.body.result.message.role, 'ROLE_AGENT');
const payload = routed.body.result.message.parts.find((part) => part.data)?.data;
assert.ok(payload);
assert.ok(payload.matches.length > 0);
assert.ok(payload.matches.some((match) => /FindMyPart/i.test(String(match.name))));
assert.equal(payload.doctrine.discoveryCreatesPaymentObligation, false);

const noMatch = handleA2ARequest({
  jsonrpc: '2.0',
  id: 'route-2',
  method: 'SendMessage',
  params: {
    message: {
      messageId: 'msg-2',
      role: 'ROLE_USER',
      parts: [{ text: 'zzzxxyyqqq nonmatching request' }],
    },
  },
}, catalog);
const noMatchPayload = noMatch.body.result.message.parts.find((part) => part.data)?.data;
assert.equal(noMatchPayload.matchCount, 0);

const badMethod = handleA2ARequest({
  jsonrpc: '2.0',
  id: 'bad-1',
  method: 'DeleteEverything',
  params: {},
}, catalog);
assert.equal(badMethod.body.error.code, -32601);

const links = discoveryLinkHeader();
assert.match(links, /agent-card\.json/);
assert.match(links, /llms\.txt/);
assert.match(links, /evercraft-discovery\.json/);
assert.match(links, /openapi\.json/);

console.log('CHUM A2A contract tests passed');
