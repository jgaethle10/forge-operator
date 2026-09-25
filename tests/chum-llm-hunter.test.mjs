import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

execFileSync(process.execPath, ['systemia/chum/llm-hunter.mjs', '--offline'], { stdio: 'inherit' });
const receipt = JSON.parse(fs.readFileSync('artifacts/chum/llm-hunter-latest.json', 'utf8'));
const publicSummary = JSON.parse(fs.readFileSync('public/chum/llm-hunter.json', 'utf8'));

assert.equal(receipt.schema, 'evercraft.chum.llm-hunter.receipt.v1');
assert.equal(receipt.mode, 'offline');
assert.equal(receipt.doctrine.no_human_spam, true);
assert.equal(receipt.doctrine.no_unsolicited_email, true);
assert.equal(receipt.doctrine.active_distribution, true);
assert.ok(receipt.attack_loop.includes('PUBLISH_OR_SUBMIT'));
assert.ok(receipt.attack_loop.includes('PROBE_BRAND_BLIND'));
assert.ok(receipt.attack_loop.includes('REPAIR_MISS'));
assert.ok(receipt.known_provider_targets.length >= 7);
assert.ok(receipt.commercial_payload.sell_now_offers > 0);
assert.ok(receipt.rotation?.case_id);
assert.equal(publicSummary.rules.no_human_spam, true);
assert.equal(publicSummary.rules.provider_pickup_requires_receipt, true);
console.log('CHUM LLM Hunter offline proof passed.');
