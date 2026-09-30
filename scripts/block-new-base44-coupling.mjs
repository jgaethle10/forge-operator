#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

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

let diff = '';
if (base) {
  try {
    diff = execFileSync('git', ['diff', '--unified=0', base + '...HEAD'], { encoding: 'utf8' });
  } catch {
    console.warn('Base44 coupling guard: diff comparison unavailable; continuing with critical-runtime zero-coupling scan.');
  }
} else {
  console.warn('Base44 coupling guard: migration base ref unavailable in this checkout; continuing with critical-runtime zero-coupling scan.');
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

const criticalRuntimePaths = [
  'server.ts',
  'systemia/chum/start-corridor.mjs',
];

const siteplanRoot = path.resolve('systemia/rivet/siteplan');
if (fs.existsSync(siteplanRoot)) {
  for (const name of fs.readdirSync(siteplanRoot)) {
    if (/\.(py|mjs|js|ts)$/.test(name)) criticalRuntimePaths.push('systemia/rivet/siteplan/' + name);
  }
}

const criticalViolations = [];
for (const file of criticalRuntimePaths) {
  if (!fs.existsSync(file)) continue;
  const body = fs.readFileSync(file, 'utf8');
  const lines = body.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (coupling.some((rx) => rx.test(lines[i]))) {
      criticalViolations.push({ path: file, lineNumber: i + 1, line: lines[i].trim() });
    }
  }
}

if (criticalViolations.length) {
  console.error('Base44 coupling remains in a critical owned runtime path.');
  for (const item of criticalViolations) {
    console.error(' - ' + item.path + ':' + item.lineNumber + ': ' + item.line);
  }
  process.exit(1);
}

console.log('Base44 coupling guard: PASS. No new Base44 dependency was added and critical owned runtime paths are clean.');
