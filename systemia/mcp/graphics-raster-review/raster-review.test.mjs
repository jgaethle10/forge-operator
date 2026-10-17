import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { renderArtDirectedSvg } from '../graphics-art-directed.mjs';
import { renderDataStorySvg } from '../graphics-data-story.mjs';
import { renderOwnedPreviewPng, verifyPngBytes, assertReviewSvg } from './raster-review.mjs';
import { buildReviewGallery } from './build-review-gallery.mjs';

const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const ART = {
  brandName: 'Evercraft', eyebrow: 'Synthetic proof',
  headline: 'Real PNG from our own SVG',
  subhead: 'A vector source with strict boundaries and no customer outcomes.',
  callToAction: 'Internal art review',
  treatment: 'orbit', palette: 'midnight', format: 'feed',
};
const DATA = {
  brandName: 'Evercraft', eyebrow: 'Mock chart',
  headline: 'Synthetic observations only',
  subhead: 'No independently observed figures.',
  methodNote: 'Invented categories for rendering tests.',
  chartType: 'bars', unit: 'count',
  measurementState: 'synthetic_example', palette: 'paper', format: 'square',
  sourceRefs: ['https://example.org/synthetic-data'],
  data: [{label:'North',value:15}, {label:'South',value:23}],
};

test('native resvg converts our vector artwork into real PNG with correct dimensions and hash', () => {
  const source = renderArtDirectedSvg(ART);
  const first = renderOwnedPreviewPng(source);
  const second = renderOwnedPreviewPng(source);
  assert.equal(first.receipt.mimeType, 'image/png');
  assert.equal(first.receipt.width, 1080);
  assert.equal(first.receipt.height, 1350);
  assert.ok(first.receipt.bytes > 1000);
  assert.equal(first.receipt.pngSha256, hash(first.png));
  assert.equal(first.receipt.svgSha256, hash(source.data));
  assert.equal(first.receipt.pngSha256, second.receipt.pngSha256);
  assert.equal(first.receipt.visualReviewState, 'not_independently_reviewed');
  assert.equal(first.receipt.paymentAuthority, false);
  assert.equal(first.receipt.publicationAuthority, false);
  assert.equal(first.receipt.buyerEntitlement, false);
  assert.equal(verifyPngBytes(first.png, 1080, 1350), true);
  assert.throws(() => verifyPngBytes(first.png, 900, 900), /integrity_or_dimensions/);
});

test('same pipeline produces full-size PNG from source-labeled data-story chart', () => {
  const source = renderDataStorySvg(DATA);
  const proof = renderOwnedPreviewPng(source);
  assert.equal(proof.receipt.width, 1080);
  assert.equal(proof.receipt.height, 1080);
  assert.equal(proof.receipt.sourceEvidenceState, 'client_references_not_verified');
  assert.equal(proof.receipt.svgSha256, source.sha256);
  assert.equal(proof.png.subarray(1, 4).toString(), 'PNG');
});

test('raster stage refuses tampering, arbitrary SVG, linked media and policy escalation', () => {
  const original = renderArtDirectedSvg(ART);
  const invalid = [
    { ...original, data: original.data + ' ' },
    { ...original, sha256: '0'.repeat(64) },
    { ...original, publicationAuthority: true },
    { ...original, paymentAuthority: true },
    { ...original, externalActionTaken: true },
    { ...original, mimeType: 'text/html' },
    { ...original, format: 'unknown' },
    { ...original, evidenceState: 'verified' },
  ];
  for (const bad of invalid) {
    assert.throws(() => renderOwnedPreviewPng(bad), /graphics_raster_/);
  }
  const injection = [
    '<image href="https://evil.example/tracker"/>',
    '<foreignObject width="5" height="5"/>',
    '<script>alert(1)</script>',
    '<style>@import url(https://evil.example/x.css)</style>',
    '<rect fill="url(https://evil.example/x.svg)"/>',
    '<use href="#malicious"/>',
  ];
  for (const markup of injection) {
    const updated = original.data.replace('</svg>', markup + '</svg>');
    assert.throws(() => assertReviewSvg(updated, original.format), /external_resource_forbidden/);
  }
});

test('gallery ships exact PNG and SVG bytes with matching manifest receipts without publishing', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-graphics-art-review-'));
  try {
    const folder = path.join(base, 'artwork');
    const manifest = buildReviewGallery(folder);
    assert.equal(manifest.contents.length, 6);
    assert.equal(manifest.allSynthetic, true);
    assert.equal(manifest.independentVisualAcceptance, false);
    assert.equal(manifest.founderVisualVerdict, 'rejected');
    assert.equal(manifest.presentationState, 'do_not_showcase');
    assert.equal(manifest.rejectionReasons.length, 5);
    assert.equal(manifest.releaseAuthorized, false);
    assert.equal(manifest.buyerPaid, false);
    const slugs = new Set();
    for (const entry of manifest.contents) {
      assert.ok(!slugs.has(entry.slug));
      slugs.add(entry.slug);
      const png = fs.readFileSync(path.join(folder, entry.png));
      const svg = fs.readFileSync(path.join(folder, entry.svg));
      assert.equal(hash(png), entry.receipt.pngSha256);
      assert.equal(hash(svg), entry.receipt.svgSha256);
      assert.equal(verifyPngBytes(png, entry.receipt.width, entry.receipt.height), true);
      assert.ok(entry.receipt.bytes > 1000);
      assert.equal(entry.receipt.visualReviewState, 'not_independently_reviewed');
    }
    assert.ok(fs.readFileSync(path.join(folder, 'gallery.html'), 'utf8').includes('Creative review failed.'));
    assert.ok(fs.readFileSync(path.join(folder, 'gallery.html'), 'utf8').includes('FOUNDER REJECTED'));
    assert.ok(fs.readFileSync(path.join(folder, 'manifest.json'), 'utf8').includes('sourcePr'));
    assert.throws(() => buildReviewGallery(folder), { code: 'EEXIST' });
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});
