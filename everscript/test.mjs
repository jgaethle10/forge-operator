import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import {
  buildCapabilityIndex,
  compile,
  EverScriptCompileError,
  EverScriptExecutionError,
  MemoryMeter,
  MemoryReplayStore,
  run,
  signCapabilityManifest,
  verifyCapabilityManifest,
  verifyReceipt,
} from './everscript.mjs';
import { createAgentGateway } from './gateway.mjs';
import { buildAgentDescriptor, manifestsToMcpTools } from './agent-bridge.mjs';

const unsignedManifest = {
  name: 'ForensiScope',
  version: '1.0.0',
  description: 'Media analysis capability',
  public: true,
  actions: {
    analyze: { arity: 1, billable: true, approvalRecommended: true },
  },
};

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const manifest = signCapabilityManifest(unsignedManifest, privateKey, { keyId: 'evercraft-root-test' });
assert.equal(verifyCapabilityManifest(manifest, publicKey), true);

const tamperedManifest = structuredClone(manifest);
tamperedManifest.version = '9.9.9';
assert.equal(verifyCapabilityManifest(tamperedManifest, publicKey), false);

const source = `
mission AnalyzeMedia(file) {
  use ForensiScope@^1
  budget $2.00 USD
  timeout 5s
  replay prefer-replay
  require approval before ForensiScope.analyze
  receipt everything
  call ForensiScope.analyze(file) -> findings
  return findings
}
`;

const plan = compile(source, {
  manifests: [manifest],
  requireSignedManifests: true,
  trustedManifestKeys: { 'evercraft-root-test': publicKey },
});
assert.equal(plan.version, '0.3');
assert.equal(plan.budgetCents, 200);
assert.equal(plan.replayPolicy, 'prefer-replay');

let invokeCount = 0;
const adapter = {
  manifest,
  async quote(action, args) {
    assert.equal(action, 'analyze');
    assert.equal(args.length, 1);
    assert.equal(typeof args[0], 'string');
    return 25;
  },
  async invoke(action, args, context) {
    invokeCount += 1;
    assert.equal(context.approvalGranted, true);
    assert.ok(context.reservationId);
    return {
      value: { summary: 'mock findings' },
      costCents: 19,
      evidence: { provider: 'mock', action },
    };
  },
};

const meter = new MemoryMeter();
const replayStore = new MemoryReplayStore();
const result = await run(plan, { file: 'clip.mp4' }, {
  capabilities: [adapter],
  approvalProvider: { async request() { return true; } },
  meter,
  replayStore,
});
assert.equal(result.receipt.spentCents, 19);
assert.equal(result.receipt.entries.length, 1);
assert.equal(result.receipt.entries[0].status, 'succeeded');
assert.ok(result.receipt.entries[0].reservationId);
assert.ok(result.receipt.entries[0].settlementId);
assert.equal(verifyReceipt(result.receipt), true);
assert.equal(meter.snapshot().settlements.length, 1);
assert.equal(invokeCount, 1);

const replayed = await run(plan, { file: 'clip.mp4' }, {
  capabilities: [adapter],
  approvalProvider: { async request() { throw new Error('approval should not be requested on replay'); } },
  meter,
  replayStore,
});
assert.equal(replayed.receipt.spentCents, 0);
assert.equal(replayed.receipt.entries[0].replayed, true);
assert.equal(invokeCount, 1);
assert.equal(verifyReceipt(replayed.receipt), true);

const tamperedReceipt = structuredClone(result.receipt);
tamperedReceipt.entries[0].actualCostCents = 99;
assert.equal(verifyReceipt(tamperedReceipt), false);

assert.throws(() => compile(`
mission Bad(file) {
  call Ghost.run(file) -> out
  return out
}
`), EverScriptCompileError);

assert.throws(() => compile(`
mission Bad(file) {
  use ForensiScope@^2
  call ForensiScope.analyze(file) -> out
  return out
}
`, { manifests: [manifest] }), EverScriptCompileError);

