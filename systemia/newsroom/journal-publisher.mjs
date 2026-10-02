#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const clean = (value) => String(value ?? '').trim();
const unique = (values = []) => [...new Set(values.map(clean).filter(Boolean))];
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

function escapeHtml(value) {
  return clean(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeXml(value) {
  return escapeHtml(value);
}

function assertIso(value, field) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(`${field} must be a valid timestamp`);
  return date.toISOString();
}

function validateUrl(value, field) {
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error(`${field} must be http(s)`);
  return url.toString();
}

export function validateJournalStory(input, { now = new Date() } = {}) {
  const story = structuredClone(input || {});
  if (story.schema !== 'evercraft.journal.story.v1') throw new Error('Unsupported Journal story schema.');
  if (!clean(story.story_id)) throw new Error('story_id is required.');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(clean(story.slug))) throw new Error('slug must be lowercase kebab-case.');
  if (!clean(story.title) || !clean(story.dek)) throw new Error('title and dek are required.');
  if (!clean(story.desk)) throw new Error('desk is required.');
  if (story.status !== 'approved') throw new Error('Only approved Journal stories may publish.');

  story.published_at = assertIso(story.published_at, 'published_at');
  story.updated_at = assertIso(story.updated_at || story.published_at, 'updated_at');
  story.freshness_expires_at = assertIso(story.freshness_expires_at, 'freshness_expires_at');
  if (new Date(story.freshness_expires_at).getTime() <= now.getTime()) {
    throw new Error('Journal story freshness window has expired.');
  }

  const sensitivity = clean(story.sensitivity?.state);
  if (sensitivity !== 'public_unclassified') {
    throw new Error('Owned Journal publisher only accepts public_unclassified stories.');
  }
  if (story.sensitivity?.classified_detail_policy !== 'do_not_infer_or_expand') {
    throw new Error('Classified-detail boundary must fail closed.');
  }

  const sources = Array.isArray(story.sources) ? story.sources : [];
  if (sources.length < 2) throw new Error('At least two source records are required.');
  const sourceIndex = new Map();
  for (const source of sources) {
    const id = clean(source.source_id);
    if (!id || sourceIndex.has(id)) throw new Error('Each source requires a unique source_id.');
    const url = validateUrl(source.url, `source:${id}`);
    const evidenceState = clean(source.evidence_state);
    if (!['reported', 'observed', 'verified', 'public_source'].includes(evidenceState)) {
      throw new Error(`source:${id} has unsupported evidence_state`);
    }
    sourceIndex.set(id, { ...source, source_id: id, url });
  }

  const claims = Array.isArray(story.claims) ? story.claims : [];
  if (!claims.length) throw new Error('At least one source-bound claim is required.');
  for (const claim of claims) {
    const refs = unique(claim.source_refs);
    if (!clean(claim.claim) || !refs.length) throw new Error('Each claim requires text and source_refs.');
    const missing = refs.filter((ref) => !sourceIndex.has(ref));
    if (missing.length) throw new Error(`Claim cites unknown source refs: ${missing.join(', ')}`);
    if (!['reported', 'verified', 'public_source'].includes(clean(claim.evidence_state))) {
      throw new Error('Claims must preserve an explicit evidence_state.');
    }
  }

  const sections = Array.isArray(story.sections) ? story.sections : [];
  if (sections.length < 3) throw new Error('Journal stories require at least three substantive sections.');
  for (const section of sections) {
    if (!clean(section.heading) || clean(section.body).length < 180) {
      throw new Error('Every Journal section needs a heading and substantive prose.');
    }
  }

  const rightsState = clean(story.hero_visual?.rights_state);
  if (story.hero_visual?.url) {
    validateUrl(story.hero_visual.url, 'hero_visual.url');
    if (rightsState !== 'verified') throw new Error('Hero visual rights must be verified before publication.');
    const sourceRef = clean(story.hero_visual.source_ref);
    if (!sourceIndex.has(sourceRef)) throw new Error('Hero visual must cite an approved source.');
  }

  if (story.production_grade?.status !== 'accepted') {
    throw new Error('Production-grade gate must be accepted before publication.');
  }
  if (story.production_grade?.text_primary === true) {
    throw new Error('Text-card-first production is not publishable.');
  }
  if (!['verified_capture', 'licensed_media', 'data_visualization', 'generated_cinematic'].includes(clean(story.production_grade?.hero_kind))) {
    throw new Error('Production-grade hero kind is missing or invalid.');
  }

  if (story.editorial_gate?.status !== 'accepted') throw new Error('Editorial preflight must be accepted.');
  if (Number(story.editorial_gate?.score || 0) < 10) throw new Error('Journal editorial preflight must be 10/10.');

  if (!story.fallen_brief || story.fallen_brief.contract !== 'evercraft.fallen.journal.production.v1') {
    throw new Error('A canonical Fallen Journal production brief is required.');
  }
  if (story.fallen_brief.evidence?.freshness_state !== 'fresh') {
    throw new Error('Fallen Journal brief must be fresh.');
  }

  return {
    ...story,
    sources: [...sourceIndex.values()],
    claims,
    sections
  };
}

