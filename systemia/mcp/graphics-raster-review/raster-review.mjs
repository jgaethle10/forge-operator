import crypto from 'node:crypto';
import { Resvg } from '@resvg/resvg-js';
import { ART_FORMATS } from '../graphics-art-directed.mjs';

// Bounded rasterization of OWNED, internally-generated synthetic SVG previews.
// Intentionally NOT a general SVG upload/converter or external MCP tool.
const PNG_MAGIC = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const MAX_SVG_BYTES = 512 * 1024;
const MAX_PNG_BYTES = 6 * 1024 * 1024;
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

export function assertReviewSvg(svg, expectedFormat) {
  if (typeof svg !== 'string' || Buffer.byteLength(svg, 'utf8') > MAX_SVG_BYTES ||
      !svg.startsWith('<svg ') || !ART_FORMATS[expectedFormat]) {
    throw new Error('graphics_raster_invalid_owned_svg');
  }
  // Defense-in-depth: resvg supports external <image> resources. Never allow
  // fetch-capable, referential or script-bearing markup in the review worker.
  if (/<(?:image|script|foreignObject|use|iframe|object|style)\b/iu.test(svg) ||
      /<!(?:DOCTYPE|ENTITY|\[CDATA)/iu.test(svg) ||
      /<\?/u.test(svg) ||
      /\b(?:href|src)\s*=/iu.test(svg) ||
      /\b@import\b/iu.test(svg)) {
    throw new Error('graphics_raster_external_resource_forbidden');
  }
  const cssUrls = svg.match(/url\(\s*[^)]+\)/giu) || [];
  if (cssUrls.some((v) => !/^url\(\s*#[A-Za-z_][\w.-]*\s*\)$/u.test(v))) {
    throw new Error('graphics_raster_external_resource_forbidden');
  }
  const { width, height } = ART_FORMATS[expectedFormat];
  const exactSize = 'width="' + width + '" height="' + height + '"';
  const viewBox = 'viewBox="0 0 ' + width + ' ' + height + '"';
  if (!svg.includes(exactSize) || !svg.includes(viewBox)) {
    throw new Error('graphics_raster_size_mismatch');
  }
  return { width, height };
}

export function verifyPngBytes(buffer, width, height) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 33 || buffer.length > MAX_PNG_BYTES ||
      !buffer.subarray(0, 8).equals(PNG_MAGIC) ||
      buffer.subarray(12, 16).toString('ascii') !== 'IHDR' ||
      buffer.readUInt32BE(16) !== width || buffer.readUInt32BE(20) !== height) {
    throw new Error('graphics_raster_png_integrity_or_dimensions_failed');
  }
  // PNG's first image header is exactly 13 bytes; verify its CRC32 in tests
  // and leave a complete decoder pass to recipient/visual QA.
  if (buffer.readUInt32BE(8) !== 13) {
    throw new Error('graphics_raster_png_header_invalid');
  }
  return true;
}

export function renderOwnedPreviewPng(preview) {
  if (!preview || typeof preview !== 'object' ||
      !['image/svg+xml'].includes(preview.mimeType) ||
      preview.paymentAuthority !== false ||
      preview.publicationAuthority !== false ||
      preview.externalActionTaken !== false ||
      preview.evidenceState === 'verified' ||
      typeof preview.sha256 !== 'string' ||
      !/^[0-9a-f]{64}$/u.test(preview.sha256)) {
    throw new Error('graphics_raster_preview_authority_invalid');
  }
  const { width, height } = assertReviewSvg(preview.data, preview.format);
  const svgBytes = Buffer.from(preview.data, 'utf8');
  if (hash(svgBytes) !== preview.sha256) {
    throw new Error('graphics_raster_svg_hash_mismatch');
  }
  // Same runner and system fonts required for byte-identical replay.
  // Other OS/font environments must verify their own exact output receipt.
  const resvg = new Resvg(svgBytes, {
    fitTo: { mode: 'original' },
    font: { loadSystemFonts: true, defaultFontFamily: 'DejaVu Sans' },
  });
  const raster = resvg.render();
  if (raster.width !== width || raster.height !== height) {
    throw new Error('graphics_raster_engine_dimensions_mismatch');
  }
  const png = Buffer.from(raster.asPng());
  verifyPngBytes(png, width, height);
  return {
    png,
    receipt: {
      schema: 'evercraft.graphics.raster-review-receipt.v1',
      previewId: preview.previewId,
      format: preview.format,
      raster: 'png',
      mimeType: 'image/png',
      width,
      height,
      bytes: png.length,
      svgSha256: preview.sha256,
      pngSha256: hash(png),
      sourceEvidenceState: preview.evidenceState,
      visualReviewState: 'not_independently_reviewed',
      materialKind: 'synthetic_internal_review',
      renderer: '@resvg/resvg-js@2.6.2',
      buyerEntitlement: false,
      publicationAuthority: false,
      paymentAuthority: false,
      externalActionTaken: false,
    },
  };
}