assert.throws(() => compile(source, {
  manifests: [manifest],
  requireSignedManifests: true,
  trustedManifestKeys: { wrong: publicKey },
}), EverScriptCompileError);

const noReplayPlan = compile(source.replace('replay prefer-replay', 'replay prefer-live'), { manifests: [manifest] });
await assert.rejects(
  () => run(noReplayPlan, { file: 'clip.mp4' }, { capabilities: [adapter] }),
  (error) => error instanceof EverScriptExecutionError && error.message.includes('Human approval required'),
);

const expensiveAdapter = {
  manifest,
  async quote() { return 500; },
  async invoke() { throw new Error('must never invoke'); },
};
await assert.rejects(
  () => run(noReplayPlan, { file: 'clip.mp4' }, {
    capabilities: [expensiveAdapter],
    approvalProvider: { async request() { return true; } },
    meter: new MemoryMeter(),
  }),
  (error) => error instanceof EverScriptExecutionError && error.message.includes('Budget exceeded'),
);

const index = buildCapabilityIndex([manifest]);
assert.equal(index.kind, 'evercraft.capability-index');
assert.equal(index.capabilities[0].name, 'ForensiScope');


const mcpTools = manifestsToMcpTools([manifest]);
assert.equal(mcpTools.length, 1);
assert.equal(mcpTools[0].name, 'ForensiScope__analyze');
assert.equal(mcpTools[0].annotations.billable, true);
const descriptor = buildAgentDescriptor([manifest], { baseUrl: 'https://example.test' });
assert.equal(descriptor.execute, 'https://example.test/v1/run');
assert.equal(descriptor.capabilityIndex.capabilities[0].name, 'ForensiScope');

const gateway = createAgentGateway({
  capabilities: [adapter],
  approvalProvider: { async request() { return true; } },
  meter: new MemoryMeter(),
  replayStore: new MemoryReplayStore(),
  authorize: async (request) => request.headers.authorization === 'Bearer test-token',
  requireSignedManifests: true,
  trustedManifestKeys: { 'evercraft-root-test': publicKey },
});
await new Promise((resolve) => gateway.listen(0, '127.0.0.1', resolve));
const address = gateway.address();
const base = `http://127.0.0.1:${address.port}`;

const unauthorized = await fetch(`${base}/.well-known/everscript/capabilities`);
assert.equal(unauthorized.status, 401);

const headers = { authorization: 'Bearer test-token', 'content-type': 'application/json' };
const discovery = await fetch(`${base}/.well-known/everscript/capabilities`, { headers });
assert.equal(discovery.status, 200);
const discoveryBody = await discovery.json();
assert.equal(discoveryBody.capabilities[0].name, 'ForensiScope');

const agentDescriptorResponse = await fetch(`${base}/.well-known/evercraft-agent.json`, { headers });
assert.equal(agentDescriptorResponse.status, 200);
const agentDescriptorBody = await agentDescriptorResponse.json();
assert.equal(agentDescriptorBody.protocol, 'everscript');

const mcpResponse = await fetch(`${base}/v1/mcp/tools`, { headers });
assert.equal(mcpResponse.status, 200);
const mcpBody = await mcpResponse.json();
assert.equal(mcpBody.tools[0].name, 'ForensiScope__analyze');

const compileResponse = await fetch(`${base}/v1/compile`, {
  method: 'POST', headers, body: JSON.stringify({ source }),
});
assert.equal(compileResponse.status, 200);
const compileBody = await compileResponse.json();
assert.equal(compileBody.plan.version, '0.3');

const runResponse = await fetch(`${base}/v1/run`, {
  method: 'POST', headers, body: JSON.stringify({ source, input: { file: 'gateway.mp4' } }),
});
assert.equal(runResponse.status, 200);
const runBody = await runResponse.json();
assert.equal(runBody.receiptValid, true);
assert.equal(runBody.value.summary, 'mock findings');

await new Promise((resolve, reject) => gateway.close((error) => error ? reject(error) : resolve()));
console.log('EverScript v0.3 tests passed');
