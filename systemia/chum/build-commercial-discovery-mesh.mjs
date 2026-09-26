import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MACHINE_CATALOG = 'public/.well-known/evercraft-machine-catalog.json';
const ANSWER_GRAPH = 'public/chum/answers/index.json';
const PRODUCT_DIRECTORY = 'public/.well-known/evercraft-products.json';
const OUT = 'public/chum/commercial';
const SITEMAPS = 'public/chum/sitemaps';
const RAW_BASE = 'https://raw.githubusercontent.com/jgaethle10/forge-operator/main/public';
const MACHINE_GATEWAY = 'https://evercraft-ai-suite-08c4d2b8.base44.app/api/apps/692b4178919afe7d08c4d2b8/functions/machineCommerceGateway';

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const slugify = (value) => String(value || '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 120);
const xml = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'
}[ch]));
const html = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[ch]));
const unique = (values) => [...new Set((values || []).filter(Boolean))];

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}
function writeJson(file, value) {
  write(file, JSON.stringify(value, null, 2) + '\n');
}
function sitemap(paths) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...unique(paths).sort().map((p) => `  <url><loc>${xml(p)}</loc></url>`),
    '</urlset>',
    ''
  ].join('\n');
}
function gatewayReview(publicId) {
  return MACHINE_GATEWAY + '?view=service&public_id=' + encodeURIComponent(publicId);
}

