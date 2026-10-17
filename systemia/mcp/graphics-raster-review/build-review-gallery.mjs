#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderArtDirectedSvg } from '../graphics-art-directed.mjs';
import { renderDataStorySvg } from '../graphics-data-story.mjs';
import { renderGraphicsPreview } from '../graphics-department.mjs';
import { renderOwnedPreviewPng } from './raster-review.mjs';

const ART = {
  brandName: 'Evercraft Graphics',
  eyebrow: 'Synthetic department proof',
  headline: 'An idea becomes a visual system',
  subhead: 'Original geometric artwork with repeatable rendering, never a claim about customer outcomes.',
  callToAction: 'Internal creative review',
};
const DATA = {
  brandName: 'Evercraft Graphics',
  eyebrow: 'Synthetic data studio',
  headline: 'Evidence deserves a readable picture',
  subhead: 'Mock observations illustrate scale, categories and source-state labels.',
  methodNote: 'Synthetic values invented only to exercise the chart engine.',
  unit: 'count',
  measurementState: 'synthetic_example',
  sourceRefs: ['https://example.org/synthetic-methodology'],
  data: [
    { label: 'North', value: 18 }, { label: 'South', value: 52 },
    { label: 'West', value: 32 }, { label: 'East', value: 44 },
  ],
};
const COMMERCIAL = {
  product: 'Evercraft Graphics',
  offer: 'Synthetic concept preview',
  audience: 'Creative technology teams',
  offerUrl: 'https://example.org/synthetic-offer',
  priceUsd: 49,
  sourceRefs: ['https://example.org/synthetic-source'],
  hook: 'Make ideas visible',
  subhook: 'Illustrative concept, not an actual customer campaign',
  cta: 'Explore the concept',
  visualMetaphor: 'Visitors discover clarity through an illustrative conversion path',
};
const EXAMPLES = [
  { slug: 'orbit-feed', title: 'Orbit · Feed', create: () => renderArtDirectedSvg({ ...ART, treatment: 'orbit', palette: 'midnight', format: 'feed' }) },
  { slug: 'architecture-hero-wide', title: 'Architecture · Wide', create: () => renderArtDirectedSvg({ ...ART, treatment: 'architecture', palette: 'paper', format: 'hero-wide' }) },
  { slug: 'type-story', title: 'Type · Story', create: () => renderArtDirectedSvg({ ...ART, treatment: 'type', palette: 'ember', format: 'story' }) },
  { slug: 'data-bars-square', title: 'Synthetic Bars · Square', create: () => renderDataStorySvg({ ...DATA, chartType: 'bars', format: 'square', palette: 'cobalt' }) },
  { slug: 'data-trend-feed', title: 'Synthetic Trend · Feed', create: () => renderDataStorySvg({ ...DATA, chartType: 'trend', format: 'feed', palette: 'midnight' }) },
  { slug: 'commercial-feed', title: 'Commercial Concept · Feed', create: () => renderGraphicsPreview({ ...COMMERCIAL, format: 'feed' }) },
];
function escapeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}
function saveNew(directory, filename, content) {
  fs.writeFileSync(path.join(directory, filename), content, { flag: 'wx' });
}
export function buildReviewGallery(directory) {
  const absolute = path.resolve(directory);
  fs.mkdirSync(absolute, { recursive: true });
  const records = [];
  for (const entry of EXAMPLES) {
    const preview = entry.create();
    const { png, receipt } = renderOwnedPreviewPng(preview);
    const pngName = entry.slug + '.png';
    const svgName = entry.slug + '.svg';
    saveNew(absolute, pngName, png);
    saveNew(absolute, svgName, preview.data);
    records.push({
      title: entry.title, slug: entry.slug,
      svg: svgName, png: pngName,
      sourceState: preview.evidenceState,
      receipt,
    });
  }
  const manifest = {
    schema: 'evercraft.graphics.raster-review-gallery.v1',
    sourceMission: 'evercraft-blackbox-distribution-20261012',
    sourcePr: 'https://github.com/jgaethle10/forge-operator/pull/1337',
    contents: records,
    allSynthetic: true,
    independentVisualAcceptance: false,
    founderVisualVerdict: 'rejected',
    founderVisualReviewDate: '2026-10-16',
    presentationState: 'do_not_showcase',
    founderVisualReviewRef: 'systemia/graphics-command/GRAPHICS_FOUNDER_VISUAL_REVIEW_20261016.md',
    rejectionReasons: [
      'Decorative geometry does not communicate the story',
      'Copy dominates instead of artwork carrying the message',
      'Same rigid template repeated across treatments',
      'Too much fine print for a phone-sized social post',
      'No compelling subject, licensed authentic imagery, or product-specific scene',
    ],
    releaseAuthorized: false,
    buyerPaid: false,
    sourceReferencesVerified: false,
    artifactDeliveryVerified: false,
  };
  const cards = records.map((record) =>
    '<figure><div class="thumb"><img loading="lazy" alt="' + escapeHtml(record.title) +
    ' synthetic proof" src="' + record.png + '"></div><figcaption><strong>' +
    escapeHtml(record.title) + '</strong><span>' +
    record.receipt.width + ' × ' + record.receipt.height + ' • PNG ' +
    record.receipt.bytes + ' bytes</span><a href="' + record.svg + '">Vector source</a></figcaption></figure>').join('\n');
  const html = '<!doctype html><html lang="en"><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Evercraft Graphics | Private Proof Gallery</title>' +
    '<style>body{background:#090d17;color:#f4f6f9;margin:0;font:16px/1.5 system-ui,sans-serif}' +
    'main{max-width:1320px;margin:0 auto;padding:48px 22px}h1{font-size:clamp(32px,6vw,60px);margin:0 0 12px}' +
    'p{color:#afb9ca;max-width:880px}section{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:24px;margin-top:32px}' +
    'figure{margin:0;border:1px solid #2b3947;border-radius:20px;overflow:hidden;background:#111a2a}' +
    '.thumb{height:400px;display:flex;justify-content:center;align-items:center;padding:20px;background:#202b3e}' +
    'img{max-width:100%;max-height:100%;object-fit:contain;box-shadow:0 12px 30px #0006}' +
    'figcaption{padding:16px;display:grid;gap:5px}span{font-size:13px;color:#91a6b8}a{color:#91d9ff}</style>' +
    '<main><p>EVERCRAFT GRAPHICS / FOUNDER REJECTED</p><h1>Rasterization passed. Creative review failed.</h1>' +
    '<p>Every image is generated from owned deterministic SVG code and accompanied by matching PNG/SVG SHA-256 receipts. ' +
    'All claims and data are synthetic. The founder rejected this gallery as generic and not showcase-worthy on 2026-10-16. ' +
    'This archive exists to reproduce the failure, not as a creative-portfolio example. ' +
    'Do not publish, sell, or imply client authorization from this gallery.</p>' +
    '<section>' + cards + '</section></main></html>';
  saveNew(absolute, 'manifest.json', JSON.stringify(manifest, null, 2) + '\n');
  saveNew(absolute, 'gallery.html', html);
  return manifest;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const destination = process.argv[2];
  if (!destination) throw new Error('Usage: node build-review-gallery.mjs <new-directory>');
  const receipt = buildReviewGallery(destination);
  process.stdout.write(JSON.stringify({
    generated: receipt.contents.length,
    output: path.resolve(destination),
    visualReviewAccepted: false,
    commercialReleaseAuthorized: false,
  }) + '\n');
}
