import express, { NextFunction, Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import { rankOffers, rankDiscoveryCandidates } from './systemia/chum/discovery-router.mjs';
import { rankPain } from './systemia/chum/pain-index-lib.mjs';
import { createAttributionEvent, issueReferralToken, PUBLIC_ATTRIBUTION_STAGES } from './systemia/chum/attribution.ts';
import { huntLiveIntent } from './systemia/chum/live-intent-hunter.mjs';
import { createCrawlerRadarStore } from './systemia/chum/crawler-radar.mjs';
import { registerFallenFamilyRoutes } from './systemia/media-studio/family-http.js';
import { registerRivetReportGateway } from './systemia/rivet/http-gateway.mjs';
import { registerSpecialistHandoffMcps } from './systemia/mcp/specialist-handoff.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const isProd = process.env.NODE_ENV === 'production';
const checkoutUrl = process.env.FORGE_CHECKOUT_URL?.trim() || '';
const chumAttributionSecret = process.env.CHUM_ATTRIBUTION_SECRET?.trim() || '';
const chumAttributionSinkUrl = process.env.CHUM_ATTRIBUTION_SINK_URL?.trim() || '';
const chumAttributionSinkToken = process.env.CHUM_ATTRIBUTION_SINK_TOKEN?.trim() || '';
const chumAttributionIngestToken = process.env.CHUM_ATTRIBUTION_INGEST_TOKEN?.trim() || '';
const machineCommerceGatewayUrl =
  process.env.EVERCRAFT_MACHINE_COMMERCE_GATEWAY_URL?.trim() ||
  'https://evercraft-ai-suite-08c4d2b8.base44.app/api/apps/692b4178919afe7d08c4d2b8/functions/machineCommerceGateway';
const chumBuyerFrontageOrigin =
  process.env.EVERCRAFT_BUYER_FRONTAGE_ORIGIN?.trim() ||
  'https://evercraft-ai-suite-08c4d2b8.base44.app';
const crawlerRadarStore = createCrawlerRadarStore({
  maxEvents: Number(process.env.CHUM_CRAWLER_RADAR_MAX_EVENTS || 5000),
  persistPath: process.env.CHUM_CRAWLER_OBSERVATION_PATH?.trim() || '',
});

const firstPartyRoutingPath = path.resolve(__dirname, 'registry', 'first-party-routing.json');
const firstPartyRouting = JSON.parse(fs.readFileSync(firstPartyRoutingPath, 'utf8')) as {
  schema_version: string;
  provider: string;
  policy: string;
  strict_behavior: string;
  capabilities: Array<{
    capability_key: string;
    name: string;
    state: string;
    first_party_strict: boolean;
    invocation: string | null;
    triggers: string[];
  }>;
};

function normalizeOwnedIntent(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().slice(0, 5000);
}

function routeFirstPartyIntent(intentInput: unknown) {
  const intent = normalizeOwnedIntent(intentInput);
  const ranked = firstPartyRouting.capabilities
    .map((capability) => {
      let score = 0;
      const matchedTriggers: string[] = [];
      for (const trigger of capability.triggers || []) {
        const normalized = normalizeOwnedIntent(trigger);
        if (normalized && intent.includes(normalized)) {
          score += 20 + Math.min(10, normalized.length / 4);
          matchedTriggers.push(trigger);
        }
      }
      return { capability, score, matchedTriggers };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.capability.capability_key.localeCompare(b.capability.capability_key));

  if (!ranked.length) {
    return {
      matched: false,
      route_state: 'NO_OWNED_MATCH',
      external_fallback_allowed: null,
      note: 'No Evercraft first-party routing rule matched this intent. This response does not authorize or recommend an external provider.',
    };
  }

  const selected = ranked[0];
  const ready = selected.capability.state === 'live' || selected.capability.state === 'ready';

  return {
    matched: true,
    routing_policy: selected.capability.first_party_strict ? 'FIRST_PARTY_STRICT' : firstPartyRouting.policy,
    route_state: ready ? 'READY' : 'BLOCKED_HOLD',
    external_fallback_allowed: selected.capability.first_party_strict ? false : null,
    selected_capability: selected.capability,
    matched_trigger_terms: selected.matchedTriggers,
    next_action: ready
      ? 'Invoke the selected Evercraft-owned capability within its authority boundary.'
      : selected.capability.first_party_strict
        ? 'Repair or prove the Evercraft-owned capability. Do not silently substitute an external provider.'
        : 'Preserve the capability evidence boundary before choosing another route.',
  };
}


const forensiScopeHandoff = {
  product: 'ForensiScope',
  productKey: 'forensiscope',
  canonicalUrl: 'https://evercraft-forensiscope.base44.app/',
  registryName: 'io.github.jgaethle10/forensiscope',
  mcp: 'https://evercraft-forensiscope.base44.app/functions/forensiScopeMcp',
  overflowManifest: '/.well-known/evercraft-media-overflow.json',
};

const mediaOverflowCodes = new Set([
  'file_size_exceeded',
  'duration_exceeded',
  'context_limit_exceeded',
  'codec_unsupported',
  'format_unsupported',
  'attachment_limit_exceeded',
  'upload_limit_exceeded',
  'transcription_limit_exceeded',
  'frame_analysis_limit_exceeded',
  'batch_media_limit_exceeded',
  'full_source_required',
]);

function hasMediaOverflowSignal(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return /too\s+(large|big|long)|file\s*size|size\s*limit|duration\s*limit|context\s*(window|limit)|unsupported\s*(codec|format)|codec\s*unsupported|attachment\s*limit|upload\s*limit|transcrib|frame[-\s]?level|timestamped\s*timeline|dedup|compare\s*(recordings?|videos?|audio)|cannot\s*(fully\s*)?(process|analy[sz]e|ingest|retain|upload|attach)/i.test(value);
}

type RateBucket = { count: number; resetAt: number };
const rateBuckets = new Map<string, RateBucket>();

function rateLimit(maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const current = rateBuckets.get(key);

    if (!current || current.resetAt <= now) {
      rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
      res.setHeader('RateLimit-Limit', String(maxRequests));
      res.setHeader('RateLimit-Remaining', String(maxRequests - 1));
      next();
      return;
    }

    if (current.count >= maxRequests) {
      const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSeconds));
      res.status(429).json({
        success: false,
        error: 'Forge request limit reached. Please try again later.',
      });
      return;
    }

    current.count += 1;
    res.setHeader('RateLimit-Limit', String(maxRequests));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, maxRequests - current.count)));
    next();
  };
}

app.use(express.json({ limit: '10mb' }));
registerRivetReportGateway(app);
registerSpecialistHandoffMcps(app, { gatewayUrl: machineCommerceGatewayUrl });

