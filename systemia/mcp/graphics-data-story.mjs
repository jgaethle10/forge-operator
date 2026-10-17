import crypto from 'node:crypto';
import { ART_FORMATS, ART_PALETTES, fitArtText } from './graphics-art-directed.mjs';

// Source references are assertions supplied by a caller, never fetched or verified here.
// This lane creates deterministic vector previews. It is not a research, editorial,
// geospatial, image-model, payment, publishing or production authority.
const CHARTS = ['bars', 'trend'];
const UNITS = ['count', 'USD', 'percent', 'kWh', 'hours'];
const STATES = ['client_reported', 'client_modeled', 'synthetic_example'];
const safeText = (value, name, max) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max ||
      /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(value))
    throw new Error('graphics_data_invalid_' + name);
  return value.replace(/\s+/gu, ' ').trim();
};
const esc = (s) => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const isRecord = (v, keys) => v && typeof v === 'object' && !Array.isArray(v) &&
  Object.keys(v).every((key) => keys.includes(key));
const digest = (v) => crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');

export const DATA_STORY_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    brandName: { type: 'string', minLength: 1, maxLength: 42 },
    eyebrow: { type: 'string', minLength: 1, maxLength: 52 },
    headline: { type: 'string', minLength: 1, maxLength: 80 },
    subhead: { type: 'string', minLength: 1, maxLength: 130 },
    methodNote: { type: 'string', minLength: 1, maxLength: 105 },
    chartType: { type: 'string', enum: CHARTS },
    unit: { type: 'string', enum: UNITS },
    measurementState: { type: 'string', enum: STATES },
    format: { type: 'string', enum: Object.keys(ART_FORMATS) },
    palette: { type: 'string', enum: Object.keys(ART_PALETTES) },
    sourceRefs: { type: 'array', minItems: 1, maxItems: 3, items: { type: 'string', minLength: 12, maxLength: 500 } },
    data: { type: 'array', minItems: 2, maxItems: 8, items: {
      type: 'object', additionalProperties: false,
      properties: { label: { type: 'string', minLength: 1, maxLength: 24 },
        value: { type: 'number', minimum: 0, maximum: 1000000000 } },
      required: ['label', 'value'],
    } },
  },
  required: ['brandName', 'eyebrow', 'headline', 'subhead', 'methodNote',
    'chartType', 'unit', 'measurementState', 'format', 'palette', 'sourceRefs', 'data'],
};

function httpsSource(raw) {
  const text = safeText(raw, 'source_ref', 500);
  let url;
  try { url = new URL(text); } catch { throw new Error('graphics_data_invalid_source_ref'); }
  if (url.protocol !== 'https:' || url.username || url.password || !url.hostname ||
      url.hostname.toLowerCase() === 'localhost' || url.hostname.endsWith('.local') ||
      /^(?:\d{1,3}\.){3}\d{1,3}$/u.test(url.hostname) || url.hostname.includes(':'))
    throw new Error('graphics_data_invalid_source_ref');
  return url.toString();
}

