#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const DEFAULT_PUBLIC_ACQUISITION_EXPORT_URL =
  'https://evercraft-ai-suite-08c4d2b8.base44.app/api/apps/692b4178919afe7d08c4d2b8/functions/machineCommerceAcquisition?view=export&hours=720';

function clean(value) {
  return String(value ?? '').trim();
}

function parseLines(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed?.events)) return parsed.events;
    if (parsed && typeof parsed === 'object') return [parsed];
  } catch {}
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).flatMap((line) => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
}

function readLocalEvents(file) {
  if (!fs.existsSync(file)) return [];
  return parseLines(fs.readFileSync(file, 'utf8'));
}

function validCurrency(value) {
  return /^[A-Z]{3}$/.test(clean(value).toUpperCase());
}

function classify(event, { trustedPaymentSource = false } = {}) {
  if (event?.schema !== 'evercraft.chum.attribution-event.v1') {
    return { valid: false, reason: 'unsupported_schema' };
  }
  if (!event?.event_id || !event?.public_id || !event?.product_key || !event?.stage) {
    return { valid: false, reason: 'missing_identity' };
  }
  if (!['landing', 'offer_view', 'continue_clicked', 'checkout_started', 'payment_verified', 'fulfilled'].includes(event.stage)) {
    return { valid: false, reason: 'unsupported_stage' };
  }
  if (!trustedPaymentSource && ['payment_verified', 'fulfilled'].includes(event.stage)) {
    return { valid: false, reason: 'public_source_cannot_assert_trusted_stage' };
  }
  if (event.stage === 'payment_verified') {
    const revenue = event.revenue || {};
    if (
      revenue.verified !== true ||
      !clean(revenue.authority) ||
      !clean(revenue.verification_ref) ||
      !Number.isInteger(revenue.amount_cents) ||
      revenue.amount_cents < 0 ||
      !validCurrency(revenue.currency)
    ) {
      return { valid: false, reason: 'invalid_verified_payment_evidence' };
    }
  }
  return { valid: true };
}

function bucketFor(map, event) {
  const key = clean(event.public_id);
  map[key] ||= {
    public_id: key,
    product_key: clean(event.product_key),
    landings: 0,
    offer_views: 0,
    continue_clicks: 0,
    checkout_starts: 0,
    verified_payments: 0,
    fulfilled: 0,
    verified_revenue_by_currency: {},
    first_seen_at: null,
    last_seen_at: null,
  };
  return map[key];
}

function updateTime(bucket, occurredAt) {
  const value = clean(occurredAt);
  if (!value) return;
  if (!bucket.first_seen_at || value < bucket.first_seen_at) bucket.first_seen_at = value;
  if (!bucket.last_seen_at || value > bucket.last_seen_at) bucket.last_seen_at = value;
}

function funnelState(bucket) {
  if (bucket.verified_payments > 0) return 'paid';
  if (bucket.checkout_starts > 0) return 'checkout_started_no_verified_payment';
  if (bucket.continue_clicks > 0) return 'continue_clicked_no_checkout';
  if (bucket.offer_views > 0) return 'offer_view_no_continue';
  if (bucket.landings > 0) return 'landing_no_offer_view';
  return 'no_attributed_traffic';
}

