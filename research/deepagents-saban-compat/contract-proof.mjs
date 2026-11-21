#!/usr/bin/env node
// Synthetic, dependency-free capability contract checks.
// No model, subprocess, network, or Deep Agents runtime is invoked.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const allowed = new Set(['scratch.read', 'scratch.write']);
export function checkCapability(name) {
  return { capability: name, admitted: allowed.has(name) };
}
export function checkRelativePath(input) {
  const normalized = typeof input === 'string' ? input.replaceAll('\\', '/') : '';
  const segments = normalized.split('/');
  const valid = Boolean(normalized) && !path.posix.isAbsolute(normalized) &&
    segments.every(x => x && x !== '.' && x !== '..');
  return { path: input, admitted: valid };
}
export function proof() {
  const checks = [
    { name: 'read', actual: checkCapability('scratch.read').admitted, expected: true },
    { name: 'write', actual: checkCapability('scratch.write').admitted, expected: true },
    { name: 'unknown_capability', actual: checkCapability('unapproved').admitted, expected: false },
    { name: 'relative_path', actual: checkRelativePath('evidence/input.txt').admitted, expected: true },
    { name: 'parent_traversal', actual: checkRelativePath('../outside').admitted, expected: false },
    { name: 'absolute_path', actual: checkRelativePath('/outside').admitted, expected: false },
    { name: 'windows_traversal', actual: checkRelativePath('..\\outside').admitted, expected: false }
  ];
  return {
    schema: 'evercraft.saban.deepagents-contract-proof.v0',
    synthetic: true,
    deepagents_invoked: false,
    sandbox_enforced: false,
    checkpoint_tested: false,
    checks: checks.map(x => ({ ...x, passed: x.actual === x.expected })),
    passed: checks.every(x => x.actual === x.expected)
  };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const receipt = proof();
  process.stdout.write(JSON.stringify(receipt, null, 2) + '\n');
  if (!receipt.passed) process.exitCode = 1;
}
