#!/usr/bin/env node
import { execFileSync } from 'node:child_process';

const explicitBase = String(process.env.BASE44_MIGRATION_BASE_REF || '').trim();
const candidates = [explicitBase, 'origin/main', 'main'].filter(Boolean);
let base = '';

for (const candidate of candidates) {
  try {
    execFileSync('git', ['rev-parse', '--verify', candidate], { stdio: 'ignore' });
    base = candidate;
    break;
  } catch {}
}

if (!base) {
  console.error('Base44 coupling guard: unable to resolve a migration base ref.');
  process.exit(2);
}

let diff = '';
try {
  diff = execFileSync('git', ['diff', '--unified=0', base + '...HEAD'], { encoding: 'utf8' });
} catch (error) {
  console.error('Base44 coupling guard: git diff failed.');
  process.exit(2);
}

const coupling = [
  /(?:^|\.)base44\.app\b/i,
  /\/api\/apps\/[A-Za-z0-9_-]+\/functions\//i,
  /@base44\/sdk\b/i,
  /\bbase44\/functions\//i,
];

const allowedPaths = [
  /^migration\/base44\//,
  /^scripts\/block-new-base44-coupling\.mjs$/,
  /^tests\/block-new-base44-coupling\.test\.mjs$/,
];

let currentPath = '';
const violations = [];

for (const line of diff.split('\n')) {
  if (line.startsWith('+++ b/')) {
    currentPath = line.slice(6);
    continue;
  }
  if (!line.startsWith('+') || line.startsWith('+++')) continue;
  if (allowedPaths.some((rx) => rx.test(currentPath))) continue;
  const added = line.slice(1);
  if (coupling.some((rx) => rx.test(added))) {
    violations.push({ path: currentPath || '<unknown>', line: added.trim() });
  }
}

if (violations.length) {
  console.error('New Base44 runtime coupling is forbidden during the evacuation program.');
  for (const item of violations) console.error(' - ' + item.path + ': ' + item.line);
  process.exit(1);
}

console.log('Base44 coupling guard: PASS. No new Base44 runtime dependency was added.');
