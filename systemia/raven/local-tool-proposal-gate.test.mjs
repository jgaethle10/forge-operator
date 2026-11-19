import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PROPOSAL_TOOL, localOllamaOrigin, validateWorkProposal,
  evaluateToolResponse, inspectLocalToolProposal,
} from './local-tool-proposal-gate.mjs';

const ID = 'trial_001';
const example = { task_id: ID, operation: 'verify', target: 'reports/result.json', rationale: 'Confirm the artifact exists' };
const reply = (value = example, opts = {}) => ({ model: 'example:local', done: true,
  message: { role: 'assistant', content: '', tool_calls: [{ function: { name: 'submit_work_proposal', arguments: value } }] }, ...opts });
const fake = (output = reply()) => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    const body = String(url).endsWith('/api/tags') ?
      { models: [{ name: 'example:local', digest: 'sha256:fixture' }] } : output;
    return { ok: true, async text() { return JSON.stringify(body); } };
  };
  return { fetchImpl, calls };
};

test('local origin refuses remote hosts and URL credentials', () => {
  assert.equal(localOllamaOrigin('http://127.0.0.1:11434'), 'http://127.0.0.1:11434');
  for (const origin of ['https://localhost:11434', 'http://8.8.8.8:11434',
    'http://127.0.0.1:11434/other', 'http://x:y@localhost:11434',
    'http://localhost:11434/?token=abc']) assert.throws(() => localOllamaOrigin(origin));
});

test('tool schema exposes no shell or filesystem execution mechanism', () => {
  assert.equal(PROPOSAL_TOOL.function.name, 'submit_work_proposal');
  assert.deepEqual(PROPOSAL_TOOL.function.parameters.properties.operation.enum, ['inspect', 'draft', 'verify']);
  assert.equal(PROPOSAL_TOOL.function.parameters.additionalProperties, false);
});

test('strict proposal shape, task identity, and relative path', () => {
  assert.deepEqual(validateWorkProposal(example, ID), example);
  const bad = [
    { ...example, task_id: 'wrong' },
    { ...example, operation: 'run_shell' },
    { ...example, target: '../private.key' },
    { ...example, target: '/etc/passwd' },
    { ...example, target: 'dir/../../etc/passwd' },
    { ...example, target: 'dir\\escape' },
    { ...example, target: '.ssh/config' },
    { ...example, extra: 'ignore' },
    { ...example, rationale: '' },
  ];
  for (const item of bad) assert.throws(() => validateWorkProposal(item, ID));
});

test('tool result accepted whether SDK returns JSON arguments or a parsed object', () => {
  assert.equal(evaluateToolResponse(reply(), { model: 'example:local', taskId: ID }).proposal.operation, 'verify');
  assert.equal(evaluateToolResponse(reply(JSON.stringify(example)), { model: 'example:local', taskId: ID }).proposal.operation, 'verify');
});

test('rejects prose contamination, unexpected tools, multiple calls, bad JSON, and model mismatch', () => {
  const variants = [
    { ...reply(), message: { ...reply().message, content: 'Here is the answer' } },
    { ...reply(), message: { ...reply().message, tool_calls: [] } },
    { ...reply(), message: { ...reply().message, tool_calls: [reply().message.tool_calls[0], reply().message.tool_calls[0]] } },
    reply('{bad json'),
    reply({ ...example, target: '../escape' }),
    { ...reply(), model: 'other:local' },
    { ...reply(), done: false },
    { ...reply(), done_reason: 'length' },
  ];
  for (const item of variants) assert.throws(() => evaluateToolResponse(item, { model: 'example:local', taskId: ID }));
});

test('valid local Ollama call produces a proposal-only receipt, never action execution', async () => {
  const { fetchImpl, calls } = fake();
  const result = await inspectLocalToolProposal({ model: 'example:local', taskId: ID,
    objective: 'Verify the report', fetchImpl });
  assert.equal(result.status, 'validated_proposal_only');
  assert.equal(result.executable, false);
  assert.equal(result.code_executed, false);
  assert.equal(result.side_effects_authorized, false);
  assert.equal(result.model_downloads_authorized, false);
  assert.equal(result.proposal.target, 'reports/result.json');
  assert.match(result.objective_sha256, /^sha256:[0-9a-f]{64}$/);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].url, 'http://127.0.0.1:11434/api/chat');
  assert.equal(JSON.parse(calls[1].init.body).tools.length, 1);
  assert.equal(JSON.parse(calls[1].init.body).keep_alive, 0);
  assert.equal(calls[1].init.redirect, 'error');
});

test('missing model returns hold without even calling chat', async () => {
  const { fetchImpl, calls } = fake();
  const result = await inspectLocalToolProposal({ model: 'other:local', taskId: ID, objective: 'Test', fetchImpl });
  assert.equal(result.status, 'blocked');
  assert.equal(result.blocked_reason, 'model_not_installed');
  assert.equal(calls.length, 1);
});

test('unsupported proposals yield blocked receipts, without source leakage or tools executed', async () => {
  const { fetchImpl } = fake(reply({ ...example, operation: 'sudo' }));
  const result = await inspectLocalToolProposal({ model: 'example:local', taskId: ID,
    objective: 'Please do sudo things', fetchImpl });
  assert.equal(result.status, 'blocked');
  assert.equal(result.blocked_reason, 'proposal_operation_invalid');
  assert.equal(result.executable, false);
  assert.equal(result.proposal, undefined);
  assert.equal(JSON.stringify(result).includes('sudo things'), false);
});

test('invalid request options fail before any model or inventory call', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; throw new Error('unexpected'); };
  for (const options of [{ model: '../weird' }, { taskId: '../bad' }, { origin: 'http://example.com' },
    { timeoutMs: 0 }, { objective: '' }]) {
    await assert.rejects(inspectLocalToolProposal({
      model: 'example:local', taskId: ID, objective: 'Test', fetchImpl, ...options,
    }));
  }
  assert.equal(calls, 0);
});

test('transport errors hold without echoing secrets', async () => {
  const result = await inspectLocalToolProposal({ model: 'example:local', taskId: ID,
    objective: 'Do not expose user secret', fetchImpl: async () => { throw new Error('secret123'); } });
  assert.equal(result.status, 'blocked');
  assert.equal(result.blocked_reason, 'ollama_transport_error');
  assert.equal(JSON.stringify(result).includes('secret123'), false);
});