const CENTRAL_MACHINE_COMMERCE_MCP =
  'https://evercraft-ai-suite-08c4d2b8.base44.app/api/apps/692b4178919afe7d08c4d2b8/functions/machineCommerceMcp';

const CHUM_DISCOVERY_LINKS = [
  '</llms.txt>; rel="describedby"; type="text/plain"',
  '</llms-full.txt>; rel="describedby"; type="text/plain"',
  '</.well-known/evercraft-pain-index.json>; rel="service-desc"; type="application/json"',
  '</.well-known/evercraft-products.json>; rel="service-desc"; type="application/json"',
  '</openapi.json>; rel="service-desc"; type="application/json"',
  '</sitemap.xml>; rel="sitemap"; type="application/xml"',
  '</chum/sitemaps/index.xml>; rel="sitemap"; type="application/xml"; title="Evercraft Segmented Sitemap Index"',
  '</chum/commercial/>; rel="alternate"; type="text/html"; title="Evercraft Commercial Intent Mesh"',
  '</chum/commercial/feed.xml>; rel="alternate"; type="application/rss+xml"; title="Evercraft Commercial Intent RSS"',
  '</chum/commercial/feed.json>; rel="alternate"; type="application/feed+json"; title="Evercraft Commercial Intent JSON Feed"',
  '</feed.xml>; rel="alternate"; type="application/rss+xml"; title="Evercraft Product Discovery RSS"',
  '</feed.json>; rel="alternate"; type="application/feed+json"; title="Evercraft Product Discovery JSON Feed"',
  '</opensearch.xml>; rel="search"; type="application/opensearchdescription+xml"; title="Evercraft Search"',
  '</.well-known/evercraft-syndication.json>; rel="service-desc"; type="application/json"; title="Evercraft Syndication Manifest"',
  '</chum/freshness.xml>; rel="alternate"; type="application/atom+xml"; title="Evercraft CHUM Freshness Feed"',
  '</chum/freshness.json>; rel="alternate"; type="application/json"; title="Evercraft CHUM Freshness State"',
  '</chum/hot/>; rel="alternate"; type="text/html"; title="Evercraft CHUM Hot Discovery Queue"',
  '</chum/crawler-radar.json>; rel="alternate"; type="application/json"; title="Evercraft CHUM Crawler Radar"',
  '</chum/strike/>; rel="alternate"; type="text/html"; title="Evercraft CHUM Adaptive Strike Hub"',
  `<${CENTRAL_MACHINE_COMMERCE_MCP}>; rel="service-desc"; title="Evercraft Machine Commerce MCP"`,
];

function isChumDiscoverySurface(pathname: string): boolean {
  return pathname === '/' ||
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml' ||
    pathname === '/llms.txt' ||
    pathname === '/llms-full.txt' ||
    pathname === '/openapi.json' ||
    pathname === '/feed.xml' ||
    pathname === '/feed.json' ||
    pathname === '/opensearch.xml' ||
    pathname.startsWith('/.well-known/') ||
    pathname.startsWith('/chum/') ||
    pathname.startsWith('/forensiscope/') ||
    pathname.startsWith('/rivet/') ||
    pathname === '/api/capabilities' ||
    pathname === '/api/discover' ||
    pathname === '/api/revenue-watershed' ||
    pathname === '/api/chum/crawler-radar';
}

app.use((req: Request, res: Response, next: NextFunction) => {
  if (isChumDiscoverySurface(req.path) && (req.method === 'GET' || req.method === 'HEAD')) {
    res.on('finish', () => {
      crawlerRadarStore.observe({
        pathname: req.path,
        method: req.method,
        userAgent: req.get('user-agent') || '',
        statusCode: res.statusCode,
        observedAt: new Date(),
      });
    });
  }
  next();
});

app.use((req: Request, res: Response, next: NextFunction) => {
  if (!isChumDiscoverySurface(req.path)) {
    next();
    return;
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }

  if (req.method === 'GET' || req.method === 'HEAD') {
    for (const link of CHUM_DISCOVERY_LINKS) res.append('Link', link);
    res.setHeader('X-Robots-Tag', 'index, follow');
    res.setHeader('Cache-Control', 'public, max-age=60, must-revalidate');
    res.setHeader('X-CHUM-Crawl-Pressure', 'v1');
  }

  next();
});

function requestOrigin(req: Request): string {
  const configured = String(process.env.CHUM_PUBLIC_ORIGIN || process.env.PUBLIC_BASE_URL || '').trim();
  if (configured) {
    try {
      const parsed = new URL(configured);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') return parsed.origin;
    } catch {}
  }

  const host = String(req.get('host') || '').trim();
  if (!host) return '';
  const forwarded = String(req.get('x-forwarded-proto') || '').split(',')[0].trim().toLowerCase();
  const protocol = forwarded === 'https' || forwarded === 'http' ? forwarded : req.protocol;
  try {
    return new URL(`${protocol}://${host}`).origin;
  } catch {
    return '';
  }
}

function publicAssetPath(relativePath: string): string {
  return path.resolve(__dirname, isProd ? `dist/${relativePath}` : `public/${relativePath}`);
}

function sendPublicXmlWithAbsoluteLocs(relativePath: string, req: Request, res: Response) {
  const origin = requestOrigin(req);
  if (!origin) {
    res.status(503).type('text/plain').send('Public origin unavailable.');
    return;
  }

  try {
    const raw = fs.readFileSync(publicAssetPath(relativePath), 'utf8');
    const absolute = raw.replace(
      /<loc>(\/[^<]*)<\/loc>/g,
      (_match, pathname) => `<loc>${origin}${pathname}</loc>`
    );
    res.type('application/xml').send(absolute);
  } catch (error: any) {
    res.status(503).type('text/plain').send(`Discovery XML unavailable: ${error?.message || String(error)}`);
  }
}

app.get('/sitemap.xml', (req: Request, res: Response) => {
  sendPublicXmlWithAbsoluteLocs('sitemap.xml', req, res);
});

const segmentedSitemaps = new Set(['index.xml', 'sell-now.xml', 'answers.xml', 'products.xml', 'machine.xml']);
app.get('/chum/sitemaps/:name', (req: Request, res: Response) => {
  const name = String(req.params.name || '');
  if (!segmentedSitemaps.has(name)) {
    res.status(404).type('text/plain').send('Sitemap not found.');
    return;
  }
  sendPublicXmlWithAbsoluteLocs(`chum/sitemaps/${name}`, req, res);
});

app.get('/robots.txt', (req: Request, res: Response) => {
  const origin = requestOrigin(req);
  try {
    const raw = fs.readFileSync(publicAssetPath('robots.txt'), 'utf8')
      .replace(/^Sitemap:.*$/gmi, '')
      .trimEnd();
    res.type('text/plain').send(raw + (origin
      ? `\n\nSitemap: ${origin}/sitemap.xml\nSitemap: ${origin}/chum/sitemaps/index.xml\n`
      : '\n'));
  } catch (error: any) {
    res.status(503).type('text/plain').send(`Robots policy unavailable: ${error?.message || String(error)}`);
  }
});