function renderSourceList(story) {
  return story.sources.map((source) => {
    const label = escapeHtml(source.label || source.source_id);
    const publisher = escapeHtml(source.publisher || '');
    const url = escapeHtml(source.url);
    return `<li><a href="${url}" rel="noopener noreferrer">${label}</a>${publisher ? ` <span class="source-publisher">${publisher}</span>` : ''}</li>`;
  }).join('\n');
}

function normalizeJournalOrigin(value='https://journal.evercraft.global') {
  const url = new URL(String(value || 'https://journal.evercraft.global'));
  if (!['https:','http:'].includes(url.protocol)) throw new Error('Journal public origin must be http(s).');
  return url.toString().replace(/\/$/,'');
}

function storyUrl(publicOrigin, slug) {
  return `${normalizeJournalOrigin(publicOrigin)}/${String(slug || '').replace(/^\/+|\/+$/g,'')}/`;
}

function renderArticle(story, publicOrigin) {
  const canonical = storyUrl(publicOrigin, story.slug);
  const description = escapeHtml(story.dek);
  const image = story.hero_visual?.url ? escapeHtml(story.hero_visual.url) : '';
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: story.title,
    description: story.dek,
    datePublished: story.published_at,
    dateModified: story.updated_at,
    author: { '@type': 'Organization', name: 'Evercraft Journal' },
    publisher: { '@type': 'Organization', name: 'Evercraft Journal' },
    mainEntityOfPage: canonical,
    ...(image ? { image: [story.hero_visual.url] } : {})
  };

  const sections = story.sections.map((section) =>
    `<section><h2>${escapeHtml(section.heading)}</h2><p>${escapeHtml(section.body)}</p></section>`
  ).join('\n');

  const uncertainty = unique(story.uncertainty_notes || []);
  const uncertaintyHtml = uncertainty.length
    ? `<aside class="evidence-box"><h2>What remains uncertain</h2><ul>${uncertainty.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></aside>`
    : '';

  const heroHtml = image
    ? `<figure class="hero"><img src="${image}" alt="${escapeHtml(story.hero_visual.alt || story.title)}"><figcaption>${escapeHtml(story.hero_visual.caption || '')}</figcaption></figure>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(story.title)} | Evercraft Journal</title>
<meta name="description" content="${description}">
<link rel="canonical" href="${canonical}">
<meta property="og:site_name" content="Evercraft Journal">
<meta property="og:type" content="article">
<meta property="og:title" content="${escapeHtml(story.title)}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${canonical}">
${image ? `<meta property="og:image" content="${image}">` : ''}
<script type="application/ld+json">${JSON.stringify(jsonLd).replaceAll('<', '\\u003c')}</script>
<style>
:root{color-scheme:dark;--bg:#080b0b;--panel:#101515;--text:#f5f5f2;--muted:#b7bdc5;--gold:#b79a56;--ice:#4fb8ff}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.68}
a{color:var(--ice)}header,main,footer{width:min(920px,calc(100% - 36px));margin:auto}
header{padding:28px 0 16px;border-bottom:1px solid #222b2b}.brand{font-weight:800;letter-spacing:.08em;text-transform:uppercase}.brand span{color:var(--gold)}
main{padding:52px 0 80px}.kicker{color:var(--ice);font-size:.86rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase}.meta{color:var(--muted);margin-top:12px}
h1{font-size:clamp(2.4rem,7vw,5rem);line-height:1.02;letter-spacing:-.045em;margin:.2em 0}.dek{font-size:clamp(1.1rem,2.4vw,1.45rem);color:#d8dddd;max-width:760px}
.hero{margin:36px 0}.hero img{display:block;width:100%;border-radius:16px}.hero figcaption{color:var(--muted);font-size:.88rem;margin-top:9px}
section{margin:42px 0}h2{font-size:1.65rem;letter-spacing:-.02em}p{font-size:1.08rem}.evidence-box{border:1px solid #2b3535;background:var(--panel);padding:22px 24px;border-radius:14px;margin:40px 0}
.sources{border-top:1px solid #263030;padding-top:24px}.source-publisher{color:var(--muted)}footer{padding:28px 0 50px;color:var(--muted);border-top:1px solid #222b2b}
</style>
</head>
<body>
<header><div class="brand">Evercraft <span>Journal</span></div></header>
<main>
<article>
<div class="kicker">${escapeHtml(story.desk)} · ${escapeHtml(story.story_type || 'Analysis')}</div>
<h1>${escapeHtml(story.title)}</h1>
<p class="dek">${description}</p>
<p class="meta">Published ${escapeHtml(new Date(story.published_at).toLocaleString('en-US',{timeZone:'America/Los_Angeles',dateStyle:'long',timeStyle:'short'}))} PT · Evidence state: ${escapeHtml(story.evidence_state || 'source-grounded')}</p>
${heroHtml}
${sections}
${uncertaintyHtml}
<section class="sources"><h2>Sources and evidence</h2><ol>${renderSourceList(story)}</ol></section>
</article>
</main>
<footer>Evercraft Journal · Source-grounded reporting, analysis and education.</footer>
</body>
</html>`;
}

