import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { measureProviderPickupConsistency } from '../systemia/chum/provider-pickup-consistency.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chum-pickup-'));
const obs = path.join(root, 'observations');
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
  productKey: 'forensiscope',
  prompt,
  outputPath: path.join(root, 'out4.json')
});
const google = result.measurements.find((m) => m.provider === 'google');
assert.equal(google.state, 'failing');

console.log('CHUM provider pickup consistency proof passed.');
