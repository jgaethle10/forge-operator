import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const sha256 = (value) => crypto.createHash('sha256').update(String(value ?? '')).digest('hex');
const normalizePrompt = (value) => String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

function pickupValue(row) {
  if (typeof row?.surfaced_expected_product === 'boolean') return row.surfaced_expected_product;
  if (typeof row?.surfaced_forensiscope === 'boolean') return row.surfaced_forensiscope;
  if (typeof row?.surfaced_product === 'boolean') return row.surfaced_product;
  return null;
}

function surfaceClass(row) {
  const source = String(row?.source || '').toLowerCase();
  const surface = String(row?.provider_surface || '').toLowerCase();
  if (String(row?.provider || '').toLowerCase() === 'generic_agent') return 'machine_client';
  if (source === 'user_observed_result') return 'consumer_chat_observed';
  if (surface.includes('consumer') || surface.includes('chat')) return 'consumer_chat';
  if (surface.includes('machine')) return 'machine_client';
  return 'other';
}

function stateFor({ samples, pickups, misses, rate, minSamples, targetRate }) {
  if (!samples) return 'no_samples';
  if (pickups > 0 && misses > 0) return samples >= minSamples && rate >= targetRate ? 'healthy' : 'intermittent';
  if (pickups === 0) return samples >= minSamples ? 'failing' : 'zero_pickup_observed';
  if (samples < minSamples) return 'insufficient_samples';
  return rate >= targetRate ? 'healthy' : 'failing';
}

export function measureProviderPickupConsistency({
  observationsRoot = 'conformance/provider-observations',
  productKey = null,
  prompt = null,
  minSamples = 5,
  targetRate = 0.8,
  outputPath = 'artifacts/chum/provider-pickup-consistency-latest.json'
} = {}) {
  const promptHash = prompt ? sha256(normalizePrompt(prompt)) : null;
  const rows = [];
  if (fs.existsSync(observationsRoot)) {
    for (const name of fs.readdirSync(observationsRoot).filter((n) => n.endsWith('.json')).sort()) {
      const pathname = path.join(observationsRoot, name);
      let row;
      try { row = readJson(pathname); } catch { continue; }
      if (row?.schema !== 'evercraft.provider-observation.v1') continue;
      if (productKey && String(row.product_key || '') !== productKey) continue;
      const value = pickupValue(row);
      if (value === null) continue;
      const normalized = normalizePrompt(row.prompt);
      const rowPromptHash = normalized ? sha256(normalized) : null;
      if (promptHash && rowPromptHash !== promptHash) continue;
      rows.push({
        file: pathname,
        observed_at: row.observed_at || null,
        provider: String(row.provider || 'unknown').toLowerCase(),
        surface_class: surfaceClass(row),
        product_key: row.product_key || null,
        prompt_hash: rowPromptHash,
        pickup: value,
        source: row.source || null
      });
    }
  }

  const groups = new Map();
  for (const row of rows) {
    const key = [row.provider, row.surface_class, row.product_key || 'unknown', row.prompt_hash || 'unknown'].join('|');
    const group = groups.get(key) || {
      provider: row.provider,
      surface_class: row.surface_class,
      product_key: row.product_key,
      prompt_hash: row.prompt_hash,
      samples: 0,
      pickups: 0,
      misses: 0,
      receipts: []
    };
    group.samples += 1;
    if (row.pickup) group.pickups += 1;
    else group.misses += 1;
    group.receipts.push({ file: row.file, observed_at: row.observed_at, pickup: row.pickup, source: row.source });
    groups.set(key, group);
  }

  const measurements = [...groups.values()].map((group) => {
    const rate = group.samples ? group.pickups / group.samples : 0;
    return {
      ...group,
      pickup_rate: Number(rate.toFixed(4)),
      target_rate: targetRate,
      minimum_samples_for_green: minSamples,
      state: stateFor({ ...group, rate, minSamples, targetRate })
    };
  }).sort((a,b) => a.provider.localeCompare(b.provider) || a.product_key.localeCompare(b.product_key || ''));

  const summary = {
    schema: 'evercraft.chum.provider-pickup-consistency.v1',
    generated_at: new Date().toISOString(),
    filters: { product_key: productKey, prompt_hash: promptHash },
    policy: {
      target_pickup_rate: targetRate,
      minimum_independent_receipts_for_green: minSamples,
      mixed_positive_and_negative_receipts_are_intermittent_until_threshold_is_met: true,
      publication_does_not_imply_provider_pickup: true
    },
    measurements
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(summary, null, 2) + '\n');
  const mdPath = outputPath.replace(/\.json$/, '.md');
  const md = [
    '# CHUM Provider Pickup Consistency',
    '',
    `Target: ${Math.round(targetRate * 100)}% pickup with at least ${minSamples} independent receipts before a provider/prompt lane can be called green.`,
    '',
    '| Provider | Surface | Product | Samples | Pickups | Misses | Rate | State |',
    '|---|---|---|---:|---:|---:|---:|---|',
    ...measurements.map((m) => `| ${m.provider} | ${m.surface_class} | ${m.product_key || ''} | ${m.samples} | ${m.pickups} | ${m.misses} | ${Math.round(m.pickup_rate*100)}% | ${m.state} |`)
  ];
  fs.writeFileSync(mdPath, md.join('\n') + '\n');
  return summary;
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isCli) {
  const productKey = process.env.CHUM_PICKUP_PRODUCT || null;
  const prompt = process.env.CHUM_PICKUP_PROMPT || null;
  const summary = measureProviderPickupConsistency({ productKey, prompt });
  console.log(JSON.stringify(summary));
}