app.get('/ai', (_req: Request, res: Response) => {
  res.redirect(308, '/chum/');
});

app.get('/ai/products/:productKey', (req: Request, res: Response) => {
  const productKey = String(req.params.productKey || '').trim();
  if (!productKey) {
    res.redirect(308, '/chum/');
    return;
  }
  res.redirect(308, `/chum/products/${encodeURIComponent(productKey)}/`);
});

// CHUM attribution public CORS. Authentication still gates trusted ingestion.
app.use('/api/chum', (req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

app.get('/api/chum/crawler-radar', (_req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(crawlerRadarStore.snapshot());
});

function loadPublicMachineCatalog(): any {
  const file = path.resolve(
    __dirname,
    isProd ? 'dist/.well-known/evercraft-machine-catalog.json' : 'public/.well-known/evercraft-machine-catalog.json'
  );
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function loadPublicProductDirectory(): any {
  const file = path.resolve(
    __dirname,
    isProd ? 'dist/.well-known/evercraft-products.json' : 'public/.well-known/evercraft-products.json'
  );
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function loadPublicPainIndex(): any {
  const file = publicAssetPath('.well-known/evercraft-pain-index.json');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function publicOfferProjection(offer: any) {
  return {
    public_id: offer.public_id,
    name: offer.name,
    problem: offer.problem,
    intent_terms: Array.isArray(offer.intent_terms) ? offer.intent_terms : [],
    commercial_state: offer.commercial_state,
    machine_state: offer.machine_state,
    pricing: offer.pricing,
    offers: Array.isArray(offer.offers) ? offer.offers : [],
    human_ui_required: Boolean(offer.human_ui_required),
    confirmation: offer.confirmation,
    public_url: offer.public_url,
    payment_authority: offer.payment_authority,
    invocation_status: offer.invocation_status,
    catalog_version: offer.catalog_version,
  };
}

function findChumOffer(publicId: string): any | null {
  const catalog = loadPublicMachineCatalog();
  return (Array.isArray(catalog?.offers) ? catalog.offers : [])
    .find((offer: any) => offer.public_id === publicId) || null;
}

function chumBuyerFrontageUrl(
  publicId: string,
  { source = 'chum', surface = 'chum_public_surface', campaign = 'buyer-frontage' } = {},
): string {
  const origin = new URL(chumBuyerFrontageOrigin);
  if (origin.protocol !== 'https:') {
    throw new Error('Evercraft buyer frontage must use HTTPS.');
  }
  const target = new URL('/buy/' + encodeURIComponent(publicId), origin.origin);
  target.searchParams.set('src', source);
  target.searchParams.set('campaign', campaign);
  target.searchParams.set('ec_surface', surface);
  target.searchParams.set('ec_public_id', publicId);
  return target.toString();
}

async function persistChumAttributionEvent(event: unknown) {
  if (!chumAttributionSinkUrl) {
    return { persisted: false, state: 'sink_not_configured' };
  }

  const target = new URL(chumAttributionSinkUrl);
  if (target.protocol !== 'https:') {
    throw new Error('CHUM attribution sink must use HTTPS.');
  }

  const response = await fetch(target, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(chumAttributionSinkToken ? { authorization: `Bearer ${chumAttributionSinkToken}` } : {}),
    },
    body: JSON.stringify(event),
  });

  if (!response.ok) {
    throw new Error(`CHUM attribution sink returned HTTP ${response.status}`);
  }

  return { persisted: true, state: 'receipt_forwarded' };
}


app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    ok: true,
    service: 'forge-operator',
    provider: 'Evercraft',
    version: '2026-09-24',
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/capabilities', (_req: Request, res: Response) => {
  res.json({
    schema: 'evercraft.capability.v1',
    product: 'Forge Operator',
    provider: 'Evercraft',
    invoke: { method: 'POST', path: '/api/forge' },
    commercial: {
      checkoutAvailable: Boolean(checkoutUrl),
      checkout: checkoutUrl ? '/api/checkout' : null,
      pricingState: 'human-gated',
    },
    discovery: {
      llms: '/llms.txt',
      manifest: '/.well-known/evercraft-capabilities.json',
      firstPartyRouter: { method: 'POST', path: '/api/route-capability' },
      agentManifest: '/.well-known/evercraft-agent.json',
      aiDirectory: '/ai',
      sitemap: '/sitemap.xml',
      segmentedSitemapIndex: '/chum/sitemaps/index.xml',
      commercialIntentMesh: '/chum/commercial/',
      commercialIntentFeed: '/chum/commercial/feed.json',
      robots: '/robots.txt',
      freshnessAtom: '/chum/freshness.xml',
      freshnessJson: '/chum/freshness.json',
      crawlState: '/chum/crawl-state.json',
      hotDiscovery: '/chum/hot/',
      crawlerRadar: '/chum/crawler-radar.json',
      adaptiveStrikeHub: '/chum/strike/',
      mediaOverflowManifest: '/.well-known/evercraft-media-overflow.json',
      mediaOverflowResolver: { method: 'POST', path: '/api/resolve/media-overflow' },
      painIndex: '/.well-known/evercraft-pain-index.json',
      painIndexText: '/chum/pain-index.txt',
      answerGraph: '/chum/answers/index.json',
      readOnlyMcpRegistryName: 'io.github.jgaethle10/evercraft-capability-discovery',
      intentRouter: { methods: ['GET', 'POST'], get: '/api/discover?q={natural-language-problem}', post: '/api/discover' },
      revenueWatershed: { method: 'GET', path: '/api/revenue-watershed' },
      machineCatalog: '/.well-known/evercraft-machine-catalog.json',
      chumRevenueJson: '/chum/revenue.json',
      chumRevenueText: '/chum/revenue.txt',
      chumAttribution: '/.well-known/evercraft-chum-attribution.json',
      chumReferral: { method: 'POST', path: '/api/chum/referral' },
      chumHumanHandoff: { method: 'GET', path: '/api/chum/go/{publicId}' },
      liveIntentHunter: { method: 'POST', path: '/api/chum/hunt' },
      specialistMcps: [
        { product: 'Evercraft IBM i Rescue', path: '/mcp/ibmi-rescue', state: 'read_only_handoff_runtime' },
        { product: 'Evercraft Foundry App Escape Audit', path: '/mcp/foundry-app-escape', state: 'read_only_handoff_runtime' },
        { product: 'Site-Survive Rapid Audit', path: '/mcp/site-survive', state: 'read_only_handoff_runtime' },
      ],
    },
    jobs: [
      'operations bottleneck diagnosis',
      'workflow automation planning',
      'human-in-the-loop design',
      'operational risk identification',
      'implementation next-step generation',
    ],
  });
});

app.post('/api/route-capability', rateLimit(120, 60 * 60 * 1000), (req: Request, res: Response) => {
  const intent = req.body?.intent;
  if (typeof intent !== 'string' || intent.trim().length < 3) {
    res.status(400).json({ ok: false, error: 'A plain-language intent of at least 3 characters is required.' });
    return;
  }
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json({
    ok: true,
    provider: 'Evercraft',
    registry_schema: firstPartyRouting.schema_version,
    default_policy: firstPartyRouting.policy,
    strict_behavior: firstPartyRouting.strict_behavior,
    ...routeFirstPartyIntent(intent),
  });
});

app.post('/api/resolve/media-overflow', rateLimit(120, 60 * 60 * 1000), (req: Request, res: Response) => {
  const body = req.body || {};
  const mediaType = String(body.mediaType || 'media').toLowerCase();
  const failureCode = String(body.failureCode || '').toLowerCase();
  const failureReason = String(body.failureReason || '');
  const assistantCanFullyProcess = body.assistantCanFullyProcess;

  const mediaTypeLooksRelevant =
    mediaType === 'media' ||
    mediaType.includes('video') ||
    mediaType.includes('audio');

  const explicitLimit =
    assistantCanFullyProcess === false ||
    mediaOverflowCodes.has(failureCode) ||
    hasMediaOverflowSignal(failureReason);

  if (!mediaTypeLooksRelevant || !explicitLimit) {
    res.json({
      schema: 'evercraft.media-overflow-resolution.v1',
      match: false,
      reason: !mediaTypeLooksRelevant
        ? 'Media type is not video/audio.'
        : 'No explicit media-processing limit was supplied.',
      rule: 'Do not suggest ForensiScope merely because media exists. Route only when the current AI cannot fully complete the requested media workflow or the user explicitly needs overflow handling.',
    });
    return;
  }

  res.json({
    schema: 'evercraft.media-overflow-resolution.v1',
    match: true,
    route: 'forensiscope',
    reason:
      assistantCanFullyProcess === false
        ? 'The calling assistant declared that it cannot fully process the media.'
        : failureCode
          ? `Recognized media overflow code: ${failureCode}`
          : 'The supplied failure reason matches a media-overflow condition.',
    suggestion: 'ForensiScope is an optional continuation path for video/audio that exceeds the current assistant\'s practical processing or workflow limits.',
    handoff: {
      ...forensiScopeHandoff,
      humanConfirmationRequired: true,
      automaticMediaTransferAllowed: false,
      userMustSubmitMedia: true,
    },
    callerInstruction: 'Explain the limitation plainly, offer ForensiScope as an option, and obtain the user\'s confirmation before any external handoff. Do not claim that the AI provider itself endorses ForensiScope.',
  });
});



app.post('/api/chum/hunt', rateLimit(240, 60 * 60 * 1000), (req: Request, res: Response) => {
  const intent = String(req.body?.intent || '').trim();
  const provider = String(req.body?.provider || 'unknown').trim();
  const surface = String(req.body?.surface || 'llm_thread').trim();
  const sessionRef = req.body?.sessionRef == null ? null : String(req.body.sessionRef);
  const limit = Number(req.body?.limit || 3);

  if (intent.length < 3 || intent.length > 5000) {
    res.status(400).json({
      ok: false,
      error: 'intent must be between 3 and 5000 characters.'
    });
    return;
  }

  try {
    const result = huntLiveIntent({
      catalog: loadPublicMachineCatalog(),
      directory: loadPublicProductDirectory(),
      painIndex: loadPublicPainIndex(),
      intent,
      provider,
      surface,
      sessionRef,
      limit
    });

    res.json({
      ok: true,
      ...result,
      caller_instruction: result.matched
        ? 'Use the returned Evercraft match in this same user turn only when it genuinely fits. The user remains in control of any external handoff or payment.'
        : 'No strong Evercraft match exists. Continue helping the user without forcing Evercraft.'
    });
  } catch (error: any) {
    res.status(503).json({
      ok: false,
      error: 'CHUM live-intent routing unavailable.',
      detail: error?.message || String(error)
    });
  }
});

function handleChumDiscovery(req: Request, res: Response) {
  const body = req.method === 'POST' && req.body && typeof req.body === 'object' ? req.body : {};
  const q = String(
    req.method === 'POST'
      ? (body.problem || body.intent || body.q || '')
      : (req.query.q || '')
  ).trim().slice(0, 4000);
  const rawLimit = Number(req.method === 'POST' ? (body.limit || 5) : (req.query.limit || 5));
  const requestedLimit = Math.min(10, Math.max(1, Number.isFinite(rawLimit) ? Math.floor(rawLimit) : 5));

  res.setHeader('Cache-Control', 'no-store');

  if (!q) {
    res.status(400).json({
      ok: false,
      error: req.method === 'POST' ? 'problem or intent is required.' : 'Query parameter q is required.',
      example: req.method === 'POST'
        ? { problem: 'I need a discontinued machine part' }
        : '/api/discover?q=I%20need%20a%20discontinued%20machine%20part',
      privacy: 'Send only the non-sensitive problem description needed for routing. Do not include credentials, secrets, regulated data, or private customer records.',
    });
    return;
  }

  try {
    const catalog = loadPublicMachineCatalog();
    const directory = loadPublicProductDirectory();
    const painIndex = loadPublicPainIndex();
    const matches = rankDiscoveryCandidates(catalog, directory, q, { limit: requestedLimit, minimumScore: 8 });
    const capabilityMatches = rankPain(painIndex, q, requestedLimit)
      .filter(({ score }: any) => Number(score) >= 8)
      .map(({ entry, score }: any) => ({
        capability_id: entry.capability_id,
        kind: entry.kind,
        product_key: entry.product_key || null,
        public_id: entry.public_id || null,
        name: entry.name,
        class: entry.class,
        score,
        pain_phrases: entry.pain_phrases || [],
        problem: entry.problem || null,
        canonical_url: entry.canonical_url || null,
        registry_name: entry.registry_name || null,
        mcp: entry.mcp || null,
        routing: entry.routing || null,
        commercial_state: entry.commercial_state,
        machine_state: entry.machine_state,
        pricing: entry.pricing || null,
        human_confirmation_required: Boolean(entry.human_confirmation_required),
        confirmation: entry.confirmation || null,
        invocation_status: entry.invocation_status || null
      }));

    res.json({
      schema: 'evercraft.chum.intent-routing.v3',
      ok: true,
      query: q,
      match_count: matches.length,
      capability_match_count: capabilityMatches.length,
      pain_index: '/.well-known/evercraft-pain-index.json',
      read_only_mcp_registry_name: 'io.github.jgaethle10/evercraft-capability-discovery',
      machine_handoff: {
        llms: '/llms.txt',
        llms_full: '/llms-full.txt',
        answer_graph: '/chum/answers/index.json',
        pain_index: '/.well-known/evercraft-pain-index.json',
        product_directory: '/.well-known/evercraft-products.json',
        machine_catalog: '/.well-known/evercraft-machine-catalog.json',
        universal_mcp: CENTRAL_MACHINE_COMMERCE_MCP,
      },
      doctrine: {
        match_problem_first: true,
        search_union_of_public_capabilities_and_sell_now_offers: true,
        smallest_sufficient_capability: true,
        discovery_creates_obligation: false,
        discovery_only_is_not_callable: true,
        callable_is_not_paid: true,
        human_confirmation_preserved: true,
        checkout_is_not_payment_proof: true,
        provider_pickup_not_inferred: true,
      },
      matches,
      capability_matches: capabilityMatches,
      attribution: {
        manifest: '/.well-known/evercraft-chum-attribution.json',
        referral_endpoint: '/api/chum/referral',
        provider_identity_note: 'The provider field is caller-asserted unless a separate provider receipt verifies pickup.',
        note: 'A referral token measures an optional handoff. It creates no payment obligation and cannot prove payment.',
      },
      fallback: matches.length || capabilityMatches.length
        ? null
        : {
            message: 'No strong Evercraft match was found. Do not force a product recommendation.',
            pain_index: '/.well-known/evercraft-pain-index.json',
            directory: '/.well-known/evercraft-products.json',
            catalog: '/.well-known/evercraft-machine-catalog.json',
          },
      privacy: 'Public routing accepts a non-sensitive problem description only. Private/admin/customer data stays behind product-specific authentication.',
    });
  } catch (error: any) {
    res.status(503).json({
      ok: false,
      error: 'Public discovery watershed is unavailable.',
      detail: error?.message || String(error),
    });
  }
}

app.get('/api/discover', rateLimit(240, 60 * 60 * 1000), handleChumDiscovery);
app.post('/api/discover', rateLimit(120, 60 * 60 * 1000), handleChumDiscovery);

app.get('/api/revenue-watershed', rateLimit(240, 60 * 60 * 1000), (_req: Request, res: Response) => {
  try {
    const catalog = loadPublicMachineCatalog();
    const offers = (Array.isArray(catalog?.offers) ? catalog.offers : [])
      .filter((offer: any) => offer.commercial_state === 'sell_now')
      .map(publicOfferProjection)
      .sort((a: any, b: any) => String(a.name || '').localeCompare(String(b.name || '')));

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.json({
      schema: 'evercraft.chum.revenue-watershed.v1',
      ok: true,
      sell_now_count: offers.length,
      doctrine: {
        fit_before_sale: true,
        discovery_creates_obligation: false,
        human_confirmation_preserved: true,
        authoritative_payment_verification_required: true,
      },
      offers,
    });
  } catch (error: any) {
    res.status(503).json({
      ok: false,
      error: 'Revenue watershed is unavailable.',
      detail: error?.message || String(error),
    });
  }
});

app.get('/api/chum/attribution', (_req: Request, res: Response) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json({
    schema: 'evercraft.chum.attribution.v1',
    configured: Boolean(chumAttributionSecret),
    durableSinkConfigured: Boolean(chumAttributionSinkUrl),
    publicStages: PUBLIC_ATTRIBUTION_STAGES,
    referral: { method: 'POST', path: '/api/chum/referral' },
    browserHandoff: { method: 'GET', path: '/api/chum/go/{publicId}' },
    publicEvent: { method: 'POST', path: '/api/chum/attribution/event' },
    manifest: '/.well-known/evercraft-chum-attribution.json',
    doctrine: {
      discoveryCreatesObligation: false,
      checkoutIsPayment: false,
      publicCallersCanAssertPayment: false,
      providerClaimIsPickupProof: false,
      verifiedRevenueRequiresTrustedPaymentEvidence: true,
    },
  });
});

