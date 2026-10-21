import crypto from 'node:crypto';

export const ART_FORMATS = Object.freeze({
  feed: { width: 1080, height: 1350 },
  square: { width: 1080, height: 1080 },
  story: { width: 1080, height: 1920 },
  'hero-wide': { width: 1600, height: 900 },
});

export const ART_TREATMENTS = Object.freeze(['orbit', 'architecture', 'type']);
export const ART_PALETTES = Object.freeze({
  midnight: { background: '#091321', ink: '#F8F6EE', muted: '#B0C2CA', accent: '#B9FF6A', hairline: '#304654', panel: '#152D3F' },
  paper: { background: '#F5F0E7', ink: '#1B2928', muted: '#596F65', accent: '#C1532E', hairline: '#CFD4CA', panel: '#DDE6DC' },
  ember: { background: '#1C1320', ink: '#FFF2E8', muted: '#D5B9AD', accent: '#FF8E61', hairline: '#493240', panel: '#36202F' },
  cobalt: { background: '#121C42', ink: '#F8FAFF', muted: '#AFBFDE', accent: '#75DCFF', hairline: '#374C73', panel: '#1D3261' },
});

export const ART_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    brandName: { type: 'string', minLength: 1, maxLength: 42 },
    eyebrow: { type: 'string', minLength: 1, maxLength: 52 },
    headline: { type: 'string', minLength: 1, maxLength: 90 },
    subhead: { type: 'string', minLength: 1, maxLength: 160 },
    callToAction: { type: 'string', minLength: 1, maxLength: 60 },
    treatment: { type: 'string', enum: ART_TREATMENTS },
    palette: { type: 'string', enum: Object.keys(ART_PALETTES) },
    format: { type: 'string', enum: Object.keys(ART_FORMATS) },
  },
  required: ['brandName', 'eyebrow', 'headline', 'subhead', 'callToAction', 'treatment', 'palette', 'format'],
};

const allowed = Object.keys(ART_SCHEMA.properties);
function safeText(input, key, maximum) {
  if (typeof input !== 'string' || input.length > maximum || !input.trim() ||
      /[\u0000-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/u.test(input)) {
    throw new Error('graphics_art_invalid_' + key);
  }
  return input.replace(/\s+/gu, ' ').trim();
}
export function normalizeArtBrief(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some((key) => !allowed.includes(key))) {
    throw new Error('graphics_art_unexpected_arguments');
  }
  const result = {};
  for (const [key, maximum] of [
    ['brandName', 42], ['eyebrow', 52], ['headline', 90],
    ['subhead', 160], ['callToAction', 60],
  ]) result[key] = safeText(input[key], key, maximum);
  for (const [key, options] of [
    ['treatment', ART_TREATMENTS],
    ['palette', Object.keys(ART_PALETTES)],
    ['format', Object.keys(ART_FORMATS)],
  ]) {
    if (!options.includes(input[key])) throw new Error('graphics_art_invalid_' + key);
    result[key] = input[key];
  }
  return result;
}

const esc = (value) => String(value)
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;').replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

function splitWord(word, maximum) {
  const pieces = [];
  for (let i = 0; i < word.length; i += maximum) pieces.push(word.slice(i, i + maximum));
  return pieces;
}
function linesFor(text, maxChars) {
  const words = text.split(/\s+/u).flatMap((word) => word.length > maxChars ? splitWord(word, maxChars) : [word]);
  const rows = [];
  let row = '';
  for (const word of words) {
    if ((row ? row.length + 1 : 0) + word.length > maxChars) {
      if (row) rows.push(row);
      row = word;
    } else row = row ? row + ' ' + word : word;
  }
  if (row) rows.push(row);
  return rows;
}

