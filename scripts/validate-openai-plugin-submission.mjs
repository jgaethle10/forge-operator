#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const submission = read('distribution/openai-plugin/submission.json');
const tests = read('distribution/openai-plugin/test-cases.json');
const manifest = read('plugins/evercraft-fabric/plugin.json');
const compatibility = read('plugins/evercraft-fabric/.codex-plugin/plugin.json');
const portableMcp = read('plugins/evercraft-fabric/mcp.json');

const errors = [];
const interfaceMeta = manifest?.extensions?.['com.openai']?.interface || {};
const supportedCategories = new Set([
  'Productivity',
  'Creativity',
  'Developer Tools',
  'Business & Operations',
  'Data & Analytics',
  'Communication',
  'Education & Research',
  'Security',
  'Finance',
  'Healthcare',
  'Travel',
  'Entertainment',
  'Other',
]);

const requireHttps = (label, value) => {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:') errors.push(`${label} must use HTTPS`);
  } catch {
    errors.push(`${label} must be a valid URL`);
  }
};

const oneLine = (label, value, max) => {
  const text = String(value || '');
  if (!text.trim()) errors.push(`${label} is required`);
  if (/\r|\n/.test(text)) errors.push(`${label} must fit on one line`);
  if (text.length > max) errors.push(`${label} must be ${max} characters or fewer`);
};

const packageRoot = path.resolve('plugins/evercraft-fabric');
const requirePackageAsset = (label, value) => {
  const raw = String(value || '');
  if (!raw.startsWith('./')) {
    errors.push(`${label} must begin with ./`);
    return;
  }
  const resolved = path.resolve(packageRoot, raw);
  const relative = path.relative(packageRoot, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    errors.push(`${label} must stay inside the plugin package`);
    return;
  }
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    errors.push(`${label} must reference a package file`);
    return;
  }
  if (fs.statSync(resolved).size > 5 * 1024 * 1024) {
    errors.push(`${label} must be 5 MiB or smaller`);
  }
  if (/\.png$/i.test(resolved)) {
    const data = fs.readFileSync(resolved);
    const pngSignature = '89504e470d0a1a0a';
    if (data.length < 24 || data.subarray(0, 8).toString('hex') !== pngSignature) {
      errors.push(`${label} must be a decodable PNG`);
    } else {
      const width = data.readUInt32BE(16);
      const height = data.readUInt32BE(20);
      if (width !== height) errors.push(`${label} must be square`);
      if (width < 48 || height < 48) errors.push(`${label} must be at least 48x48`);
      if (width > 4096 || height > 4096) errors.push(`${label} must be at most 4096x4096`);
    }
  }
};

if (submission.submission_type !== 'With MCP') errors.push('submission_type must be With MCP');
if (!submission.plugin_name) errors.push('plugin_name is required');
requireHttps('mcp.url', submission?.mcp?.url);
if(submission?.mcp?.authority==='owned_public_fabric'){
  const mcpUrl=new URL(submission.mcp.url);
  if(/(^|\.)base44\.app$/i.test(mcpUrl.hostname)) errors.push('owned public Fabric MCP must not use Base44');
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
if (!fs.existsSync('plugins/evercraft-fabric/.codex-plugin/plugin.json')) errors.push('Evercraft plugin compatibility manifest is required');

if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(String(manifest.version || ''))) {
  errors.push('plugin version must be semantic');
}
if (submission.package_version !== manifest.version) errors.push('submission package_version must match plugin manifest');
if (compatibility.version !== manifest.version) errors.push('compatibility manifest version must match portable manifest');
if (compatibility.name !== manifest.name) errors.push('compatibility manifest name must match portable manifest');

oneLine('displayName', interfaceMeta.displayName, 30);
oneLine('shortDescription', interfaceMeta.shortDescription, 30);
oneLine('developerName', interfaceMeta.developerName, 80);
if (!String(interfaceMeta.longDescription || '').trim()) errors.push('longDescription is required');
if (String(interfaceMeta.longDescription || '').length > 4000) errors.push('longDescription must be 4000 characters or fewer');

if (!supportedCategories.has(interfaceMeta.category)) {
  errors.push('interface category must use a supported OpenAI directory category');
}
if (submission.proposed_category !== interfaceMeta.category) {
  errors.push('submission category must match portable interface category');
}
if (compatibility.interface?.category !== interfaceMeta.category) {
  errors.push('compatibility category must match portable interface category');
}

const capabilities = interfaceMeta.capabilities;
if (!Array.isArray(capabilities) || capabilities.length > 20) {
  errors.push('interface capabilities must be an array of at most 20 values');
} else {
  for (const capability of capabilities) oneLine('capability', capability, 120);
}

const prompts = interfaceMeta.defaultPrompt;
if (!Array.isArray(prompts) || prompts.length < 1 || prompts.length > 3) {
  errors.push('defaultPrompt must contain between one and three prompts');
} else {
  const normalized = new Set();
  for (const prompt of prompts) {
    oneLine('starter prompt', prompt, 128);
    const key = String(prompt).normalize('NFKC').replace(/\s+/g, ' ').trim();
    if (normalized.has(key)) errors.push('starter prompts must be unique');
    normalized.add(key);
    if (/@[A-Za-z0-9_-]+/.test(String(prompt))) errors.push('starter prompts must not contain MCP @mentions');
  }
}

for (const [label, value] of [
  ['interface.websiteURL', interfaceMeta.websiteURL],
  ['interface.supportURL', interfaceMeta.supportURL],
  ['interface.privacyPolicyURL', interfaceMeta.privacyPolicyURL],
  ['interface.termsOfServiceURL', interfaceMeta.termsOfServiceURL],
]) requireHttps(label, value);

if (interfaceMeta.websiteURL !== submission.website) errors.push('website URL must match submission packet');
if (interfaceMeta.supportURL !== submission.support_url) errors.push('support URL must match submission packet');
if (interfaceMeta.privacyPolicyURL !== submission.privacy_policy_url) errors.push('privacy URL must match submission packet');
if (interfaceMeta.termsOfServiceURL !== submission.terms_url) errors.push('terms URL must match submission packet');

requirePackageAsset('composerIcon', interfaceMeta.composerIcon);
requirePackageAsset('logo', interfaceMeta.logo);

const portableServer = portableMcp?.mcpServers?.evercraft;
if (portableServer?.type !== 'streamable-http') errors.push('portable Evercraft MCP must use streamable-http');
if (portableServer?.url !== submission.mcp.url) errors.push('portable MCP URL must match submission packet');
if (compatibility.interface?.websiteURL !== interfaceMeta.websiteURL) errors.push('compatibility website must match portable interface');

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

const review = manifest?.extensions?.['com.openai']?.review || {};
if (!Array.isArray(review?.test_cases?.positive) || review.test_cases.positive.length !== 5) {
  errors.push('portable manifest must embed exactly five positive review cases');
}
if (!Array.isArray(review?.test_cases?.negative) || review.test_cases.negative.length !== 3) {
  errors.push('portable manifest must embed exactly three negative review cases');
}
requireHttps('review.demo_recording_url', review.demo_recording_url);
if (!String(manifest?.extensions?.['com.openai']?.publication?.release_notes || '').trim()) {
  errors.push('portable manifest release notes are required');
}

const serialized = JSON.stringify({ submission, tests, manifest, compatibility, portableMcp });
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
  version:manifest.version,
  category:interfaceMeta.category,
  positive_tests:tests.positive.length,
  negative_tests:tests.negative.length,
  starter_prompts:prompts.length,
  mcp:submission.mcp.url
}));