export function normalizeDataStory(input) {
  if (!isRecord(input, Object.keys(DATA_STORY_SCHEMA.properties)))
    throw new Error('graphics_data_unexpected_arguments');
  const b = {};
  for (const [name, max] of [
    ['brandName', 42], ['eyebrow', 52], ['headline', 80],
    ['subhead', 130], ['methodNote', 105],
  ]) b[name] = safeText(input[name], name, max);
  for (const [name, options] of [
    ['chartType', CHARTS], ['unit', UNITS], ['measurementState', STATES],
    ['format', Object.keys(ART_FORMATS)], ['palette', Object.keys(ART_PALETTES)],
  ]) {
    if (!options.includes(input[name])) throw new Error('graphics_data_invalid_' + name);
    b[name] = input[name];
  }
  if (!Array.isArray(input.sourceRefs) || input.sourceRefs.length < 1 || input.sourceRefs.length > 3)
    throw new Error('graphics_data_source_refs_required');
  b.sourceRefs = input.sourceRefs.map(httpsSource);
  if (new Set(b.sourceRefs).size !== b.sourceRefs.length) throw new Error('graphics_data_duplicate_source_refs');
  if (!Array.isArray(input.data) || input.data.length < 2 || input.data.length > 8)
    throw new Error('graphics_data_invalid_points');
  if (input.chartType === 'bars' && input.data.length > 6)
    throw new Error('graphics_data_too_many_bars');
  const seen = new Set();
  b.data = input.data.map((item) => {
    if (!isRecord(item, ['label', 'value']) || Object.keys(item).length !== 2)
      throw new Error('graphics_data_invalid_point');
    const label = safeText(item.label, 'label', b.chartType === 'trend' ? 10 : 24);
    const comparable = label.toLocaleLowerCase('en-US');
    if (seen.has(comparable)) throw new Error('graphics_data_duplicate_label');
    seen.add(comparable);
    if (typeof item.value !== 'number' || !Number.isFinite(item.value) ||
        item.value < 0 || item.value > 1000000000)
      throw new Error('graphics_data_invalid_value');
    if (b.unit === 'percent' && item.value > 100)
      throw new Error('graphics_data_percent_out_of_range');
    return { label, value: item.value };
  });
  return b;
}

