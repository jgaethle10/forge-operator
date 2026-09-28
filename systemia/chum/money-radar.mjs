#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const DEFAULT_PUBLIC_ACQUISITION_EXPORT_URL =
  'https://evercraft-ai-suite-08c4d2b8.base44.app/api/apps/692b4178919afe7d08c4d2b8/functions/machineCommerceAcquisition?view=export&hours=720';

const PUBLIC_STAGES = new Set(['landing', 'offer_view', 'continue_clicked', 'checkout_started']);
const QUALIFIED_BUYER_CLASSES = new Set([
  'human_probable',
  'ai_referral_human_probable',
  'human_confirmed_agent',
]);
const MACHINE_CLASSES = new Set(['machine_client', 'crawler', 'synthetic']);
const KNOWN_ACTOR_CLASSES = new Set([
  ...QUALIFIED_BUYER_CLASSES,
  ...MACHINE_CLASSES,
  'unknown',
]);
const CRAWLER_SOURCES = new Set([
  'oai-searchbot','chatgpt-user','gptbot','claude-searchbot','claude-user','claude-crawler',
  'perplexity-user','perplexity-crawler','duckassistbot','youbot','bytespider','meta-ai-crawler',
  'applebot','amazonbot','cohere-crawler','commoncrawl','googlebot','bingbot','crawler',
]);

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

function actorClass(event) {
  const declared = clean(event?.actor_class).toLowerCase();
  if (KNOWN_ACTOR_CLASSES.has(declared)) return declared;
  if (event?.is_synthetic === true) return 'synthetic';
  const source = clean(event?.provider_claim).toLowerCase();
  if (CRAWLER_SOURCES.has(source)) return 'crawler';
  return 'unknown';
}

function classificationState(event, actor) {
  if (actor !== 'unknown') return 'classified';
  if (clean(event?.telemetry_version).toLowerCase() === 'legacy' || !clean(event?.telemetry_version)) {
    return 'legacy_unclassified';
  }
  return 'unknown_current';
}

function safeSession(event) {
  const value = clean(event?.session_key);
  return /^[A-Za-z0-9_-]{8,120}$/.test(value) ? value : '';
}

function rate(numerator, denominator) {
  if (!denominator) return null;
  return Number((Number(numerator || 0) / Number(denominator)).toFixed(4));
}

