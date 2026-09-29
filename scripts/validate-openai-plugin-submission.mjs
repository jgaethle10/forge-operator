#!/usr/bin/env node
import fs from 'node:fs';

const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const submission = read('distribution/openai-plugin/submission.json');
const tests = read('distribution/openai-plugin/test-cases.json');

const errors = [];
const requireHttps = (label, value) => {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:') errors.push(`${label} must use HTTPS`);
  } catch {
    errors.push(`${label} must be a valid URL`);
  }
};

if (submission.submission_type !== 'With MCP') errors.push('submission_type must be With MCP');
if (!submission.plugin_name) errors.push('plugin_name is required');
requireHttps('mcp.url', submission?.mcp?.url);
if(submission?.mcp?.authority==='owned_public_fabric'){
  const mcpUrl=new URL(submission.mcp.url);
  if(/(^|\\.)base44\\.app$/i.test(mcpUrl.hostname)) errors.push('owned public Fabric MCP must not use Base44');
  if(submission.mcp.owned_fabric_cutover_required!==false) errors.push('owned public Fabric must close the cutover gate');
  if(submission.mcp.origin_change_requires_new_plugin_submission!==true) errors.push('owned Fabric origin change must require a new OpenAI plugin submission');
}
requireHttps('website', submission.website);
requireHttps('support_url', submission.support_url);
requireHttps('privacy_policy_url', submission.privacy_policy_url);
requireHttps('terms_url', submission.terms_url);

for (const file of ['PRIVACY.md','TERMS.md','SUPPORT.md']) {
  if (!fs.existsSync(file)) errors.push(`${file} is required`);
}

if (submission.plugin_name !== 'Evercraft') errors.push('canonical plugin_name must be Evercraft');
if (submission.source_package !== 'plugins/evercraft-fabric') errors.push('source_package must be plugins/evercraft-fabric');
if (submission.public_directory_claim_allowed !== false) errors.push('public directory claim must remain false before publication receipt');
if (!fs.existsSync('plugins/evercraft-fabric/.codex-plugin/plugin.json')) errors.push('Evercraft plugin package manifest is required');

if (!Array.isArray(tests.positive) || tests.positive.length !== 5) {
  errors.push('exactly five positive review cases are required');
}
if (!Array.isArray(tests.negative) || tests.negative.length !== 3) {
  errors.push('exactly three negative review cases are required');
}

const allCases = [...(tests.positive || []), ...(tests.negative || [])];
const ids = new Set();
for (const test of allCases) {
  if (!test.id || !test.description || !test.prompt || !test.expected_behavior) {
    errors.push('every review case needs id, description, prompt and expected_behavior');
  }
  if (ids.has(test.id)) errors.push(`duplicate test id: ${test.id}`);
  ids.add(test.id);
}
for (const test of tests.positive || []) {
  if (!test.tools_triggered) errors.push(`positive review case ${test.id || 'unknown'} needs tools_triggered`);
}

const serialized = JSON.stringify({ submission, tests });
if (/TODO|PLACEHOLDER|example\.com/i.test(serialized)) {
  errors.push('submission packet contains a placeholder');
}

if (errors.length) {
  console.error(JSON.stringify({ ok:false, errors }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok:true,
  plugin:submission.plugin_name,
  positive_tests:tests.positive.length,
  negative_tests:tests.negative.length,
  mcp:submission.mcp.url
}));
