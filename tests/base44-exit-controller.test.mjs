import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { analyzeExitEstate } from '../scripts/base44-exit-controller.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Base44 exit controller preserves the full observed estate and covers P0', () => {
  const result = analyzeExitEstate({ root });
  assert.equal(result.observed_apps >= 100, true);
  assert.equal(result.observed_apps >= result.observed_minimum, true);
  assert.equal(result.p0_apps >= 10, true);
  assert.deepEqual(result.p0_uncovered, []);
  assert.equal(result.coverage.every((item) => Boolean(item.disposition)), true);
  assert.equal(result.healthy, true);
});
