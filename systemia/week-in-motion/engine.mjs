import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const DEFAULT_TIMEZONE = 'America/Los_Angeles';
const JOURNAL_BASE = 'https://evercraftjournal.base44.app/journal/';

function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function resolveCompletedWeek(now = new Date()) {
  const current = new Date(now);
  current.setHours(0, 0, 0, 0);
  const day = current.getDay();
  const daysSinceMonday = (day + 6) % 7;
  const currentMonday = new Date(current);
  currentMonday.setDate(current.getDate() - daysSinceMonday);
  const start = new Date(currentMonday);
  start.setDate(currentMonday.getDate() - 7);
  const endExclusive = new Date(currentMonday);
  const end = new Date(endExclusive);
  end.setDate(endExclusive.getDate() - 1);
  end.setHours(23, 59, 59, 999);
  return {
    timezone: process.env.TZ || DEFAULT_TIMEZONE,
    start,
    end,
    endExclusive,
    startDate: isoDate(start),
    endDate: isoDate(end),
    slug: `evercraft-week-in-motion-${isoDate(start)}-${isoDate(end)}`,
    key: `week-in-motion:${isoDate(start)}:${isoDate(end)}`,
  };
}

function normalizeText(value, max = 12000) {
  return String(value ?? '').replace(/\r\n/g, '\n').trim().slice(0, max);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function hash(input) {
  return crypto.createHash('sha256').update(String(input)).digest('hex');
}

const THEMES = [
  ['systemia', ['systemia', 'organism', 'control plane', 'mission', 'saban', 'kaidance', 'collider']],
  ['yard_infrastructure', ['yard', 'deploy', 'runtime', 'forge', 'compute', 'nodeseed', 'edge', 'gateway']],
  ['machine_discovery', ['chum', 'mcp', 'discovery', 'llms', 'crawler', 'direct door', 'plugin']],
  ['rivet_aliev', ['rivet', 'aliev', 'charger', 'ev ', 'session', 'tariff', 'site plan']],
  ['forensiscope', ['forensiscope', 'transcript', 'media overflow', 'asr', 'diarization']],
  ['network', ['network', 'continuity', 'relay', 'offline', 'blackout', 'transport']],
  ['field_ops', ['eps', 'estimate', 'contractor', 'field', 'property']],
  ['media_publishing', ['fallen', 'media studio', 'publishing', 'journal', 'clip', 'book']],
  ['commerce', ['payment', 'checkout', 'revenue', 'commerce', 'buyer', 'fulfillment']],
  ['research_science', ['research', 'sentinel', 'earthquake', 'volcano', 'health', 'science']],
];

export function classifyTheme(text) {
  const hay = normalizeText(text).toLowerCase();
  const scored = THEMES.map(([name, terms]) => [name, terms.reduce((n, term) => n + (hay.includes(term) ? 1 : 0), 0)])
    .sort((a, b) => b[1] - a[1]);
  return scored[0][1] > 0 ? scored[0][0] : 'portfolio_other';
}

async function githubJson(url, token) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!response.ok) throw new Error(`GitHub ${response.status}: ${await response.text()}`);
  return response.json();
}

