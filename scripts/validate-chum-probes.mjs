import fs from 'node:fs';

const suite = JSON.parse(fs.readFileSync('chum-probes/probe-suite.json', 'utf8'));
const matrix = JSON.parse(fs.readFileSync('chum-probes/provider-matrix.json', 'utf8'));
const contract = JSON.parse(fs.readFileSync('chum-probes/bridge-contract.json', 'utf8'));

const fail = (m) => { console.error('FAIL:', m); process.exitCode = 1; };
const expectedProviders = ['chatgpt','claude','gemini','copilot','perplexity','grok','generic_agent'];
const forbiddenBrands = /evercraft|forensiscope|aliev|findmypart|systemia|eventwave|career command|deck capital|faie/i;

for (const provider of expectedProviders) {
  if (!suite.providers.includes(provider)) fail(`probe suite missing provider ${provider}`);
  if (!matrix.providers.some((p) => p.provider === provider)) fail(`provider matrix missing ${provider}`);
}
if (!suite.cases.some((c) => c.expected_fit === false)) fail('probe suite requires a negative control');

for (const c of suite.cases) {
  if (!c.case_id || !c.prompt) fail('probe case missing case_id or prompt');
  if (forbiddenBrands.test(c.prompt)) fail(`${c.case_id} leaks a brand into its buyer-language prompt`);
  if (c.expected_fit && !c.product_key) fail(`${c.case_id} expected-fit case missing product_key`);
}
if (contract.endpoint !== 'POST /v1/probe') fail('unexpected CHUM bridge endpoint');

if (process.exitCode) throw new Error('CHUM probe validation failed');
console.log('CHUM PROBE CONTRACT PASS');