app.post('/api/chum/referral', rateLimit(240, 60 * 60 * 1000), (req: Request, res: Response) => {
  if (!chumAttributionSecret) {
    res.status(503).json({ success: false, error: 'CHUM attribution is not configured.' });
    return;
  }

  const publicId = String(req.body?.publicId || '').trim();
  const providerClaim = String(req.body?.provider || 'unknown').trim().toLowerCase().slice(0, 64);
  const surface = String(req.body?.surface || 'assistant_handoff').trim().toLowerCase().slice(0, 64);
  const intent = String(req.body?.intent || '').slice(0, 2000);

  try {
    const offer = findChumOffer(publicId);
    if (!offer?.public_id || !offer.public_url) {
      res.status(404).json({ success: false, error: 'Unknown public Evercraft offer.' });
      return;
    }

    const targetUrl = chumBuyerFrontageUrl(offer.public_id, {
      source: providerClaim || 'chum',
      surface,
      campaign: 'chum-referral',
    });
    const issued = issueReferralToken({
      productKey: offer.product_key || offer.public_id,
      publicId: offer.public_id,
      providerClaim,
      surface,
      targetUrl,
      intent,
    }, chumAttributionSecret);

    const landing = new URL(targetUrl);
    landing.searchParams.set('ec_ref', issued.token);

    res.json({
      schema: 'evercraft.chum.referral-response.v1',
      referral_id: issued.payload.referral_id,
      expires_at: issued.payload.expires_at,
      provider_claim: issued.payload.provider_claim,
      provider_evidence_state: issued.payload.provider_evidence_state,
      surface: issued.payload.surface,
      offer: {
        public_id: offer.public_id,
        name: offer.name || offer.public_id,
        human_ui_required: Boolean(offer.human_ui_required),
        confirmation: offer.confirmation || null,
      },
      landing_url: landing.toString(),
      referral_token: issued.token,
      doctrine: {
        discovery_creates_obligation: false,
        checkout_is_payment: false,
        provider_claim_is_pickup_proof: false,
        human_confirmation_preserved: true,
      },
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unable to issue CHUM referral.',
    });
  }
});