export async function collectGitHubEvidence({ repo, token, window }) {
  const [owner, name] = repo.split('/');
  if (!owner || !name) throw new Error('repository must be owner/name');
  const since = window.start.toISOString();
  const until = window.end.toISOString();
  const evidence = [];

  const commits = await githubJson(
    `https://api.github.com/repos/${owner}/${name}/commits?since=${encodeURIComponent(since)}&until=${encodeURIComponent(until)}&per_page=100`,
    token,
  );
  for (const commit of commits) {
    const message = normalizeText(commit?.commit?.message, 3000);
    evidence.push({
      id: `github-commit-${commit.sha}`,
      sourceType: 'github_commit',
      sourceRef: commit.html_url,
      occurredAt: commit?.commit?.committer?.date || commit?.commit?.author?.date,
      title: message.split('\n')[0],
      detail: message,
      truthState: 'observed_repository_event',
      theme: classifyTheme(message),
      digest: hash(JSON.stringify({ sha: commit.sha, message })),
    });
  }

  const mergedQuery = `repo:${repo} is:pr is:merged merged:${window.startDate}..${window.endDate}`;
  const search = await githubJson(
    `https://api.github.com/search/issues?q=${encodeURIComponent(mergedQuery)}&sort=updated&order=asc&per_page=100`,
    token,
  );
  for (const pr of search.items || []) {
    const detail = normalizeText([pr.title, pr.body].filter(Boolean).join('\n\n'), 12000);
    evidence.push({
      id: `github-pr-${pr.number}`,
      sourceType: 'github_pr',
      sourceRef: pr.html_url,
      occurredAt: pr.closed_at || pr.updated_at,
      title: normalizeText(pr.title, 500),
      detail,
      truthState: 'merged_source_change',
      theme: classifyTheme(detail),
      digest: hash(JSON.stringify({ number: pr.number, title: pr.title, body: pr.body })),
    });
  }

  const runs = await githubJson(
    `https://api.github.com/repos/${owner}/${name}/actions/runs?created=${window.startDate}..${window.endDate}&per_page=100`,
    token,
  );
  for (const run of runs.workflow_runs || []) {
    const detail = `${run.name || run.display_title || 'workflow'}: ${run.conclusion || run.status}`;
    evidence.push({
      id: `github-run-${run.id}`,
      sourceType: 'github_workflow_run',
      sourceRef: run.html_url,
      occurredAt: run.updated_at || run.created_at,
      title: normalizeText(run.name || run.display_title || 'Workflow run', 500),
      detail,
      truthState: run.conclusion === 'success' ? 'ci_pass' : run.conclusion ? 'ci_failure' : 'ci_incomplete',
      theme: classifyTheme(`${run.name} ${run.display_title}`),
      digest: hash(JSON.stringify({ id: run.id, name: run.name, conclusion: run.conclusion })),
    });
  }

  evidence.sort((a, b) => String(a.occurredAt).localeCompare(String(b.occurredAt)));
  return evidence;
}

export function summarizeEvidence(evidence) {
  const byTheme = {};
  const byState = {};
  for (const item of evidence) {
    byTheme[item.theme] = (byTheme[item.theme] || 0) + 1;
    byState[item.truthState] = (byState[item.truthState] || 0) + 1;
  }
  return {
    total: evidence.length,
    byTheme,
    byState,
    sourceRefs: unique(evidence.map((x) => x.sourceRef)),
    evidenceRefs: evidence.map((x) => x.id),
  };
}

function editorialPrompt({ window, evidence }) {
  const packet = evidence.map((x) => ({
    id: x.id,
    type: x.sourceType,
    ref: x.sourceRef,
    state: x.truthState,
    theme: x.theme,
    title: x.title,
    detail: x.detail,
    occurred_at: x.occurredAt,
  }));
  return `You are the Evercraft Week in Motion editorial machine.

Produce the weekly public record for ${window.startDate} through ${window.endDate}. The benchmark is Evercraft Week in Motion Sep 14-20, 2026.

NON-NEGOTIABLE EDITORIAL STANDARD:
1. Story first, receipts underneath it. Find the company-level thesis instead of making a project laundry list.
2. Long, developed paragraphs are the default. Do not stack one-sentence paragraphs. A line break is not punctuation.
3. No em dashes or en dashes anywhere.
4. Preserve evidence states. Designed is not built. Built is not runtime-proven. Runtime-proven is not deployed. Deployed is not adopted. Checkout is not payment. Modeled is not observed.
5. Never invent counts, revenue, customers, deployments, partnerships, capabilities, dates, failures, quotes, motives or external validation.
6. Include meaningful failures and blockers when the evidence contains them. Explain what the system learned from them.
7. Numbers may only be used when they occur in the evidence packet or the week dates.
8. Translate engineering into why it matters to Evercraft. Technical detail is welcome when it carries the story.
9. The final section must answer what the week taught Evercraft how to do next.
10. The deeper Journal edition must be more substantial than the social master. The social master should still be substantive, not teaser copy.
11. The listen-along comment must be exactly one natural sentence followed by the canonical URL placeholder {{ARTICLE_URL}}.
12. Visual direction must prefer real product screens, real field imagery, diagrams from verified data and rights-cleared media. Synthetic visualization must be labeled and cannot fabricate operational metrics.
13. Do not use listicle cadence in the article body.

Return STRICT JSON with this shape:
{
  "title": "EVERCRAFT: WEEK IN MOTION | Month D-D, YYYY",
  "subtitle": "...",
  "excerpt": "... <= 280 chars",
  "seo_description": "... <= 500 chars",
  "article_markdown": "...",
  "social_post": "...",
  "listen_comment": "If you'd rather listen along, ... {{ARTICLE_URL}}",
  "visual_brief": {
    "thesis": "...",
    "real_asset_priorities": ["..."],
    "synthetic_allowed": ["..."],
    "synthetic_forbidden": ["..."]
  },
  "claim_refs": [
    {"claim": "short description of a material claim", "evidence_ids": ["github-pr-123"]}
  ]
}

Every material factual section needs supporting claim_refs. Do not include markdown fences around the JSON.

EVIDENCE PACKET:
${JSON.stringify(packet)}`;
}

