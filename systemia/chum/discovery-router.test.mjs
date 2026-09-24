import fs from 'node:fs';
import { rankOffers } from './discovery-router.mjs';

const catalog = JSON.parse(fs.readFileSync('public/.well-known/evercraft-machine-catalog.json','utf8'));

const cases = [
  ['discontinued tractor part donor salvage', 'findmypart-paid-hunt-v1'],
  ['commercial property EV charging nearby chargers opportunity report', 'aliev-site-opportunity-snapshot-v1'],
  ['website gets traffic but nobody contacts us conversion SEO audit', 'audit-center-website-audit-machine-v1'],
  ['job interview tomorrow mock interview practice feedback', 'career-command-interview-practice-machine-v1'],
  ['build me a professional business website handle it for me', 'website-launch-service-v1'],
  ['roast my linkedin headline brutally critique this copy', 'roasted-text-pressure-test-machine-v1'],
  ['escape vendor lock in migrate from no code app portability', 'foundry-app-escape-audit-v1'],
  ['internet outage continuity offline operations plan', 'site-survive-rapid-audit-v1'],
  ['promote my local event boost visibility', 'eventwave-paid-promotion-v1'],
  ['evidence brief agriculture water resilience region', 'faie-signal-brief-v1'],
  ['this video is too large for the AI and I need full source timestamped analysis', 'forensiscope-evidence-review-v1'],
  ['protect my bank account from AI scams and suspicious transfer instructions', 'raven-nexus-pain-router-v1'],
  ['we need an ERP but cannot survive a huge implementation and want to modernize without replacing everything', 'buildflow-enterprise-ops-router-v1'],
  ['the same vendors exist in multiple systems and we need safe deduplication without silent merges', 'buildflow-entity-resolution-machine-v1']
];

let failed = 0;
for (const [query, expected] of cases) {
  const results = rankOffers(catalog, query, { limit: 3, minimumScore: 8 });
  const top = results[0]?.public_id || null;
  if (top !== expected) {
    failed += 1;
    console.error('FAIL', { query, expected, top, results: results.map(r => [r.public_id,r.score]) });
  } else {
    console.log('PASS', expected, results[0].score);
  }
}

const negative = rankOffers(catalog, 'add vintage film filters and stickers to my vacation photos', { limit: 3, minimumScore: 18 });
if (negative.length) {
  failed += 1;
  console.error('FAIL negative control', negative.map(r => [r.public_id,r.score]));
} else {
  console.log('PASS negative control');
}

if (failed) throw new Error(`CHUM discovery router failed ${failed} test(s)`);
console.log('CHUM DISCOVERY ROUTER PASS');