function compact(v) {
  if (v === 0) return '0';
  if (Math.abs(v) >= 1000000000) return (v / 1000000000).toFixed(2).replace(/\.?0+$/, '') + 'B';
  if (Math.abs(v) >= 1000000) return (v / 1000000).toFixed(2).replace(/\.?0+$/, '') + 'M';
  if (Math.abs(v) >= 10000) return (v / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return v.toLocaleString('en-US', { maximumFractionDigits: 2 });
}
function displayValue(value, unit) {
  const number = compact(value);
  if (unit === 'USD') return '$' + number;
  if (unit === 'percent') return number + '%';
  if (unit === 'kWh') return number + ' kWh';
  if (unit === 'hours') return number + ' h';
  return number;
}

function yCeiling(max, unit) {
  if (unit === 'percent') return 100;
  if (max <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(max));
  const fraction = max / magnitude;
  return (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * magnitude;
}
function svgLines(lines, x, y, size, lineHeight, fill, weight = 650) {
  return '<text font-family="Arial,Helvetica,sans-serif" fill="' + fill + '" font-size="' + size +
    '" font-weight="' + weight + '">' +
    lines.map((line, i) => '<tspan x="' + x + '" y="' + (y + i * size * lineHeight) + '">' + esc(line) + '</tspan>').join('') +
    '</text>';
}

function horizontalBars(b, p, plot) {
  const max = Math.max(...b.data.map((item) => item.value));
  const ceiling = yCeiling(max, b.unit);
  const { x, y, width: w, height: h } = plot;
  const left = x + 24, nameW = Math.round(w * .27);
  const lineX = left + nameW, valueW = Math.round(w * .18);
  const barW = Math.max(40, w - nameW - valueW - 78);
  const rowHeight = (h - 74) / b.data.length;
  const elements = [
    '<text x="' + lineX + '" y="' + (y + 23) + '" fill="' + p.muted + '" font-size="15" font-family="Arial">' +
      esc('0 to ' + displayValue(ceiling, b.unit)) + '  •  ZERO-BASED SCALE</text>',
  ];
  for (const [i, item] of b.data.entries()) {
    const yy = y + 59 + rowHeight * (i + .5);
    const ratio = item.value / ceiling;
    const label = fitArtText(item.label, nameW - 12, 2, 21, 13);
    elements.push(svgLines(label.lines, left, yy - (label.lines.length - 1) * label.size * .47, label.size, 1.1, p.ink));
    elements.push('<rect x="' + lineX + '" y="' + (yy - 16) + '" width="' + barW + '" height="31" rx="12" fill="' + p.panel + '"/>');
    elements.push('<rect x="' + lineX + '" y="' + (yy - 16) + '" width="' + (barW * ratio).toFixed(2) +
      '" height="31" rx="12" fill="' + p.accent + '"/>');
    elements.push('<text x="' + (lineX + barW + 16) + '" y="' + (yy + 7) + '" fill="' + p.ink +
      '" font-size="21" font-weight="700" font-family="Arial">' + esc(displayValue(item.value, b.unit)) + '</text>');
  }
  return elements.join('');
}

function lineTrend(b, p, plot) {
  const max = Math.max(...b.data.map((item) => item.value));
  const ceiling = yCeiling(max, b.unit);
  const { x, y, width: w, height: h } = plot;
  const x0 = x + 72, right = x + w - 36;
  const y0 = y + 56, bottom = y + h - 88;
  const usableW = right - x0, usableH = bottom - y0;
  const parts = [];
  for (const ratio of [0, .5, 1]) {
    const yy = bottom - ratio * usableH;
    parts.push('<path d="M' + x0 + ' ' + yy + ' H' + right + '" fill="none" stroke="' +
      p.hairline + '" stroke-width="2"/>');
    parts.push('<text x="' + (x0 - 9) + '" y="' + (yy + 5) + '" font-family="Arial" font-size="13" text-anchor="end" fill="' +
      p.muted + '">' + esc(compact(ceiling * ratio)) + '</text>');
  }
  const points = b.data.map((item, i) => ({
    x: x0 + usableW * i / (b.data.length - 1),
    y: bottom - usableH * item.value / ceiling,
    item,
  }));
  const path = points.map((pt, i) => (i ? 'L' : 'M') + pt.x.toFixed(2) + ' ' + pt.y.toFixed(2)).join(' ');
  parts.push('<path d="' + path + '" fill="none" stroke="' + p.accent +
    '" stroke-width="7" stroke-linejoin="round" stroke-linecap="round"/>');
  for (const [i, pt] of points.entries()) {
    parts.push('<circle cx="' + pt.x.toFixed(2) + '" cy="' + pt.y.toFixed(2) + '" r="8" fill="' + p.accent +
      '" stroke="' + p.background + '" stroke-width="3"/>');
    const anchor = i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle';
    parts.push('<text x="' + pt.x.toFixed(2) + '" y="' + (bottom + 31) +
      '" text-anchor="' + anchor + '" font-family="Arial" font-size="14" fill="' + p.ink + '">' +
      esc(pt.item.label) + '</text>');
  }
  parts.push('<text x="' + (x + w / 2) + '" y="' + (y + h - 18) +
    '" text-anchor="middle" font-family="Arial" font-size="13" fill="' + p.muted +
    '">ORDERED CATEGORIES  •  ZERO-BASED SCALE  •  ' + esc(b.unit.toUpperCase()) + '</text>');
  return parts.join('');
}

export function renderDataStorySvg(raw) {
  const b = normalizeDataStory(raw);
  const p = ART_PALETTES[b.palette];
  const { width: w, height: h } = ART_FORMATS[b.format];
  const wide = b.format === 'hero-wide';
  const margin = wide ? 68 : 70;
  const contentWidth = wide ? 610 : w - margin * 2;
  const headline = fitArtText(b.headline, contentWidth, wide ? 4 : 3, wide ? 75 : 76, 40);
  const subhead = fitArtText(b.subhead, contentWidth, 3, wide ? 25 : 27, 18);
  const titleY = Math.round(h * (wide ? .30 : b.format === 'story' ? .21 : .20));
  const subY = titleY + headline.size * (headline.lines.length - 1) * 1.12 + headline.size + 34;
  const subBottom = subY + subhead.size * (subhead.lines.length - 1) * 1.18 + subhead.size;
  const plotX = wide ? 740 : margin;
  const plotY = wide ? 162 : Math.max(subBottom + 48, Math.round(h * (b.format === 'story' ? .41 : .42)));
  const plotW = wide ? 790 : w - margin * 2;
  // A fixed plot height collides with two-line mobile headings, especially
  // square canvases. Allocate chart height from the actual text bottom instead.
  const plotH = wide ? 570 : Math.min(
    b.format === 'story' ? 760 : 540,
    Math.round(h * .40),
    Math.floor(h * .825 - plotY),
  );
  if (plotH < 300 || plotY + plotH > h * .84)
    throw new Error('graphics_data_layout_overflow');
  const sourceY = Math.round(h * .89);
  const note = fitArtText('METHOD: ' + b.methodNote, w - margin * 2, 2, 19, 14);
  const noteY = Math.round(h * .85);
  if (!wide && noteY <= plotY + plotH + 12) throw new Error('graphics_data_method_overlaps_plot');
  const text = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h +
      '" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="' + esc(b.headline) + '">',
    '<defs><linearGradient id="wash" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="' +
      p.panel + '"/><stop offset="100%" stop-color="' + p.background + '"/></linearGradient></defs>',
    '<rect width="' + w + '" height="' + h + '" fill="' + p.background + '"/>',
    '<circle cx="' + (w * .85) + '" cy="' + (h * .04) + '" r="' + (w * .23) + '" fill="' + p.accent +
      '" opacity=".05"/>',
    '<rect x="' + margin + '" y="' + Math.round(h * .07) + '" width="' + (w - 2 * margin) +
      '" height="2" fill="' + p.hairline + '"/>',
    svgLines([b.brandName.toUpperCase()], margin, Math.round(h * .062), 18, 1.1, p.ink, 800),
    svgLines([b.eyebrow.toUpperCase()], margin, Math.round(h * (wide ? .16 : .14)), 18, 1, p.accent, 800),
    svgLines(headline.lines, margin, titleY, headline.size, 1.12, p.ink, 800),
    svgLines(subhead.lines, margin, subY, subhead.size, 1.18, p.muted, 450),
    '<rect x="' + plotX + '" y="' + plotY + '" width="' + plotW + '" height="' + plotH +
      '" rx="28" fill="url(#wash)" stroke="' + p.hairline + '" stroke-width="2"/>',
    b.chartType === 'bars' ? horizontalBars(b, p, {x: plotX, y: plotY, width: plotW, height: plotH}) :
      lineTrend(b, p, {x: plotX, y: plotY, width: plotW, height: plotH}),
    svgLines(note.lines, margin, noteY, note.size, 1.15, p.muted, 450),
    '<rect x="' + margin + '" y="' + Math.round(h * .91) + '" width="' + (w - 2 * margin) +
      '" height="2" fill="' + p.hairline + '"/>',
    svgLines([b.measurementState.toUpperCase().replaceAll('_', ' ') +
      '  •  ' + b.sourceRefs.length + ' CLIENT SOURCE REF(S)  •  NOT INDEPENDENTLY VERIFIED'],
      margin, Math.round(h * .947), wide ? 15 : 13, 1, p.muted, 600),
    '</svg>',
  ].join('');
  return {
    schema: 'evercraft.graphics-mcp.data-story-preview.v1',
    ok: true,
    mode: 'source_labeled_vector_chart_preview',
    previewId: 'graphics-data-' + digest(b).slice(0,20),
    chartType: b.chartType, format: b.format, palette: b.palette,
    measurementState: b.measurementState, unit: b.unit,
    sourceRefs: b.sourceRefs, evidenceState: 'client_references_not_verified',
    scale: { min: 0, max: yCeiling(Math.max(...b.data.map(d => d.value)), b.unit) },
    dataCount: b.data.length, categoriesEqualSpaced: b.chartType === 'trend',
    mimeType: 'image/svg+xml', sha256: crypto.createHash('sha256').update(text).digest('hex'), data: text,
    publicationAuthority: false, paymentAuthority: false, externalActionTaken: false,
  };
}
