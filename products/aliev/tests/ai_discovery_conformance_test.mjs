import fs from 'node:fs';

const llms = fs.readFileSync('public/llms.txt','utf8');
const openapi = JSON.parse(fs.readFileSync('public/openapi.json','utf8'));
const manifest = JSON.parse(fs.readFileSync('public/ai-conformance.json','utf8'));

const failures = [];
const check = (condition, label) => {
  if (!condition) failures.push(label);
  else console.log('PASS:', label);
};

for (const truth of [
  'Missing is not zero.',
  'Mapped charger inventory is not utilization.',
  'Modeled values are not observed facts.',
  'Program presence is not incentive eligibility.',
  'authoritative payment verification'
]) check(llms.includes(truth), `llms preserves: ${truth}`);

for (const price of ['$299', '$750', '$250', '$2,500/month']) {
  check(llms.includes(price), `llms preserves offer price ${price}`);
}

const providers = new Map((manifest.providers || []).map(x => [x.provider,x]));
for (const provider of ['chatgpt','claude','gemini','copilot','perplexity','grok','generic_agent']) {
  check(providers.has(provider), `provider profile present: ${provider}`);
  check(providers.get(provider)?.behavioral_probe_state === 'not_run', `provider is not falsely marked verified: ${provider}`);
}

for (const dimension of [
  'identity_resolution','intent_fit','evidence_semantics','offer_accuracy','pricing_accuracy',
  'safe_invocation','human_confirmation','payment_verification','private_surface_separation'
]) check((manifest.dimensions || []).includes(dimension), `dimension present: ${dimension}`);

const path = openapi.paths?.['/api/apps/69b9b64d86a732029ce0db81/functions/alievAgentGateway'];
check(Boolean(path?.post), 'OpenAPI gateway is present');
const openapiText = JSON.stringify(openapi);
for (const action of ['capabilities','offers','analyze_site','create_handoff']) {
  check(openapiText.includes(action), `OpenAPI action present: ${action}`);
}

check((manifest.probe_cases || []).length >= 4, 'behavioral probe case suite present');
check((manifest.forbidden_claims || []).length >= 8, 'forbidden claim boundary is explicit');

if (failures.length) {
  for (const failure of failures) console.error('FAIL:', failure);
  throw new Error(`AliEV AI conformance failed: ${failures.length} issue(s)`);
}
console.log('ALL ALIEV AI DISCOVERY CONFORMANCE TESTS PASSED');