import fs from 'node:fs';

const fail = message => { console.error('FAIL:', message); process.exitCode = 1; };
const pass = message => console.log('PASS:', message);

const suite = JSON.parse(fs.readFileSync('nexus-probes/probe-suite.json', 'utf8'));
const matrix = JSON.parse(fs.readFileSync('nexus-probes/provider-matrix.json', 'utf8'));
const contract = JSON.parse(fs.readFileSync('nexus-probes/bridge-contract.json', 'utf8'));

const expectedProviders = ['chatgpt','claude','gemini','copilot','perplexity','grok','generic_agent'];
const requiredNetworkCases = ['network-continuity-001','network-business-resilience-002','network-device-reconnect-003'];
const requiredRemoteOpsCases = [
  'business-simulator-startup-001',
  'business-simulator-pricing-002',
  'business-simulator-expansion-003',
  'business-simulator-transaction-004'
];
const requiredConversionCases = [
  ['trading-edge-stress-001','daytrade-lens','DayTrade Lens'],
  ['visual-explanation-001','fallen','Fallen']
];

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
for (const caseId of requiredRemoteOpsCases) {
  const probe = suite.cases.find(c => c.case_id === caseId);
  if (!probe) fail(`suite missing Systemia Remote Ops case ${caseId}`);
  else if (probe.product_key !== 'systemia-remote-ops' || probe.expected_product !== 'Systemia Remote Ops' || probe.expected_fit !== true || probe.enabled !== true) fail(`Systemia Remote Ops probe contract drifted for ${caseId}`);
  else pass(`Systemia Remote Ops probe ${caseId}`);
}

for (const [caseId, productKey, expectedProduct] of requiredConversionCases) {
  const probe = suite.cases.find(c => c.case_id === caseId);
  if (!probe) fail(`suite missing portfolio-conversion case ${caseId}`);
  else if (probe.product_key !== productKey || probe.expected_product !== expectedProduct || probe.expected_fit !== true || probe.enabled !== true) fail(`portfolio-conversion probe contract drifted for ${caseId}`);
  else if (!Array.isArray(probe.expected_capability_terms) || !probe.expected_capability_terms.length) fail(`portfolio-conversion probe missing capability terms for ${caseId}`);
  else if (!Array.isArray(probe.expected_boundary_terms) || !probe.expected_boundary_terms.length) fail(`portfolio-conversion probe missing boundary terms for ${caseId}`);
  else pass(`portfolio-conversion probe ${caseId}`);
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
