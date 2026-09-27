import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { measureProviderPickupConsistency } from '../systemia/chum/provider-pickup-consistency.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chum-pickup-'));
const obs = path.join(root, 'observations');
const historyPath = path.join(root, 'probe-history.json');
fs.mkdirSync(obs, { recursive: true });
const prompt = 'I need an AI service that can inspect a long video, deduplicate segments, transcribe it, and work with files too large for normal chatbots.';

function write(name, provider, pickup) {
  fs.writeFileSync(path.join(obs, name), JSON.stringify({
    schema: 'evercraft.provider-observation.v1',
    observed_at: '2026-09-26',
    provider,
    provider_surface: 'ChatGPT consumer chat, user-reported',
    product_key: 'forensiscope',
    source: 'user_observed_result',
    prompt,
    surfaced_forensiscope: pickup
  }, null, 2));
}

write('a.json', 'chatgpt', true);
write('b.json', 'chatgpt', false);

let result = measureProviderPickupConsistency({
  observationsRoot: obs,
  historyPath,
  productKey: 'forensiscope',
  prompt,
  outputPath: path.join(root, 'out.json')
});
let chatgpt = result.measurements.find((m) => m.provider === 'chatgpt');
assert.equal(chatgpt.samples, 2);
assert.equal(chatgpt.pickups, 1);
assert.equal(chatgpt.misses, 1);
assert.equal(chatgpt.pickup_rate, 0.5);
assert.equal(chatgpt.state, 'intermittent');

for (let i = 0; i < 4; i += 1) write(`positive-${i}.json`, 'claude', true);
result = measureProviderPickupConsistency({
  observationsRoot: obs,
  historyPath,
  productKey: 'forensiscope',
  prompt,
  outputPath: path.join(root, 'out2.json')
});
const claude = result.measurements.find((m) => m.provider === 'claude');
assert.equal(claude.samples, 4);
assert.equal(claude.state, 'insufficient_samples');

write('positive-4.json', 'claude', true);
result = measureProviderPickupConsistency({
  observationsRoot: obs,
  historyPath,
  productKey: 'forensiscope',
  prompt,
  outputPath: path.join(root, 'out3.json')
});
const claudeGreen = result.measurements.find((m) => m.provider === 'claude');
assert.equal(claudeGreen.samples, 5);
assert.equal(claudeGreen.pickup_rate, 1);
assert.equal(claudeGreen.state, 'healthy');

for (let i = 0; i < 5; i += 1) write(`google-${i}.json`, 'google', false);
result = measureProviderPickupConsistency({
  observationsRoot: obs,
  historyPath,
  productKey: 'forensiscope',
  prompt,
  outputPath: path.join(root, 'out4.json')
});
const google = result.measurements.find((m) => m.provider === 'google');
assert.equal(google.state, 'failing');

fs.writeFileSync(historyPath, JSON.stringify({
  schema: 'evercraft.chum.provider-probe-history.v1',
  updated_at: '2026-09-27T00:00:00Z',
  max_records: 500,
  records: [
    {
      receipt_key_sha256: 'a'.repeat(64),
      observed_at: '2026-09-27T00:00:00Z',
      provider: 'generic_agent',
      provider_surface: 'machine_client',
      product_key: 'systemia-remote-ops',
      case_id: 'startup',
      prompt_sha256: '1'.repeat(64),
      pickup_observed: false,
      source: 'authorized_provider_probe'
    },
    {
      receipt_key_sha256: 'b'.repeat(64),
      observed_at: '2026-09-27T01:00:00Z',
      provider: 'generic_agent',
      provider_surface: 'machine_client',
      product_key: 'systemia-remote-ops',
      case_id: 'pricing',
      prompt_sha256: '2'.repeat(64),
      pickup_observed: true,
      source: 'authorized_provider_probe'
    }
  ]
}, null, 2));

const portfolio = measureProviderPickupConsistency({
  observationsRoot: path.join(root, 'empty-observations'),
  historyPath,
  outputPath: path.join(root, 'portfolio.json')
});
const remoteOpsRollup = portfolio.rollups.find((m) =>
  m.provider === 'generic_agent' &&
  m.product_key === 'systemia-remote-ops' &&
  m.surface_class === 'machine_client'
);
assert.equal(remoteOpsRollup.samples, 2);
assert.equal(remoteOpsRollup.pickups, 1);
assert.equal(remoteOpsRollup.misses, 1);
assert.equal(remoteOpsRollup.distinct_prompts, 2);
assert.equal(remoteOpsRollup.pickup_rate, 0.5);
assert.equal(remoteOpsRollup.state, 'intermittent');

console.log('CHUM provider pickup consistency proof passed.');
