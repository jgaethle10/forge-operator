import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
const file = new URL('./run-raven-local-tool-canary.mjs', import.meta.url);

test('default CLI produces no inference and no execution', () => {
  const r = spawnSync(process.execPath, [file.pathname], { encoding: 'utf8' });
  assert.equal(r.status, 0);
  const body = JSON.parse(r.stdout);
  assert.equal(body.status, 'NOT_STARTED');
  assert.equal(body.operations_executable, false);
  assert.equal(body.model_downloads_authorized, false);
});
test('explicit run requires an installed model name', () => {
  const r = spawnSync(process.execPath, [file.pathname, '--run'], { encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /model_required_for_run/);
});
test('unrecognized CLI arguments are rejected before any inference', () => {
  const r = spawnSync(process.execPath, [file.pathname, '--do-shell'], { encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /unsupported_canary_option/);
});