function bucketFor(map, event) {
  const key = clean(event.public_id);
  map[key] ||= {
    public_id: key,
    product_key: clean(event.product_key),
    raw_landings: 0,
    raw_offer_views: 0,
    raw_continue_clicks: 0,
    raw_checkout_starts: 0,
    landings: 0,
    offer_views: 0,
    continue_clicks: 0,
    checkout_starts: 0,
    unique_buyer_sessions: 0,
    traffic_class_counts: {},
    classification_counts: {},
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

function incrementStage(bucket, prefix, stage) {
  const field = stage === 'landing' ? prefix + 'landings'
    : stage === 'offer_view' ? prefix + 'offer_views'
      : stage === 'continue_clicked' ? prefix + 'continue_clicks'
        : stage === 'checkout_started' ? prefix + 'checkout_starts'
          : null;
  if (field) bucket[field] += 1;
}

function funnelState(bucket) {
  if (bucket.verified_payments > 0) return 'paid';
  if (bucket.checkout_starts > 0) return 'checkout_started_no_verified_payment';
  if (bucket.continue_clicks > 0) return 'continue_clicked_no_checkout';
  if (bucket.offer_views > 0) return 'offer_view_no_continue';
  if (bucket.landings > 0) return 'landing_no_offer_view';
  if (bucket.raw_offer_views > 0 || bucket.raw_landings > 0) return 'unqualified_traffic_only';
  return 'no_attributed_traffic';
}

function diagnosis(bucket) {
  if (bucket.verified_payments > 0) return 'paid_conversion_observed';
  if (bucket.checkout_starts > 0) return 'checkout_to_payment_dropoff';
  if (bucket.continue_clicks > 0) return 'continue_to_checkout_dropoff';
  if (bucket.offer_views > 0) return 'offer_to_continue_dropoff';
  if (bucket.raw_offer_views > 0) return 'raw_views_without_qualified_buyer_signal';
  if (bucket.landings > 0) return 'landing_to_offer_dropoff';
  if (bucket.raw_landings > 0) return 'raw_landings_without_qualified_buyer_signal';
  return 'no_measured_acquisition';
}

function actionForDiagnosis(value) {
  if (value === 'checkout_to_payment_dropoff') return { priority: 'P1', action: 'inspect_checkout_to_payment_dropoff_with_authoritative_receipts' };
  if (value === 'continue_to_checkout_dropoff') return { priority: 'P1', action: 'inspect_buyer_handoff_and_checkout_friction' };
  if (value === 'offer_to_continue_dropoff') return { priority: 'P1', action: 'repair_offer_trust_value_or_primary_cta' };
  if (value === 'landing_to_offer_dropoff') return { priority: 'P1', action: 'inspect_discovery_to_offer_frontage_dropoff' };
  if (value === 'raw_views_without_qualified_buyer_signal' || value === 'raw_landings_without_qualified_buyer_signal') {
    return { priority: 'P1', action: 'increase_qualified_discovery_traffic_without_tuning_checkout_from_machine_noise' };
  }
  if (value === 'no_measured_acquisition') return { priority: 'P2', action: 'increase_qualified_discovery_traffic_and_measure_conversion' };
  return { priority: 'P3', action: 'hold_and_measure_verified_conversion' };
}

function windowSnapshot(events, generatedAt, hours) {
  const now = Date.parse(generatedAt);
  const cutoff = Number.isFinite(now) ? now - hours * 3600_000 : Date.now() - hours * 3600_000;
  const rows = events.filter((event) => {
    if (event._source_kind !== 'public_acquisition_https' || !PUBLIC_STAGES.has(event.stage)) return false;
    const t = Date.parse(event.occurred_at || '');
    return Number.isFinite(t) && t >= cutoff;
  });
  const actor_class_counts = {};
  const sessions = new Set();
  let raw_landings = 0;
  let raw_offer_views = 0;
  let raw_continue_clicks = 0;
  let raw_checkout_starts = 0;
  let landings = 0;
  let offer_views = 0;
  let continue_clicks = 0;
  let checkout_starts = 0;

  for (const event of rows) {
    const actor = actorClass(event);
    actor_class_counts[actor] = (actor_class_counts[actor] || 0) + 1;
    if (event.stage === 'landing') raw_landings += 1;
    if (event.stage === 'offer_view') raw_offer_views += 1;
    if (event.stage === 'continue_clicked') raw_continue_clicks += 1;
    if (event.stage === 'checkout_started') raw_checkout_starts += 1;
    if (!QUALIFIED_BUYER_CLASSES.has(actor)) continue;
    if (event.stage === 'landing') landings += 1;
    if (event.stage === 'offer_view') offer_views += 1;
    if (event.stage === 'continue_clicked') continue_clicks += 1;
    if (event.stage === 'checkout_started') checkout_starts += 1;
    const session = safeSession(event);
    if (session) sessions.add(session);
  }

  return {
    hours,
    raw_landings,
    raw_offer_views,
    raw_continue_clicks,
    raw_checkout_starts,
    landings,
    offer_views,
    continue_clicks,
    checkout_starts,
    unique_buyer_sessions: sessions.size,
    view_to_continue_rate: rate(continue_clicks, offer_views),
    continue_to_checkout_rate: rate(checkout_starts, continue_clicks),
    raw_to_qualified_view_rate: rate(offer_views, raw_offer_views),
    actor_class_counts,
  };
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
  publicSourceEvents = null,
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

  const acquisitionConfigured = Array.isArray(publicSourceEvents) || Boolean(clean(publicSourceUrl));
  let acquisitionFetched = false;
  let acquisitionEvents = [];
  let acquisitionError = null;

  if (Array.isArray(publicSourceEvents)) {
    acquisitionEvents = publicSourceEvents;
    acquisitionFetched = true;
  } else if (acquisitionConfigured) {
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
  const buyerSessionsByProduct = new Map();
  const allBuyerSessions = new Set();
  const revenueEvents = [];
  const seenPayments = new Set();
  const trafficClassCounts = {};
  const classificationCounts = {};
  const sourceBreakdown = {};

  for (const event of accepted) {
    const bucket = bucketFor(byPublicId, event);
    updateTime(bucket, event.occurred_at);

    const isPublicAcquisition = event._source_kind === 'public_acquisition_https' && PUBLIC_STAGES.has(event.stage);
    if (isPublicAcquisition) {
      const actor = actorClass(event);
      const classState = classificationState(event, actor);
      trafficClassCounts[actor] = (trafficClassCounts[actor] || 0) + 1;
      classificationCounts[classState] = (classificationCounts[classState] || 0) + 1;
      bucket.traffic_class_counts[actor] = (bucket.traffic_class_counts[actor] || 0) + 1;
      bucket.classification_counts[classState] = (bucket.classification_counts[classState] || 0) + 1;
      incrementStage(bucket, 'raw_', event.stage);

      const source = clean(event.provider_claim).toLowerCase() || 'unknown';
      sourceBreakdown[source] ||= {
        source,
        raw_events: 0,
        qualified_buyer_events: 0,
        raw_offer_views: 0,
        qualified_offer_views: 0,
        unique_buyer_sessions: 0,
        actor_class_counts: {},
      };
      const sourceRow = sourceBreakdown[source];
      sourceRow.raw_events += 1;
      sourceRow.actor_class_counts[actor] = (sourceRow.actor_class_counts[actor] || 0) + 1;
      if (event.stage === 'offer_view') sourceRow.raw_offer_views += 1;

      if (QUALIFIED_BUYER_CLASSES.has(actor)) {
        incrementStage(bucket, '', event.stage);
        sourceRow.qualified_buyer_events += 1;
        if (event.stage === 'offer_view') sourceRow.qualified_offer_views += 1;

        const session = safeSession(event);
        if (session) {
          if (!buyerSessionsByProduct.has(bucket.public_id)) buyerSessionsByProduct.set(bucket.public_id, new Set());
          buyerSessionsByProduct.get(bucket.public_id).add(session);
          allBuyerSessions.add(session);
          sourceRow._sessions ||= new Set();
          sourceRow._sessions.add(session);
        }
      }
    }

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
    bucket.unique_buyer_sessions = buyerSessionsByProduct.get(bucket.public_id)?.size || 0;
    bucket.view_to_continue_rate = rate(bucket.continue_clicks, bucket.offer_views);
    bucket.continue_to_checkout_rate = rate(bucket.checkout_starts, bucket.continue_clicks);
    bucket.checkout_to_verified_payment_rate = rate(bucket.verified_payments, bucket.checkout_starts);
    bucket.raw_to_qualified_view_rate = rate(bucket.offer_views, bucket.raw_offer_views);
    bucket.funnel_state = funnelState(bucket);
    bucket.diagnosis = diagnosis(bucket);
  }

  for (const row of Object.values(sourceBreakdown)) {
    row.unique_buyer_sessions = row._sessions?.size || 0;
    delete row._sessions;
    row.raw_to_qualified_view_rate = rate(row.qualified_offer_views, row.raw_offer_views);
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

  const products = Object.values(byPublicId).sort((a, b) => a.public_id.localeCompare(b.public_id));
  const rawLandings = products.reduce((n, row) => n + row.raw_landings, 0);
  const rawOfferViews = products.reduce((n, row) => n + row.raw_offer_views, 0);
  const rawContinueClicks = products.reduce((n, row) => n + row.raw_continue_clicks, 0);
  const rawCheckoutStarts = products.reduce((n, row) => n + row.raw_checkout_starts, 0);
  const buyerLandings = products.reduce((n, row) => n + row.landings, 0);
  const buyerOfferViews = products.reduce((n, row) => n + row.offer_views, 0);
  const buyerContinueClicks = products.reduce((n, row) => n + row.continue_clicks, 0);
  const buyerCheckoutStarts = products.reduce((n, row) => n + row.checkout_starts, 0);
  const acquisitionClassified = Object.entries(classificationCounts)
    .filter(([key]) => key === 'classified')
    .reduce((n, [, value]) => n + Number(value), 0);
  const acquisitionAccepted = rawLandings + rawOfferViews + rawContinueClicks + rawCheckoutStarts;

  let buyerSignalState = 'no_qualified_buyer_signal';
  if (buyerOfferViews > 0 && buyerContinueClicks === 0) buyerSignalState = 'qualified_views_zero_continue';
  if (buyerContinueClicks > 0 && buyerCheckoutStarts === 0) buyerSignalState = 'continue_without_checkout';
  if (buyerCheckoutStarts > 0 && revenueEvents.length === 0) buyerSignalState = 'checkout_without_verified_payment';
  if (revenueEvents.length > 0) buyerSignalState = 'verified_payment_observed';

  const windows = Object.fromEntries(
    [24, 168, 720].map((hours) => {
      const snapshot = windowSnapshot(accepted, generatedAt, hours);
      const cutoff = Date.parse(generatedAt) - hours * 3600_000;
      const verified_payments = revenueEvents.filter((event) => {
        const t = Date.parse(event.occurred_at || '');
        return Number.isFinite(t) && t >= cutoff;
      }).length;
      return [hours === 24 ? '24h' : hours === 168 ? '7d' : '30d', { ...snapshot, verified_payments }];
    })
  );

  const priorityWeight = { P0: 0, P1: 1, P2: 2, P3: 3 };
  const action_queue = products
    .map((row) => ({
      public_id: row.public_id,
      product_key: row.product_key,
      priority: actionForDiagnosis(row.diagnosis).priority,
      action: actionForDiagnosis(row.diagnosis).action,
      diagnosis: row.diagnosis,
      unique_buyer_sessions: row.unique_buyer_sessions,
      qualified_offer_views: row.offer_views,
      raw_offer_views: row.raw_offer_views,
      continue_clicks: row.continue_clicks,
      checkout_starts: row.checkout_starts,
      verified_payments: row.verified_payments,
    }))
    .sort((a, b) =>
      (priorityWeight[a.priority] ?? 9) - (priorityWeight[b.priority] ?? 9) ||
      b.unique_buyer_sessions - a.unique_buyer_sessions ||
      b.qualified_offer_views - a.qualified_offer_views ||
      a.public_id.localeCompare(b.public_id)
    );

  const receipt = {
    schema: 'evercraft.chum.money-radar.v2',
    generated_at: generatedAt,
    measurement_state: measurementState,
    acquisition_measurement_state: acquisitionMeasurementState,
    payment_measurement_state: paymentMeasurementState,
    buyer_signal_state: buyerSignalState,
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
      raw_view_is_not_unique_buyer: true,
      machine_crawler_and_synthetic_traffic_never_counts_as_buyer_demand: true,
      legacy_unclassified_traffic_never_counts_as_buyer_demand: true,
      unique_buyer_is_session_based_not_person_identity: true,
    },
    totals: {
      source_events: taggedEvents.length,
      acquisition_source_events: acquisitionEvents.length,
      trusted_payment_source_events: paymentEvents.length,
      accepted_events: accepted.length,
      rejected_events: rejected.length,
      unique_verified_payments: revenueEvents.length,
      products_with_attribution: products.length,

      raw_landings: rawLandings,
      raw_offer_views: rawOfferViews,
      raw_continue_clicks: rawContinueClicks,
      raw_checkout_starts: rawCheckoutStarts,

      landings: buyerLandings,
      offer_views: buyerOfferViews,
      continue_clicks: buyerContinueClicks,
      checkout_starts: buyerCheckoutStarts,
      unique_buyer_sessions: allBuyerSessions.size,

      view_to_continue_rate: rate(buyerContinueClicks, buyerOfferViews),
      continue_to_checkout_rate: rate(buyerCheckoutStarts, buyerContinueClicks),
      checkout_to_verified_payment_rate: rate(revenueEvents.length, buyerCheckoutStarts),
      raw_to_qualified_view_rate: rate(buyerOfferViews, rawOfferViews),
      actor_class_counts: trafficClassCounts,
      classification_counts: classificationCounts,
      actor_classification_coverage_rate: rate(acquisitionClassified, acquisitionAccepted),
    },
    source_breakdown: Object.values(sourceBreakdown)
      .sort((a, b) => b.raw_events - a.raw_events || a.source.localeCompare(b.source)),
    windows,
    action_queue,
    products,
    rejected: rejected.slice(0, 100),
  };

  fs.writeFileSync(
    path.join(artifactDir, 'revenue-events.ndjson'),
    revenueEvents.map((event) => JSON.stringify(event)).join('\n') + (revenueEvents.length ? '\n' : '')
  );
  fs.writeFileSync(path.join(artifactDir, 'money-radar-latest.json'), JSON.stringify(receipt, null, 2) + '\n');

  const md = [
    '# CHUM Money Radar v2',
    '',
    `Generated: ${generatedAt}`,
    `Overall measurement state: ${measurementState}`,
    `Acquisition measurement state: ${acquisitionMeasurementState}`,
    `Trusted payment measurement state: ${paymentMeasurementState}`,
    `Buyer signal state: ${buyerSignalState}`,
    '',
    '## Traffic truth',
    '',
    `Raw offer-view events: ${rawOfferViews}`,
    `Qualified buyer offer views: ${buyerOfferViews}`,
    `Unique qualified buyer sessions: ${allBuyerSessions.size}`,
    `Machine/crawler/synthetic/unknown mix: ${JSON.stringify(trafficClassCounts)}`,
    `Actor-classification coverage: ${receipt.totals.actor_classification_coverage_rate ?? 'n/a'}`,
    '',
    '## Qualified buyer funnel',
    '',
    `Landings: ${buyerLandings}`,
    `Offer views: ${buyerOfferViews}`,
    `Continue clicks: ${buyerContinueClicks}`,
    `Checkout starts: ${buyerCheckoutStarts}`,
    `Unique provider-verified payments: ${revenueEvents.length}`,
    `View → continue: ${receipt.totals.view_to_continue_rate ?? 'n/a'}`,
    `Continue → checkout: ${receipt.totals.continue_to_checkout_rate ?? 'n/a'}`,
    `Checkout → verified payment: ${receipt.totals.checkout_to_verified_payment_rate ?? 'n/a'}`,
    '',
    '## Velocity windows',
    '',
    `24h: ${JSON.stringify(windows['24h'])}`,
    `7d: ${JSON.stringify(windows['7d'])}`,
    `30d: ${JSON.stringify(windows['30d'])}`,
    '',
    '## Revenue action queue',
    '',
    ...(action_queue.length
      ? action_queue.map((row) => `- ${row.priority} :: ${row.public_id} :: ${row.diagnosis} :: ${row.action} :: qualified_views=${row.qualified_offer_views} :: sessions=${row.unique_buyer_sessions}`)
      : ['- No products with attribution yet.']),
    '',
    '## Product leak map',
    '',
    ...(
      products.length
        ? products.map((row) =>
            `- ${row.public_id} :: ${row.funnel_state} :: diagnosis=${row.diagnosis} :: raw_views=${row.raw_offer_views} :: qualified_views=${row.offer_views} :: unique_sessions=${row.unique_buyer_sessions} :: continue=${row.continue_clicks} :: checkout=${row.checkout_starts} :: paid=${row.verified_payments} :: revenue=${JSON.stringify(row.verified_revenue_by_currency)}`
          )
        : ['- No attribution events observed yet.']
    ),
    '',
    '## Truth boundary',
    '',
    'Money Radar separates raw traffic from qualified buyer activity. Crawler, machine, synthetic and legacy-unclassified events remain visible for distribution diagnostics but never count as buyer demand. Unique buyers are privacy-safe session counts, not claims about unique people. Payment remains authoritative only when verified by the trusted payment source.',
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
    buyer_signal_state: receipt.buyer_signal_state,
    source_events: receipt.totals.source_events,
    raw_offer_views: receipt.totals.raw_offer_views,
    qualified_buyer_offer_views: receipt.totals.offer_views,
    unique_buyer_sessions: receipt.totals.unique_buyer_sessions,
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
