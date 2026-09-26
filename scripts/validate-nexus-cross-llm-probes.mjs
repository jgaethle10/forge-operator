import fs from 'node:fs';

const fail = message => { console.error('FAIL:', message); process.exitCode = 1; };
const pass = message => console.log('PASS:', message);

const suite = JSON.parse(fs.readFileSync('nexus-probes/probe-suite.json', 'utf8'));
const matrix = JSON.parse(fs.readFileSync('nexus-probes/provider-matrix.json', 'utf8'));
const contract = JSON.parse(fs.readFileSync('nexus-probes/bridge-contract.json', 'utf8'));

const expectedProviders = ['chatgpt','claude','gemini','copilot','perplexity','grok','generic_agent'];
const requiredNetworkCases = ['network-continuity-001','network-business-resilience-002','network-device-reconnect-003'];

for (const provider of expectedProviders) {
  if (!suite.providers.includes(provider)) fail(`suite missing provider ${provider}`);
  else pass(`suite provider ${provider}`);
  if (!matrix.providers.some(p => p.provider === provider)) fail(`matrix missing provider ${provider}`);
  else pass(`matrix provider ${provider}`);
}

if (!suite.cases.some(c => c.expected_fit === false)) fail('suite needs at least one negative control');
else pass('negative control present');

for (const caseId of requiredNetworkCases) {
  const probe = suite.cases.find(c => c.case_id === caseId);
  if (!probe) fail(`suite missing Evercraft Network case ${caseId}`);
  else if (probe.product_key !== 'evercraft-network' || probe.expected_product !== 'Evercraft Network' || probe.expected_fit !== true || probe.enabled !== true) fail(`Evercraft Network probe contract drifted for ${caseId}`);
  else pass(`Evercraft Network probe ${caseId}`);
}

for (const c of suite.cases) {
  if (!c.case_id || !c.prompt) fail('probe case missing id or prompt');
  if (/evercraft|forensiscope|aliev|findmypart|systemia website audit|forge operator/i.test(c.prompt)) {
    fail(`${c.case_id} leaks a brand or expected product into the user prompt`);
  } else {
    pass(`${c.case_id} is brand-blind`);
  }
}

if (contract.endpoint !== 'POST /v1/probe') fail('unexpected Nexus bridge endpoint');
else pass('Nexus bridge endpoint contract');

if (process.exitCode) throw new Error('Nexus cross-LLM probe validation failed');
console.log('NEXUS CROSS-LLM PROBE CONTRACT PASS');