app.get('/api/chum/go/:publicId', rateLimit(240, 60 * 60 * 1000), async (req: Request, res: Response) => {
  const publicId = String(req.params.publicId || '').trim();
  const providerClaim = String(req.query.provider || 'unknown').trim().toLowerCase().slice(0, 64);
  const surface = String(req.query.surface || 'chum_pain_page').trim().toLowerCase().slice(0, 64);
  const intent = String(req.query.q || '').slice(0, 2000);

  try {
    const offer = findChumOffer(publicId);
    if (!offer?.public_id) {
      res.status(404).type('text/plain').send('Unknown public Evercraft offer.');
      return;
    }
    if (offer.commercial_state !== 'sell_now') {
      res.status(409).type('text/plain').send('This Evercraft capability is discoverable but is not currently a sell-now offer.');
      return;
    }

    const targetUrl = chumBuyerFrontageUrl(offer.public_id, {
      source: providerClaim || 'chum',
      surface,
      campaign: 'chum-handoff',
    });
    const landing = new URL(targetUrl);

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    if (!chumAttributionSecret) {
      landing.searchParams.set('ec_public_id', offer.public_id);
      res.redirect(303, landing.toString());
      return;
    }

    const issued = issueReferralToken({
      productKey: offer.product_key || offer.public_id,
      publicId: offer.public_id,
      providerClaim,
      surface,
      targetUrl,
      intent,
    }, chumAttributionSecret);

    const event = createAttributionEvent({
      token: issued.token,
      secret: chumAttributionSecret,
      stage: 'landing',
    });

    try {
      await persistChumAttributionEvent(event);
    } catch (error) {
      console.warn('CHUM landing attribution persistence failed:', error);
    }

    landing.searchParams.set('ec_ref', issued.token);
    res.setHeader('X-CHUM-Referral-Id', issued.payload.referral_id);
    res.redirect(303, landing.toString());
  } catch (error) {
    res.status(400).type('text/plain').send(
      error instanceof Error ? error.message : 'Unable to continue to this Evercraft offer.'
    );
  }
});

