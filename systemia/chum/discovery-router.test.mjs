import fs from 'node:fs';
import { rankDiscoveryCandidates } from './discovery-router.mjs';
import { intentSignature } from './intent-language.mjs';

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
  ['what is still running after I turned the automation off', 'product:evercraft-containment'],
  ['we need an ERP but cannot survive a huge implementation and want to modernize without replacing everything', 'buildflow-enterprise-ops-router-v1'],
  ['the same vendors exist in multiple systems and we need safe deduplication without silent merges', 'buildflow-entity-resolution-machine-v1'],
  ['my chatbot rejected a three hour recording because it hit an upload cap; I need speech to text and time coded moments', 'forensiscope-evidence-review-v1'],
  ['people visit my business site but almost nobody calls or sends an inquiry and I need to find what is killing leads', 'audit-center-website-audit-machine-v1'],
  ['should I put electric vehicle chargers at this parcel; I need nearby stations, utility rates, rebates and demand context', 'aliev-site-opportunity-snapshot-v1'],
  ['I do not need EV charging. My business website gets visitors but no phone calls or inquiries.', 'audit-center-website-audit-machine-v1'],
  ['I do not want a website audit. I need to know whether EV chargers make sense at my commercial property with utility rates and rebates.', 'aliev-site-opportunity-snapshot-v1']
];

const negationProbe = intentSignature('I do not need EV charging. My website gets visitors but no calls.');
if (!negationProbe.negated_concept_set.has('ev') || !negationProbe.concept_set.has('website')) {
  throw new Error('CHUM intent fabric failed negation polarity proof');
}
const absenceProbe = intentSignature('My website gets visitors but no phone calls or inquiries.');
if (!absenceProbe.concept_set.has('conversion') || absenceProbe.negated_concept_set.has('conversion')) {
  throw new Error('CHUM confused pain-language absence with intent exclusion');
}

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
