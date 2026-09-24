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
  return branchBlock[1]
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('- '))
    .map(line => line.slice(2).trim().replace(/^["']|["']$/g, ''));
}

function requireMainOnlyPush(path) {
  const text = read(path);
  const branches = pushBranches(text);
  if (branches.length !== 1 || branches[0] !== 'main') {
    fail(`${path} push branches must be exactly [main], got [${branches.join(', ')}]`);
  } else {
    pass(`${path} push is main-only`);
  }
}

requireMainOnlyPush('.github/workflows/ci.yml');
requireMainOnlyPush('.github/workflows/chum-watershed.yml');
requireMainOnlyPush('.github/workflows/evercraft-mcp-canary.yml');

{
  const path = '.github/workflows/ai-doorway-canary.yml';
  const block = onBlock(read(path));
  if (/\n  push:/.test(block) || /\n  schedule:/.test(block)) {
    fail(`${path} must remain manual-only; CHUM owns automatic discovery monitoring`);
  } else if (!/\n  workflow_dispatch:/.test(block)) {
    fail(`${path} must retain workflow_dispatch for diagnostics`);
  } else {
    pass(`${path} is manual-only`);
  }
}

{
  const path = '.github/workflows/publish-runtime.yml';
  const block = onBlock(read(path));
  const match = block.match(/workflow_run:[\s\S]*?branches:\n((?:      - .+(?:\n|$))+)/);
  const branches = match
    ? match[1].split('\n').map(line => line.trim()).filter(line => line.startsWith('- ')).map(line => line.slice(2).trim().replace(/^["']|["']$/g, ''))
    : [];
  if (branches.length !== 1 || branches[0] !== 'main') {
    fail(`${path} workflow_run branches must be exactly [main]`);
  } else {
    pass(`${path} follows main checks only`);
  }
}

for (const path of [
  '.github/workflows/ci.yml',
  '.github/workflows/chum-watershed.yml',
  '.github/workflows/evercraft-mcp-canary.yml'
]) {
  const text = read(path);
  if (!/concurrency:[\s\S]*?cancel-in-progress:\s*true/.test(text)) {
    fail(`${path} must cancel superseded runs`);
  } else {
    pass(`${path} cancels superseded runs`);
  }
}

if (process.exitCode) {
  throw new Error('workflow notification-noise policy violated');
}

console.log('WORKFLOW NOISE POLICY PASS');
