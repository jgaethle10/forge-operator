import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

execFileSync(process.execPath, ['systemia/chum/ard-strike.mjs', '--offline'], { stdio: 'inherit' });
const receipt = JSON.parse(fs.readFileSync('artifacts/chum/ard-strike-latest.json', 'utf8'));

assert.equal(receipt.schema, 'evercraft.chum.ard-strike.receipt.v1');
assert.equal(receipt.mode, 'offline');
assert.equal(receipt.doctrine.no_unsolicited_email, true);
assert.equal(receipt.doctrine.no_direct_message_outreach, true);
assert.equal(receipt.doctrine.no_payment_action, true);
assert.equal(receipt.doctrine.no_fake_pickup, true);
assert.equal(receipt.registry.submission_mode, 'offline');
assert.equal(receipt.registry.submission_concurrency, 4);
assert.equal(receipt.registry.request_timeout_ms, 20000);
assert.ok(receipt.registry.submission_concurrency >= 1 && receipt.registry.submission_concurrency <= 8);
assert.ok(receipt.endpoints_discovered >= 1);
assert.ok(receipt.submissions.every((x) => x.attempted === false));
assert.ok(receipt.discovery_probe.case_id);
console.log('CHUM ARD strike offline proof passed.');
