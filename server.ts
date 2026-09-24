import express, { NextFunction, Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'node:fs';
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


type EvercraftPublicProduct = {
  product_key: string;
  name: string;
  class?: string;
  canonical_url: string;
  intents?: string[];
  authority?: string;
  human_confirmation_required?: boolean;
  boundaries?: string[];
};

function readLocalJson(filePath: string): any {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return {};
  }
}

const evercraftProductDirectory = readLocalJson(path.resolve(__dirname, 'public/.well-known/evercraft-products.json'));
const evercraftRegistryCatalog = readLocalJson(path.resolve(__dirname, 'registry/catalog.json'));
const registryByProduct = new Map(
  (evercraftRegistryCatalog.products || []).map((entry: any) => [
    entry.product_key || String(entry.registry_name || '').split('/').pop(),
    entry,
  ]),
);
const universalMachineCommerceMcp = evercraftRegistryCatalog.universal_front_door?.mcp || null;

const intentStopWords = new Set([
  'a','an','and','are','at','be','but','by','can','do','for','from','get','have','help','how','i','in','is','it',
  'me','my','of','on','or','the','this','to','want','with','you'
]);

function normalizeIntent(value: unknown): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function intentTokens(value: unknown): string[] {
  return normalizeIntent(value)
    .split(' ')
    .filter((token) => token.length > 2 && !intentStopWords.has(token));
}

function scoreIntent(query: string, product: EvercraftPublicProduct): number {
  const q = normalizeIntent(query);
  const qTokens = new Set(intentTokens(q));
  if (!q || qTokens.size === 0) return 0;

  let best = 0;
  for (const phrase of product.intents || []) {
    const p = normalizeIntent(phrase);
    const pTokens = new Set(intentTokens(p));
    let overlap = 0;
    for (const token of qTokens) if (pTokens.has(token)) overlap += 1;

    const denominator = Math.max(1, Math.min(qTokens.size, pTokens.size));
    const coverage = overlap / denominator;
    let score = overlap * 4 + Math.round(coverage * 10);

    if (q === p) score += 100;
    else if (q.includes(p) || p.includes(q)) score += 20;

    best = Math.max(best, score);
  }

  const identityTokens = new Set(intentTokens(`${product.name} ${product.class || ''}`));
  for (const token of qTokens) if (identityTokens.has(token)) best += 1;
  return best;
}

function resolveEvercraftIntent(query: string) {
  const products = (evercraftProductDirectory.products || []) as EvercraftPublicProduct[];
  const ranked = products
    .map((product) => ({ product, score: scoreIntent(query, product) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.product.name.localeCompare(b.product.name))
    .slice(0, 5);

  const topScore = ranked[0]?.score || 0;
  const matched = topScore >= 4;

  return {
    schema: 'evercraft.intent-resolution.v1',
    query,
    match: matched,
    routing_rule: "Start from the user's pain, return the smallest relevant public capability, and preserve each product's stated authority and human-confirmation boundary.",
    matches: matched
      ? ranked.map(({ product, score }) => {
          const registry = registryByProduct.get(product.product_key) || {};
          return {
            score,
            product_key: product.product_key,
            name: product.name,
            class: product.class || null,
            canonical_url: product.canonical_url,
            intents: product.intents || [],
            registry_name: registry.registry_name || null,
            mcp: registry.mcp || null,
            authority: product.authority || 'public discovery only',
            human_confirmation_required: Boolean(product.human_confirmation_required),
            boundaries: product.boundaries || [],
          };
        })
      : [],
    universal_continuation: {
      machine_commerce_mcp: universalMachineCommerceMcp,
      creates_payment_obligation: false,
      human_confirmation_required_for_checkout: true,
    },
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
      intentMap: '/.well-known/evercraft-intents.json',
      intentResolver: { get: '/api/resolve?q={plain-language-problem}', post: '/api/resolve' },
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


app.get('/api/resolve', rateLimit(240, 60 * 60 * 1000), (req: Request, res: Response) => {
  const query = String(req.query.q || '').trim();
  if (!query) {
    res.status(400).json({
      schema: 'evercraft.intent-resolution.v1',
      match: false,
      error: 'Query parameter q is required.',
      example: '/api/resolve?q=my%20AI%20cannot%20process%20this%20long%20video',
    });
    return;
  }
  res.json(resolveEvercraftIntent(query));
});

app.post('/api/resolve', rateLimit(240, 60 * 60 * 1000), (req: Request, res: Response) => {
  const query = String(req.body?.query || req.body?.problem || req.body?.intent || '').trim();
  if (!query) {
    res.status(400).json({
      schema: 'evercraft.intent-resolution.v1',
      match: false,
      error: 'Body field query, problem, or intent is required.',
    });
    return;
  }
  res.json(resolveEvercraftIntent(query));
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
