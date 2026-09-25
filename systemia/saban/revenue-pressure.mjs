#!/usr/bin/env node
import fs from 'node:fs';

const readJson = (file, fallback = {}) => {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
};

const normalize = value => String(value || '')
  .normalize('NFKC')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const tokens = value => new Set(normalize(value).split(/\s+/).filter(x => x.length >= 2));

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function numericEntryPrice(offer) {
  const explicit = Number(offer?.entry_paid_offer?.price_usd_normalized);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;

  const prices = (offer?.offers || [])
    .map(item => {
      const direct = Number(item?.price_usd);
      if (Number.isFinite(direct) && direct > 0) return direct;
      const text = String(item?.price || '');
      const match = text.match(/\$\s*([0-9]+(?:\.[0-9]+)?)/);
      return match ? Number(match[1]) : NaN;
    })
    .filter(x => Number.isFinite(x) && x > 0);

  return prices.length ? Math.min(...prices) : null;
}

function machineReadiness(state) {
  const value = normalize(state);
  if (value === 'payment ready') return 44;
  if (value.includes('payment ready')) return 36;
  if (value.includes('callable') || value.includes('live')) return 28;
  if (value.includes('human handoff ready')) return 14;
  return 6;
}

function speedPriceScore(price) {
  if (!Number.isFinite(price) || price <= 0) return 2;
  if (price <= 1) return 26;
  if (price <= 20) return 24;
  if (price <= 50) return 21;
  if (price <= 100) return 18;
  if (price <= 250) return 13;
  if (price <= 500) return 9;
  return 5;
}

function valuePriceScore(price) {
  if (!Number.isFinite(price) || price <= 0) return 0;
  return clamp(Math.round(Math.log10(price + 1) * 8), 2, 24);
}

function intentCoverage(offer) {
  return clamp((offer?.intent_terms || []).length * 2, 0, 24);
}

function frictionPenalty(offer) {
  let penalty = 0;
  if (offer?.human_ui_required) penalty += 8;
  const state = normalize(offer?.machine_state);
  if (state.includes('human handoff')) penalty += 10;
  if (!String(offer?.public_url || '').startsWith('https://')) penalty += 20;
  return penalty;
}

export function scoreSellNowOffer(offer) {
  const price = numericEntryPrice(offer);
  const readiness = machineReadiness(offer?.machine_state);
  const intents = intentCoverage(offer);
  const friction = frictionPenalty(offer);
  const speed = speedPriceScore(price);
  const value = valuePriceScore(price);
  const checkoutReady = normalize(offer?.machine_state).includes('payment ready');

  return {
    public_id: offer?.public_id || null,
    name: offer?.name || offer?.public_id || 'Unknown offer',
    machine_state: offer?.machine_state || null,
    entry_price_usd: price,
    intent_count: (offer?.intent_terms || []).length,
    human_ui_required: Boolean(offer?.human_ui_required),
    first_dollar_score: clamp(readiness + intents + speed + (checkoutReady ? 10 : 0) - friction, 0, 100),
    real_revenue_score: clamp(readiness + intents + value + (checkoutReady ? 8 : 0) - Math.round(friction / 2), 0, 100),
    reasons: [
      checkoutReady ? 'provider-verified checkout path is declared' : 'checkout path still has human-handoff friction',
      `${(offer?.intent_terms || []).length} pain-language intent terms`,
      price ? `entry paid offer about $${price}` : 'entry price is not normalized',
      offer?.human_ui_required ? 'extra human UI step required' : 'no extra human UI step declared'
    ]
  };
}

function caseFit(caseRow, offer) {
  const caseTokens = tokens([
    caseRow?.product_key,
    caseRow?.expected_product,
    ...(caseRow?.expected_aliases || []),
    ...(caseRow?.expected_hosts || [])
  ].join(' '));
  const offerTokens = tokens([
    offer?.public_id,
    offer?.name,
    offer?.public_url
  ].join(' '));

  let overlap = 0;
  for (const token of caseTokens) if (offerTokens.has(token)) overlap += 1;

  let hostBonus = 0;
  try {
    const host = new URL(offer?.public_url || '').host;
    if ((caseRow?.expected_hosts || []).some(x => host === x || host.endsWith(`.${x}`) || x.endsWith(`.${host}`))) {
      hostBonus = 8;
    }
  } catch {}

  return overlap + hostBonus;
}

