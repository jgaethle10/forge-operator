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
import { ART_FORMATS, ART_TREATMENTS, ART_PALETTES, renderArtDirectedSvg } from './graphics-art-directed.mjs';
import { renderDataStorySvg, normalizeDataStory } from './graphics-data-story.mjs';

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
    'graphics_get_capabilities', 'graphics_preview_commercial', 'graphics_preview_art_directed', 'graphics_preview_data_story', 'graphics_preview_motion_stage'
  ]);
  assert.ok(tools.every((tool) => tool.annotations.readOnlyHint));
  assert.equal(rpc('tools/call', { name: 'unknown' }).error.code, -32602);
  assert.equal(rpc('does/not/exist').error.code, -32601);
  const disclosure = rpc('tools/call', {name:'graphics_get_capabilities'}).result.structuredContent;
  assert.equal(disclosure.creativeReviewState, 'founder_rejected_generic_gallery_20261016');
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
    assert.equal(response.result.tools.length, 5);
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


test('art direction produces 48 deterministic layout, palette and format combinations', () => {
  const base = {
    brandName: 'Evercraft Media', eyebrow: 'Creative intelligence',
    headline: 'Build better visual stories',
    subhead: 'Synthetic vector proof with genuine variety of compositions and no invented customer outcomes.',
    callToAction: 'Explore the concept',
  };
  const hashes = new Set();
  for (const format of Object.keys(ART_FORMATS)) {
    for (const treatment of ART_TREATMENTS) {
      for (const palette of Object.keys(ART_PALETTES)) {
        const request = { ...base, format, treatment, palette };
        const output = renderArtDirectedSvg(request);
        assert.equal(output.ok, true);
        assert.match(output.data, /^<svg /);
        assert.match(output.data, /CONCEPT VISUAL/);
        assert.equal(output.sha256, crypto.createHash('sha256').update(output.data).digest('hex'));
        assert.equal(output.sha256, renderArtDirectedSvg(request).sha256);
        assert.equal(output.paymentAuthority, false);
        assert.equal(output.showcaseAuthority, false);
        assert.equal(output.creativeReviewState, 'founder_rejected_generic_gallery_20261016');
        assert.equal(output.publicationAuthority, false);
        hashes.add(output.sha256);
      }
    }
  }
  assert.equal(hashes.size, 48);
  const rpcResponse = rpc('tools/call', {
    name: 'graphics_preview_art_directed',
    arguments: { ...base, format: 'feed', treatment: 'orbit', palette: 'midnight' },
  });
  assert.equal(rpcResponse.result?.isError, false);
  assert.equal(rpcResponse.result?.structuredContent?.imageryState, 'synthetic_vector_art');
});

test('art-directed typography uses client-specific initials, not a generic fixed symbol', () => {
  const base = {
    brandName: 'Evercraft Graphics', eyebrow: 'Concept',
    headline: 'Brand-aware visual system',
    subhead: 'A synthetic typography preview', callToAction: 'Review',
    format: 'story', treatment: 'type', palette: 'ember',
  };
  const first = renderArtDirectedSvg(base);
  const second = renderArtDirectedSvg({ ...base, brandName: 'Blue Lantern' });
  assert.match(first.data, />EG<\/text>/u);
  assert.match(second.data, />BL<\/text>/u);
  assert.notEqual(first.sha256, second.sha256);
  assert.equal(first.publicationAuthority, false);
});

test('art directed tool rejects injection, spoofed formats and bidi controls', () => {
  const base = {
    brandName: 'Evercraft', eyebrow: 'Concept', headline: 'A story with a point',
    subhead: 'A concept, not customer evidence', callToAction: 'See more',
    format: 'feed', treatment: 'orbit', palette: 'midnight',
  };
  for (const request of [
    { ...base, format: 'execute-js' },
    { ...base, palette: 'url(https://example.org/a)' },
    { ...base, hidden: true },
    { ...base, headline: 'A\u202E B' },
  ]) {
    const response = rpc('tools/call', { name: 'graphics_preview_art_directed', arguments: request });
    assert.equal(response.result?.isError, true);
  }
  const escaped = renderArtDirectedSvg({ ...base, subhead: 'Never trust <script> & copy' });
  assert.doesNotMatch(escaped.data, /<script>/i);
  assert.match(escaped.data, /&lt;script&gt;/);
});


const DATA_STORY_BRIEF = {
  brandName: 'Evercraft Graphics',
  eyebrow: 'Synthetic market brief',
  headline: 'A clear view of change',
  subhead: 'Illustrative category comparison using client-provided information.',
  methodNote: 'Five synthetic observations to exercise graph layout.',
  chartType: 'bars',
  unit: 'count',
  measurementState: 'synthetic_example',
  format: 'feed',
  palette: 'midnight',
  sourceRefs: ['https://example.org/illustrative-methodology'],
  data: [
    { label: 'North', value: 32 }, { label: 'East', value: 14 },
    { label: 'South', value: 79 }, { label: 'West', value: 43 },
    { label: 'Central', value: 56 },
  ],
};

