import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { buildTrace, buildTraces, localCollectorURL, sendTraces } from '../integrations/neatroots/checkout-evidence-demo.mjs';

const script = resolve(dirname(fileURLToPath(import.meta.url)), '../integrations/neatroots/checkout-evidence-demo.mjs');

test('exposes two explicitly synthetic, same-evidence scenarios', () => {
  const [bad, good] = buildTraces();
  assert.equal(bad.project, 'evercraft-checkout-evidence-demo');
  assert.equal(bad.metadata.synthetic, true);
  assert.equal(good.metadata.synthetic, true);
  assert.equal(bad.children.length, 3);
  assert.deepEqual(bad.children.slice(0, 2), good.children.slice(0, 2));
  assert.equal(bad.children[1].status, 'ERROR');
  assert.match(bad.output, /payment confirmed/i);
  assert.match(good.output, /payment is unverified.*fulfillment is blocked/i);
});

test('no real order information, provider tokens, or real checkout links', () => {
  const raw = JSON.stringify(buildTraces());
  assert.match(raw, /example\.invalid/);
  assert.match(raw, /DEMO-1001/);
  assert.doesNotMatch(raw, /sk_(test|live)_|ghp_|Bearer |api[_-]?key/i);
  assert.doesNotMatch(raw, /stripe\.com|evercraftpropertyservices\.com/i);
});

test('rejects unknown scenario', () => {
  assert.throws(() => buildTrace('real_production'), /Unknown synthetic scenario/);
});

test('collector URL is loopback-only and disallows query/path tricks', () => {
  assert.equal(localCollectorURL(), 'http://127.0.0.1:4100/v1/trace');
  assert.equal(localCollectorURL('http://localhost:5102'), 'http://localhost:5102/v1/trace');
  for (const url of [
    'https://localhost:4100', 'http://localhost.evil.test:4100',
    'http://10.10.0.1:4100', 'http://user:pass@localhost:4100',
    'http://localhost:4100/other', 'http://localhost:4100?foo=bar',
  ]) assert.throws(() => localCollectorURL(url), /Only a local/);
});

test('both traces POST to the documented local /v1/trace API', async () => {
  const received = [];
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    received.push({ method: req.method, path: req.url, type: req.headers['content-type'], trace: JSON.parse(Buffer.concat(chunks)) });
    res.writeHead(202, { 'content-type': 'application/json' });
    res.end('{"accepted":true}');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address();
    const receipts = await sendTraces(buildTraces(), { endpoint: `http://127.0.0.1:${port}` });
    assert.deepEqual(receipts.map(r => r.status), [202, 202]);
    assert.deepEqual(received.map(r => r.path), ['/v1/trace', '/v1/trace']);
    assert.deepEqual(received.map(r => r.method), ['POST', 'POST']);
    assert.deepEqual(received.map(r => r.type), ['application/json', 'application/json']);
    assert.deepEqual(received.map(r => r.trace.metadata.scenario), ['false_success', 'truthful_block']);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('rejects non-2xx collector response instead of reporting accepted', async () => {
  const fake = async () => ({ ok: false, status: 500 });
  await assert.rejects(() => sendTraces(buildTraces(), { fetchImpl: fake }), /HTTP 500/);
});

test('CLI generates two JSONL traces without contacting a server', () => {
  const result = spawnSync(process.execPath, [script], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const traces = result.stdout.trim().split('\n').map(x => JSON.parse(x));
  assert.deepEqual(traces, buildTraces());
});
