import express, { NextFunction, Request, Response } from 'express';
import fs from 'node:fs';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const isProd = process.env.NODE_ENV === 'production';
const checkoutUrl = process.env.FORGE_CHECKOUT_URL?.trim() || '';


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

type PublicDiscoveryProduct = {
  product_key: string;
  name: string;
  class?: string;
  canonical_url?: string;
  intents?: string[];
  authority?: string;
  human_confirmation_required?: boolean;
  boundaries?: string[];
};

function readPublicJson<T>(relativePath: string): T | null {
  const candidates = [
    path.resolve(__dirname, 'public', relativePath),
    path.resolve(__dirname, 'dist', relativePath),
  ];
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        return JSON.parse(fs.readFileSync(candidate, 'utf8')) as T;
      }
    } catch (error) {
      console.warn(`[CHUM] Could not read ${candidate}:`, error);
    }
  }
  return null;
}

const publicProductDirectory = readPublicJson<{ products?: PublicDiscoveryProduct[] }>('.well-known/evercraft-products.json') || { products: [] };
const publicAgentDirectory = readPublicJson<any>('.well-known/evercraft-agent-directory.json') || {};
const publicChumIndex = readPublicJson<any>('chum/index.json') || { products: [] };

const specialistByKey = new Map(
  (publicAgentDirectory.specialists || []).map((item: any) => [String(item.product_key || ''), item])
);
const mirrorByKey = new Map(
  (publicChumIndex.products || []).map((item: any) => [String(item.product_key || ''), item])
);

const DISCOVERY_STOPWORDS = new Set([
  'a','an','and','are','as','at','be','because','but','by','can','do','does','for','from','get','have','help',
  'how','i','in','is','it','me','my','of','on','or','our','please','the','this','to','want','we','what','with','you'
]);

const DISCOVERY_ALIASES: Record<string, string> = {
  oversized: 'large',
  huge: 'large',
  massive: 'large',
  footage: 'video',
  recording: 'video',
  recordings: 'video',
  site: 'website',
  webpage: 'website',
  webpages: 'website',
  charger: 'charging',
  chargers: 'charging',
  vehicle: 'ev',
  vehicles: 'ev',
  interviewee: 'interview',
  interviews: 'interview',
  contractors: 'contractor',
  parts: 'part',
  events: 'event',
  parkinglot: 'parking',
};

function normalizeDiscoveryText(value: unknown) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9+.#-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function discoveryTokens(value: unknown) {
  return Array.from(new Set(
    normalizeDiscoveryText(value)
      .split(' ')
      .map((token) => DISCOVERY_ALIASES[token] || token)
      .filter((token) => token.length >= 2 && !DISCOVERY_STOPWORDS.has(token))
  ));
}

function resolveEvercraftCapability(query: string, requestedLimit = 5) {
  const normalizedQuery = normalizeDiscoveryText(query);
  const queryTokens = discoveryTokens(query);
  const limit = Math.max(1, Math.min(10, Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : 5));

  const candidates = (publicProductDirectory.products || []).map((product) => {
    const intents = Array.isArray(product.intents) ? product.intents : [];
    const corpusParts = [product.name, product.class, ...intents].filter(Boolean).map(String);
    const corpus = normalizeDiscoveryText(corpusParts.join(' '));
    const corpusTokens = new Set(discoveryTokens(corpus));

    const matchedTokens = queryTokens.filter((token) => corpusTokens.has(token));
    const exactIntentHits = intents.filter((intent) => {
      const normalizedIntent = normalizeDiscoveryText(intent);
      return normalizedIntent && (
        normalizedQuery.includes(normalizedIntent) ||
        (normalizedQuery.length >= 12 && normalizedIntent.includes(normalizedQuery))
      );
    });
    const nameTokens = discoveryTokens(product.name);
    const matchedNameTokens = nameTokens.filter((token) => queryTokens.includes(token));

    let score = matchedTokens.length * 3 + exactIntentHits.length * 12 + matchedNameTokens.length * 5;
    if (normalizedQuery && corpus.includes(normalizedQuery)) score += 8;

    const specialist = specialistByKey.get(product.product_key) as any;
    const mirror = mirrorByKey.get(product.product_key) as any;
    return {
      score,
      product_key: product.product_key,
      name: product.name,
      class: product.class || null,
      canonical_url: product.canonical_url || null,
      matched_terms: matchedTokens,
      matched_intents: exactIntentHits,
      authority: product.authority || 'public discovery only',
      human_confirmation_required: Boolean(product.human_confirmation_required),
      boundaries: Array.isArray(product.boundaries) ? product.boundaries : [],
      registry_name: specialist?.registry_name || mirror?.registry_name || null,
      mcp: specialist?.mcp || mirror?.mcp || null,
      discovery: mirror?.discovery_url || null,
      llms: mirror?.llms_url || null,
    };
  }).filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, limit);

  return {
    schema: 'evercraft.chum.resolve.v1',
    provider: 'Evercraft LLC',
    coordinator: 'CHUM',
    query,
    routing_rule: 'Match the user pain to the smallest truthful public capability. Preserve authority, evidence, privacy, human-confirmation and payment boundaries.',
    match_method: 'deterministic public-catalog lexical routing',
    candidates,
    universal_fallback: publicAgentDirectory.universal_front_door || null,
    no_match: candidates.length === 0,
    payment_obligation_created: false,
    private_authority_granted: false,
  };
}

