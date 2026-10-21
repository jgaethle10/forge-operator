import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  ART_FORMATS, ART_TREATMENTS, ART_PALETTES,
  normalizeArtBrief, fitArtText, renderArtDirectedSvg,
} from './graphics-art-directed.mjs';
import { executeGraphicsMcpRpc } from './graphics-department.mjs';

const BRIEF = {
  brandName: 'Evercraft Media',
  eyebrow: 'Creative technology',
  headline: 'Turn information into understanding',
  subhead: 'A concept for translating complex subjects into expressive, editable visual assets.',
  callToAction: 'Explore the possibilities',
  treatment: 'orbit',
  palette: 'midnight',
  format: 'feed',
};
const invoke = (arguments_) => executeGraphicsMcpRpc({
  jsonrpc: '2.0', id: 9, method: 'tools/call',
  params: { name: 'graphics_preview_art_directed', arguments: arguments_ },
});

test('all 48 layout combinations emit distinct safe deterministic SVG artwork', () => {
  const variants = new Set();
  for (const format of Object.keys(ART_FORMATS)) {
    for (const treatment of ART_TREATMENTS) {
      for (const palette of Object.keys(ART_PALETTES)) {
        const request = { ...BRIEF, format, treatment, palette };
        const result = renderArtDirectedSvg(request);
        assert.equal(result.ok, true);
        assert.equal(result.mimeType, 'image/svg+xml');
        assert.equal(result.format, format);
        assert.equal(result.treatment, treatment);
        assert.equal(result.palette, palette);
        assert.match(result.data, /^<svg /);
        assert.match(result.data, /CONCEPT VISUAL/);
        assert.equal(result.sha256, crypto.createHash('sha256').update(result.data).digest('hex'));
        assert.equal(result.sha256, renderArtDirectedSvg(request).sha256);
        assert.equal(result.imageryState, 'synthetic_vector_art');
        assert.equal(result.paymentAuthority, false);
        assert.equal(result.publicationAuthority, false);
        assert.equal(result.actualVideoGenerated, false);
        assert.equal(result.externalActionTaken, false);
        variants.add(result.sha256);
        const { width, height } = ART_FORMATS[format];
        assert.ok(result.data.includes('viewBox="0 0 ' + width + ' ' + height + '"'));
      }
    }
  }
  assert.equal(variants.size, 48);
});

test('creative treatment changes geometry rather than only the palette', () => {
  const orbit = renderArtDirectedSvg(BRIEF).data;
  const architecture = renderArtDirectedSvg({ ...BRIEF, treatment: 'architecture' }).data;
  const type = renderArtDirectedSvg({ ...BRIEF, treatment: 'type' }).data;
  assert.notEqual(orbit, architecture);
  assert.notEqual(orbit, type);
  assert.notEqual(architecture, type);
  assert.match(orbit, /stroke-dasharray/);
  assert.match(type, /stroke-linejoin="miter"/, 'expected distinguishing geometry from type treatment');
});

test('hostile text is escaped, never executed or interpreted as SVG markup', () => {
  const result = renderArtDirectedSvg({ ...BRIEF, subhead: 'Better <script>alert("bad")</script> & clarity' });
  assert.doesNotMatch(result.data, /<script>/i);
  assert.match(result.data, /&lt;script&gt;/);
  assert.match(result.data, /&amp; clarity/);
  const headline = renderArtDirectedSvg({ ...BRIEF, headline: 'Learn & build <trust>' });
  assert.match(headline.data, /Learn &amp; build/);
  assert.match(headline.data, /&lt;trust&gt;/);
});

test('invalid geometry directives, scripts in object keys, hidden bidi and excessive input fail closed', () => {
  const invalid = [
    { ...BRIEF, palette: '#abc123' },
    { ...BRIEF, treatment: 'render-png' },
    { ...BRIEF, format: 'large-freeform' },
    { ...BRIEF, unexpectedHtml: '<img/>' },
    { ...BRIEF, headline: '' },
    { ...BRIEF, headline: 'Z'.repeat(91) },
    { ...BRIEF, brandName: 'X\u202EY' },
    { ...BRIEF, subhead: 'X\nY' },
    { ...BRIEF, callToAction: false },
  ];
  for (const input of invalid) {
    assert.throws(() => normalizeArtBrief(input), /graphics_art_/);
    const rpc = invoke(input);
    assert.equal(rpc.result?.isError, true);
    assert.equal(rpc.result?.structuredContent, undefined);
  }
});

test('art-directed MCP tool returns SHA-verifiable data with client copy disclaimer', () => {
  const result = invoke(BRIEF);
  assert.equal(result.error, undefined);
  assert.equal(result.result.isError, false);
  const output = result.result.structuredContent;
  assert.equal(output.schema, 'evercraft.graphics-mcp.art-directed-preview.v1');
  assert.equal(output.brandRightsState, 'client_asserted_not_verified');
  assert.equal(output.evidenceState, 'client_copy_unverified');
  assert.equal(output.sha256, crypto.createHash('sha256').update(output.data).digest('hex'));
});

test('text fitting has deterministic cap and fail-close behavior', () => {
  assert.deepEqual(fitArtText('SHORT TITLE', 900, 4, 90, 60).lines, ['SHORT TITLE']);
  assert.throws(() => fitArtText('LONG '.repeat(100), 100, 1, 70, 68), /does_not_fit/);
});
