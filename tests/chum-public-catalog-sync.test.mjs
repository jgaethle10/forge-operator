import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const syncScript = path.join(repoRoot, 'systemia', 'chum', 'sync-public-discovery.mjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-catalog-sync-'));
const output = path.join(root, 'public', '.well-known', 'evercraft-machine-catalog.json');

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify({
  schema: 'evercraft.machine-catalog.snapshot.v1',
  provider: 'Evercraft LLC',
  offers: [{
    public_id: 'proof-offer-v1',
    name: 'Proof Offer',
    intent_terms: ['prove the catalog boundary'],
    problem: 'A proof offer needs a safe public continuation.',
    inputs: 'None.',
    outputs: 'Proof.',
    commercial_state: 'sell_now',
    machine_state: 'payment_ready',
    pricing: '$1',
    offers: [{ name: 'Proof', price: '$1', billing: 'one_time' }],
    human_ui_required: false,
    confirmation: 'Explicit confirmation required.',
    public_url: 'https://legacy.example.base44.app/buy',
    payment_authority: 'Evercraft Payments with provider verification',
    invocation_status: 'LIVE at https://legacy.example.base44.app/mcp',
    catalog_version: 'proof'
  }]
}, null, 2) + '\n');

const env = {
  ...process.env,
  EVERCRAFT_MACHINE_CATALOG_URL: '',
  EVERCRAFT_MACHINE_COMMERCE_GATEWAY_URL: ''
};

const run = () => JSON.parse(execFileSync(process.execPath, [syncScript], {
  cwd: root,
  env,
  encoding: 'utf8'
}).trim());

try {
  const first = run();
  assert.equal(first.changed, true);

  const afterFirst = JSON.parse(fs.readFileSync(output, 'utf8'));
  const offer = afterFirst.offers[0];
  assert.match(
    offer.public_url,
    /^https:\/\/raw\.githubusercontent\.com\/jgaethle10\/forge-operator\/main\/public\/chum\/capabilities\/proof-offer-v1\/index\.html$/
  );
  assert.equal(offer.public_url_source, 'static_capability_mirror');
  assert.equal(offer.public_url_transactional, false);
  assert.equal(offer.checkout_continuation_verified, false);
  assert.equal(/base44\.app/i.test(offer.public_url), false);
  assert.match(offer.invocation_status, /^HELD: legacy provider runtime retired/);
  assert.equal(afterFirst.safety.static_capability_public_url_is_not_checkout, true);
  assert.equal(afterFirst.safety.public_url_does_not_imply_payment_authority, true);

  const firstBytes = fs.readFileSync(output, 'utf8');
  const second = run();
  const secondBytes = fs.readFileSync(output, 'utf8');

  assert.equal(second.changed, false);
  assert.equal(secondBytes, firstBytes);
  const afterSecond = JSON.parse(secondBytes);
  assert.equal(afterSecond.offers[0].public_url_source, 'static_capability_mirror');
  assert.equal(afterSecond.offers[0].public_url_transactional, false);
  assert.equal(afterSecond.offers[0].checkout_continuation_verified, false);

  console.log(JSON.stringify({
    ok: true,
    legacy_provider_url_retired: true,
    static_public_continuation_preserved: true,
    static_continuation_is_not_checkout: true,
    repeated_sync_is_idempotent: true
  }));
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
