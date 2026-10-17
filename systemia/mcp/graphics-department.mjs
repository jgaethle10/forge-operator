import crypto from 'node:crypto';
import {
  normalizeCommercialCampaign,
  compileCommercialAttention,
  assessCommercialScrollStop,
} from '../graphics-command/commercial-director.mjs';
import {
  renderCommercialPoster,
  renderCommercialMotion,
} from '../graphics-command/commercial-renderer.mjs';
import { ART_SCHEMA, renderArtDirectedSvg } from './graphics-art-directed.mjs';
import { DATA_STORY_SCHEMA, renderDataStorySvg } from './graphics-data-story.mjs';

// Preview-only contract. No Systemia job dispatch, public write, payment,
// publication, network fetch, or model-provider inference is performed here.
export const GRAPHICS_MCP_VERSION = '0.2.0-rc1';
const PROTOCOL_VERSION = '2025-03-26';
const FORMATS = ['feed', 'square', 'story', 'hero-wide'];
const DELIVERABLES = [
  { id: 'feed', width: 1080, height: 1350 },
  { id: 'square', width: 1080, height: 1080 },
  { id: 'story', width: 1080, height: 1920 },
  { id: 'hero-wide', width: 1600, height: 900 },
];

const BRIEF_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    product: { type: 'string', minLength: 1, maxLength: 80 },
    offer: { type: 'string', minLength: 1, maxLength: 90 },
    audience: { type: 'string', minLength: 1, maxLength: 160 },
    offerUrl: { type: 'string', minLength: 10, maxLength: 500 },
    priceUsd: { type: 'number', exclusiveMinimum: 0, maximum: 100000 },
    sourceRefs: { type: 'array', minItems: 1, maxItems: 5, items: { type: 'string', maxLength: 500 } },
    hook: { type: 'string', minLength: 1, maxLength: 34 },
    subhook: { type: 'string', minLength: 1, maxLength: 120 },
    cta: { type: 'string', minLength: 1, maxLength: 70 },
    visualMetaphor: { type: 'string', minLength: 1, maxLength: 180 },
    format: { type: 'string', enum: FORMATS, default: 'feed' },
  },
  required: ['product', 'offer', 'audience', 'offerUrl', 'priceUsd', 'sourceRefs', 'hook', 'subhook', 'cta', 'visualMetaphor'],
};

const COMMON = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

export function graphicsDepartmentTools() {
  return [
    {
      name: 'graphics_get_capabilities',
      title: 'Discover Evercraft graphics preview capabilities',
      description: 'Lists the first available owned graphics production preview and the capabilities not yet authorized. No purchase or job submission.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: COMMON,
    },
    {
      name: 'graphics_preview_commercial',
      title: 'Render an Evercraft-branded commercial graphic preview',
      description: 'Generate a deterministic, synthetic, Evercraft-branded SVG preview for feed, square, story, or hero format. Seller-provided offers, prices and source references are NOT independently verified. Does not publish, charge, run agents, or generate video.',
      inputSchema: BRIEF_SCHEMA,
      annotations: COMMON,
    },
    {
      name: 'graphics_preview_art_directed',
      title: 'Create an art-directed vector concept preview',
      description: 'Render a bounded brand-text-only SVG concept using one of three distinctive geometric treatments and four curated palettes. Client copy and brand rights are unverified. Founder rejected the generic composition gallery for creative quality; ENGINEERING PREVIEW ONLY, never portfolio-approved. No asset uploads, external images, model inference, video, charges or publication.',
      inputSchema: ART_SCHEMA,
      annotations: COMMON,
    },
    {
      name: 'graphics_preview_data_story',
      title: 'Make a source-labeled data-story chart preview',
      description: 'Render a deterministic SVG bar or ordered-category trend chart from explicit caller-provided numerical values. Source references and measurement claims are labeled but not independently verified. Always uses a zero baseline. No external queries, publication, or payment.',
      inputSchema: DATA_STORY_SCHEMA,
      annotations: COMMON,
    },
    {
      name: 'graphics_preview_motion_stage',
      title: 'Preview an HTML motion stage, not a rendered video',
      description: 'Generate deterministic HTML animation stage for the same bounded Evercraft-branded commercial brief. Returns HTML source, not an MP4 or public URL; does not perform publishing or external actions.',
      inputSchema: { ...BRIEF_SCHEMA, properties: Object.fromEntries(Object.entries(BRIEF_SCHEMA.properties).filter(([k]) => k !== 'format')) },
      annotations: COMMON,
    },
  ];
}