export function buildRevenuePressurePlan({
  revenue,
  probeSuite,
  providerCount = 7,
  generatedAt = new Date()
}) {
  const offers = (revenue?.offers || [])
    .filter(x => x?.commercial_state === 'sell_now')
    .map(offer => ({ offer, score: scoreSellNowOffer(offer) }));

  const firstDollar = [...offers]
    .sort((a, b) => b.score.first_dollar_score - a.score.first_dollar_score || (a.score.entry_price_usd ?? Infinity) - (b.score.entry_price_usd ?? Infinity))
    .map(x => x.score);

  const realRevenue = [...offers]
    .sort((a, b) => b.score.real_revenue_score - a.score.real_revenue_score || (b.score.entry_price_usd ?? 0) - (a.score.entry_price_usd ?? 0))
    .map(x => x.score);

  const positiveCases = (probeSuite?.cases || []).filter(x => x?.enabled && x?.expected_fit);
  const caseAssignments = positiveCases.map(caseRow => {
    let best = null;
    for (const row of offers) {
      const fit = caseFit(caseRow, row.offer);
      if (!best || fit > best.fit) best = { fit, row };
    }
    return {
      case_id: caseRow.case_id,
      product_key: caseRow.product_key,
      matched_public_id: best?.fit > 0 ? best.row.score.public_id : null,
      fit_score: best?.fit || 0,
      first_dollar_score: best?.fit > 0 ? best.row.score.first_dollar_score : 0,
      real_revenue_score: best?.fit > 0 ? best.row.score.real_revenue_score : 0
    };
  });

  const logicalWorkCells = offers.reduce((sum, row) => {
    const intents = Math.max(1, (row.offer?.intent_terms || []).length);
    return sum + intents * Math.max(1, providerCount);
  }, 0);

  return {
    schema: 'evercraft.saban.revenue-pressure.v1',
    generated_at: generatedAt instanceof Date ? generatedAt.toISOString() : new Date(generatedAt).toISOString(),
    mission: 'Concentrate internal Saban/CHUM pressure on truthful sell-now capability paths that can reach verified revenue with the least buyer friction, while preserving fit, consent and payment evidence boundaries.',
    doctrine: {
      no_human_spam: true,
      no_unsolicited_email_or_dm: true,
      no_fake_demand: true,
      no_fake_provider_pickup: true,
      fit_before_sale: true,
      checkout_is_not_revenue: true,
      payment_requires_explicit_human_confirmation: true,
      verified_revenue_requires_authoritative_payment_receipt: true
    },
    logical_work_cells: logicalWorkCells,
    sell_now_offer_count: offers.length,
    lanes: {
      first_dollar: firstDollar.slice(0, 6),
      real_revenue: realRevenue.slice(0, 6)
    },
    probe_assignments: caseAssignments,
    next_actions: [
      'Spend most brand-blind provider-probe rotation on the highest first-dollar scores until verified conversion evidence exists.',
      'Reserve recurring pressure for high-value payment-ready offers so low-ticket wins do not become the whole business.',
      'Treat no-match and provider misses as discovery-repair work, never as a reason to force an Evercraft recommendation.',
      'Use conversion receipts to replace heuristic scores with observed conversion performance as soon as live attribution data exists.'
    ]
  };
}

export function selectRevenueProbeCase({ plan, probeSuite, now = new Date() }) {
  const cases = (probeSuite?.cases || []).filter(x => x?.enabled && x?.expected_fit);
  if (!cases.length) return null;

  const hour = Math.floor((now instanceof Date ? now : new Date(now)).getTime() / 3600000);
  const lane = hour % 4 === 3 ? 'real_revenue' : 'first_dollar';
  const ranked = (plan?.probe_assignments || [])
    .filter(x => x?.matched_public_id)
    .sort((a, b) => Number(b[`${lane}_score`] || 0) - Number(a[`${lane}_score`] || 0));

  const cohort = ranked.slice(0, Math.min(5, ranked.length));
  const selected = cohort.length ? cohort[hour % cohort.length] : null;
  const caseRow = cases.find(x => x.case_id === selected?.case_id) || cases[hour % cases.length];

  return {
    lane,
    case: caseRow,
    matched_public_id: selected?.matched_public_id || null,
    score: Number(selected?.[`${lane}_score`] || 0)
  };
}

if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const revenue = readJson('public/chum/revenue.json', { offers: [] });
  const probeSuite = readJson('chum-probes/probe-suite.json', { cases: [] });
  const providerMatrix = readJson('chum-probes/provider-matrix.json', { providers: [] });
  const plan = buildRevenuePressurePlan({
    revenue,
    probeSuite,
    providerCount: (providerMatrix.providers || []).length || 7
  });
  const rotation = selectRevenueProbeCase({ plan, probeSuite });

  fs.mkdirSync('artifacts/saban-revenue', { recursive: true });
  fs.writeFileSync('artifacts/saban-revenue/latest.json', JSON.stringify({ ...plan, rotation }, null, 2) + '\n');

  const lines = [
    '# Saban Revenue Pressure',
    '',
    `Generated: ${plan.generated_at}`,
    `Sell-now offers: ${plan.sell_now_offer_count}`,
    `Logical work cells: ${plan.logical_work_cells}`,
    '',
    '## First Dollar',
    '',
    ...plan.lanes.first_dollar.map((x, i) => `${i + 1}. [${x.first_dollar_score}] ${x.name} — $${x.entry_price_usd ?? '?'} — ${x.machine_state}`),
    '',
    '## Real Revenue',
    '',
    ...plan.lanes.real_revenue.map((x, i) => `${i + 1}. [${x.real_revenue_score}] ${x.name} — $${x.entry_price_usd ?? '?'} — ${x.machine_state}`),
    '',
    `Next probe: ${rotation?.case?.case_id || 'none'} (${rotation?.lane || 'none'}, score ${rotation?.score || 0})`,
    ''
  ];
  fs.writeFileSync('artifacts/saban-revenue/latest.md', lines.join('\n'));
  console.log(JSON.stringify({
    sell_now_offer_count: plan.sell_now_offer_count,
    logical_work_cells: plan.logical_work_cells,
    first_dollar_top: plan.lanes.first_dollar[0]?.public_id || null,
    real_revenue_top: plan.lanes.real_revenue[0]?.public_id || null,
    next_probe: rotation?.case?.case_id || null,
    lane: rotation?.lane || null
  }));
}
