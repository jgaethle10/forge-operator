#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function readJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function moneyValues(text) {
  const values = [];
  const re = /\$([0-9]+(?:,[0-9]{3})*(?:\.[0-9]+)?)/g;
  for (const match of String(text || '').matchAll(re)) {
    const n = Number(String(match[1]).replace(/,/g, ''));
    if (Number.isFinite(n) && n > 0) values.push(n);
  }
  return [...new Set(values)].sort((a, b) => a - b);
}

function readinessScore(machineState) {
  const value = String(machineState || '').toLowerCase();
  if (value.startsWith('payment_ready')) return 50;
  if (value.includes('human_handoff_ready')) return 25;
  if (/callable|live|routable/.test(value)) return 18;
  return 5;
}

function entryFrictionScore(minPaid) {
  if (!Number.isFinite(minPaid)) return 0;
  if (minPaid <= 1) return 12;
  if (minPaid <= 25) return 11;
  if (minPaid <= 100) return 9;
  if (minPaid <= 300) return 7;
  if (minPaid <= 500) return 5;
  if (minPaid <= 1000) return 3;
  return 1;
}

function ticketScore(maxPaid) {
  if (!Number.isFinite(maxPaid)) return 0;
  return Math.min(24, Math.round(Math.log10(maxPaid + 1) * 7));
}

function canaryMap(receipt) {
  const map = new Map();
  for (const row of receipt?.results || []) {
    if (row?.public_id) map.set(row.public_id, row);
  }
  return map;
}

function probeCasesForOffer(offer, cases) {
  const url = String(offer.public_url || '').toLowerCase();
  const name = String(offer.name || '').toLowerCase();
  return (cases || [])
    .filter((c) => c?.enabled && c?.expected_fit)
    .filter((c) => {
      const hosts = (c.expected_hosts || []).map((x) => String(x).toLowerCase()).filter(Boolean);
      const expected = String(c.expected_product || '').toLowerCase();
      return hosts.some((host) => url.includes(host)) || (expected && name.includes(expected));
    })
    .map((c) => c.case_id);
}

export function buildRevenueFormation({
  catalog,
  painIndex,
  probeSuite,
  commerceCanary = null,
  generatedAt = new Date().toISOString()
}) {
  const canaries = canaryMap(commerceCanary);
  const painByPublicId = new Map(
    (painIndex?.entries || [])
      .filter((e) => e?.kind === 'machine_offer' && e?.public_id)
      .map((e) => [e.public_id, e])
  );

  const sellNow = (catalog?.offers || [])
    .filter((offer) => offer?.public_id && offer?.commercial_state === 'sell_now');

  const rows = sellNow.map((offer) => {
    const prices = moneyValues(offer.pricing);
    const minPaid = prices.length ? prices[0] : null;
    const maxPaid = prices.length ? prices[prices.length - 1] : null;
    const pain = painByPublicId.get(offer.public_id);
    const painCount = Math.max(
      Array.isArray(offer.intent_terms) ? offer.intent_terms.length : 0,
      Array.isArray(pain?.pain_phrases) ? pain.pain_phrases.length : 0
    );
    const canary = canaries.get(offer.public_id) || null;
    const canaryKnown = Boolean(canary);
    const canaryHealthy = canaryKnown ? canary.valid === true : null;
    const readiness = readinessScore(offer.machine_state);
    const uiEase = offer.human_ui_required ? 3 : 10;
    const languageCoverage = Math.min(15, Math.max(1, painCount));
    const doorHealth = canaryHealthy === true ? 20 : canaryHealthy === false ? -60 : 0;
    const velocityScore =
      readiness +
      uiEase +
      languageCoverage +
      entryFrictionScore(minPaid) +
      doorHealth;
    const highValueScore =
      readiness +
      uiEase +
      languageCoverage +
      ticketScore(maxPaid) +
      doorHealth;

    return {
      public_id: offer.public_id,
      name: offer.name,
      problem: offer.problem || null,
      pricing: offer.pricing || null,
      machine_state: offer.machine_state || null,
      public_url: offer.public_url || null,
      human_ui_required: Boolean(offer.human_ui_required),
      requires_human_confirmation: true,
      min_paid_usd: minPaid,
      max_listed_usd: maxPaid,
      pain_phrase_count: painCount,
      canary_state: canaryHealthy === true ? 'healthy' : canaryHealthy === false ? 'broken' : 'unknown',
      canary_reason: canary?.reason || null,
      probe_case_ids: probeCasesForOffer(offer, probeSuite?.cases || []),
      velocity_score: velocityScore,
      high_value_score: highValueScore,
      next_machine_action:
        canaryHealthy === false
          ? 'repair_sell_now_door_before_distribution'
          : String(offer.machine_state || '').startsWith('payment_ready')
            ? 'increase_brand_blind_machine_discovery_pressure'
            : 'increase_qualified_handoff_discovery_pressure',
      boundaries: {
        fit_before_sale: true,
        no_unsolicited_human_outreach: true,
        no_automatic_checkout: true,
        checkout_requires_explicit_human_confirmation: true,
        checkout_is_not_payment_proof: true,
        paid_state_requires_authoritative_provider_verification: true
      }
    };
  });

  const healthyOrUnknown = rows.filter((row) => row.canary_state !== 'broken');
  const broken = rows.filter((row) => row.canary_state === 'broken');

  const firstDollar = healthyOrUnknown
    .slice()
    .sort((a, b) =>
      b.velocity_score - a.velocity_score ||
      (a.min_paid_usd ?? Number.POSITIVE_INFINITY) - (b.min_paid_usd ?? Number.POSITIVE_INFINITY) ||
      a.public_id.localeCompare(b.public_id)
    );

  const highValue = healthyOrUnknown
    .slice()
    .sort((a, b) =>
      b.high_value_score - a.high_value_score ||
      (b.max_listed_usd ?? 0) - (a.max_listed_usd ?? 0) ||
      a.public_id.localeCompare(b.public_id)
    );

  const humanHandoff = healthyOrUnknown
    .filter((row) => String(row.machine_state || '').includes('human_handoff_ready'))
    .sort((a, b) => b.high_value_score - a.high_value_score || a.public_id.localeCompare(b.public_id));

  const formation = [];
  const seen = new Set();
  const maxDepth = Math.max(firstDollar.length, highValue.length);
  for (let i = 0; i < maxDepth; i += 1) {
    for (const candidate of [firstDollar[i], highValue[i]]) {
      if (!candidate || seen.has(candidate.public_id)) continue;
      seen.add(candidate.public_id);
      formation.push(candidate);
    }
  }

  return {
    schema: 'evercraft.saban.revenue-formation.v1',
    generated_at: generatedAt,
    source: {
      catalog_generated_at: catalog?.generated_at || null,
      catalog_schema_version: catalog?.source_schema_version || null,
      pain_index_schema: painIndex?.schema || null,
      commerce_canary_generated_at: commerceCanary?.generated_at || null
    },
    doctrine: {
      mission: 'Concentrate machine-discovery pressure on truthful sell-now Evercraft capabilities without spamming humans or inventing demand.',
      fit_before_sale: true,
      no_unsolicited_human_outreach: true,
      public_priority_bias_for_external_llms: false,
      no_automatic_checkout: true,
      explicit_human_confirmation_before_payment_obligation: true,
      checkout_is_not_payment_proof: true,
      verified_revenue_requires_authoritative_provider_receipt: true,
      scores_are_internal_operating_heuristics_not_conversion_predictions: true
    },
    summary: {
      sell_now_offers: rows.length,
      payment_ready: rows.filter((r) => String(r.machine_state || '').startsWith('payment_ready')).length,
      human_handoff_ready: rows.filter((r) => String(r.machine_state || '').includes('human_handoff_ready')).length,
      canary_healthy: rows.filter((r) => r.canary_state === 'healthy').length,
      canary_broken: broken.length,
      probe_covered: rows.filter((r) => r.probe_case_ids.length > 0).length
    },
    lanes: {
      first_dollar_velocity: firstDollar,
      high_value_cash: highValue,
      human_handoff: humanHandoff,
      repair_before_distribution: broken
    },
    focus_rotation: formation
  };
}

