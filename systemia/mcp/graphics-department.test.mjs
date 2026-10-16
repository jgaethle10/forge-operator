import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import {
  graphicsDepartmentTools,
  renderGraphicsPreview,
  executeGraphicsMcpRpc,
} from './graphics-department.mjs';
import { createGraphicsMcpServer } from './graphics-department-server.mjs';

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

const rpc = (method, params = {}, id = 1) => executeGraphicsMcpRpc({ jsonrpc: '2.0', id, method, params });

test('MCP initialize, discovery, safe annotations and unknown tool', () => {
  assert.equal(rpc('initialize').result.serverInfo.name, 'evercraft-graphics-preview');
  const tools = rpc('tools/list').result.tools;
  assert.deepEqual(tools.map((tool) => tool.name), [
    'graphics_get_capabilities', 'graphics_preview_commercial', 'graphics_preview_motion_stage'
  ]);
  assert.ok(tools.every((tool) => tool.annotations.readOnlyHint));
  assert.equal(rpc('tools/call', { name: 'unknown' }).error.code, -32602);
  assert.equal(rpc('does/not/exist').error.code, -32601);
  assert.equal(executeGraphicsMcpRpc({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);
});


test('safe discovery tool returns correction-friendly error for unexpected input', () => {
  const r = rpc('tools/call', { name: 'graphics_get_capabilities', arguments: { unsafe: true } });
  assert.equal(r.result.isError, true);
  assert.equal(r.error, undefined);
});

test('same brief produces byte-identical SVG with SHA-256 receipt and synthetic truth', () => {
  const one = renderGraphicsPreview(BRIEF);
  const two = renderGraphicsPreview(BRIEF);
  assert.equal(one.mimeType, 'image/svg+xml');
  assert.ok(one.data.startsWith('<svg '));
  assert.equal(one.data, two.data);
  assert.equal(one.sha256, crypto.createHash('sha256').update(one.data).digest('hex'));
  assert.equal(one.evidenceState, 'customer_supplied_unverified');
  assert.equal(one.imageryState, 'synthetic_visualization');
  assert.equal(one.pricingState, 'seller_supplied_unverified');
  assert.equal(one.publicationAuthority, false);
  assert.equal(one.paymentAuthority, false);
  assert.equal(one.actualVideoGenerated, false);
  assert.equal(one.externalActionTaken, false);
});

test('all four supported publication formats render and retain synthetic footer', () => {
  for (const format of ['feed', 'square', 'story', 'hero-wide']) {
    const preview = renderGraphicsPreview({ ...BRIEF, format });
    assert.equal(preview.format, format);
    assert.match(preview.data, /SYNTHETIC VISUAL/);
    assert.ok(preview.score >= 0.9);
  }
});

test('HTML motion is an inspectable stage, never a video rendering claim', () => {
  const preview = renderGraphicsPreview(BRIEF, { motion: true });
  assert.equal(preview.mimeType, 'text/html');
  assert.match(preview.data, /window\.__evercraftRenderFrame/);
  assert.equal(preview.actualVideoGenerated, false);
  assert.equal(preview.publicationAuthority, false);
  assert.equal(preview.format, 'story');
});

test('malicious markup, untrusted URLs, unexpected keys, and false prices fail closed', () => {
  const bad = [
    { ...BRIEF, hook: '<script>alert(1)</script>' },
    { ...BRIEF, offerUrl: 'javascript:alert(1)' },
    { ...BRIEF, offerUrl: 'http://example.org' },
    { ...BRIEF, offerUrl: 'https://127.0.0.1/private' },
    { ...BRIEF, sourceRefs: ['https://localhost/private'] },
    { ...BRIEF, sourceRefs: [] },
    { ...BRIEF, priceUsd: -1 },
    { ...BRIEF, priceUsd: '49' },
    { ...BRIEF, extraAuthority: true },
    { ...BRIEF, hook: 'A'.repeat(35) },
    { ...BRIEF, format: '../secret' },
  ];
  for (const invalid of bad) {
    const response = rpc('tools/call', { name: 'graphics_preview_commercial', arguments: invalid });
    assert.equal(response.result?.isError, true, JSON.stringify(invalid));
    assert.equal(response.result?.structuredContent, undefined);
  }
});

test('RPC preview exposes actual machine-readable output without external effect', () => {
  const response = rpc('tools/call', { name: 'graphics_preview_commercial', arguments: BRIEF });
  assert.equal(response.result.structuredContent.ok, true);
  assert.equal(response.result.structuredContent.paymentAuthority, false);
  assert.equal(response.result.structuredContent.externalActionTaken, false);
  assert.equal(response.result.isError, false);
});

async function liveServer(fn) {
  const token = 'only-for-test-' + 'z'.repeat(48);
  const server = createGraphicsMcpServer({ token });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try { await fn({ base: 'http://127.0.0.1:' + port, token }); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

test('HTTP gateway requires a strong bearer secret', () => {
  assert.throws(() => createGraphicsMcpServer({ token: 'short' }), /token_missing_or_short/);
});

test('HTTP gateway authenticates discovery and denies unauthenticated access', async () => {
  await liveServer(async ({ base, token }) => {
    const request = JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/list' });
    const wrong = await fetch(base + '/mcp/graphics', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: request,
    });
    assert.equal(wrong.status, 401);
    const good = await fetch(base + '/mcp/graphics', {
      method: 'POST', headers: {
        authorization: 'Bearer ' + token,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      }, body: request,
    });
    assert.equal(good.status, 200);
    const response = await good.json();
    assert.equal(response.result.tools.length, 3);
    const deniedGet = await fetch(base + '/mcp/graphics', {
      headers: { authorization: 'Bearer ' + token },
    });
    assert.equal(deniedGet.status, 405);
    const deniedType = await fetch(base + '/mcp/graphics', {
      method: 'POST', headers: { authorization: 'Bearer ' + token, 'content-type': 'text/plain' },
      body: request,
    });
    assert.equal(deniedType.status, 415);
  });
});

test('oversize RPC request returns 413 without producing graphics', async () => {
  await liveServer(async ({ base, token }) => {
    const response = await fetch(base + '/mcp/graphics', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 8, method: 'tools/call', params: {
        name: 'graphics_preview_commercial', arguments: { ...BRIEF, hook: 'X'.repeat(140000) },
      } }),
    });
    assert.equal(response.status, 413);
  });
});

