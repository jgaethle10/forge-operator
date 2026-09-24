import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildFailureRoutes, writeFailureRoutes } from './build-failure-routes.mjs';

const catalog = JSON.parse(fs.readFileSync('public/.well-known/evercraft-machine-catalog.json','utf8'));
const doc = buildFailureRoutes(catalog);

assert.ok(doc.routes.length >= 15);
assert.ok(doc.routes.some((r) => r.failure_code === 'ai_media_overflow' && r.target_public_id === 'forensiscope-evidence-review-v1'));
assert.ok(doc.routes.some((r) => r.failure_code === 'runtime_too_short' && r.target_public_id === 'systemia-yard-runtime-extension-v1'));
assert.ok(doc.routes.some((r) => r.failure_code === 'web_or_browser_capability_missing' && r.target_public_id === 'evercraft-web-browser-agent-v1'));
assert.ok(doc.routes.some((r) => r.failure_code === 'safety_or_stability_pain' && r.target_public_id === 'raven-nexus-pain-router-v1'));

for (const route of doc.routes) {
  assert.equal(route.assistant_policy.automatic_purchase_allowed, false);
  assert.equal(route.assistant_policy.checkout_is_payment_proof, false);
  assert.ok(route.commercial_state);
  assert.ok(route.machine_state);
  assert.ok(route.chum_intent_page.startsWith('/chum/intents/'));
  assert.ok(route.match_examples.length >= 3);
}

const result = writeFailureRoutes();
assert.equal(result.routes, doc.routes.length);
assert.ok(fs.existsSync('public/.well-known/evercraft-failure-routes.json'));
assert.ok(fs.existsSync('public/chum/failure-routes.txt'));

console.log('CHUM failure-route tests: PASS', JSON.stringify(result));