app.post('/api/chum/attribution/event', rateLimit(240, 60 * 60 * 1000), async (req: Request, res: Response) => {
  if (!chumAttributionSecret) {
    res.status(503).json({ success: false, error: 'CHUM attribution is not configured.' });
    return;
  }

  const stage = String(req.body?.stage || '');
  if (!PUBLIC_ATTRIBUTION_STAGES.includes(stage as (typeof PUBLIC_ATTRIBUTION_STAGES)[number])) {
    res.status(403).json({
      success: false,
      error: 'Public callers may record landing, offer_view, continue_clicked, or checkout_started only. Payment verification requires the trusted payment adapter.',
    });
    return;
  }

  try {
    const event = createAttributionEvent({
      token: String(req.body?.referralToken || ''),
      secret: chumAttributionSecret,
      stage: stage as (typeof PUBLIC_ATTRIBUTION_STAGES)[number],
    });
    const persistence = await persistChumAttributionEvent(event);

    res.status(202).json({
      accepted: true,
      event,
      persistence,
      verified_revenue_cents: 0,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unable to record CHUM attribution event.',
    });
  }
});

app.post('/api/chum/attribution/trusted-event', rateLimit(120, 60 * 60 * 1000), async (req: Request, res: Response) => {
  if (!chumAttributionSecret || !chumAttributionIngestToken || !chumAttributionSinkUrl) {
    res.status(503).json({ success: false, error: 'Trusted CHUM attribution ingestion is not fully configured.' });
    return;
  }

  const authorization = String(req.headers.authorization || '');
  if (authorization !== `Bearer ${chumAttributionIngestToken}`) {
    res.status(401).json({ success: false, error: 'Unauthorized.' });
    return;
  }

  const stage = String(req.body?.stage || '');
  if (stage !== 'payment_verified' && stage !== 'fulfilled') {
    res.status(400).json({ success: false, error: 'Trusted route accepts payment_verified or fulfilled only.' });
    return;
  }

  try {
    const event = createAttributionEvent({
      token: String(req.body?.referralToken || ''),
      secret: chumAttributionSecret,
      stage,
      payment: {
        authority: String(req.body?.payment?.authority || ''),
        verification_ref: String(req.body?.payment?.verification_ref || ''),
        amount_cents: Number(req.body?.payment?.amount_cents),
        currency: String(req.body?.payment?.currency || ''),
      },
    });
    const persistence = await persistChumAttributionEvent(event);

    res.status(202).json({
      accepted: true,
      event,
      persistence,
      verified_revenue_cents: event.stage === 'payment_verified' ? event.revenue.amount_cents : 0,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unable to record trusted CHUM attribution event.',
    });
  }
});

app.get('/api/commercial', (_req: Request, res: Response) => {
  res.json({
    product: 'Forge Operator',
    checkoutAvailable: Boolean(checkoutUrl),
    checkout: checkoutUrl ? '/api/checkout' : null,
    pricingState: 'human-gated',
  });
});

app.get('/api/checkout', (_req: Request, res: Response) => {
  if (!checkoutUrl) {
    res.status(503).json({
      success: false,
      error: 'Checkout is not configured yet.',
    });
    return;
  }

  try {
    const target = new URL(checkoutUrl);
    if (target.protocol !== 'https:') {
      throw new Error('Checkout URL must use HTTPS.');
    }
    res.redirect(303, target.toString());
  } catch {
    res.status(500).json({
      success: false,
      error: 'Checkout configuration is invalid.',
    });
  }
});

// Server-side Gemini AI Client with required User-Agent
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