test('data-story renders 32 unique chart/format/palette variants with zero baseline and SHA-256', () => {
  const shapes = new Set();
  for (const chartType of ['bars', 'trend']) {
    for (const format of Object.keys(ART_FORMATS)) {
      for (const palette of Object.keys(ART_PALETTES)) {
        const request = { ...DATA_STORY_BRIEF, chartType, format, palette };
        const result = renderDataStorySvg(request);
        assert.equal(result.ok, true);
        assert.equal(result.chartType, chartType);
        assert.equal(result.mimeType, 'image/svg+xml');
        assert.match(result.data, /^<svg /);
        assert.match(result.data, /ZERO-BASED SCALE/);
        assert.match(result.data, /NOT INDEPENDENTLY VERIFIED/);
        assert.equal(result.scale.min, 0);
        assert.equal(result.scale.max, 100);
        assert.equal(result.dataCount, 5);
        assert.equal(result.sha256, crypto.createHash('sha256').update(result.data).digest('hex'));
        assert.equal(result.sha256, renderDataStorySvg(request).sha256);
        assert.equal(result.evidenceState, 'client_references_not_verified');
        assert.equal(result.externalActionTaken, false);
        assert.equal(result.paymentAuthority, false);
        assert.equal(result.publicationAuthority, false);
        shapes.add(result.sha256);
      }
    }
  }
  assert.equal(shapes.size, 32);
});

test('data-story source refs are preserved as unverified and graph data never auto-claims observed truth', () => {
  const request = {
    ...DATA_STORY_BRIEF, unit: 'percent',
    data: [{ label: 'A', value: 7 }, { label: 'B', value: 81 }],
    measurementState: 'client_reported',
  };
  const output = renderDataStorySvg(request);
  assert.equal(output.measurementState, 'client_reported');
  assert.equal(output.scale.max, 100);
  assert.deepEqual(output.sourceRefs, ['https://example.org/illustrative-methodology']);
  assert.match(output.data, /CLIENT REPORTED/);
  assert.match(output.data, /NOT INDEPENDENTLY VERIFIED/);
});

test('data-story fail-closed when numbers, references, axis labels, or method are invalid', () => {
  const invalid = [
    { ...DATA_STORY_BRIEF, data: [] },
    { ...DATA_STORY_BRIEF, data: [{label:'North',value:10}] },
    { ...DATA_STORY_BRIEF, data: [{label:'North',value:10},{label:'north',value:8}] },
    { ...DATA_STORY_BRIEF, data: [{label:'North',value:-1},{label:'South',value:4}] },
    { ...DATA_STORY_BRIEF, data: [{label:'North',value:Infinity},{label:'South',value:4}] },
    { ...DATA_STORY_BRIEF, data: [{label:'North',value:NaN},{label:'South',value:4}] },
    { ...DATA_STORY_BRIEF, sourceRefs: [] },
    { ...DATA_STORY_BRIEF, sourceRefs: ['http://example.org/record'] },
    { ...DATA_STORY_BRIEF, sourceRefs: ['https://localhost/private'] },
    { ...DATA_STORY_BRIEF, sourceRefs: ['https://example.org/one','https://example.org/one'] },
    { ...DATA_STORY_BRIEF, measurementState: 'verified_external' },
    { ...DATA_STORY_BRIEF, unit: 'USD', chartType: 'pie' },
    { ...DATA_STORY_BRIEF, unit: 'percent', data: [{label:'North',value:101},{label:'South',value:8}] },
    { ...DATA_STORY_BRIEF, chartType: 'trend', data: [{label:'A very long period',value:1},{label:'June',value:2}] },
    { ...DATA_STORY_BRIEF, extraSideEffect: true },
    { ...DATA_STORY_BRIEF, methodNote: '' },
    { ...DATA_STORY_BRIEF, methodNote: 'X\u202eY' },
  ];
  for (const request of invalid) {
    assert.throws(() => normalizeDataStory(request), /graphics_data_/);
    if (JSON.stringify(request).includes('null')) continue; // JSON cannot transmit NaN/Infinity
    const call = rpc('tools/call', { name: 'graphics_preview_data_story', arguments: request });
    assert.equal(call.result?.isError, true);
  }
});

test('SVG data story safely escapes client copy and does not permit markup injection', () => {
  const output = renderDataStorySvg({
    ...DATA_STORY_BRIEF, subhead: 'A study <script>alert(1)</script> & a second source',
    data: [{ label: '<unsafe>', value: 2 }, { label: 'Safe', value: 3 }],
  });
  assert.doesNotMatch(output.data, /<script/i);
  assert.doesNotMatch(output.data, /<unsafe>/i);
  assert.match(output.data, /&lt;unsafe&gt;/);
  assert.match(output.data, /&amp; a second source/);
});

test('MCP tool exposes a digest-verifiable data story with no publishing or billing authority', () => {
  const response = rpc('tools/call', { name: 'graphics_preview_data_story', arguments: DATA_STORY_BRIEF });
  assert.equal(response.error, undefined);
  assert.equal(response.result?.isError, false);
  const v = response.result.structuredContent;
  assert.equal(v.mode, 'source_labeled_vector_chart_preview');
  assert.equal(v.scale.min, 0);
  assert.equal(v.dataCount, 5);
  assert.equal(v.sha256, crypto.createHash('sha256').update(v.data).digest('hex'));
  assert.equal(v.publicationAuthority, false);
  assert.equal(v.paymentAuthority, false);
});
