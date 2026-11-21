import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const repo = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '../..'
);

test('sales coordinator remains shadow-only and fail-closed', () => {
  execFileSync(
    process.execPath,
    ['systemia/sales-coordinator/shadow.mjs'],
    { cwd: repo, stdio: 'pipe' }
  );

  const report = JSON.parse(fs.readFileSync(
    path.join(repo, 'artifacts/sales-coordinator/latest.json'),
    'utf8'
  ));

  assert.equal(report.execution_mode, 'shadow');
  assert.equal(report.external_actions_performed, false);
  assert.equal(report.messages_sent, 0);
  assert.equal(report.payments_collected, 0);
  assert.equal(report.authoritative_relationship_state, false);
  assert.equal(report.targets.length, 8);

  const dispositions = new Map();

  for (const target of report.targets) {
    assert.equal(target.contact_authorized, false);
    assert.equal(target.relationship_ledger_verified, false);
    assert.equal(target.provider_delivery_verified, false);
    assert.equal(
      target.next_action,
      'reconcile_relationship_before_contact'
    );

    const state = target.proof_first_state?.state;
    assert.ok(state, 'missing proof-first classification');
    dispositions.set(state, (dispositions.get(state) || 0) + 1);
  }

  assert.equal(dispositions.get('waiting_reply'), 4);
  assert.equal(dispositions.get('awaiting_human_approval'), 4);
});