async function main() {
  const catalog = readJson('public/.well-known/evercraft-machine-catalog.json', { offers: [] });
  const painIndex = readJson('public/.well-known/evercraft-pain-index.json', { entries: [] });
  const probeSuite = readJson('chum-probes/probe-suite.json', { cases: [] });
  const commerceCanary = readJson('artifacts/chum/commerce-canary-latest.json', null);

  const receipt = buildRevenueFormation({
    catalog,
    painIndex,
    probeSuite,
    commerceCanary
  });

  fs.mkdirSync('artifacts/saban-revenue', { recursive: true });
  fs.writeFileSync('artifacts/saban-revenue/latest.json', JSON.stringify(receipt, null, 2) + '\n');

  const topVelocity = receipt.lanes.first_dollar_velocity.slice(0, 6);
  const topValue = receipt.lanes.high_value_cash.slice(0, 6);
  const md = [
    '# Saban Revenue Formation',
    '',
    `Generated: ${receipt.generated_at}`,
    `Sell-now offers: ${receipt.summary.sell_now_offers}`,
    `Payment-ready: ${receipt.summary.payment_ready}`,
    `Human-handoff ready: ${receipt.summary.human_handoff_ready}`,
    `Healthy commerce doors: ${receipt.summary.canary_healthy}`,
    `Broken commerce doors: ${receipt.summary.canary_broken}`,
    `Probe-covered: ${receipt.summary.probe_covered}`,
    '',
    '## First-dollar velocity',
    '',
    ...topVelocity.map((row, index) =>
      `${index + 1}. ${row.name} | ${row.pricing} | machine=${row.machine_state} | door=${row.canary_state}`
    ),
    '',
    '## Higher-ticket cash',
    '',
    ...topValue.map((row, index) =>
      `${index + 1}. ${row.name} | ${row.pricing} | machine=${row.machine_state} | door=${row.canary_state}`
    ),
    '',
    '## Rules',
    '',
    '- No unsolicited human outreach.',
    '- No automatic checkout.',
    '- Fit before sale.',
    '- Checkout is not payment proof.',
    '- Revenue exists only after authoritative provider verification.',
    '- Scores are internal operating heuristics, not predictions about what a person will buy.',
    ''
  ];
  fs.writeFileSync('artifacts/saban-revenue/latest.md', md.join('\n'));

  console.log(JSON.stringify(receipt.summary));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