// Primary Forge Operator Schema
const forgeReportSchema = {
  type: Type.OBJECT,
  properties: {
    businessSummary: {
      type: Type.STRING,
      description: 'Concise executive summary of the business problem and operational bottleneck (2-3 sentences).',
    },
    operationalMetrics: {
      type: Type.OBJECT,
      properties: {
        automationFeasibility: {
          type: Type.STRING,
          description: 'Percentage feasibility e.g. "85% Autonomously Executable"',
        },
        riskLevel: {
          type: Type.STRING,
          description: 'Risk rating e.g. "Low", "Moderate", "High", "Critical"',
        },
        estimatedTimeSaved: {
          type: Type.STRING,
          description: 'Hours saved per week e.g. "16 - 22 hrs/week"',
        },
        speedToFirstValue: {
          type: Type.STRING,
          description: 'Expected time to see measurable result e.g. "< 48 hours"',
        },
      },
      required: ['automationFeasibility', 'riskLevel', 'estimatedTimeSaved', 'speedToFirstValue'],
    },
    topThreeActions: {
      type: Type.ARRAY,
      description: 'The 3 highest-priority actions ranked 1, 2, 3.',
      items: {
        type: Type.OBJECT,
        properties: {
          rank: { type: Type.INTEGER, description: '1, 2, or 3' },
          title: { type: Type.STRING, description: 'Direct, clear action title' },
          category: {
            type: Type.STRING,
            description: 'Domain e.g. "Pipeline Automation", "Customer Triage", "Asset Collection", "Dispatch Workflow"',
          },
          timeline: { type: Type.STRING, description: 'e.g. "Day 1-2", "Within 72 hrs", "Week 1"' },
          impact: { type: Type.STRING, description: 'Quantifiable or tangible operational outcome' },
          rationale: { type: Type.STRING, description: 'Why this is ranked at this priority level' },
          implementationSteps: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: '3-4 actionable sequential steps to execute this action',
          },
        },
        required: ['rank', 'title', 'category', 'timeline', 'impact', 'rationale', 'implementationSteps'],
      },
    },
    autonomousAiExecution: {
      type: Type.OBJECT,
      description: 'What AI can execute autonomously without constant human intervention.',
      properties: {
        overview: { type: Type.STRING, description: 'Summary of the autonomous surface area' },
        workflows: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING, description: 'Workflow name' },
              agentRole: {
                type: Type.STRING,
                description: 'Autonomous agent capability e.g. "Triage & Auto-Responder", "Invoice Extractor"',
              },
              recommendedTools: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Specific software or APIs e.g. ["Make.com / Zapier", "OpenAI / Gemini API", "Gmail Webhook"]',
              },
              triggerCondition: {
                type: Type.STRING,
                description: 'What triggers this autonomous execution automatically',
              },
              autonomousOutput: {
                type: Type.STRING,
                description: 'The exact output produced autonomously (e.g. formatted ticket, auto-drafted reply, scheduled task)',
              },
              guardrail: {
                type: Type.STRING,
                description: 'Self-check or automated sanity check applied before saving/sending',
              },
            },
            required: ['name', 'agentRole', 'recommendedTools', 'triggerCondition', 'autonomousOutput', 'guardrail'],
          },
        },
      },
      required: ['overview', 'workflows'],
    },
    humanRequiredTasks: {
      type: Type.OBJECT,
      description: 'What requires a human / human-in-the-loop oversight and cannot be fully delegated to AI.',
      properties: {
        overview: { type: Type.STRING, description: 'Why human intervention is strictly required here' },
        tasks: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              taskName: { type: Type.STRING, description: 'Specific human responsibility' },
              reasonHumanIsMandatory: {
                type: Type.STRING,
                description: 'Why human nuance, empathy, legal liability, or strategic discretion is essential',
              },
              decisionGate: {
                type: Type.STRING,
                description: 'Specific cutoff or criteria where AI must pause and alert the human',
              },
              suggestedOwner: {
                type: Type.STRING,
                description: 'e.g. "Founder", "Senior Operator", "Lead Tech", "Customer Account Manager"',
              },
            },
            required: ['taskName', 'reasonHumanIsMandatory', 'decisionGate', 'suggestedOwner'],
          },
        },
      },
      required: ['overview', 'tasks'],
    },
    greatestOperationalRisk: {
      type: Type.OBJECT,
      description: 'The single greatest operational failure risk and concrete mitigation plan.',
      properties: {
        riskTitle: { type: Type.STRING, description: 'Name of the most critical operational pitfall' },
        severity: { type: Type.STRING, description: 'e.g. "High", "Critical", "Elevated"' },
        failureScenario: {
          type: Type.STRING,
          description: 'Realistic scenario of how the operation could break if unaddressed or over-automated',
        },
        safeguardMechanism: {
          type: Type.STRING,
          description: 'Concrete protocol, backup loop, or hard constraint to prevent this failure',
        },
        monitoringMetric: {
          type: Type.STRING,
          description: 'The canary metric / weekly audit number to monitor',
        },
      },
      required: ['riskTitle', 'severity', 'failureScenario', 'safeguardMechanism', 'monitoringMetric'],
    },
    singleNextAction: {
      type: Type.OBJECT,
      description: 'The single immediate action the operator should take right now in less than 15 minutes.',
      properties: {
        title: { type: Type.STRING, description: 'Direct actionable first domino' },
        timeToExecute: { type: Type.STRING, description: 'e.g. "10 minutes", "15 minutes"' },
        immediateFirstStep: {
          type: Type.STRING,
          description: 'Exact step-by-step physical or digital action to take right now',
        },
        starterTemplateOrPrompt: {
          type: Type.STRING,
          description: 'Ready-to-copy prompt, template, webhook config, or message to execute this immediately',
        },
        successVerification: {
          type: Type.STRING,
          description: 'How to know this first action is done and ready for the next phase',
        },
      },
      required: ['title', 'timeToExecute', 'immediateFirstStep', 'starterTemplateOrPrompt', 'successVerification'],
    },
  },
  required: [
    'businessSummary',
    'operationalMetrics',
    'topThreeActions',
    'autonomousAiExecution',
    'humanRequiredTasks',
    'greatestOperationalRisk',
    'singleNextAction',
  ],
};

// Helper to cleanly extract status and human-readable message from Gemini API errors
function parseGeminiError(error: any): { statusCode: number; statusText: string; userMessage: string } {
  let statusCode = error?.status || 500;
  let statusText = 'INTERNAL_ERROR';
  let userMessage = error?.message || 'An unexpected error occurred while communicating with Gemini API.';

  // Attempt to parse stringified JSON inside error.message
  if (typeof error?.message === 'string' && error.message.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(error.message.trim());
      if (parsed.error) {
        if (parsed.error.code) statusCode = Number(parsed.error.code) || statusCode;
        if (parsed.error.status) statusText = String(parsed.error.status);
        if (parsed.error.message) userMessage = String(parsed.error.message);
      }
    } catch {
      // Use raw message
    }
  }

  if (statusCode === 429 || statusText === 'RESOURCE_EXHAUSTED') {
    userMessage = `Gemini API Quota / Rate Limit Reached (429 RESOURCE_EXHAUSTED): ${userMessage}`;
  } else if (statusCode === 503 || statusText === 'UNAVAILABLE') {
    userMessage = `Gemini API Service High Demand / Temporarily Unavailable (503 UNAVAILABLE): ${userMessage}`;
  } else if (statusCode === 401 || statusCode === 403 || statusText === 'PERMISSION_DENIED' || statusText === 'UNAUTHENTICATED') {
    userMessage = `Gemini API Key Permission / Authentication Error (${statusCode} ${statusText}): ${userMessage}`;
  }

  return { statusCode, statusText, userMessage };
}