export function fitArtText(text, maxWidth, maxRows, maxSize, minSize) {
  for (let size = maxSize; size >= minSize; size -= 2) {
    const maxChars = Math.max(5, Math.floor(maxWidth / (size * .62)));
    const lines = linesFor(text, maxChars);
    if (lines.length <= maxRows) return { size, lines };
  }
  throw new Error('graphics_art_text_does_not_fit');
}
function svgText(lines, { x, y, fontSize, lineHeight = 1.08, color, weight = 700, letterSpacing = 0 }) {
  return '<text x="' + x + '" y="' + y + '" fill="' + color + '" font-family="Arial,Helvetica,sans-serif" font-weight="' + weight +
    '" font-size="' + fontSize + '" letter-spacing="' + letterSpacing + '">' +
    lines.map((row, i) => '<tspan x="' + x + '" dy="' + (i ? Math.round(fontSize * lineHeight) : 0) + '">' + esc(row) + '</tspan>').join('') +
    '</text>';
}
function artOrbit(x, y, w, h, palette) {
  const cx = x + w * .5, cy = y + h * .51, r = Math.min(w * .35, h * .38);
  const rings = [1, .72, .45].map((fraction, i) =>
    '<circle cx="' + cx + '" cy="' + cy + '" r="' + (r * fraction).toFixed(2) + '" stroke="' +
    (i === 1 ? palette.accent : palette.hairline) + '" stroke-width="' + (i === 1 ? 5 : 2) + '" fill="none"/>').join('');
  return rings +
    '<circle cx="' + (cx + r * .71) + '" cy="' + (cy - r * .13) + '" r="' + (r * .09) + '" fill="' + palette.accent + '"/>' +
    '<path d="M' + (cx - r) + ' ' + cy + ' Q' + cx + ' ' + (cy - r * 1.32) + ' ' + (cx + r) + ' ' + cy +
    '" fill="none" stroke="' + palette.accent + '" stroke-width="3" stroke-dasharray="10 13"/>';
}
function artArchitecture(x, y, w, h, palette) {
  const base = Math.min(w, h), rects = [];
  for (let i = 0; i < 5; i++) {
    const padding = base * .06 * i;
    const offset = i * base * .034;
    rects.push('<rect x="' + (x + padding + offset).toFixed(1) + '" y="' + (y + padding).toFixed(1) +
      '" width="' + (w - padding * 2 - offset).toFixed(1) + '" height="' + (h - padding * 2).toFixed(1) +
      '" rx="' + Math.max(4, 24 - i * 3) + '" stroke="' + (i === 3 ? palette.accent : palette.hairline) +
      '" fill="' + (i === 4 ? palette.panel : 'none') + '" stroke-width="' + (i === 3 ? 5 : 2) + '"/>');
  }
  rects.push('<path d="M' + (x + w * .15) + ' ' + (y + h * .8) + ' L' + (x + w * .75) + ' ' + (y + h * .2) +
    '" stroke="' + palette.accent + '" stroke-width="7" stroke-linecap="round"/>');
  return rects.join('');
}
function artType(x, y, w, h, palette, brandName) {
  // Typography must reflect the caller's actual, unverified brand text.
  // A constant decorative "Z" is not a client monogram.
  const letters = brandName.split(/\s+/u).filter(Boolean).slice(0, 2)
    .map((word) => [...word][0] || '').join('').toLocaleUpperCase('en-US');
  const midX = x + w / 2, midY = y + h / 2;
  const size = Math.min(w, h) * .72;
  const typeSize = Math.round(size * (letters.length === 1 ? .62 : .52));
  const lineY = midY + size * .33;
  return '<circle cx="' + midX + '" cy="' + midY + '" r="' + (size * .43) +
    '" fill="' + palette.panel + '" stroke="' + palette.hairline + '" stroke-width="2"/>' +
    '<text x="' + midX + '" y="' + (midY + typeSize * .33) +
    '" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="' +
    typeSize + '" font-weight="900" letter-spacing="-5" fill="' + palette.accent +
    '">' + esc(letters) + '</text>' +
    '<path d="M' + (midX - size * .25) + ' ' + lineY + ' L' +
    (midX + size * .25) + ' ' + lineY + '" stroke="' + palette.accent +
    '" stroke-width="4" stroke-linejoin="miter" fill="none"/>';
}

