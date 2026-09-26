import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';

const suite = JSON.parse(fs.readFileSync('chum-probes/probe-suite.json', 'utf8'));
const testCase = suite.cases.find((row) => row.case_id === 'media-overflow-001');
assert.ok(testCase);

let requestCount = 0;
const server = http.createServer((req, res) => {
  if (req.method !== 'POST' || req.url !== '/search') {
    res.writeHead(404).end();
    return;
  }
  let body = '';
  req.setEncoding('utf8');
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', () => {
    const payload = JSON.parse(body || '{}');
    assert.equal(payload?.query?.text, testCase.prompt);
    requestCount += 1;
    res.setHeader('content-type', 'application/json');
    if (requestCount < 3) {
      res.writeHead(503);
      res.end(JSON.stringify({ error: 'temporary upstream unavailable' }));
      return;
    }
    res.end(JSON.stringify({
      results: [{
        identifier: 'urn:test:forensiscope',
        displayName: 'ForensiScope',
        description: 'Long video transcription, timeline and evidence review.',
        url: 'https://evercraft-forensiscope.base44.app/',
        source: 'https://mock-federation.test'
      }]
    }));
  });
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert.equal(typeof address, 'object');
const searchUrl = `http://127.0.0.1:${address.port}/search`;

const exitCode = await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, ['systemia/chum/provider-probes.mjs'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      CHUM_PROBE_BRIDGE_URL: '',
      CHUM_PROBE_BRIDGE_TOKEN: '',
      NEXUS_PROBE_BRIDGE_URL: '',
      NEXUS_PROBE_BRIDGE_TOKEN: '',
      CHUM_REQUIRE_PROBE_BRIDGE: 'false',
      CHUM_PROBE_PROVIDERS: 'generic_agent',
      CHUM_PROBE_CASES: testCase.case_id,
      CHUM_GENERIC_AGENT_SEARCH_URL: searchUrl
    }
  });
  child.once('error', reject);
  child.once('exit', (code) => resolve(code));
});
await new Promise((resolve) => server.close(resolve));
assert.equal(exitCode, 0);

const receipt = JSON.parse(fs.readFileSync('artifacts/chum/provider-probe-latest.json', 'utf8'));
assert.equal(receipt.bridge_configured, false);
assert.equal(receipt.measurement_state, 'machine_only_measured');
assert.equal(receipt.summary.completed, 1);
assert.equal(receipt.summary.consumer_completed, 0);
assert.equal(receipt.summary.machine_completed, 1);
assert.equal(receipt.summary.pickup_observed, 1);
assert.equal(receipt.results[0]?.provider, 'generic_agent');
assert.equal(receipt.results[0]?.status, 'completed');
assert.equal(receipt.results[0]?.evaluation?.pickup_observed, true);
assert.equal(receipt.results[0]?.provider_receipt?.engine, 'federated_agent_discovery');
assert.equal(requestCount, 3);
assert.equal(receipt.results[0]?.provider_receipt?.attempt, 3);
assert.equal(receipt.results[0]?.provider_receipt?.max_attempts, 3);
assert.ok(receipt.results[0]?.provider_receipt?.response_sha256);
console.log('CHUM generic-agent live measurement proof passed.');
