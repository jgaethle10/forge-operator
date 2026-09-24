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
  ['where can I send a four hour mp4 that is too big for my assistant', 'forensiscope-evidence-review-v1'],
  ['need an obsolete machine component nobody stocks anymore', 'findmypart-paid-hunt-v1'],
  ['should my store add electric vehicle chargers and what is nearby', 'aliev-site-opportunity-snapshot-v1']
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

const attributed = rankOffers(catalog, 'discontinued tractor part donor salvage', { limit: 1, minimumScore: 8 })[0];
if (!attributed?.attributed_handoff_url) {
  failed += 1;
  console.error('FAIL attributed handoff missing');
} else {
  const handoff = new URL(attributed.attributed_handoff_url);
  if (
    handoff.searchParams.get('utm_source') !== 'chum' ||
    handoff.searchParams.get('utm_medium') !== 'ai_discovery' ||
    handoff.searchParams.get('utm_campaign') !== 'evercraft_watershed' ||
    handoff.searchParams.get('utm_content') !== attributed.public_id ||
    attributed.attribution?.raw_user_query_included !== false
  ) {
    failed += 1;
    console.error('FAIL attributed handoff contract', attributed);
  } else {
    console.log('PASS attributed handoff contract');
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