export function renderArtDirectedSvg(raw) {
  const b = normalizeArtBrief(raw);
  const { width: w, height: h } = ART_FORMATS[b.format];
  const p = ART_PALETTES[b.palette];
  const wide = b.format === 'hero-wide';
  const inset = Math.round(w * (wide ? .053 : .074));
  const headX = inset, headY = Math.round(h * (wide ? .25 : .188));
  const textWidth = wide ? Math.round(w * .46) : w - inset * 2;
  const headline = fitArtText(b.headline, textWidth, wide ? 4 : 4, wide ? 82 : 94, wide ? 40 : 42);
  const leadBottom = headY + headline.size * (1 + Math.max(0, headline.lines.length - 1) * 1.08);
  const summary = fitArtText(b.subhead, textWidth, wide ? 3 : 3, wide ? 25 : 27, 18);
  const summaryY = leadBottom + (wide ? 42 : 38);
  const summaryBottom = summaryY + summary.size * (1 + Math.max(0, summary.lines.length - 1) * 1.22);
  const artX = wide ? Math.round(w * .53) : inset;
  const artY = wide ? Math.round(h * .14) : Math.max(Math.round(h * .50), summaryBottom + 26);
  const artW = wide ? Math.round(w * .40) : w - inset * 2;
  const artH = wide ? Math.round(h * .74) : Math.max(72, Math.round(h * .81) - artY);
  // Avoid destructive collisions by rejecting briefs that exceed the safe area.
  if (!wide && artY >= h * .78) throw new Error('graphics_art_text_overflows_canvas');
  if (wide && summaryBottom >= h * .72) throw new Error('graphics_art_text_overflows_canvas');
  const art = b.treatment === 'orbit' ? artOrbit(artX, artY, artW, artH, p) :
    b.treatment === 'architecture' ? artArchitecture(artX, artY, artW, artH, p) :
    artType(artX, artY, artW, artH, p, b.brandName);
  const kickerSize = wide ? 18 : 17;
  const footer = Math.round(h * .94);
  const ctaWidth = wide ? Math.round(w * .45) : w - inset * 2;
  const cta = fitArtText(b.callToAction, ctaWidth, 2, wide ? 24 : 25, 16);
  const ctaY = wide ? Math.round(h * .79) : Math.round(h * .85);
  if (wide && ctaY <= summaryBottom) throw new Error('graphics_art_cta_overlaps_text');
  const brand = fitArtText(b.brandName.toUpperCase(), wide ? w * .48 : w * .74, 1, 19, 12);
  const design = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="' + esc(b.headline) + '">',
    '<rect width="' + w + '" height="' + h + '" fill="' + p.background + '"/>',
    '<rect x="' + inset + '" y="' + Math.round(h * .074) + '" width="' + (w - 2 * inset) + '" height="2" fill="' + p.hairline + '"/>',
    svgText(brand.lines, { x: headX, y: Math.round(h * .067), fontSize: brand.size, color: p.ink, weight: 800, letterSpacing: 1 }),
    svgText([b.eyebrow.toUpperCase()], { x: headX, y: Math.round(h * (wide ? .17 : .132)), fontSize: kickerSize, color: p.accent, weight: 700, letterSpacing: 1 }),
    svgText(headline.lines, { x: headX, y: headY, fontSize: headline.size, color: p.ink, weight: 800, lineHeight: 1.08, letterSpacing: -1 }),
    svgText(summary.lines, { x: headX, y: summaryY, fontSize: summary.size, color: p.muted, weight: 400, lineHeight: 1.22 }),
    art,
    svgText(cta.lines, { x: headX, y: ctaY, fontSize: cta.size, color: p.accent, weight: 700, lineHeight: 1.22 }),
    '<rect x="' + inset + '" y="' + Math.round(h * .9) + '" width="' + (w - 2 * inset) + '" height="2" fill="' + p.hairline + '"/>',
    svgText(['CONCEPT VISUAL  /  CLIENT-PROVIDED COPY  /  UNVERIFIED CLAIMS'],
      { x: headX, y: footer, fontSize: wide ? 15 : 12, color: p.muted, weight: 600 }),
    '</svg>',
  ].join('');
  const sha256 = crypto.createHash('sha256').update(design).digest('hex');
  const intentDigest = crypto.createHash('sha256').update(JSON.stringify(b)).digest('hex');
  return {
    schema: 'evercraft.graphics-mcp.art-directed-preview.v1',
    ok: true,
    mode: 'deterministic_art_directed_svg',
    previewId: 'graphics-art-' + intentDigest.slice(0,20),
    format: b.format,
    treatment: b.treatment,
    palette: b.palette,
    mimeType: 'image/svg+xml',
    sha256,
    data: design,
    evidenceState: 'client_copy_unverified',
    imageryState: 'synthetic_vector_art',
    brandRightsState: 'client_asserted_not_verified',
    creativeReviewState: 'founder_rejected_generic_gallery_20261016',
    showcaseAuthority: false,
    publicationAuthority: false,
    paymentAuthority: false,
    actualVideoGenerated: false,
    externalActionTaken: false,
  };
}