export async function generateEditorial({ window, evidence, endpoint, token, model }) {
  if (!endpoint) {
    return { status: 'blocked_editorial_provider', reason: 'EVERCRAFT_EDITORIAL_ENDPOINT is not configured.' };
  }
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      model: model || 'evercraft-editorial',
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'You are an evidence-bound editorial engine. Return only valid JSON.' },
        { role: 'user', content: editorialPrompt({ window, evidence }) },
      ],
    }),
  });
  if (!response.ok) {
    return { status: 'blocked_editorial_provider', reason: `Editorial provider ${response.status}: ${await response.text()}` };
  }
  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content ?? payload?.output_text ?? payload?.content;
  if (!content) return { status: 'blocked_editorial_provider', reason: 'Editorial provider returned no content.' };
  try {
    return { status: 'generated', output: typeof content === 'string' ? JSON.parse(content) : content };
  } catch (error) {
    return { status: 'blocked_editorial_parse', reason: error instanceof Error ? error.message : String(error), raw: content };
  }
}

function proseBlocks(markdown) {
  return normalizeText(markdown, 300000)
    .split(/\n\s*\n/)
    .map((x) => x.trim())
    .filter((x) => x && !x.startsWith('#') && !x.startsWith('- ') && !x.startsWith('* ') && !/^\d+\.\s/.test(x) && !x.startsWith('>') && !x.startsWith('```'));
}