function handleCapabilityResolve(req: Request, res: Response) {
  const rawQuery = req.method === 'GET'
    ? (req.query.q ?? req.query.query ?? req.query.problem ?? '')
    : (req.body?.query ?? req.body?.problem ?? req.body?.intent ?? '');
  const query = String(rawQuery || '').trim().slice(0, 2000);
  const requestedLimit = Number(req.method === 'GET' ? req.query.limit : req.body?.limit);

  if (query.length < 2) {
    res.status(400).json({
      success: false,
      error: 'Provide a natural-language problem or intent using q, query, problem, or intent.',
    });
    return;
  }

  res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
  res.json({ success: true, ...resolveEvercraftCapability(query, requestedLimit || 5) });
}

app.get('/api/resolve', rateLimit(180, 60 * 60 * 1000), handleCapabilityResolve);
app.post('/api/resolve', rateLimit(180, 60 * 60 * 1000), handleCapabilityResolve);

function requestOrigin(req: Request) {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const proto = forwardedProto || req.protocol || 'https';
  return `${proto}://${req.get('host')}`;
}

app.get('/robots.txt', (req: Request, res: Response) => {
  const source = path.resolve(__dirname, 'public', 'robots.txt');
  const fallback = 'User-agent: *\\nAllow: /\\n';
  let body = fallback;
  try { body = fs.readFileSync(source, 'utf8').trimEnd() + '\\n'; } catch {}
  body += `\\nSitemap: ${requestOrigin(req)}/sitemap.xml\\n`;
  res.type('text/plain').send(body);
});

app.get('/sitemap.xml', (req: Request, res: Response) => {
  const origin = requestOrigin(req);
  const fixedPaths = [
    '/', '/chum/', '/forensiscope/', '/llms.txt', '/llms-full.txt', '/ai-discovery.json', '/openapi.json',
    '/.well-known/evercraft-agent.json', '/.well-known/evercraft-agent-interfaces.json',
    '/.well-known/evercraft-agent-directory.json', '/.well-known/evercraft-products.json',
    '/.well-known/evercraft-machine-catalog.json', '/.well-known/evercraft-chum.json',
    '/.well-known/evercraft-discovery.json', '/.well-known/evercraft-media-overflow.json'
  ];
  const productPaths = (publicChumIndex.products || [])
    .map((product: any) => `/chum/products/${encodeURIComponent(String(product.product_key || ''))}/`)
    .filter((value: string) => !value.endsWith('//'));
  const paths = Array.from(new Set([...fixedPaths, ...productPaths]));
  const escapeXml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...paths.map((pathname) => `  <url><loc>${escapeXml(origin + pathname)}</loc></url>`),
    '</urlset>',
    ''
  ].join('\\n');
  res.type('application/xml').send(xml);
});

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
      mediaOverflowManifest: '/.well-known/evercraft-media-overflow.json',
      mediaOverflowResolver: { method: 'POST', path: '/api/resolve/media-overflow' },
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