function exactObject(value, allowed) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).every((key) => allowed.includes(key));
}

function boundedText(value, name, max) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[<>\u0000-\u001f]/u.test(value)) {
    throw new Error('graphics_invalid_' + name);
  }
  return value.replace(/\s+/gu, ' ').trim();
}

function httpsRef(value, name) {
  const raw = boundedText(value, name, 500);
  let uri;
  try { uri = new URL(raw); } catch { throw new Error('graphics_invalid_' + name); }
  if (uri.protocol !== 'https:' || uri.username || uri.password || !uri.hostname ||
      uri.hostname === 'localhost' || uri.hostname.endsWith('.local') ||
      /^(\d{1,3}\.){3}\d{1,3}$/.test(uri.hostname) || uri.hostname.includes(':')) {
    throw new Error('graphics_invalid_https_' + name);
  }
  return uri.toString();
}

function normalizeBrief(args = {}, { motion = false } = {}) {
  const expected = Object.keys(BRIEF_SCHEMA.properties).filter((k) => !motion || k !== 'format');
  if (!exactObject(args, expected)) throw new Error('graphics_unexpected_arguments');
  const sourceRefs = args.sourceRefs;
  if (!Array.isArray(sourceRefs) || sourceRefs.length < 1 || sourceRefs.length > 5) {
    throw new Error('graphics_source_refs_required');
  }
  const priceUsd = args.priceUsd;
  if (typeof priceUsd !== 'number' || !Number.isFinite(priceUsd) || priceUsd <= 0 || priceUsd > 100000) {
    throw new Error('graphics_price_invalid');
  }
  const product = boundedText(args.product, 'product', 80);
  const offer = boundedText(args.offer, 'offer', 90);
  const audience = boundedText(args.audience, 'audience', 160);
  const hook = boundedText(args.hook, 'hook', 34);
  const subhook = boundedText(args.subhook, 'subhook', 120);
  const cta = boundedText(args.cta, 'cta', 70);
  const visualMetaphor = boundedText(args.visualMetaphor, 'visual_metaphor', 180);
  const offerUrl = httpsRef(args.offerUrl, 'offer_url');
  const refs = [...new Set(sourceRefs.map((v) => httpsRef(v, 'source_ref')))];
  const format = motion ? 'story' : (args.format || 'feed');
  if (!FORMATS.includes(format)) throw new Error('graphics_format_invalid');
  const stableBrief = { product, offer, audience, offerUrl, priceUsd, sourceRefs: refs, hook, subhook, cta, visualMetaphor };
  const key = crypto.createHash('sha256').update(JSON.stringify(stableBrief)).digest('hex').slice(0,20);
  return { stableBrief, key, format };
}

function campaignFor({ stableBrief: b, key }) {
  return normalizeCommercialCampaign({
    schema: 'evercraft.commercial-attention-campaign.v1',
    id: 'graphics-mcp-preview-' + key,
    slug: 'graphics-mcp-' + key,
    product: b.product,
    offer: b.offer,
    audience: b.audience,
    offerUrl: b.offerUrl,
    priceUsd: b.priceUsd,
    sourceRefs: b.sourceRefs,
    truthState: 'synthetic_visualization',
    boundaries: { syntheticVisualMustNotMasqueradeAsObservedCustomerEvidence: true },
    deliverables: DELIVERABLES,
    creative: {
      eyebrow: 'EVERCRAFT • CONCEPT',
      hook: b.hook,
      subhook: b.subhook,
      cta: b.cta,
      priceLockup: '$' + b.priceUsd.toLocaleString('en-US', { maximumFractionDigits: 2 }),
      visualMetaphor: b.visualMetaphor,
      sonicHook: ['NOTICE', 'UNDERSTAND', 'ACT'],
      guardrails: ['Synthetic preview', 'Unverified source claims', 'Not a customer case study'],
      palette: {
        background: '#05080D', text: '#F6FAFF', muted: '#B1C7D6',
        electric: '#55C7FF', gold: '#E8C46A',
      },
    },
    shots: [
      { id: 'opening', beat: 'problem', durationSec: 2, intent: 'Show friction' },
      { id: 'middle', beat: 'value', durationSec: 2, intent: 'Show conceptual flow' },
      { id: 'closing', beat: 'cta', durationSec: 2, intent: 'Show seller-supplied CTA' },
    ],
  });
}