function sentenceCount(text) {
  return (text.match(/[.!?](?:["')\]]+)?(?:\s|$)/g) || []).length || 1;
}

function words(text) {
  return text.split(/\s+/).filter(Boolean).length;
}

function unknownNumbers(text, evidence, window) {
  const allowed = new Set([
    ...String(window.startDate).match(/\d+/g) || [],
    ...String(window.endDate).match(/\d+/g) || [],
  ]);
  for (const item of evidence) {
    for (const n of `${item.title} ${item.detail}`.match(/\b\d+(?:\.\d+)?%?\b/g) || []) allowed.add(n);
  }
  const found = text.match(/\b\d+(?:\.\d+)?%?\b/g) || [];
  return unique(found.filter((n) => !allowed.has(n)));
}

export function qualityGate({ output, evidence, window }) {
  const reasons = [];
  const article = normalizeText(output?.article_markdown, 300000);
  const social = normalizeText(output?.social_post, 100000);
  const comment = normalizeText(output?.listen_comment, 3000);
  if (!article || !social || !comment) reasons.push('missing_required_editorial_output');
  if (/[\u2013\u2014]/.test(`${article}\n${social}\n${comment}`)) reasons.push('forbidden_dash_character');

  const blocks = proseBlocks(article);
  if (blocks.length < 8) reasons.push('article_too_thin');
  const shortSingle = blocks.filter((b) => sentenceCount(b) === 1 && words(b) < 40);
  const ratio = blocks.length ? shortSingle.length / blocks.length : 1;
  if (ratio > 0.1) reasons.push(`one_sentence_paragraph_ratio_too_high:${ratio.toFixed(2)}`);
  for (let i = 0; i < blocks.length - 1; i++) {
    if (sentenceCount(blocks[i]) === 1 && words(blocks[i]) < 40 && sentenceCount(blocks[i + 1]) === 1 && words(blocks[i + 1]) < 40) {
      reasons.push('stacked_short_one_sentence_paragraphs');
      break;
    }
  }
  const avg = blocks.length ? blocks.reduce((sum, b) => sum + words(b), 0) / blocks.length : 0;
  if (avg < 45) reasons.push(`paragraph_density_too_low:${avg.toFixed(1)}`);
  if (!/what .*week taught|what did .*week teach/i.test(article)) reasons.push('missing_learning_section');
  if (!comment.includes('{{ARTICLE_URL}}')) reasons.push('listen_comment_missing_article_url_placeholder');

  const ids = new Set(evidence.map((x) => x.id));
  const refs = Array.isArray(output?.claim_refs) ? output.claim_refs : [];
  if (refs.length < 5) reasons.push('insufficient_claim_receipts');
  for (const ref of refs) {
    const evidenceIds = Array.isArray(ref?.evidence_ids) ? ref.evidence_ids : [];
    if (!evidenceIds.length) reasons.push('claim_without_evidence');
    for (const id of evidenceIds) if (!ids.has(id)) reasons.push(`unknown_evidence_id:${id}`);
  }

  const unknown = unknownNumbers(`${article}\n${social}`, evidence, window);
  if (unknown.length) reasons.push(`unsupported_numeric_tokens:${unknown.slice(0, 20).join(',')}`);

  return {
    pass: reasons.length === 0,
    reasons: unique(reasons),
    metrics: {
      proseParagraphs: blocks.length,
      shortSingleSentenceParagraphs: shortSingle.length,
      shortSingleSentenceRatio: ratio,
      averageWordsPerProseParagraph: avg,
      claimReceiptCount: refs.length,
    },
  };
}

export function publicationPayload({ output, evidence, window, gate }) {
  const articleUrl = `${JOURNAL_BASE}${window.slug}`;
  return {
    action: 'publish',
    publication_key: window.key,
    work_key: `systemia:week-in-motion:${window.startDate}`,
    title: output.title,
    subtitle: output.subtitle,
    slug: window.slug,
    body: output.article_markdown,
    excerpt: output.excerpt,
    category: 'Leadership',
    author: 'Evercraft Editorial',
    closing_question: 'What should Evercraft investigate, build or prove next?',
    source_refs: unique(evidence.map((x) => x.sourceRef)).slice(0, 80),
    evidence_refs: evidence.map((x) => x.id).slice(0, 120),
    tags: ['Evercraft', 'Systemia', 'Week in Motion', ...unique(evidence.map((x) => x.theme)).slice(0, 12)],
    visual_refs: [],
    visual_rights_state: 'not_required',
    evidence_state: 'verified',
    preflight_passed: gate.pass,
    publishable: gate.pass,
    uncertainty_note: 'Audit-backed weekly record. Source-complete, blocked, modeled, unverified and externally unproven work is not promoted beyond available evidence.',
    seo_title: output.title,
    seo_description: output.seo_description || output.excerpt,
    investigation_badge: 'WEEK IN MOTION',
    article_url: articleUrl,
  };
}

export async function publishJournal({ payload, ingressUrl, secret }) {
  if (!ingressUrl || !secret) {
    return { status: 'blocked_journal_ingress', reason: 'Journal ingress URL or shared secret is not configured.' };
  }
  const response = await fetch(ingressUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  return {
    status: response.ok ? 'published' : 'blocked_journal_ingress',
    httpStatus: response.status,
    data,
    reason: response.ok ? undefined : data?.message || text,
  };
}

export async function writeArtifacts({ outDir, window, evidence, editorial, gate, publication, publishPayload }) {
  const dir = path.join(outDir, `${window.startDate}--${window.endDate}`);
  await fs.mkdir(dir, { recursive: true });
  const summary = summarizeEvidence(evidence);
  const files = {
    'evidence-ledger.json': { window: { ...window, start: window.start.toISOString(), end: window.end.toISOString(), endExclusive: window.endExclusive.toISOString() }, summary, evidence },
    'editorial.json': editorial,
    'quality-gate.json': gate,
    'publication-payload.json': publishPayload,
    'publication-result.json': publication,
  };
  if (editorial?.output?.article_markdown) files['journal.md'] = editorial.output.article_markdown;
  if (editorial?.output?.social_post) files['social.txt'] = editorial.output.social_post;
  if (editorial?.output?.visual_brief) files['fallen-visual-brief.json'] = editorial.output.visual_brief;
  if (editorial?.output?.listen_comment) {
    const url = publication?.data?.article_url || publishPayload?.article_url || '{{ARTICLE_URL}}';
    files['listen-comment.txt'] = editorial.output.listen_comment.replace('{{ARTICLE_URL}}', url);
  }
  for (const [name, value] of Object.entries(files)) {
    await fs.writeFile(path.join(dir, name), typeof value === 'string' ? value : JSON.stringify(value, null, 2));
  }
  return dir;
}
