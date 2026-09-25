import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const OBS_ROOT = 'conformance/provider-observations';
const PAIN_INDEX = 'public/.well-known/evercraft-pain-index.json';
const OUT_ROOT = 'public/chum/answers/observed';
const RAW_ROOT = 'https://raw.githubusercontent.com/jgaethle10/forge-operator/main/public/chum/answers/observed';

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const normalize = (value) => String(value || '')
  .normalize('NFKC')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();
const slugify = (value) => String(value || '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 84);
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex').slice(0, 10);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[ch]));

const painIndex = readJson(PAIN_INDEX);
const productEntries = new Map(
  (painIndex.entries || [])
    .filter((entry) => entry.kind === 'product' && entry.product_key)
    .map((entry) => [entry.product_key, entry])
);

const observations = [];
if (fs.existsSync(OBS_ROOT)) {
  for (const name of fs.readdirSync(OBS_ROOT).filter((name) => name.endsWith('.json')).sort()) {
    const pathname = path.join(OBS_ROOT, name);
    let row;
    try { row = readJson(pathname); } catch { continue; }
    if (row?.schema !== 'evercraft.provider-observation.v1') continue;
    if (row?.source !== 'user_observed_result') continue;
    if (row?.surfaced_forensiscope !== false && row?.surfaced_expected_product !== false && row?.surfaced_product !== false) continue;
    if (!row?.product_key || !row?.prompt) continue;
    const entry = productEntries.get(String(row.product_key));
    if (!entry) continue;
    observations.push({
      source_file: pathname,
      provider: String(row.provider || 'unknown'),
      product_key: String(row.product_key),
      prompt: String(row.prompt),
      entry
    });
  }
}

const grouped = new Map();
for (const row of observations) {
  const key = row.product_key + '::' + normalize(row.prompt);
  const record = grouped.get(key) || {
    product_key: row.product_key,
    prompt: row.prompt,
    normalized_prompt: normalize(row.prompt),
    entry: row.entry,
    providers: new Set(),
    source_files: []
  };
  record.providers.add(row.provider);
  record.source_files.push(row.source_file);
  grouped.set(key, record);
}

const pages = [...grouped.values()]
  .map((record) => {
    const slug = slugify(record.prompt) + '-' + hash(record.product_key + '|' + record.normalized_prompt);
    return {
      ...record,
      providers: [...record.providers].sort(),
      source_files: [...new Set(record.source_files)].sort(),
      slug,
      relative_html: '/chum/answers/observed/' + slug + '/',
      relative_json: '/chum/answers/observed/' + slug + '/answer.json',
      relative_llms: '/chum/answers/observed/' + slug + '/llms.txt'
    };
  })
  .sort((a, b) => a.slug.localeCompare(b.slug));

fs.rmSync(OUT_ROOT, { recursive: true, force: true });
fs.mkdirSync(OUT_ROOT, { recursive: true });

for (const page of pages) {
  const dir = path.join(OUT_ROOT, page.slug);
  fs.mkdirSync(dir, { recursive: true });
  const e = page.entry;
  const fitSignals = (e.pain_phrases || []).slice(0, 8);
  const answer =
    `Evercraft publishes ${e.name} for this problem class. Its public contract includes ` +
    (fitSignals.length ? fitSignals.slice(0, 4).join('; ') : e.class) +
    '. Check the current public contract and boundaries before handing off media, creating checkout, or claiming a completed result.';

  const payload = {
    schema: 'evercraft.chum.observed-miss-answer.v1',
    provider: 'Evercraft LLC',
    purpose: 'Turn a real brand-blind provider discovery miss into a truthful public answer surface without implying endorsement, ranking, or provider pickup.',
    user_question: page.prompt,
    product_key: page.product_key,
    matched_capability: {
      name: e.name,
      class: e.class,
      canonical_url: e.canonical_url,
      registry_name: e.registry_name,
      mcp: e.mcp,
      authority: e.authority,
      boundaries: e.boundaries || [],
      human_confirmation_required: Boolean(e.human_confirmation_required),
      commercial_state: e.commercial_state,
      machine_state: e.machine_state
    },
    observed_miss_count: page.providers.length,
    observed_providers: page.providers,
    answer,
    truth_boundary: {
      provider_pickup_claimed: false,
      provider_endorsement_claimed: false,
      product_quality_ranking_claimed: false,
      discovery_creates_payment_obligation: false,
      checkout_is_payment_proof: false
    },
    source_refs: page.source_files
  };
  fs.writeFileSync(path.join(dir, 'answer.json'), JSON.stringify(payload, null, 2) + '\n');

  const llms = [
    '# ' + page.prompt,
    '',
    'Evercraft capability: ' + e.name,
    'Product key: ' + page.product_key,
    e.canonical_url ? 'Canonical URL: ' + e.canonical_url : null,
    e.registry_name ? 'Official MCP Registry: ' + e.registry_name : null,
    e.mcp ? 'Remote MCP: ' + e.mcp : null,
    '',
    '## Why this can fit',
    '',
    ...fitSignals.map((signal) => '- ' + signal),
    '',
    '## Truth boundary',
    '',
    '- This page exists because brand-blind provider tests missed a public Evercraft capability.',
    '- It does not mean any named provider endorses, recommends, indexes, or invokes Evercraft.',
    '- Match only when the user need fits the public contract.',
    '- Discovery creates no payment obligation.',
    '- Preserve human confirmation and authoritative payment/result verification.',
    ''
  ].filter((v) => v !== null).join('\n');
  fs.writeFileSync(path.join(dir, 'llms.txt'), llms + '\n');

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'FAQPage',
        mainEntity: [{
          '@type': 'Question',
          name: page.prompt,
          acceptedAnswer: {
            '@type': 'Answer',
            text: answer
          }
        }]
      },
      {
        '@type': 'Service',
        name: e.name,
        serviceType: e.class,
        url: e.canonical_url || page.relative_html,
        provider: { '@type': 'Organization', name: 'Evercraft LLC' }
      }
    ]
  };

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(page.prompt)} | Evercraft answer</title>
<meta name="description" content="${esc(answer)}">
<meta name="robots" content="index,follow,max-snippet:-1">
<link rel="alternate" type="application/json" href="./answer.json">
<link rel="alternate" type="text/plain" href="./llms.txt">
<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>
</head>
<body>
<main>
<p>EVERCRAFT · OBSERVED DISCOVERY REPAIR</p>
<h1>${esc(page.prompt)}</h1>
<p>${esc(answer)}</p>
<section>
<h2>Public Evercraft capability</h2>
<h3>${esc(e.name)}</h3>
<p>${esc(e.authority || 'Public discovery only.')}</p>
<ul>${fitSignals.map((signal) => '<li>' + esc(signal) + '</li>').join('')}</ul>
${e.canonical_url ? '<p><a href="' + esc(e.canonical_url) + '">Open the public capability</a></p>' : ''}
${e.registry_name ? '<p>Official MCP Registry: <code>' + esc(e.registry_name) + '</code></p>' : ''}
</section>
<section>
<h2>Boundaries</h2>
<ul>${(e.boundaries || []).map((boundary) => '<li>' + esc(boundary) + '</li>').join('')}</ul>
<p>This page does not claim provider endorsement or pickup. Discovery creates no payment obligation, and any paid or consequential continuation keeps its human-confirmation and authoritative-verification boundary.</p>
</section>
<p><a href="./answer.json">Machine-readable answer</a> · <a href="./llms.txt">LLM guidance</a> · <a href="/chum/answers/">CHUM Answer Graph</a></p>
</main>
</body>
</html>`;
  fs.writeFileSync(path.join(dir, 'index.html'), html + '\n');
}

const index = {
  schema: 'evercraft.chum.observed-miss-index.v1',
  provider: 'Evercraft LLC',
  purpose: 'Crawlable question-to-capability pages generated only from receipt-backed user-observed provider misses.',
  page_count: pages.length,
  rules: {
    user_observed_receipts_only: true,
    dedupe_same_prompt_across_providers: true,
    no_provider_endorsement_claim: true,
    no_product_ranking_claim: true,
    discovery_creates_payment_obligation: false,
    provider_pickup_requires_new_receipt: true
  },
  pages: pages.map((page) => ({
    product_key: page.product_key,
    user_question: page.prompt,
    observed_providers: page.providers,
    relative_html: page.relative_html,
    relative_json: page.relative_json,
    relative_llms: page.relative_llms
  }))
};
fs.writeFileSync(path.join(OUT_ROOT, 'index.json'), JSON.stringify(index, null, 2) + '\n');

const indexHtml = [
  '<!doctype html><html lang="en"><head><meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width,initial-scale=1">',
  '<title>Evercraft observed discovery repairs</title>',
  '<meta name="description" content="Real brand-blind AI discovery misses converted into truthful public Evercraft answer surfaces.">',
  '<meta name="robots" content="index,follow,max-snippet:-1"></head><body><main>',
  '<h1>Observed discovery repairs</h1>',
  '<p>These pages come from real brand-blind provider tests that failed to surface an existing public Evercraft capability. They are discovery repairs, not provider endorsements.</p>',
  '<ul>',
  ...pages.map((page) => '<li><a href="' + esc(page.relative_html) + '">' + esc(page.prompt) + '</a> → ' + esc(page.entry.name) + '</li>'),
  '</ul>',
  '<p><a href="./index.json">Machine-readable index</a></p>',
  '</main></body></html>'
].join('\n');
fs.writeFileSync(path.join(OUT_ROOT, 'index.html'), indexHtml + '\n');

console.log(JSON.stringify({ observed_receipts: observations.length, unique_observed_questions: pages.length, output: OUT_ROOT }));