export function renderGraphicsPreview(args, { motion = false } = {}) {
  const brief = normalizeBrief(args, { motion });
  const campaign = campaignFor(brief);
  const plan = compileCommercialAttention(campaign);
  const report = assessCommercialScrollStop(plan);
  if (report.status !== 'pass') throw new Error('graphics_scroll_stop_rejected');
  const output = motion
    ? renderCommercialMotion(campaign, plan)
    : renderCommercialPoster(campaign, plan, brief.format);
  const sha256 = crypto.createHash('sha256').update(output).digest('hex');
  return {
    schema: 'evercraft.graphics-mcp.preview.v1',
    ok: true,
    mode: motion ? 'deterministic_html_motion_stage' : 'deterministic_svg_preview',
    previewId: 'graphics-preview-' + brief.key,
    format: brief.format,
    mimeType: motion ? 'text/html' : 'image/svg+xml',
    sha256,
    data: output,
    score: report.score,
    sourceRefs: campaign.sourceRefs,
    evidenceState: 'customer_supplied_unverified',
    imageryState: 'synthetic_visualization',
    pricingState: 'seller_supplied_unverified',
    publicationAuthority: false,
    paymentAuthority: false,
    actualVideoGenerated: false,
    externalActionTaken: false,
  };
}

function rpcResult(id, result) { return { jsonrpc: '2.0', id: id ?? null, result }; }
function rpcError(id, code, message) { return { jsonrpc: '2.0', id: id ?? null, error: { code, message } }; }
function toolResult(payload) {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload) }],
    structuredContent: payload,
    isError: false,
  };
}
function toolExecutionError(message) {
  return {
    content: [{ type: 'text', text: String(message) }],
    isError: true,
  };
}
export function executeGraphicsMcpRpc(request) {
  const id = request?.id ?? null;
  if (!request || typeof request !== 'object' || Array.isArray(request)) return rpcError(null, -32600, 'Invalid request');
  if (request.jsonrpc !== '2.0' || typeof request.method !== 'string') return rpcError(id, -32600, 'Invalid request');
  if (request.method === 'initialize') {
    return rpcResult(id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'evercraft-graphics-preview', version: GRAPHICS_MCP_VERSION },
      instructions: 'Preview-only, synthetic and Evercraft-branded. No paid fulfillment, agent dispatch, production authorization or public publication.',
    });
  }
  if (request.method === 'notifications/initialized') return null;
  if (request.method === 'ping') return rpcResult(id, {});
  if (request.method === 'tools/list') return rpcResult(id, { tools: graphicsDepartmentTools() });
  if (request.method !== 'tools/call') return rpcError(id, -32601, 'Method not found');
  const name = request.params?.name;
  const args = request.params?.arguments ?? {};
  if (name === 'graphics_get_capabilities') {
    if (!exactObject(args, [])) return rpcResult(id, toolExecutionError('Invalid arguments: this tool takes no inputs'));
    return rpcResult(id, toolResult({
      available: ['graphics_preview_commercial', 'graphics_preview_art_directed', 'graphics_preview_data_story', 'graphics_preview_motion_stage'],
      availableMode: 'local_authenticated_preview_only',
      pending: ['paid_rendering', 'real_video', '3d_world_jobs', 'image_model_calls', 'public_discovery', 'tenant_billing', 'publishing'],
      commercialReadiness: 'not_approved',
      creativeReviewState: 'founder_rejected_generic_gallery_20261016',
      subjectFirstCandidate: 'Fallen RC09 authentic scene-based proof, separate from this generic MCP tool',
      publicationAuthority: false,
    }));
  }
  if (name !== 'graphics_preview_commercial' && name !== 'graphics_preview_motion_stage' && name !== 'graphics_preview_art_directed' && name !== 'graphics_preview_data_story') {
    return rpcError(id, -32602, 'Unknown graphics tool');
  }
  try {
    return rpcResult(id, toolResult(name === 'graphics_preview_art_directed'
      ? renderArtDirectedSvg(args)
      : name === 'graphics_preview_data_story'
        ? renderDataStorySvg(args)
        : renderGraphicsPreview(args, { motion: name === 'graphics_preview_motion_stage' })));
  } catch (e) {
    return rpcResult(id, toolExecutionError(e instanceof Error ? e.message : 'Graphics preview failed'));
  }
}
