import fs from 'node:fs';
import path from 'node:path';
import { Router, Request, Response } from 'express';

const router = Router();

type ProductEntry = {
  product_key: string;
  name: string;
  class?: string;
  canonical_url: string;
  intents?: string[];
  authority?: string;
  human_confirmation_required?: boolean;
  boundaries?: string[];
  machine_contract?: string;
  overflow_contract?: string;
  overflow_signals?: string[];
  handoff_policy?: Record<string, unknown>;
};

type ProductDirectory = {
  schema?: string;
  provider?: string;
  purpose?: string;
  updated_at?: string;
  routing_rule?: string;
  products?: ProductEntry[];
};

const STOPWORDS = new Set([
  'about','after','again','also','and','are','because','been','before','but','can','could','does','for',
  'from','have','help','how','into','need','not','our','out','service','should','that','the','their',
  'them','there','they','this','use','want','what','when','where','which','with','would','your','you'
]);

function normalize(value: unknown): string {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokens(value: unknown): string[] {
  return normalize(value)
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));
}

function readDirectory(): ProductDirectory {
  const candidates = [
    path.resolve(process.cwd(), 'dist/.well-known/evercraft-products.json'),
    path.resolve(process.cwd(), 'public/.well-known/evercraft-products.json'),
  ];

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    return JSON.parse(fs.readFileSync(candidate, 'utf8'));
  }

  throw new Error('Evercraft public product directory is unavailable.');
}

function overlapScore(queryTokens: string[], candidateTokens: string[]): number {
  if (!queryTokens.length || !candidateTokens.length) return 0;
  const candidate = new Set(candidateTokens);
  return queryTokens.reduce((score, token) => score + (candidate.has(token) ? 1 : 0), 0);
}

function scoreIntent(query: string, queryTokens: string[], intent: string): number {
  const intentNorm = normalize(intent);
  const intentTokens = tokens(intent);
  let score = overlapScore(queryTokens, intentTokens) * 8;

  if (query.includes(intentNorm) || intentNorm.includes(query)) score += 70;

  const longShared = queryTokens.filter((token) => token.length >= 6 && intentTokens.includes(token)).length;
  score += longShared * 5;

  return score;
}

function scoreProduct(query: string, product: ProductEntry) {
  const queryTokens = tokens(query);
  const nameNorm = normalize(product.name);
  const classNorm = normalize(product.class || '');
  const intents = Array.isArray(product.intents) ? product.intents : [];

  let score = 0;
  if (nameNorm && query.includes(nameNorm)) score += 90;
  score += overlapScore(queryTokens, tokens(product.name)) * 16;
  score += overlapScore(queryTokens, tokens(classNorm)) * 5;

  const intentScores = intents
    .map((intent) => ({ intent, score: scoreIntent(query, queryTokens, intent) }))
    .sort((a, b) => b.score - a.score);

  score += intentScores.slice(0, 3).reduce((sum, item) => sum + item.score, 0);

  return {
    score,
    matchedIntents: intentScores.filter((item) => item.score > 0).slice(0, 3).map((item) => item.intent),
  };
}

function safeProvider(value: unknown): string {
  const candidate = normalize(value).replace(/\s+/g, '-');
  const allowed = new Set(['chatgpt','claude','gemini','copilot','perplexity','grok','generic-agent','unknown']);
  return allowed.has(candidate) ? candidate : 'unknown';
}

function attributedUrl(url: string, productKey: string, provider: string): string {
  try {
    const target = new URL(url);
    if (!['http:', 'https:'].includes(target.protocol)) return url;
    target.searchParams.set('utm_source', provider === 'unknown' ? 'chum' : provider);
    target.searchParams.set('utm_medium', 'ai_handoff');
    target.searchParams.set('utm_campaign', 'evercraft_chum');
    target.searchParams.set('utm_content', productKey);
    return target.toString();
  } catch {
    return url;
  }
}

router.get('/', (_req: Request, res: Response) => {
  const directory = readDirectory();
  res.json({
    schema: 'evercraft.chum.runtime.v1',
    name: 'CHUM',
    expansion: 'Capability Handoff & Utility Mesh',
    provider: directory.provider || 'Evercraft',
    purpose: 'Resolve natural-language needs to the smallest appropriate public Evercraft capability.',
    discover: {
      method: 'GET',
      path: '/api/chum/discover',
      query: 'q',
      optional_provider: 'provider',
    },
    directory: '/.well-known/evercraft-products.json',
    manifest: '/.well-known/chum.json',
    llms: '/llms.txt',
    rules: {
      public_capabilities_only: true,
      private_topology_exposed: false,
      payment_obligation_created_by_discovery: false,
      human_confirmation_preserved: true,
    },
  });
});

router.get('/products', (_req: Request, res: Response) => {
  const directory = readDirectory();
  res.json(directory);
});

router.get('/discover', (req: Request, res: Response) => {
  const rawQuery = String(req.query.q || '').trim();
  const provider = safeProvider(req.query.provider);

  if (!rawQuery) {
    res.status(400).json({
      success: false,
      error: 'Query parameter q is required.',
      example: '/api/chum/discover?q=I+need+help+finding+a+discontinued+machine+part',
    });
    return;
  }

  if (rawQuery.length > 1200) {
    res.status(400).json({ success: false, error: 'Query is too long.' });
    return;
  }

  const directory = readDirectory();
  const normalizedQuery = normalize(rawQuery);

  const ranked = (directory.products || [])
    .map((product) => ({ product, ...scoreProduct(normalizedQuery, product) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  res.json({
    schema: 'evercraft.chum.discovery-result.v1',
    success: true,
    query: rawQuery,
    provider,
    routing_rule: directory.routing_rule || null,
    matches: ranked.map(({ product, matchedIntents }) => ({
      product_key: product.product_key,
      name: product.name,
      class: product.class || null,
      canonical_url: product.canonical_url,
      attributed_handoff_url: attributedUrl(product.canonical_url, product.product_key, provider),
      matched_intents: matchedIntents,
      authority: product.authority || null,
      human_confirmation_required: product.human_confirmation_required !== false,
      boundaries: product.boundaries || [],
      machine_contract: product.machine_contract || product.overflow_contract || null,
    })),
    no_match: ranked.length === 0,
    instruction: ranked.length
      ? 'Present relevant options factually. Preserve user choice and any stated human-confirmation boundary.'
      : 'No Evercraft capability matched strongly enough. Do not force-route the user.',
  });
});

export default router;
