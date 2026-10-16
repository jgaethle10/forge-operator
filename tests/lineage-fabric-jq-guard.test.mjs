import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const workflow = readFileSync('.github/workflows/lineage-public-fabric-canary.yml', 'utf8');
const marker = 'printf \'%s\' "$capability" | jq -e --arg url "$page_url" \'';
const begin = workflow.indexOf(marker);
assert.ok(begin >= 0, 'cannot find actual published Lineage capability jq validation');
const from = begin + marker.length;
const end = workflow.indexOf("' >/dev/null", from);
assert.ok(end > from, 'cannot extract actual jq filter');
const filter = workflow.slice(from, end).trim();
const url = 'https://fabric.systemiacommandcenters.com/capabilities/lineage-founding-pilot-v1';
const base = Object.freeze({
  public_id: 'lineage-founding-pilot-v1',
  commercial_state: 'verification_required',
  machine_state: 'human_handoff_ready',
  public_url: url,
  entry_paid_offer: { price_usd: 500 },
  authority_rule: 'Checkout creation is not proof of payment; no settlement or deploy claims',
});
function evaluate(input) {
  const result = spawnSync('jq', ['-e', '--arg', 'url', url, filter], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    timeout: 5_000,
  });
  assert.equal(result.error, undefined, result.error?.message);
  assert.notEqual(result.status, 5, 'jq expression must not crash: ' + result.stderr);
  return result;
}

test('exact published jq guard accepts only the complete approved founding pilot', () => {
  const result = evaluate(base);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), 'true');
});
const negatives = [
  ['wrong public_id', { public_id: 'other-product' }],
  ['premature sell-now', { commercial_state: 'sell_now' }],
  ['not human handoff', { machine_state: 'automated_checkout' }],
  ['mismatched public route', { public_url: 'https://example.com' }],
  ['wrong price', { entry_paid_offer: { price_usd: 499 } }],
  ['missing bounded authority rule', { authority_rule: 'Checkout creation proves payment' }],
];
for (const [label, mutation] of negatives) {
  test('exact published jq guard rejects ' + label, () => {
    const result = evaluate({ ...base, ...mutation });
    assert.equal(result.status, 1, result.stderr);
    assert.equal(result.stdout.trim(), 'false');
  });
}

test('draft PR fixture runs cannot cancel the live scheduled canary', () => {
  assert.ok(workflow.includes("github.event_name == 'pull_request' && github.event.pull_request.number || 'live'"));
  assert.ok(workflow.includes('cancel-in-progress: true'));
});