test('HTTP transport refuses browser origins, rebinding host and unsupported protocol', async () => {
  await liveServer(async ({ base, token }) => {
    const body = JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'tools/list' });
    const headers = { authorization: 'Bearer ' + token, 'content-type': 'application/json' };
    const origin = await fetch(base + '/mcp/graphics', {
      method: 'POST', headers: { ...headers, origin: 'https://hostile.example' }, body,
    });
    assert.equal(origin.status, 403);
    // Native fetch may replace Host with the URL's authority. Use raw HTTP
    // to actually send the attacker-controlled Host header on the wire.
    const rebindingStatus = await new Promise((resolve, reject) => {
      const target = new URL(base);
      const request = http.request({
        hostname: target.hostname,
        port: target.port,
        path: '/mcp/graphics',
        method: 'POST',
        headers: { ...headers, host: 'evil.example:5000', 'content-length': Buffer.byteLength(body) },
      }, (response) => {
        response.resume();
        response.on('end', () => resolve(response.statusCode));
      });
      request.on('error', reject);
      request.end(body);
    });
    assert.equal(rebindingStatus, 403);
    const protocol = await fetch(base + '/mcp/graphics', {
      method: 'POST', headers: { ...headers, 'mcp-protocol-version': '2026-07-28' }, body,
    });
    assert.equal(protocol.status, 400);
    const compatible = await fetch(base + '/mcp/graphics', {
      method: 'POST', headers: { ...headers, 'mcp-protocol-version': '2025-03-26' }, body,
    });
    assert.equal(compatible.status, 200);
  });
});
