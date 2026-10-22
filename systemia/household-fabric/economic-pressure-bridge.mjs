import { buildHouseholdToday } from './surface.mjs';
import reviewed from './economic-pressure-reviewed-snapshots.json' with { type: 'json' };

/**
 * Economic Pressure Atlas -> Systemia Household Fabric, v1.
 *
 * A dated economic measurement is not a local deal, benefit, or a household
 * savings estimate. This adapter intentionally preserves economic context
 * outside the ranked local-opportunity engine, which retains its existing
 * freshness, eligibility, evidence, sponsorship, and coverage protections.
 */
const REVIEWED = new Map(reviewed.snapshots.map(s => [s.metric + ':' + s.observed_period, s]));

const SIGNALS = Object.freeze({
  'us-cpi-all-items-yoy': { geography: 'us', unit: 'percent', hosts: ['www.bls.gov', 'bls.gov'] },
  'us-cpi-gasoline-mom': { geography: 'us', unit: 'percent', hosts: ['www.bls.gov', 'bls.gov'] },
  'us-cpi-gasoline-yoy': { geography: 'us', unit: 'percent', hosts: ['www.bls.gov', 'bls.gov'] },
  'wa-unemployment-rate': { geography: 'wa-state', unit: 'percent', hosts: ['esd.wa.gov', 'www.esd.wa.gov'] },
  'wa-nonfarm-payroll-change': { geography: 'wa-state', unit: 'jobs_change', hosts: ['esd.wa.gov', 'www.esd.wa.gov'] },
  'yakima-unemployment-rate': { geography: 'yakima-wa', unit: 'percent', hosts: ['esd.wa.gov', 'www.esd.wa.gov'] },
  'yakima-nonfarm-payroll': { geography: 'yakima-wa', unit: 'jobs', hosts: ['esd.wa.gov', 'www.esd.wa.gov'] },
});

function timestamp(value) {
  const ms = Date.parse(String(value ?? ''));
  if (!Number.isFinite(ms)) throw new Error('release_at must be a valid ISO timestamp');
  return ms;
}

export function normalizeEconomicPressureSignal(raw, now = new Date()) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new TypeError('signal must be an object');
  const rule = SIGNALS[raw.metric];
  if (!rule) throw new Error('unknown measured economic metric');
  if (raw.geography !== rule.geography) throw new Error('economic metric geography mismatch');
  if (raw.unit !== rule.unit) throw new Error('economic metric unit mismatch');
  if (raw.evidence_state !== 'public' && raw.evidence_state !== 'observed') throw new Error('only measured public/observed economic signals are accepted');
  const numeric = Number(raw.value);
  if (typeof raw.value !== 'number' || !Number.isFinite(numeric)) throw new Error('economic measurement must be a finite number');
  if (raw.metric.endsWith('unemployment-rate') && (numeric < 0 || numeric > 100)) throw new Error('invalid unemployment rate');
  if (raw.unit === 'jobs' && (!Number.isInteger(numeric) || numeric < 0)) throw new Error('invalid job count');
  const period = String(raw.observed_period ?? '');
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(period)) throw new Error('observed_period must use YYYY-MM');
  let url;
  try { url = new URL(raw.source_url); }
  catch { throw new Error('official primary source URL required'); }
  if (url.protocol !== 'https:' || !rule.hosts.includes(url.hostname)) throw new Error('economic source must be an allowed official primary domain');
  const pinned = REVIEWED.get(raw.metric + ':' + period);
  if (!pinned) throw new Error('economic snapshot has not been independently reviewed');
  if (pinned.value !== numeric || pinned.unit !== raw.unit || pinned.geography !== raw.geography || pinned.source_url !== url.toString()) {
    throw new Error('economic claim does not match reviewed source snapshot');
  }
  if (pinned.release_at !== null) {
    const released = timestamp(pinned.release_at);
    if (released > now.getTime()) throw new Error('economic signal is not published yet');
    if (raw.release_at && timestamp(raw.release_at) !== released) throw new Error('official release timestamp mismatch');
  } else if (raw.release_at != null) {
    throw new Error('exact official release time not verified for this local source');
  }
  if (pinned.reviewed_on > now.toISOString().slice(0,10)) {
    throw new Error('economic review date has not been reached');
  }
  return Object.freeze({
    metric: raw.metric,
    geography: raw.geography,
    value: numeric,
    unit: rule.unit,
    observed_period: period,
    release_at: pinned.release_at,
    source_date_precision: pinned.source_date_precision,
    reviewed_on: pinned.reviewed_on,
    source_url: url.toString(),
    evidence_state: raw.evidence_state,
    measurement_state: 'reviewed_official_snapshot_not_live',
    // The signal never becomes a monetary claim or a verified local deal.
    monetary_impact_cents: null,
    local_causation_claimed: false,
  });
}

export function buildEconomicPressureHouseholdView({
  signals = [],
  ledger,
  sourceRegistry,
  geography = 'yakima-wa',
  now = new Date(),
  householdOptions = {},
} = {}) {
  if (geography !== 'yakima-wa') throw new Error('only Yakima pilot geography is implemented');
  const instant = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(instant.getTime())) throw new Error('invalid evaluation time');
  if (!Array.isArray(signals)) throw new TypeError('signals must be an array');

  const verified = signals.map(s => normalizeEconomicPressureSignal(s, instant));
  const seen = new Set();
  for (const item of verified) {
    const key = item.metric + ':' + item.observed_period;
    if (seen.has(key)) throw new Error('duplicate metric and period requires explicit adjudication');
    seen.add(key);
  }
  const household = buildHouseholdToday(ledger, sourceRegistry, {
    ...householdOptions, geography, now: instant,
  });
  return {
    schema: 'systemia.economic-pressure.household-bridge.v1',
    generated_at: instant.toISOString(),
    geography,
    state: 'source_contract_verified_not_publicly_deployed',
    measured_economic_context: verified,
    household_opportunities: household,
    boundaries: {
      national_cpi_is_not_local_price_measurement: true,
      measurement_is_not_benefit_eligibility: true,
      economic_signals_do_not_buy_organic_rank: true,
      no_individual_financial_information_required: true,
      no_live_collector_implied: true,
    },
  };
}
