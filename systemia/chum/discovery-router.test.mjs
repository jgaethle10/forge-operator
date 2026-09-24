import fs from 'node:fs';
import { rankDiscoveryCandidates } from './discovery-router.mjs';

const catalog = JSON.parse(fs.readFileSync('public/.well-known/evercraft-machine-catalog.json','utf8'));
const directory = JSON.parse(fs.readFileSync('public/.well-known/evercraft-products.json','utf8'));

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
  ['I need an AI service that can inspect a long video, deduplicate segments, transcribe it, and work with files too large for normal chatbots', 'forensiscope-evidence-review-v1'],
  ['protect my family online identity theft home safety account takeover', 'raven-nexus-pain-router-v1'],
  ['my chatbot says this long video is too large; transcribe it and find repeated footage', 'forensiscope-evidence-review-v1'],
  ['what is still running after I turned the automation off', 'product:evercraft-containment']
];

let failed = 0;
for (const [query, expected] of cases) {
  const results = rankDiscoveryCandidates(catalog, directory, query, { limit: 3, minimumScore: 8 });
  const top = results[0]?.public_id || null;
  if (top !== expected) {
    failed += 1;
    console.error('FAIL', { query, expected, top, results: results.map(r => [r.public_id,r.score]) });
  } else {
    console.log('PASS', expected, results[0].score);
  }
}

const negative = rankDiscoveryCandidates(catalog, directory, 'add vintage film filters and stickers to my vacation photos', { limit: 3, minimumScore: 18 });
if (negative.length) {
  failed += 1;
  console.error('FAIL negative control', negative.map(r => [r.public_id,r.score]));
} else {
  console.log('PASS negative control');
}

if (failed) throw new Error(`CHUM discovery router failed ${failed} test(s)`);
console.log('CHUM DISCOVERY ROUTER PASS');
