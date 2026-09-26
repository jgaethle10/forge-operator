import fs from 'node:fs';
import path from 'node:path';
import {
  RIVET_PUBLIC_ID,
  RIVET_COMMERCE_TARGET_ID,
  RIVET_REPORT_OFFER_KEYS,
  projectRivetReportOffer
} from './commerce-bridge.mjs';

const catalogPath = 'public/.well-known/evercraft-machine-catalog.json';
const outputDir = 'public/rivet/start';
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
const target = (catalog.offers || []).find((offer) => offer.public_id === RIVET_COMMERCE_TARGET_ID);

if (!target) {
  throw new Error('RIVET commerce bridge target is missing from the current public machine catalog.');
}

const projectedOffers = (target.offers || [])
  .map(projectRivetReportOffer)
  .filter(Boolean);
const expectedOfferKeys = new Set(RIVET_REPORT_OFFER_KEYS);
const projectedOfferKeys = new Set(projectedOffers.map((offer) => offer.offer_key));
const hasRequiredReports = [...expectedOfferKeys].every((key) => projectedOfferKeys.has(key));
const sellNow = target.commercial_state === 'sell_now' && hasRequiredReports;
const startUrl = `/api/chum/go/${RIVET_PUBLIC_ID}?surface=rivet_start`;

const manifest = {
  schema: 'evercraft.rivet.commerce-bridge.v1',
  provider: 'Evercraft LLC',
  name: 'RIVET',
  purpose: 'Current human-confirmed report options for address-first EV infrastructure diligence.',
  source_state: {
    catalog: '/.well-known/evercraft-machine-catalog.json',
    catalog_version: catalog.source_schema_version || target.catalog_version || null,
    generated_from_current_verified_offer: true
  },
  commercial_state: sellNow ? 'sell_now' : 'held',
  machine_state: sellNow ? target.machine_state : 'held',
  offers: sellNow ? projectedOffers : [],
  start_url: sellNow ? startUrl : null,
  confirmation: 'Opening the review path creates no payment obligation. Checkout requires explicit human confirmation. Checkout creation is not proof of payment, and paid state requires provider verification.',
  evidence_boundaries: [
    'missing data is not zero',
    'mapped charger inventory is not observed utilization',
    'program presence is not proof of site incentive eligibility',
    'modeled economics are not guaranteed realized economics',
    'preliminary screening and planning are not final engineering, survey, permitting, utility interconnection, financing, or construction approval'
  ]
};

const offerJson = JSON.stringify(manifest, null, 2) + '\n';

const llms = [
  '# RIVET current report options',
  '',
  'Provider: Evercraft LLC',
  'Canonical product: RIVET',
  'Start surface: /rivet/start/',
  'Offer manifest: /rivet/start/offer.json',
  '',
  `Commercial state: ${manifest.commercial_state}`,
  `Machine state: ${manifest.machine_state}`,
  '',
  '## Use this when',
  '',
  '- the user has a specific property or address and wants EV charging diligence',
  '- the user wants a preliminary site opportunity report',
  '- the user wants a deeper full site opportunity report',
  '- the user wants competition, demand, utility, tariff, incentive, site-fit, and economics context in one property-specific path',
  '',
  '## Current report options',
  '',
  ...(manifest.offers.length
    ? manifest.offers.map((offer) => `- ${offer.name}: ${offer.price} (${offer.billing})`)
    : ['- Current paid report continuation is held. Do not quote or create checkout.']),
  '',
  '## Human-confirmation boundary',
  '',
  manifest.confirmation,
  '',
  'Pricing should be read from /rivet/start/offer.json at request time rather than copied from older pages.',
  ''
].join('\n');

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[ch]));