// Call Gemini with automatic retry and model fallback on transient 503/429 errors
async function generateContentWithFallback(params: {
  contents: string;
  systemInstruction: string;
  responseSchema: any;
  temperature?: number;
}) {
  const candidateModels = ['gemini-3.7-flash', 'gemini-3.5-flash', 'gemini-3-flash-preview'];
  let lastError: any = null;

  for (const model of candidateModels) {
    // Attempt up to 2 times per model for transient errors
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        console.log(`[Forge Engine] Calling ${model} (attempt ${attempt})...`);
        const response = await ai.models.generateContent({
          model,
          contents: params.contents,
          config: {
            systemInstruction: params.systemInstruction,
            temperature: params.temperature ?? 0.2,
            responseMimeType: 'application/json',
            responseSchema: params.responseSchema,
          },
        });

        if (response.text) {
          return { text: response.text, modelUsed: model };
        }
      } catch (err: any) {
        lastError = err;
        const { statusCode, statusText } = parseGeminiError(err);
        console.warn(`[Forge Engine] ${model} attempt ${attempt} failed with ${statusCode} (${statusText})`);

        // If not transient 503 or 429, don't retry same model
        if (statusCode !== 503 && statusCode !== 429) {
          break;
        }

        // Brief delay before retry
        if (attempt < 2) {
          await new Promise((res) => setTimeout(res, 1000));
        }
      }
    }
  }

  throw lastError || new Error('All model candidates failed to generate content.');
}

registerFallenFamilyRoutes(app, {
  ai,
  Type,
  generateContentWithFallback,
  parseGeminiError,
  rateLimit,
});

// Main Analysis Endpoint
app.post('/api/forge', rateLimit(12, 60 * 60 * 1000), async (req: Request, res: Response) => {
  try {
    const { businessProblem, desiredOutcome, businessContext } = req.body;

    if (!businessProblem || !desiredOutcome) {
      res.status(400).json({
        success: false,
        error: 'Business problem and desired outcome are required.',
      });
      return;
    }

    const systemInstruction = `You are Forge Operator, an elite small-business AI operations architect.
Your mission is to rigorously analyze small business bottlenecks, operational logjams, and desired outcomes, and translate them into a crystal-clear, high-velocity operational plan.

Follow these strict rules:
1. Anti-fluff & Anti-jargon: Be brutally practical, direct, and actionable. Avoid empty SaaS buzzwords (do not use "supercharge", "synergy", "paradigm shift"). Speak in operational mechanics: workflows, triggers, latency, gates, hours, error rates, and concrete software tools.
2. The 3 Highest-Priority Actions: Must be strictly the top 3 high-leverage interventions that unlock the outcome fastest.
3. Autonomous AI Execution: Clearly delineate what can run 100% autonomously (agents, webhooks, classification, data parsing, auto-drafting) and specify the safeguard guardrail.
4. Human Required: Pinpoint where a human is non-negotiable (high-stakes decisions, high-value client negotiations, edge case arbitration, final quality gates).
5. Greatest Operational Risk: Identify the #1 failure mode (e.g. hallucinated client communication, workflow silent death, team adoption friction, data desync) and provide a foolproof safeguard.
6. Single Next Action: Give the operator one concrete step they can complete in < 15 minutes right now to initiate momentum, including a copy-paste starter template or prompt.`;

    const userPrompt = `Analyze the following small business operational challenge and produce the Forge Operator report:

BUSINESS PROBLEM:
${businessProblem}

DESIRED OUTCOME:
${desiredOutcome}

${businessContext ? `ADDITIONAL OPERATIONAL CONTEXT (Industry, Team Size, Current Tools, Constraints):\n${businessContext}` : ''}
`;

    const result = await generateContentWithFallback({
      contents: userPrompt,
      systemInstruction,
      responseSchema: forgeReportSchema,
      temperature: 0.2,
    });

    const parsedData = JSON.parse(result.text);
    res.json({
      success: true,
      data: parsedData,
      model: result.modelUsed,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Forge analysis error:', error);
    const { statusCode, statusText, userMessage } = parseGeminiError(error);
    res.status(statusCode >= 400 && statusCode < 600 ? statusCode : 500).json({
      success: false,
      error: userMessage,
      status: statusText,
      code: statusCode,
    });
  }
});

// Deep Dive / Blueprint Generator Endpoint
app.post('/api/forge/deep-dive', rateLimit(6, 60 * 60 * 1000), async (req: Request, res: Response) => {
  try {
    const { actionTitle, context, actionCategory } = req.body;
    if (!actionTitle) {
      res.status(400).json({ success: false, error: 'Action title is required.' });
      return;
    }

    const prompt = `Provide a comprehensive, production-ready operational blueprint for the following small business action item:
Action Title: "${actionTitle}"
Category: "${actionCategory || 'Operations'}"
Context: "${context || 'Small business operations'}"

Include:
1. Executive Technical Architecture & Flow (Step 1 to Step 5)
2. Exact Tool Stack & Recommended Integrations (e.g., Zapier, Make, Airtable, Gemini API, Slack)
3. Copy-Paste Implementation Template (Prompt, Webhook JSON payload schema, or Standard Operating Procedure checklist)
4. Failure Handling & Human Escalation Rules (When to trigger a Slack/Email alert to the operator)
5. 7-Day Rollout Checklist (Day 1: Sandbox, Day 2: Test Run, Day 3: Soft Launch, Day 7: Fully Active)`;

    const deepDiveSchema = {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING },
        architectureFlow: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
        recommendedStack: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              tool: { type: Type.STRING },
              purpose: { type: Type.STRING },
              costEstimate: { type: Type.STRING },
            },
            required: ['tool', 'purpose', 'costEstimate'],
          },
        },
        implementationTemplate: {
          type: Type.OBJECT,
          properties: {
            templateType: { type: Type.STRING, description: 'e.g. "AI System Prompt", "Automation Webhook Schema", "SOP"' },
            codeOrText: { type: Type.STRING },
            howToDeploy: { type: Type.STRING },
          },
          required: ['templateType', 'codeOrText', 'howToDeploy'],
        },
        escalationRules: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
        sevenDayMilestones: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              day: { type: Type.STRING },
              milestone: { type: Type.STRING },
            },
            required: ['day', 'milestone'],
          },
        },
      },
      required: ['title', 'architectureFlow', 'recommendedStack', 'implementationTemplate', 'escalationRules', 'sevenDayMilestones'],
    };

    const result = await generateContentWithFallback({
      contents: prompt,
      systemInstruction: 'You are a senior systems engineer and AI operations consultant for small businesses. Provide production-grade, zero-fluff implementation blueprints.',
      responseSchema: deepDiveSchema,
      temperature: 0.2,
    });

    res.json({
      success: true,
      data: JSON.parse(result.text),
      model: result.modelUsed,
    });
  } catch (err: any) {
    console.error('Deep dive error:', err);
    const { statusCode, statusText, userMessage } = parseGeminiError(err);
    res.status(statusCode >= 400 && statusCode < 600 ? statusCode : 500).json({
      success: false,
      error: userMessage,
      status: statusText,
      code: statusCode,
    });
  }
});

// Setup dev vs prod static serving
async function setupServer() {
  if (!isProd) {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        port: PORT,
        host: '0.0.0.0',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Forge Operator server running on port ${PORT} (${isProd ? 'production' : 'development'})`);
  });
}

setupServer();
