import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const fail = (message) => {
  console.error(`WORKFLOW NOISE POLICY FAIL: ${message}`);
  process.exitCode = 1;
};
const pass = (message) => console.log(`WORKFLOW NOISE POLICY PASS: ${message}`);

function onBlock(text) {
  const start = text.indexOf('on:\n');
  const end = text.indexOf('\npermissions:', start);
  if (start < 0 || end < 0) return '';
  return text.slice(start, end);
}

function pushBranches(text) {
  const block = onBlock(text);
  const push = block.match(/\n  push:\n([\s\S]*?)(?=\n  [A-Za-z_][\w-]*:|$)/);
  if (!push) return [];
  const branchBlock = push[1].match(/    branches:\n((?:      - .+(?:\n|$))+)/);
  if (!branchBlock) return [];
  return branchBlock[1].split('\n').map(line => line.trim()).filter(line => line.startsWith('- ')).map(line => line.slice(2).trim().replace(/^["']|["']$/g, ''));
}

function requireMainOnlyPush(path) {
  const branches = pushBranches(read(path));
  if (branches.length !== 1 || branches[0] !== 'main') fail(`${path} push branches must be exactly [main]`);
  else pass(`${path} push is main-only`);
}

requireMainOnlyPush('.github/workflows/ci.yml');
requireMainOnlyPush('.github/workflows/chum-watershed.yml');
requireMainOnlyPush('.github/workflows/evercraft-mcp-canary.yml');

{
  const path = '.github/workflows/ai-doorway-canary.yml';
  const block = onBlock(read(path));
  if (/\n  push:/.test(block) || /\n  schedule:/.test(block)) fail(`${path} must remain manual-only`);
  else if (!/\n  workflow_dispatch:/.test(block)) fail(`${path} must retain workflow_dispatch`);
  else pass(`${path} is manual-only`);
}

{
  const path = '.github/workflows/publish-runtime.yml';
  const block = onBlock(read(path));
  const match = block.match(/workflow_run:[\s\S]*?branches:\n((?:      - .+(?:\n|$))+)/);
  const branches = match ? match[1].split('\n').map(line=>line.trim()).filter(line=>line.startsWith('- ')).map(line=>line.slice(2).trim().replace(/^["']|["']$/g,'')) : [];
  if (branches.length !== 1 || branches[0] !== 'main') fail(`${path} workflow_run branches must be exactly [main]`);
  else pass(`${path} follows main checks only`);
}

{
  const path = '.github/workflows/ci.yml';
  const text = read(path);
  const conditional = /concurrency:[\s\S]*?cancel-in-progress:\s*\$\{\{\s*github\.event_name\s*==\s*['"]pull_request['"]\s*\}\}/.test(text);
  if (!conditional) fail(`${path} must cancel stale pull-request runs while allowing active main verification to finish`);
  else pass(`${path} cancels stale PR runs without starving main verification`);
}

for (const path of ['.github/workflows/chum-watershed.yml','.github/workflows/evercraft-mcp-canary.yml']) {
  const text = read(path);
  if (!/concurrency:[\s\S]*?cancel-in-progress:\s*true/.test(text)) fail(`${path} must cancel superseded runs`);
  else pass(`${path} cancels superseded runs`);
}


// Nexus fixture validation must not consume a runner on unrelated product,
// commercial, creative or research PRs. Main and manual checks remain intact.
{
  const path = '.github/workflows/nexus-cross-llm-probes.yml';
  const trigger = onBlock(read(path));
  const expected = [
    'nexus-probes/**',
    'scripts/validate-nexus-cross-llm-probes.mjs',
    '.github/workflows/nexus-cross-llm-probes.yml',
    'scripts/validate-workflow-noise.mjs',
  ];
  for (const event of ['pull_request', 'push']) {
    const match = trigger.match(new RegExp('\\n  ' + event + ':\\n([\\s\\S]*?)(?=\\n  [A-Za-z_][\\w-]*:|$)'));
    const block = match?.[1] || '';
    for (const entry of expected) {
      if (!block.includes(entry)) fail(`${path}: ${event} must include ${entry}`);
    }
    if (/^\s*- ['"]?systemia\/\*\*/m.test(block) || /^\s*- ['"]?\*\*/m.test(block)) {
      fail(`${path}: ${event} must not be a repository-wide trigger`);
    }
  }
  if (!/\n  workflow_dispatch:/.test(trigger)) fail(`${path}: manual override required`);
  else pass(`${path} manual and fixture-scoped`);
  requireMainOnlyPush(path);
}

for (const path of [
  '.github/workflows/nexus-cross-llm-probes.yml',
  '.github/workflows/base44-runtime-debt-inventory.yml',
]) {
  const text = read(path);
  if (!/concurrency:[\s\S]*?group:[^\n]*github\.ref[^\n]*\n\s*cancel-in-progress:\s*\$\{\{\s*github\.event_name\s*==\s*['"]pull_request['"]\s*\}\}/.test(text)) {
    fail(`${path} must cancel superseded same-ref PR checks, not main verification`);
  } else {
    pass(`${path} uses PR-only cancellation by ref`);
  }
}

if (process.exitCode) throw new Error('workflow notification-noise policy violated');
console.log('WORKFLOW NOISE POLICY PASS');
