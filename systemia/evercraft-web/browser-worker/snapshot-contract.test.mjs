import assert from 'node:assert/strict';
import test from 'node:test';
import { HEADING_SELECTOR, MAX_HEADINGS, browserSnapshotContract } from './snapshot-contract.mjs';

test('browser snapshots preserve all semantic HTML heading levels', () => {
  assert.equal(HEADING_SELECTOR, 'h1,h2,h3,h4,h5,h6');
  assert.ok(MAX_HEADINGS >= 100);
  const contract = browserSnapshotContract();
  assert.equal(contract.preserves_semantic_heading_depth, true);
  assert.equal(contract.schema, 'evercraft.web.browser.snapshot.v2');
});
