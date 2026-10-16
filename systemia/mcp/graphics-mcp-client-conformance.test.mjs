import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';

const BRIEF = {
  product: 'Evercraft Visuals',
  offer: 'Creative preview',
  audience: 'Small businesses',
  offerUrl: 'https://example.org/evercraft-offer',
  priceUsd: 49,
  sourceRefs: ['https://example.org/evidence'],
  hook: 'A clearer picture',
  subhook: 'A synthetic example with verified rendering, not verified claims',
  cta: 'See what is possible',
  visualMetaphor: 'A visible path from confusion to clarity',
};

async function createIndependentServer() {
  const token = crypto.randomBytes(32).toString('hex');
  const script = [
    "import { createGraphicsMcpServer } from './systemia/mcp/graphics-department-server.mjs';",
    "const server = createGraphicsMcpServer({token: process.env.GRAPHICS_CLIENT_TEST_TOKEN});",
    "server.listen(0,'127.0.0.1',()=>process.stdout.write('PORT='+server.address().port+'\\n'));",
    "process.on('SIGTERM',()=>server.close(()=>process.exit(0)));",
  ].join('\n');

  const child = spawn(process.execPath, ['--input-type=module', '-e', script], {
    cwd: process.cwd(),
    env: { ...process.env, GRAPHICS_CLIENT_TEST_TOKEN: token },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const port = await new Promise((resolve, reject) => {
    let output = '';
    let errorOutput = '';
    const timeout = setTimeout(() => reject(new Error('Graphics child server did not start')), 8000);
    child.stdout.on('data', (data) => {
      output += data.toString();
      const match = output.match(/PORT=(\d+)/);
      if (match) { clearTimeout(timeout); resolve(Number(match[1])); }
    });
    child.stderr.on('data', (data) => { errorOutput += data.toString(); });
    child.on('error', (error) => { clearTimeout(timeout); reject(error); });
    child.on('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error('Graphics child process ended: ' + code + ' ' + errorOutput));
    });
  });

  return {
    base: 'http://127.0.0.1:' + port,
    token,
    async close() {
      if (child.exitCode !== null) return;
      await new Promise((resolve) => {
        const killTimer = setTimeout(() => {
          child.kill('SIGKILL');
          resolve();
        }, 3000);
        child.once('exit', () => { clearTimeout(killTimer); resolve(); });
        child.kill('SIGTERM');
      });
    },
  };
}

test('independent native HTTP client negotiates and receives digest-verifiable SVG preview', async () => {
  const server = await createIndependentServer();
  let id = 0;
  async function rpc(method, params) {
    const body = { jsonrpc: '2.0', id: ++id, method, ...(params ? { params } : {}) };
    const res = await fetch(server.base + '/mcp/graphics', {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + server.token,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'mcp-protocol-version': '2025-03-26',
      },
      body: JSON.stringify(body),
    });
    assert.equal(res.status, 200, method);
    assert.match(res.headers.get('content-type'), /application\/json/);
    return await res.json();
  }
  try {
    const init = await rpc('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'external-native-fixture', version: '0.1.0' } });
    assert.equal(init.result.protocolVersion, '2025-03-26');

    const discovered = await rpc('tools/list');
    const names = discovered.result.tools.map((item) => item.name);
    assert.ok(names.includes('graphics_preview_commercial'));
    assert.ok(names.includes('graphics_preview_motion_stage'));
    assert.ok(names.includes('graphics_preview_art_directed'));
    assert.ok(names.includes('graphics_preview_data_story'));

    const first = await rpc('tools/call', { name: 'graphics_preview_commercial', arguments: { ...BRIEF, format: 'feed' } });
    const asset = first.result.structuredContent;
    assert.ok(asset.data.startsWith('<svg '));
    assert.equal(asset.sha256, crypto.createHash('sha256').update(asset.data).digest('hex'));
    assert.equal(asset.externalActionTaken, false);
    assert.equal(asset.paymentAuthority, false);
    assert.equal(asset.publicationAuthority, false);
    const replay = await rpc('tools/call', { name: 'graphics_preview_commercial', arguments: { ...BRIEF, format: 'feed' } });
    assert.equal(replay.result.structuredContent.sha256, asset.sha256);

    const bad = await rpc('tools/call', { name: 'graphics_preview_commercial', arguments: { ...BRIEF, priceUsd: 'free' } });
    assert.equal(bad.result.isError, true);
    assert.equal(bad.result.structuredContent, undefined);

    const art = await rpc('tools/call', {
      name: 'graphics_preview_art_directed',
      arguments: {
        brandName: 'Evercraft', eyebrow: 'Creative intelligence',
        headline: 'Your ideas deserve clarity',
        subhead: 'Deterministic, client-directed vector artwork with clear provenance boundaries.',
        callToAction: 'See the concept', treatment: 'architecture', palette: 'cobalt', format: 'story',
      },
    });
    const directed = art.result.structuredContent;
    assert.equal(directed.mode, 'deterministic_art_directed_svg');
    assert.equal(directed.brandRightsState, 'client_asserted_not_verified');
    assert.equal(directed.sha256, crypto.createHash('sha256').update(directed.data).digest('hex'));
    assert.equal(directed.publicationAuthority, false);

    const dataGraphic = await rpc('tools/call', {
      name: 'graphics_preview_data_story',
      arguments: {
        brandName: 'Evercraft', eyebrow: 'Synthetic proof',
        headline: 'Three categories compared',
        subhead: 'Client-provided sample values to demonstrate consistent vector rendering.',
        methodNote: 'Synthetic dataset, no empirical claims.',
        chartType: 'bars', unit: 'count', measurementState: 'synthetic_example',
        format: 'feed', palette: 'cobalt',
        sourceRefs: ['https://example.org/synthetic-source'],
        data: [{label:'North',value:10},{label:'South',value:26},{label:'West',value:18}],
      },
    });
    const graph = dataGraphic.result.structuredContent;
    assert.equal(graph.mode, 'source_labeled_vector_chart_preview');
    assert.equal(graph.scale.min, 0);
    assert.match(graph.data, /NOT INDEPENDENTLY VERIFIED/);
    assert.equal(graph.sha256, crypto.createHash('sha256').update(graph.data).digest('hex'));
    assert.equal(graph.paymentAuthority, false);

    const motion = await rpc('tools/call', { name: 'graphics_preview_motion_stage', arguments: BRIEF });
    assert.equal(motion.result.structuredContent.mimeType, 'text/html');
    assert.equal(motion.result.structuredContent.actualVideoGenerated, false);

    const notification = await fetch(server.base + '/mcp/graphics', {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + server.token,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'mcp-protocol-version': '2025-03-26',
      },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    });
    assert.equal(notification.status, 202);
  } finally {
    await server.close();
  }
});