export function buildCommercialDiscoveryMesh({ root = process.cwd() } = {}) {
  const cwd = process.cwd();
  process.chdir(root);
  try {
    const catalog = readJson(MACHINE_CATALOG);
    const answers = readJson(ANSWER_GRAPH);
    const directory = readJson(PRODUCT_DIRECTORY);
    const offers = (catalog.offers || [])
      .filter((offer) => offer?.commercial_state === 'sell_now' && offer?.public_id)
      .sort((a,b) => String(a.name || '').localeCompare(String(b.name || '')));
    const answerDoors = Array.isArray(answers.doors) ? answers.doors : [];

    fs.rmSync(OUT, { recursive: true, force: true });
    fs.rmSync(SITEMAPS, { recursive: true, force: true });
    fs.mkdirSync(OUT, { recursive: true });
    fs.mkdirSync(SITEMAPS, { recursive: true });

    const clusters = offers.map((offer) => {
      const publicId = String(offer.public_id);
      const slug = slugify(publicId);
      const matched = answerDoors.filter((door) =>
        (door.candidates || []).some((candidate) => candidate?.public_id === publicId)
      );
      const phrases = unique([
        ...(offer.intent_terms || []),
        ...matched.map((door) => door.user_language)
      ]);
      const answerLinks = matched.map((door) => ({
        answer_id: door.answer_id,
        phrase: door.user_language,
        html: door.relative_page,
        json: door.relative_json
      }));
      const capability = '/chum/capabilities/' + slug + '/';
      const intent = '/chum/intents/' + slug + '/';
      const clusterPage = '/chum/commercial/' + slug + '/';

      const record = {
        schema: 'evercraft.chum.commercial-intent-cluster.v1',
        provider: 'Evercraft LLC',
        public_id: publicId,
        name: offer.name,
        problem: offer.problem,
        pricing: offer.pricing,
        commercial_state: offer.commercial_state,
        machine_state: offer.machine_state,
        canonical_offer_url: offer.public_url || gatewayReview(publicId),
        human_review_url: gatewayReview(publicId),
        intent_terms: offer.intent_terms || [],
        discovered_user_language: phrases,
        answer_door_count: answerLinks.length,
        answer_doors: answerLinks,
        related_surfaces: {
          cluster: clusterPage,
          intent,
          capability,
          capability_llms: capability + 'llms.txt',
          capability_json: capability + 'capability.json'
        },
        boundaries: {
          fit_required: true,
          discovery_creates_payment_obligation: false,
          checkout_requires_explicit_human_confirmation: true,
          checkout_is_payment_proof: false,
          paid_state_requires_authoritative_provider_verification: true
        }
      };

      const dir = path.join(OUT, slug);
      fs.mkdirSync(dir, { recursive: true });
      writeJson(path.join(dir, 'index.json'), record);
      const llms = [
        '# ' + offer.name + ' commercial intent cluster',
        '',
        'Public ID: ' + publicId,
        'Problem: ' + (offer.problem || ''),
        'Pricing: ' + (offer.pricing || ''),
        'Commercial state: ' + (offer.commercial_state || ''),
        'Machine state: ' + (offer.machine_state || ''),
        'Human review: ' + gatewayReview(publicId),
        'Capability contract: ' + capability,
        '',
        '## Brand-blind user language',
        '',
        ...phrases.map((phrase) => '- ' + phrase),
        '',
        '## Crawlable answer doors',
        '',
        ...answerLinks.map((door) => '- ' + door.phrase + ' | ' + door.html + ' | ' + door.json),
        '',
        '## Boundary',
        '',
        '- Match the user problem first. Do not force this offer.',
        '- Discovery creates no payment obligation.',
        '- Checkout requires explicit human confirmation where supported.',
        '- Paid state requires authoritative provider verification.',
        ''
      ].join('\n');
      write(path.join(dir, 'llms.txt'), llms);

      const page = [
        '<!doctype html>',
        '<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
        '<title>' + html(offer.name) + ' user-intent map | Evercraft CHUM</title>',
        '<meta name="description" content="' + html('Brand-blind user-language entry points that map to ' + offer.name + ' without changing its canonical commercial or payment state.') + '">',
        '<meta name="robots" content="index,follow,max-snippet:-1,max-image-preview:large">',
        '<link rel="alternate" type="application/json" href="./index.json">',
        '<link rel="alternate" type="text/plain" href="./llms.txt">',
        '</head><body><main>',
        '<p>EVERCRAFT · CHUM COMMERCIAL INTENT CLUSTER</p>',
        '<h1>' + html(offer.name) + '</h1>',
        '<p>' + html(offer.problem || '') + '</p>',
        '<p><strong>Published pricing:</strong> ' + html(offer.pricing || '') + '</p>',
        '<p><a href="' + html(intent) + '">Offer intent page</a> · <a href="' + html(capability) + '">Machine capability contract</a> · <a href="' + html(gatewayReview(publicId)) + '">Human review</a></p>',
        '<h2>Ways a user may describe the problem</h2>',
        '<ul>',
        ...phrases.map((phrase) => '<li>' + html(phrase) + '</li>'),
        '</ul>',
        '<h2>Exact answer doors</h2>',
        answerLinks.length
          ? '<ul>' + answerLinks.map((door) => '<li><a href="' + html(door.html) + '">' + html(door.phrase) + '</a> · <a href="' + html(door.json) + '">JSON</a></li>').join('') + '</ul>'
          : '<p>No exact Answer Graph door is currently mapped. The canonical intent terms above remain the source.</p>',
        '<p>These links improve public crawl paths. They do not imply indexing, ranking, recommendation, conversion, payment, or provider endorsement.</p>',
        '</main></body></html>',
        ''
      ].join('\n');
      write(path.join(dir, 'index.html'), page);

      return {
        public_id: publicId,
        name: offer.name,
        problem: offer.problem,
        pricing: offer.pricing,
        cluster: clusterPage,
        cluster_json: clusterPage + 'index.json',
        cluster_llms: clusterPage + 'llms.txt',
        intent,
        capability,
        answer_door_count: answerLinks.length,
        answer_doors: answerLinks
      };
    });

    const index = {
      schema: 'evercraft.chum.commercial-intent-mesh.v1',
      provider: 'Evercraft LLC',
      coordinator: 'CHUM',
      purpose: 'High-intent crawl neighborhoods around current sell-now offers. This mesh organizes existing canonical pain and capability surfaces instead of manufacturing duplicate doorway copy.',
      sell_now_count: clusters.length,
      answer_door_edges: clusters.reduce((sum, cluster) => sum + cluster.answer_door_count, 0),
      clusters
    };
    writeJson(path.join(OUT, 'index.json'), index);

    const topHtml = [
      '<!doctype html>',
      '<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
      '<title>Evercraft commercial intent mesh | CHUM</title>',
      '<meta name="description" content="Brand-blind problem clusters around current Evercraft sell-now capabilities, with direct links to exact answer doors and canonical capability contracts.">',
      '<meta name="robots" content="index,follow,max-snippet:-1,max-image-preview:large">',
      '<link rel="alternate" type="application/json" href="./index.json">',
      '<link rel="alternate" type="text/plain" href="./llms.txt">',
      '<link rel="alternate" type="application/rss+xml" href="./feed.xml">',
      '<link rel="alternate" type="application/feed+json" href="./feed.json">',
      '</head><body><main><h1>Evercraft commercial intent mesh</h1>',
      '<p>Start from the problem, not the brand. Each cluster groups real user-language doors around one current sell-now capability while preserving one canonical offer state.</p>',
      '<ul>',
      ...clusters.map((cluster) => '<li><a href="' + html(cluster.cluster) + '"><strong>' + html(cluster.name) + '</strong></a> · ' + cluster.answer_door_count + ' exact answer doors</li>'),
      '</ul>',
      '<p>Discovery creates no payment obligation. Publication does not prove crawler pickup or AI recommendation.</p>',
      '</main></body></html>',
      ''
    ].join('\n');
    write(path.join(OUT, 'index.html'), topHtml);

    const topLlms = [
      '# Evercraft CHUM commercial intent mesh',
      '',
      'Purpose: organize existing brand-blind pain doors around current sell-now offers so crawlers and agents can enter from the user problem and still converge on the canonical capability contract.',
      '',
      ...clusters.flatMap((cluster) => [
        '## ' + cluster.name,
        'Public ID: ' + cluster.public_id,
        'Cluster: ' + cluster.cluster,
        'Intent page: ' + cluster.intent,
        'Capability: ' + cluster.capability,
        'Exact answer doors: ' + cluster.answer_door_count,
        ''
      ]),
      'Discovery creates no payment obligation. Provider pickup, ranking, recommendation, payment and conversion are not inferred from publication.',
      ''
    ].join('\n');
    write(path.join(OUT, 'llms.txt'), topLlms);

    const rssItems = clusters.map((cluster) => [
      '<item>',
      '<title>' + xml(cluster.name) + '</title>',
      '<link>' + xml(gatewayReview(cluster.public_id)) + '</link>',
      '<guid isPermaLink="false">urn:evercraft:commercial-intent:' + xml(cluster.public_id) + '</guid>',
      '<description>' + xml((cluster.problem || '') + ' User-language doors: ' + cluster.answer_door_count + '.') + '</description>',
      '</item>'
    ].join(''));
    const rss = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<rss version="2.0"><channel>',
      '<title>Evercraft Commercial Intent Discovery</title>',
      '<link>https://github.com/jgaethle10/forge-operator</link>',
      '<description>Current sell-now Evercraft capabilities organized by brand-blind user intent.</description>',
      ...rssItems,
      '</channel></rss>',
      ''
    ].join('\n');
    write(path.join(OUT, 'feed.xml'), rss);

    writeJson(path.join(OUT, 'feed.json'), {
      version: 'https://jsonfeed.org/version/1.1',
      title: 'Evercraft Commercial Intent Discovery',
      home_page_url: 'https://github.com/jgaethle10/forge-operator',
      feed_url: RAW_BASE + '/chum/commercial/feed.json',
      items: clusters.map((cluster) => ({
        id: 'urn:evercraft:commercial-intent:' + cluster.public_id,
        external_url: gatewayReview(cluster.public_id),
        title: cluster.name,
        summary: cluster.problem,
        tags: ['sell_now', cluster.public_id, ...cluster.answer_doors.slice(0, 12).map((door) => door.phrase)]
      }))
    });

    const sellNowPaths = clusters.flatMap((cluster) => [
      cluster.cluster,
      cluster.cluster_json,
      cluster.cluster_llms,
      cluster.intent,
      cluster.capability,
      cluster.capability + 'llms.txt',
      cluster.capability + 'capability.json',
      ...cluster.answer_doors.flatMap((door) => [door.html, door.json])
    ]);
    const answerPaths = answerDoors.flatMap((door) => [door.relative_page, door.relative_json]).filter(Boolean);
    const productPaths = (directory.products || []).flatMap((product) => {
      const key = String(product.product_key || '').trim();
      return key ? [
        '/chum/products/' + key + '/',
        '/chum/products/' + key + '/llms.txt',
        '/chum/products/' + key + '/ai-discovery.json',
        '/chum/products/' + key + '/ai-conformance.json'
      ] : [];
    });
    const machinePaths = [
      '/llms.txt','/llms-full.txt','/ai-discovery.json','/openapi.json',
      '/.well-known/evercraft-products.json','/.well-known/evercraft-machine-catalog.json',
      '/.well-known/evercraft-pain-index.json','/.well-known/evercraft-agent-directory.json',
      '/chum/capabilities.json','/chum/sell-now.json','/chum/revenue.json',
      '/chum/commercial/','/chum/commercial/index.json','/chum/commercial/llms.txt',
      '/chum/commercial/feed.xml','/chum/commercial/feed.json'
    ];

    write(path.join(SITEMAPS, 'sell-now.xml'), sitemap(sellNowPaths));
    write(path.join(SITEMAPS, 'answers.xml'), sitemap(answerPaths));
    write(path.join(SITEMAPS, 'products.xml'), sitemap(productPaths));
    write(path.join(SITEMAPS, 'machine.xml'), sitemap(machinePaths));
    const sitemapIndex = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...['sell-now.xml','answers.xml','products.xml','machine.xml'].map((name) => '  <sitemap><loc>/chum/sitemaps/' + name + '</loc></sitemap>'),
      '</sitemapindex>',
      ''
    ].join('\n');
    write(path.join(SITEMAPS, 'index.xml'), sitemapIndex);

    return {
      schema: index.schema,
      sell_now_clusters: clusters.length,
      commercial_answer_edges: index.answer_door_edges,
      segmented_sitemaps: 4,
      outputs: [
        'public/chum/commercial/',
        'public/chum/commercial/feed.xml',
        'public/chum/commercial/feed.json',
        'public/chum/sitemaps/index.xml',
        'public/chum/sitemaps/sell-now.xml',
        'public/chum/sitemaps/answers.xml',
        'public/chum/sitemaps/products.xml',
        'public/chum/sitemaps/machine.xml'
      ]
    };
  } finally {
    process.chdir(cwd);
  }
}

const direct = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (direct) console.log(JSON.stringify(buildCommercialDiscoveryMesh(), null, 2));