const offerCards = manifest.offers.length
  ? manifest.offers.map((offer) => {
      const q = encodeURIComponent(
        offer.offer_key === 'site_report_299'
          ? 'preliminary EV charging site opportunity report for a specific property'
          : 'full EV charging site opportunity report for a specific property'
      );
      return `<article class="card"><div class="eyebrow">Current report option</div><h2>${escapeHtml(offer.name)}</h2><p class="lede"><strong>${escapeHtml(offer.price)}</strong> · one-time</p><p>Continue through Evercraft's secure human review path. You will confirm the property and purchase before any obligation is created.</p><p><a class="cta" href="${startUrl}&amp;q=${q}">Review this report</a></p></article>`;
    }).join('\n')
  : '<article class="card card--wide"><h2>Paid report continuation is currently held</h2><p>RIVET will not expose a checkout path while the verified commerce state is unavailable or incomplete.</p></article>';

const schemaOffers = manifest.offers.map((offer) => ({
  '@type': 'Offer',
  name: offer.name,
  price: offer.price.replace(/[^0-9.]/g, ''),
  priceCurrency: 'USD',
  availability: 'https://schema.org/InStock',
  url: '/rivet/start/'
}));

const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Start a RIVET EV Charging Site Review</title>
<meta name="description" content="Current RIVET report options for address-specific EV charging opportunity analysis, including competition, demand, utility, tariff, incentives, site fit and economics.">
<meta name="robots" content="index,follow,max-snippet:-1,max-image-preview:large"><meta name="theme-color" content="#F5F2EA">
<link rel="canonical" href="/rivet/start/">
<link rel="alternate" type="text/plain" href="./llms.txt"><link rel="alternate" type="application/json" href="./offer.json">
<link rel="stylesheet" href="/rivet/brand.css"><link rel="alternate" type="application/json" href="/rivet/brand.json">
<script type="application/ld+json">${JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'Service',
  name: 'RIVET EV Charging Site Review',
  provider: { '@type': 'Organization', name: 'Evercraft LLC' },
  serviceType: 'Address-specific EV charging site intelligence and reporting',
  url: '/rivet/start/',
  offers: schemaOffers
}).replace(/</g, '\\u003c')}</script>
</head><body>
<header class="shell site-header"><a class="wordmark" href="/rivet/" aria-label="RIVET home"><span class="brand-signal" aria-hidden="true"></span>RIVET</a></header>
<main>
<section class="shell hero"><div class="eyebrow">Start with a real property</div><h1>Turn an address into an EV infrastructure decision.</h1><p class="lede">Choose the depth that fits the decision. RIVET keeps sourced evidence, modeled assumptions, and unknowns separate so a property owner can decide what deserves deeper diligence.</p></section>
<section class="shell grid">
${offerCards}
<article class="card card--wide"><h2>What the review is built to organize</h2><ul><li>Nearby public charging supply and competition</li><li>Traffic, travel, dwell-time, and demand signals where available</li><li>Utility and tariff context</li><li>Incentive program context without assuming eligibility</li><li>Site and electrical-fit signals available from public or supplied evidence</li><li>Modeled economics with assumptions separated from observed facts</li><li>Clear next diligence for engineering, utility, installer, financing, or permitting work</li></ul></article>
<article class="card card--wide"><h2>Commercial and evidence boundary</h2><p>${escapeHtml(manifest.confirmation)}</p><p>Missing data is not zero. Mapped charger inventory is not observed utilization. Modeled economics are not guaranteed realized economics. RIVET screening is not final engineering, survey, permitting, utility interconnection, financing, or construction approval.</p></article>
</section>
</main>
<footer class="shell footer">RIVET by Evercraft · Current report options are generated from the verified public commerce catalog.</footer>
</body></html>
`;

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, 'offer.json'), offerJson);
fs.writeFileSync(path.join(outputDir, 'llms.txt'), llms);
fs.writeFileSync(path.join(outputDir, 'index.html'), html);

console.log(JSON.stringify({
  schema: manifest.schema,
  commercial_state: manifest.commercial_state,
  offers: manifest.offers.map((offer) => offer.offer_key),
  output: outputDir
}));