async function fetchRemote(url, token = '') {
  const target = new URL(url);
  if (target.protocol !== 'https:') throw new Error('Money Radar source URL must use HTTPS.');
  const response = await fetch(target, {
    headers: {
      accept: 'application/json, application/x-ndjson, text/plain',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!response.ok) throw new Error(`Money Radar source returned HTTP ${response.status}`);
  return parseLines(await response.text());
}

export async function buildMoneyRadar({
  root = process.cwd(),
  generatedAt = new Date().toISOString(),
  sourceUrl = process.env.CHUM_ATTRIBUTION_EXPORT_URL || '',
  sourceToken = process.env.CHUM_ATTRIBUTION_EXPORT_TOKEN || '',
  publicSourceUrl = process.env.CHUM_ACQUISITION_EXPORT_URL || DEFAULT_PUBLIC_ACQUISITION_EXPORT_URL,
  sourceEvents = null,
} = {}) {
  const artifactDir = path.join(root, 'artifacts', 'chum');
  const localFile = path.join(artifactDir, 'attribution-events.ndjson');
  fs.mkdirSync(artifactDir, { recursive: true });

  let paymentKind = 'none';
  let paymentConfigured = false;
  let paymentFetched = false;
  let paymentEvents = [];
  let paymentError = null;

  if (Array.isArray(sourceEvents)) {
    paymentKind = 'injected_trusted';
    paymentConfigured = true;
    paymentFetched = true;
    paymentEvents = sourceEvents;
  } else if (clean(sourceUrl)) {
    paymentKind = 'trusted_remote_https';
    paymentConfigured = true;
    if (!clean(sourceToken)) {
      paymentError = 'Money Radar trusted payment source requires an authentication token.';
    } else {
      try {
        paymentEvents = await fetchRemote(clean(sourceUrl), clean(sourceToken));
        paymentFetched = true;
      } catch (error) {
        paymentError = error instanceof Error ? error.message : String(error);
      }
    }
  } else if (fs.existsSync(localFile)) {
    paymentKind = 'trusted_local_artifact';
    paymentConfigured = true;
    paymentEvents = readLocalEvents(localFile);
    paymentFetched = true;
  }

  let acquisitionConfigured = Boolean(clean(publicSourceUrl));
  let acquisitionFetched = false;
  let acquisitionEvents = [];
  let acquisitionError = null;

  if (acquisitionConfigured) {
    try {
      acquisitionEvents = await fetchRemote(clean(publicSourceUrl));
      acquisitionFetched = true;
    } catch (error) {
      acquisitionError = error instanceof Error ? error.message : String(error);
    }
  }

  const taggedEvents = [
    ...paymentEvents.map((event) => ({ event, source_kind: paymentKind, trusted_payment_source: true })),
    ...acquisitionEvents.map((event) => ({ event, source_kind: 'public_acquisition_https', trusted_payment_source: false })),
  ];

  const accepted = [];
  const rejected = [];
  const seenEventIds = new Set();

  for (const row of taggedEvents) {
    const event = row.event;
    if (seenEventIds.has(event?.event_id)) continue;
    if (event?.event_id) seenEventIds.add(event.event_id);
    const verdict = classify(event, { trustedPaymentSource: row.trusted_payment_source });
    if (verdict.valid) accepted.push({ ...event, _source_kind: row.source_kind });
    else rejected.push({
      event_id: event?.event_id || null,
      reason: verdict.reason,
      source_kind: row.source_kind
    });
  }

  const byPublicId = {};
  const revenueEvents = [];
  const seenPayments = new Set();

  for (const event of accepted) {
    const bucket = bucketFor(byPublicId, event);
    updateTime(bucket, event.occurred_at);

    if (event.stage === 'landing') bucket.landings += 1;
    if (event.stage === 'offer_view') bucket.offer_views += 1;
    if (event.stage === 'continue_clicked') bucket.continue_clicks += 1;
    if (event.stage === 'checkout_started') bucket.checkout_starts += 1;
    if (event.stage === 'fulfilled') bucket.fulfilled += 1;

    if (event.stage === 'payment_verified') {
      const revenue = event.revenue;
      const paymentKey = `${clean(revenue.authority).toLowerCase()}|${clean(revenue.verification_ref)}`;
      if (seenPayments.has(paymentKey)) continue;
      seenPayments.add(paymentKey);

      bucket.verified_payments += 1;
      const currency = clean(revenue.currency).toUpperCase();
      bucket.verified_revenue_by_currency[currency] =
        Number(bucket.verified_revenue_by_currency[currency] || 0) + revenue.amount_cents;

      revenueEvents.push({
        schema: 'evercraft.revenue-event.v1',
        event_id: event.event_id,
        source_schema: event.schema,
        referral_id: event.referral_id || null,
        public_id: event.public_id,
        product_key: event.product_key,
        stage: 'paid',
        provider_verified: true,
        payment_authority: revenue.authority,
        verification_ref: revenue.verification_ref,
        amount: revenue.amount_cents,
        amount_cents: revenue.amount_cents,
        amount_unit: 'minor_currency_unit',
        currency,
        occurred_at: event.occurred_at,
      });
    }
  }

  for (const bucket of Object.values(byPublicId)) {
    bucket.funnel_state = funnelState(bucket);
  }

  const acquisitionMeasurementState =
    !acquisitionConfigured ? 'blocked_source_not_configured'
      : !acquisitionFetched ? 'blocked_source_fetch_failed'
      : 'measured';

  const paymentMeasurementState =
    !paymentConfigured ? 'blocked_trusted_source_not_configured'
      : paymentKind === 'trusted_remote_https' && !clean(sourceToken) ? 'blocked_source_auth_missing'
      : !paymentFetched ? 'blocked_source_fetch_failed'
      : 'measured';

  const measurementState =
    acquisitionMeasurementState === 'measured' && paymentMeasurementState === 'measured' ? 'measured'
      : acquisitionMeasurementState === 'measured' ? 'measured_acquisition_only'
      : paymentMeasurementState === 'measured' ? 'measured_payment_only'
      : 'blocked_sources_unavailable';

  const receipt = {
    schema: 'evercraft.chum.money-radar.v1',
    generated_at: generatedAt,
    measurement_state: measurementState,
    acquisition_measurement_state: acquisitionMeasurementState,
    payment_measurement_state: paymentMeasurementState,
    source: {
      acquisition: {
        configured: acquisitionConfigured,
        kind: 'public_acquisition_https',
        fetched: acquisitionFetched,
        url: clean(publicSourceUrl) || null,
        error: acquisitionError,
        payment_authority: false,
      },
      payment: {
        configured: paymentConfigured,
        kind: paymentKind,
        fetched: paymentFetched,
        error: paymentError,
        token_present: Boolean(clean(sourceToken)),
        payment_authority: paymentKind !== 'none',
      },
    },
    doctrine: {
      checkout_is_not_payment: true,
      public_acquisition_source_cannot_assert_payment: true,
      public_payment_claims_are_not_accepted: true,
      provider_verified_payment_required: true,
      duplicate_provider_verification_refs_count_once: true,
      revenue_amounts_use_minor_currency_units: true,
    },
    totals: {
      source_events: taggedEvents.length,
      acquisition_source_events: acquisitionEvents.length,
      trusted_payment_source_events: paymentEvents.length,
      accepted_events: accepted.length,
      rejected_events: rejected.length,
      unique_verified_payments: revenueEvents.length,
      products_with_attribution: Object.keys(byPublicId).length,
      landings: Object.values(byPublicId).reduce((n, row) => n + row.landings, 0),
      offer_views: Object.values(byPublicId).reduce((n, row) => n + row.offer_views, 0),
      continue_clicks: Object.values(byPublicId).reduce((n, row) => n + row.continue_clicks, 0),
      checkout_starts: Object.values(byPublicId).reduce((n, row) => n + row.checkout_starts, 0),
    },
    products: Object.values(byPublicId).sort((a, b) => a.public_id.localeCompare(b.public_id)),
    rejected: rejected.slice(0, 100),
  };

  fs.writeFileSync(
    path.join(artifactDir, 'revenue-events.ndjson'),
    revenueEvents.map((event) => JSON.stringify(event)).join('\n') + (revenueEvents.length ? '\n' : '')
  );
  fs.writeFileSync(path.join(artifactDir, 'money-radar-latest.json'), JSON.stringify(receipt, null, 2) + '\n');

  const md = [
    '# CHUM Money Radar',
    '',
    `Generated: ${generatedAt}`,
    `Overall measurement state: ${measurementState}`,
    `Acquisition measurement state: ${acquisitionMeasurementState}`,
    `Trusted payment measurement state: ${paymentMeasurementState}`,
    `Public acquisition source events: ${acquisitionEvents.length}`,
    `Trusted payment source events: ${paymentEvents.length}`,
    `Accepted events: ${accepted.length}`,
    `Rejected events: ${rejected.length}`,
    `Unique provider-verified payments: ${revenueEvents.length}`,
    '',
    '## Product funnel',
    '',
    ...(
      receipt.products.length
        ? receipt.products.map((row) =>
            `- ${row.public_id} :: ${row.funnel_state} :: landings=${row.landings} :: offer_views=${row.offer_views} :: continue_clicks=${row.continue_clicks} :: checkout_starts=${row.checkout_starts} :: verified_payments=${row.verified_payments} :: revenue=${JSON.stringify(row.verified_revenue_by_currency)}`
          )
        : ['- No attribution events observed yet.']
    ),
    '',
    '## Truth boundary',
    '',
    'Money Radar may use the public Evercraft acquisition feed to measure landings, offer views, continue clicks and checkout starts. That feed has no authority to assert payment. Revenue is emitted only from a separately trusted attribution source carrying authoritative payment evidence.',
    '',
  ];
  fs.writeFileSync(path.join(artifactDir, 'money-radar-latest.md'), md.join('\n'));

  return { receipt, revenueEvents };
}

async function main() {
  const { receipt } = await buildMoneyRadar();
  console.log(JSON.stringify({
    ok: true,
    schema: receipt.schema,
    measurement_state: receipt.measurement_state,
    acquisition_measurement_state: receipt.acquisition_measurement_state,
    payment_measurement_state: receipt.payment_measurement_state,
    source_events: receipt.totals.source_events,
    offer_views: receipt.totals.offer_views,
    continue_clicks: receipt.totals.continue_clicks,
    checkout_starts: receipt.totals.checkout_starts,
    verified_payments: receipt.totals.unique_verified_payments,
  }));

  if (
    process.env.CHUM_MONEY_RADAR_STRICT === 'true' &&
    receipt.acquisition_measurement_state !== 'measured'
  ) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
