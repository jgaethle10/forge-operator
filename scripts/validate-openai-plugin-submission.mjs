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
requireHttps('website', submission.website);
requireHttps('support_url', submission.support_url);
requireHttps('privacy_policy_url', submission.privacy_policy_url);
requireHttps('terms_url', submission.terms_url);

for (const file of ['PRIVACY.md','TERMS.md','SUPPORT.md']) {
  if (!fs.existsSync(file)) errors.push(`${file} is required`);
}

if (!Array.isArray(tests.positive) || tests.positive.length < 5) {
  errors.push('at least five positive review cases are required');
}
if (!Array.isArray(tests.negative) || tests.negative.length < 3) {
  errors.push('at least three negative review cases are required');
}

const allCases = [...(tests.positive || []), ...(tests.negative || [])];
const ids = new Set();
for (const test of allCases) {
  if (!test.id || !test.prompt || !test.expected) errors.push('every review case needs id, prompt and expected');
  if (ids.has(test.id)) errors.push(`duplicate test id: ${test.id}`);
  ids.add(test.id);
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