function renderIndex(stories) {
  const cards = stories.map((story) => `<article><div class="kicker">${escapeHtml(story.desk)}</div><h2><a href="./${escapeHtml(story.slug)}/">${escapeHtml(story.title)}</a></h2><p>${escapeHtml(story.dek)}</p><div class="meta">${escapeHtml(new Date(story.published_at).toISOString().slice(0,10))}</div></article>`).join('\n');
  const latest = stories[0];
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Evercraft Journal</title><meta name="description" content="Evercraft Journal is a source-grounded newsroom for the physical world, technology, science, infrastructure and local life."><meta property="og:site_name" content="Evercraft Journal"><meta property="og:title" content="Evercraft Journal"><meta property="og:description" content="Source-grounded reporting, analysis and education from Evercraft."><style>:root{color-scheme:dark;--bg:#080b0b;--text:#f5f5f2;--muted:#b7bdc5;--gold:#b79a56;--ice:#4fb8ff}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.65}main,header,footer{width:min(960px,calc(100% - 36px));margin:auto}header{padding:48px 0 24px;border-bottom:1px solid #222b2b}h1{font-size:clamp(3rem,8vw,6rem);letter-spacing:-.06em;line-height:.95;margin:0}.sub{color:var(--muted);font-size:1.15rem;max-width:720px}.edition{color:var(--gold);font-weight:800;margin-top:16px}.grid{display:grid;gap:28px;padding:42px 0 80px}article{border-bottom:1px solid #222b2b;padding-bottom:28px}.kicker{color:var(--ice);font-size:.82rem;font-weight:800;text-transform:uppercase;letter-spacing:.1em}h2{font-size:clamp(1.6rem,4vw,2.5rem);line-height:1.08;margin:.35em 0}a{color:inherit;text-decoration:none}a:hover{color:var(--ice)}p,.meta{color:#d7dddd}.meta{font-size:.9rem}footer{border-top:1px solid #222b2b;padding:28px 0 50px;color:var(--muted)}</style></head><body><header><h1>Evercraft Journal</h1><p class="sub">A continuously refreshed, evidence-controlled newsroom built to explain what the world is doing, what changed and what the evidence can actually support.</p><div class="edition">Live edition ${escapeHtml(new Date(latest.published_at).toLocaleDateString('en-US',{timeZone:'America/Los_Angeles',weekday:'long',month:'long',day:'numeric',year:'numeric'}))}</div></header><main class="grid">${cards}</main><footer>Observed, reported, modeled and inferred are kept separate. Uncertainty stays visible.</footer></body></html>`;
}

function renderFeed(stories, publicOrigin) {
  const origin = normalizeJournalOrigin(publicOrigin);
  const items = stories.slice(0, 50).map((story) => `<item><title>${escapeXml(story.title)}</title><link>${escapeXml(storyUrl(origin, story.slug))}</link><guid>${escapeXml(storyUrl(origin, story.slug))}</guid><pubDate>${new Date(story.published_at).toUTCString()}</pubDate><description>${escapeXml(story.dek)}</description></item>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Evercraft Journal</title><link>${escapeXml(origin)}/</link><description>Source-grounded reporting, analysis and education from Evercraft.</description>${items}</channel></rss>\n`;
}

function renderLlms(stories, publicOrigin) {
  const origin = normalizeJournalOrigin(publicOrigin);
  const rows = stories.map((story) => `- ${story.title}\n  - URL: ${storyUrl(origin, story.slug)}\n  - Published: ${story.published_at}\n  - Desk: ${story.desk}\n  - Evidence: ${story.evidence_state || 'source-grounded'}\n`).join('\n');
  return `# Evercraft Journal\n\nEvercraft Journal is Evercraft's source-grounded newsroom. Current-state claims preserve source lineage, evidence state, uncertainty and freshness. Classified or access-controlled detail is never inferred from public fragments.\n\n## Current stories\n\n${rows}\n`;
}

export function publishJournalStories(inputStories, {
  outDir = 'public/journal',
  now = new Date(),
  publicOrigin = process.env.EVERCRAFT_JOURNAL_ORIGIN || 'https://journal.evercraft.global'
} = {}) {
  const origin = normalizeJournalOrigin(publicOrigin);
  const stories = inputStories.map((story) => validateJournalStory(story, { now }))
    .sort((a, b) => b.published_at.localeCompare(a.published_at));
  if (!stories.length) throw new Error('At least one approved story is required.');

  fs.mkdirSync(outDir, { recursive: true });
  const receipts = [];

  for (const story of stories) {
    const articleDir = path.join(outDir, story.slug);
    const productionDir = path.join(outDir, 'production', story.slug);
    const receiptDir = path.join(outDir, 'receipts');
    fs.mkdirSync(articleDir, { recursive: true });
    fs.mkdirSync(productionDir, { recursive: true });
    fs.mkdirSync(receiptDir, { recursive: true });

    const html = renderArticle(story, origin);
    const articlePath = path.join(articleDir, 'index.html');
    fs.writeFileSync(articlePath, html);

    const fallenBrief = JSON.stringify(story.fallen_brief, null, 2) + '\n';
    fs.writeFileSync(path.join(productionDir, 'fallen-brief.json'), fallenBrief);

    const clipHandoff = {
      schema: 'evercraft.clip.journal-handoff.v1',
      story_id: story.story_id,
      slug: story.slug,
      title: story.title,
      source_refs: story.sources.map((source) => source.source_id),
      evidence_state: story.evidence_state,
      derivatives: story.derivatives || [],
      production_grade: story.production_grade,
      publication_authority: false,
      rule: 'Clip may produce approved derivatives, but this handoff alone does not grant social publication authority.'
    };
    fs.writeFileSync(path.join(productionDir, 'clip-handoff.json'), JSON.stringify(clipHandoff, null, 2) + '\n');

    const receipt = {
      schema: 'evercraft.journal.publication-receipt.v1',
      story_id: story.story_id,
      slug: story.slug,
      published_at: story.published_at,
      built_at: now.toISOString(),
      canonical_url: storyUrl(origin, story.slug),
      evidence_state: story.evidence_state,
      source_refs: story.sources.map((source) => source.source_id),
      freshness_expires_at: story.freshness_expires_at,
      editorial_gate: story.editorial_gate,
      production_grade: story.production_grade,
      article_sha256: sha256(html),
      fallen_brief_sha256: sha256(fallenBrief),
      publisher: 'evercraft-owned-static-journal-v1',
      publication_authority: true
    };
    fs.writeFileSync(path.join(receiptDir, `${story.slug}.json`), JSON.stringify(receipt, null, 2) + '\n');
    receipts.push(receipt);
  }

  fs.writeFileSync(path.join(outDir, 'index.html'), renderIndex(stories));
  fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify({
    schema: 'evercraft.journal.index.v1',
    generated_at: now.toISOString(),
    stories: stories.map((story) => ({
      story_id: story.story_id,
      slug: story.slug,
      title: story.title,
      dek: story.dek,
      desk: story.desk,
      published_at: story.published_at,
      updated_at: story.updated_at,
      evidence_state: story.evidence_state,
      canonical_url: storyUrl(origin, story.slug)
    }))
  }, null, 2) + '\n');
  fs.writeFileSync(path.join(outDir, 'feed.xml'), renderFeed(stories, origin));
  fs.writeFileSync(path.join(outDir, 'llms.txt'), renderLlms(stories, origin));

  return {
    schema: 'evercraft.journal.publish-run.v1',
    built_at: now.toISOString(),
    story_count: stories.length,
    latest_published_at: stories[0].published_at,
    public_origin: origin,
    receipts
  };
}

function loadStories(storiesDir) {
  if (!fs.existsSync(storiesDir)) return [];
  return fs.readdirSync(storiesDir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => JSON.parse(fs.readFileSync(path.join(storiesDir, name), 'utf8')));
}

async function main() {
  const storiesDir = process.argv[2] || 'systemia/newsroom/stories';
  const outDir = process.argv[3] || 'public/journal';
  const stories = loadStories(storiesDir);
  const report = publishJournalStories(stories, { outDir, now: new Date() });
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  await main();
}
