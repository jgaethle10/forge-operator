#!/usr/bin/env node
// Dependency-free regression test for the research-only contract.
import assert from 'node:assert/strict';
import { proof, checkCapability, checkRelativePath } from './contract-proof.mjs';

const receipt = proof();
assert.equal(receipt.passed, true, 'baseline contract failed');
assert.equal(receipt.checks.length, 7);
assert.equal(checkCapability('scratch.read').admitted, true);
for (const name of ['network', 'payments', 'shell', 'admin', '']) {
  assert.equal(checkCapability(name).admitted, false, name);
}
for (const value of ['../escape', 'folder/../../escape', '/absolute', '..\\escape', '', './file']) {
  assert.equal(checkRelativePath(value).admitted, false, String(value));
}
assert.equal(checkRelativePath('documents/source.txt').admitted, true);
assert.equal(receipt.deepagents_invoked, false);
assert.equal(receipt.sandbox_enforced, false);
process.stdout.write(JSON.stringify({
  schema: 'evercraft.saban.deepagents-contract-regression.v0',
  synthetic: true,
  passed: true,
  checks: receipt.checks.length + 13,
  runtime_invoked: false
}) + '\n');
