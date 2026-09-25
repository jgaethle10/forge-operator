import assert from 'node:assert/strict';
import { approvalPathForManifest } from './scoped-approval.mjs';

assert.equal(
  approvalPathForManifest('mcp-registry/aliev.json', '1.0.3'),
  'systemia/release/approvals/mcp-registry/aliev-1.0.3.json'
);
assert.equal(
  approvalPathForManifest('mcp-registry/forensiscope.json', '2.1.0'),
  'systemia/release/approvals/mcp-registry/forensiscope-2.1.0.json'
);

console.log('Systemia scoped approval path tests: PASS');
