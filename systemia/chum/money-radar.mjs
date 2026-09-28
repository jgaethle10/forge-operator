#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const DEFAULT_PUBLIC_ACQUISITION_EXPORT_URL =
  'https://evercraft-ai-suite-08c4d2b8.base44.app/api/apps/692b4178919afe7d08c4d2b8/functions/machineCommerceAcquisition?view=export&hours=720';

const PUBLIC_STAGES = new Set(['landing', 'offer_view', 'continue_clicked', 'checkout_started']);
const DECISION_THRESHOLDS = Object.freeze({
  qualified_landings: 5,
  qualified_offer_views: 5,
  qualified_continue_clicks: 3,
  qualified_checkout_starts: 2,
});
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
  const value = clean(event?.session_bucket || event?.session_key);
  return /^[A-Za-z0-9_-]{8,120}$/.test(value) ? value : '';
}

function rate(numerator, denominator) {
  if (!denominator) return null;
  return Number((Number(numerator || 0) / Number(denominator)).toFixed(4));
}

function addAttributionObservation(map, key, event, actor) {
  const id = clean(key).toLowerCase() || 'unknown';
  map[id] ||= {
    key: id,
    raw_events: 0,
    raw_offer_views: 0,
    qualified_buyer_events: 0,
    qualified_offer_views: 0,
    continue_clicks: 0,
    checkout_starts: 0,
    _sessions: new Set(),
  };
  const row = map[id];
  row.raw_events += 1;
  if (event.stage === 'offer_view') row.raw_offer_views += 1;
  if (!QUALIFIED_BUYER_CLASSES.has(actor)) return;
  row.qualified_buyer_events += 1;
  if (event.stage === 'offer_view') row.qualified_offer_views += 1;
  if (event.stage === 'continue_clicked') row.continue_clicks += 1;
  if (event.stage === 'checkout_started') row.checkout_starts += 1;
  const session = safeSession(event);
  if (session) row._sessions.add(session);
}

function finalizeAttributionBreakdown(map, labelField) {
  return Object.values(map).map((row) => {
    const result = {
      [labelField]: row.key,
      raw_events: row.raw_events,
      raw_offer_views: row.raw_offer_views,
      qualified_buyer_events: row.qualified_buyer_events,
      qualified_offer_views: row.qualified_offer_views,
      continue_clicks: row.continue_clicks,
      checkout_starts: row.checkout_starts,
      unique_buyer_sessions: row._sessions.size,
      raw_to_qualified_view_rate: rate(row.qualified_offer_views, row.raw_offer_views),
      view_to_continue_rate: rate(row.continue_clicks, row.qualified_offer_views),
      continue_to_checkout_rate: rate(row.checkout_starts, row.continue_clicks),
    };
    return result;
  }).sort((a, b) =>
    b.unique_buyer_sessions - a.unique_buyer_sessions ||
    b.qualified_offer_views - a.qualified_offer_views ||
    b.raw_events - a.raw_events ||
    String(a[labelField]).localeCompare(String(b[labelField]))
  );
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
  if (bucket.checkout_starts > 0) {
    return Number(bucket.unique_checkout_sessions || 0) >= DECISION_THRESHOLDS.qualified_checkout_starts
      ? 'checkout_to_payment_dropoff'
      : 'checkout_signal_insufficient_sample';
  }
  if (bucket.continue_clicks > 0) {
    return Number(bucket.unique_continue_sessions || 0) >= DECISION_THRESHOLDS.qualified_continue_clicks
      ? 'continue_to_checkout_dropoff'
      : 'continue_signal_insufficient_sample';
  }
  if (bucket.offer_views > 0) {
    return Number(bucket.unique_offer_view_sessions || 0) >= DECISION_THRESHOLDS.qualified_offer_views
      ? 'offer_to_continue_dropoff'
      : 'offer_signal_insufficient_sample';
  }
  if (bucket.raw_offer_views > 0) return 'raw_views_without_qualified_buyer_signal';
  if (bucket.landings > 0) {
    return Number(bucket.unique_landing_sessions || 0) >= DECISION_THRESHOLDS.qualified_landings
      ? 'landing_to_offer_dropoff'
      : 'landing_signal_insufficient_sample';
  }
  if (bucket.raw_landings > 0) return 'raw_landings_without_qualified_buyer_signal';
  return 'no_measured_acquisition';
}

function actionForDiagnosis(value) {
  if (value === 'checkout_to_payment_dropoff') return { priority: 'P1', action: 'inspect_checkout_to_payment_dropoff_with_authoritative_receipts' };
  if (value === 'continue_to_checkout_dropoff') return { priority: 'P1', action: 'inspect_buyer_handoff_and_checkout_friction' };
  if (value === 'offer_to_continue_dropoff') return { priority: 'P1', action: 'repair_offer_trust_value_or_primary_cta' };
  if (value === 'landing_to_offer_dropoff') return { priority: 'P1', action: 'inspect_discovery_to_offer_frontage_dropoff' };
  if (value.endsWith('_signal_insufficient_sample')) {
    return { priority: 'P2', action: 'hold_conversion_tuning_collect_more_qualified_sessions' };
  }
  if (value === 'raw_views_without_qualified_buyer_signal' || value === 'raw_landings_without_qualified_buyer_signal') {
    return { priority: 'P1', action: 'increase_qualified_discovery_traffic_without_tuning_checkout_from_machine_noise' };
  }
  if (value === 'no_measured_acquisition') return { priority: 'P2', action: 'increase_qualified_discovery_traffic_and_measure_conversion' };
  return { priority: 'P3', action: 'hold_and_measure_verified_conversion' };
}

function windowSnapshot(events, generatedAt, hours) {
  const parsedNow = Date.parse(generatedAt);
  const now = Number.isFinite(parsedNow) ? parsedNow : Date.now();
  const cutoff = now - hours * 3600_000;
  const rows = events.filter((event) => {
    if (event._source_kind !== 'public_acquisition_https' || !PUBLIC_STAGES.has(event.stage)) return false;
    const t = Date.parse(event.occurred_at || '');
    return Number.isFinite(t) && t >= cutoff && t <= now;
  });
  const actor_class_counts = {};
  const sessions = new Set();
  const landingSessions = new Set();
  const offerViewSessions = new Set();
  const continueSessions = new Set();
  const checkoutSessions = new Set();
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
    if (session) {
      sessions.add(session);
      if (event.stage === 'landing') landingSessions.add(session);
      if (event.stage === 'offer_view') offerViewSessions.add(session);
      if (event.stage === 'continue_clicked') continueSessions.add(session);
      if (event.stage === 'checkout_started') checkoutSessions.add(session);
    }
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
    unique_landing_sessions: landingSessions.size,
    unique_offer_view_sessions: offerViewSessions.size,
    unique_continue_sessions: continueSessions.size,
    unique_checkout_sessions: checkoutSessions.size,
    view_to_continue_rate: rate(continue_clicks, offer_views),
    continue_to_checkout_rate: rate(checkout_starts, continue_clicks),
    session_view_to_continue_rate: rate(continueSessions.size, offerViewSessions.size),
    session_continue_to_checkout_rate: rate(checkoutSessions.size, continueSessions.size),
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
  const buyerStageSessionsByProduct = new Map();
  const allBuyerSessions = new Set();
  const revenueEvents = [];
  const seenPayments = new Set();
  const trafficClassCounts = {};
  const classificationCounts = {};
  const sourceBreakdown = {};
  const campaignBreakdown = {};
  const surfaceBreakdown = {};
  const experimentBreakdown = {};
  const journeyEventsBySession = new Map();

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
      const campaign = clean(event.campaign).toLowerCase() || 'unknown';
      const surface = clean(event.surface).toLowerCase() || 'unknown';
      const experimentKey = clean(event.experiment_key).toLowerCase();
      const variantKey = clean(event.variant_key).toLowerCase();
      addAttributionObservation(campaignBreakdown, campaign, event, actor);
      addAttributionObservation(surfaceBreakdown, surface, event, actor);
      if (experimentKey || variantKey) {
        addAttributionObservation(
          experimentBreakdown,
          (experimentKey || 'unlabeled-experiment') + '::' + (variantKey || 'unlabeled-variant'),
          event,
          actor
        );
      }
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
          if (!buyerStageSessionsByProduct.has(bucket.public_id)) {
            buyerStageSessionsByProduct.set(bucket.public_id, {
              landing: new Set(),
              offer_view: new Set(),
              continue_clicked: new Set(),
              checkout_started: new Set(),
            });
          }
          const stageSets = buyerStageSessionsByProduct.get(bucket.public_id);
          if (stageSets[event.stage]) stageSets[event.stage].add(session);
          allBuyerSessions.add(session);
          sourceRow._sessions ||= new Set();
          sourceRow._sessions.add(session);

          const journeyKey = bucket.public_id + '|' + session;
          if (!journeyEventsBySession.has(journeyKey)) journeyEventsBySession.set(journeyKey, []);
          journeyEventsBySession.get(journeyKey).push({
            occurred_at: clean(event.occurred_at),
            source,
            campaign,
            surface,
            creative_key: clean(event.creative_key).toLowerCase() || null,
            experiment_key: experimentKey || null,
            variant_key: variantKey || null,
            stage: event.stage,
          });
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
    const stageSets = buyerStageSessionsByProduct.get(bucket.public_id);
    bucket.unique_landing_sessions = stageSets?.landing?.size || 0;
    bucket.unique_offer_view_sessions = stageSets?.offer_view?.size || 0;
    bucket.unique_continue_sessions = stageSets?.continue_clicked?.size || 0;
    bucket.unique_checkout_sessions = stageSets?.checkout_started?.size || 0;
    bucket.view_to_continue_rate = rate(bucket.continue_clicks, bucket.offer_views);
    bucket.continue_to_checkout_rate = rate(bucket.checkout_starts, bucket.continue_clicks);
    bucket.session_view_to_continue_rate = rate(bucket.unique_continue_sessions, bucket.unique_offer_view_sessions);
    bucket.session_continue_to_checkout_rate = rate(bucket.unique_checkout_sessions, bucket.unique_continue_sessions);
    bucket.checkout_to_verified_payment_rate = rate(bucket.verified_payments, bucket.checkout_starts);
    bucket.raw_to_qualified_view_rate = rate(bucket.offer_views, bucket.raw_offer_views);
    bucket.funnel_state = funnelState(bucket);
    bucket.diagnosis = diagnosis(bucket);
    bucket.decision_ready = !bucket.diagnosis.endsWith('_signal_insufficient_sample');
  }

  for (const row of Object.values(sourceBreakdown)) {
    row.unique_buyer_sessions = row._sessions?.size || 0;
    delete row._sessions;
    row.raw_to_qualified_view_rate = rate(row.qualified_offer_views, row.raw_offer_views);
  }

  const campaign_breakdown = finalizeAttributionBreakdown(campaignBreakdown, 'campaign');
  const surface_breakdown = finalizeAttributionBreakdown(surfaceBreakdown, 'surface');
  const experiment_breakdown = finalizeAttributionBreakdown(experimentBreakdown, 'experiment_variant');

  const firstTouchSource = {};
  const lastTouchSource = {};
  const sourcePaths = {};
  const campaignPaths = {};
  let sessionsWithJourneyLineage = 0;

  for (const events of journeyEventsBySession.values()) {
    if (!events.length) continue;
    sessionsWithJourneyLineage += 1;
    events.sort((a, b) => Date.parse(a.occurred_at || '') - Date.parse(b.occurred_at || ''));
    const first = events[0];
    const last = events[events.length - 1];
    firstTouchSource[first.source] = (firstTouchSource[first.source] || 0) + 1;
    lastTouchSource[last.source] = (lastTouchSource[last.source] || 0) + 1;

    const sourcePath = first.source + ' → ' + last.source;
    sourcePaths[sourcePath] ||= { path: sourcePath, sessions: 0, reached_continue: 0, reached_checkout: 0 };
    sourcePaths[sourcePath].sessions += 1;
    if (events.some((event) => event.stage === 'continue_clicked')) sourcePaths[sourcePath].reached_continue += 1;
    if (events.some((event) => event.stage === 'checkout_started')) sourcePaths[sourcePath].reached_checkout += 1;

    const campaignPath = first.campaign + ' → ' + last.campaign;
    campaignPaths[campaignPath] ||= { path: campaignPath, sessions: 0, reached_continue: 0, reached_checkout: 0 };
    campaignPaths[campaignPath].sessions += 1;
    if (events.some((event) => event.stage === 'continue_clicked')) campaignPaths[campaignPath].reached_continue += 1;
    if (events.some((event) => event.stage === 'checkout_started')) campaignPaths[campaignPath].reached_checkout += 1;
  }

  const journey_attribution = {
    sessions_with_lineage: sessionsWithJourneyLineage,
    first_touch_source: Object.entries(firstTouchSource)
      .map(([source, sessions]) => ({ source, sessions }))
      .sort((a, b) => b.sessions - a.sessions || a.source.localeCompare(b.source)),
    last_touch_source: Object.entries(lastTouchSource)
      .map(([source, sessions]) => ({ source, sessions }))
      .sort((a, b) => b.sessions - a.sessions || a.source.localeCompare(b.source)),
    source_paths: Object.values(sourcePaths)
      .sort((a, b) => b.sessions - a.sessions || a.path.localeCompare(b.path))
      .slice(0, 50),
    campaign_paths: Object.values(campaignPaths)
      .sort((a, b) => b.sessions - a.sessions || a.path.localeCompare(b.path))
      .slice(0, 50),
  };

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

  const generatedMs = Date.parse(generatedAt);
  const effectiveNowMs = Number.isFinite(generatedMs) ? generatedMs : Date.now();
  const prior24End = new Date(effectiveNowMs - 24 * 3600_000).toISOString();
  const prior24 = windowSnapshot(accepted, prior24End, 24);
  const current24 = windows['24h'];
  const current24AcquisitionEvents = accepted.filter((event) => {
    if (event._source_kind !== 'public_acquisition_https' || !PUBLIC_STAGES.has(event.stage)) return false;
    const t = Date.parse(event.occurred_at || '');
    return Number.isFinite(t) && t >= effectiveNowMs - 24 * 3600_000 && t <= effectiveNowMs;
  });
  const v2Events = current24AcquisitionEvents.filter((event) => clean(event.telemetry_version).toLowerCase() === 'money-radar-v2');
  const classifiedEvents = current24AcquisitionEvents.filter((event) => actorClass(event) !== 'unknown');
  const qualifiedEvents24 = current24AcquisitionEvents.filter((event) => QUALIFIED_BUYER_CLASSES.has(actorClass(event)));
  const qualifiedWithSession = qualifiedEvents24.filter((event) => Boolean(safeSession(event)));
  const eventsWithSource = current24AcquisitionEvents.filter((event) => {
    const source = clean(event.provider_claim).toLowerCase();
    return Boolean(source && source !== 'unknown');
  });
  const eventsWithCampaign = current24AcquisitionEvents.filter((event) => Boolean(clean(event.campaign)));
  const eventsWithSurface = current24AcquisitionEvents.filter((event) => Boolean(clean(event.surface)));
  const telemetry_quality = {
    window: '24h',
    events: current24AcquisitionEvents.length,
    v2_events: v2Events.length,
    legacy_or_unversioned_events: current24AcquisitionEvents.length - v2Events.length,
    v2_coverage_rate: rate(v2Events.length, current24AcquisitionEvents.length),
    actor_classification_coverage_rate: rate(classifiedEvents.length, current24AcquisitionEvents.length),
    qualified_event_count: qualifiedEvents24.length,
    qualified_session_coverage_rate: rate(qualifiedWithSession.length, qualifiedEvents24.length),
    source_coverage_rate: rate(eventsWithSource.length, current24AcquisitionEvents.length),
    campaign_coverage_rate: rate(eventsWithCampaign.length, current24AcquisitionEvents.length),
    surface_coverage_rate: rate(eventsWithSurface.length, current24AcquisitionEvents.length),
  };
  telemetry_quality.state = telemetry_quality.events === 0
    ? 'no_recent_events'
    : telemetry_quality.v2_coverage_rate != null && telemetry_quality.v2_coverage_rate < 0.8
      ? 'transitioning_or_legacy_heavy'
      : telemetry_quality.qualified_event_count > 0 && telemetry_quality.qualified_session_coverage_rate != null && telemetry_quality.qualified_session_coverage_rate < 0.95
        ? 'degraded_missing_qualified_sessions'
        : telemetry_quality.actor_classification_coverage_rate != null && telemetry_quality.actor_classification_coverage_rate < 0.95
          ? 'degraded_actor_classification'
          : 'healthy';
  telemetry_quality.conversion_decision_safe =
    telemetry_quality.state === 'healthy' || telemetry_quality.state === 'no_recent_events';

  const operator_alerts = [];
  const current24TotalActors = Object.values(current24.actor_class_counts || {}).reduce((n, value) => n + Number(value || 0), 0);
  const current24MachineActors = Object.entries(current24.actor_class_counts || {})
    .filter(([actor]) => MACHINE_CLASSES.has(actor))
    .reduce((n, [, value]) => n + Number(value || 0), 0);
  const current24MachineShare = rate(current24MachineActors, current24TotalActors);

  if (current24.unique_buyer_sessions > 0 && prior24.unique_buyer_sessions === 0) {
    operator_alerts.push({
      severity: 'P0',
      code: 'first_qualified_buyer_activity',
      message: current24.unique_buyer_sessions + ' qualified buyer session(s) appeared in the last 24 hours after zero in the preceding 24 hours.',
      action: 'inspect_source_campaign_surface_and_offer_path_immediately',
    });
  }
  if (current24.raw_offer_views >= 20 && current24.offer_views === 0) {
    operator_alerts.push({
      severity: 'P1',
      code: 'raw_attention_without_qualified_buyers',
      message: current24.raw_offer_views + ' raw offer views produced zero qualified buyer offer views in the last 24 hours.',
      action: 'increase_qualified_discovery_pressure_without_tuning_checkout_from_machine_noise',
    });
  }
  if (current24MachineShare != null && current24MachineShare >= 0.8 && current24TotalActors >= 20) {
    operator_alerts.push({
      severity: 'P1',
      code: 'machine_dominated_acquisition',
      message: Math.round(current24MachineShare * 100) + '% of last-24h acquisition events are machine, crawler or synthetic.',
      action: 'separate_distribution_success_from_human_acquisition_and_expand_human_reach',
    });
  }
  if (telemetry_quality.events >= 20 && telemetry_quality.v2_coverage_rate != null && telemetry_quality.v2_coverage_rate < 0.8) {
    operator_alerts.push({
      severity: 'P2',
      code: 'telemetry_v2_coverage_low',
      message: Math.round(telemetry_quality.v2_coverage_rate * 100) + '% of last-24h acquisition events use Money Radar v2 telemetry.',
      action: 'finish_migrating_entry_surfaces_before_trusting_conversion_diagnosis',
    });
  }
  if (telemetry_quality.qualified_event_count > 0 && telemetry_quality.qualified_session_coverage_rate != null && telemetry_quality.qualified_session_coverage_rate < 0.95) {
    operator_alerts.push({
      severity: 'P1',
      code: 'qualified_session_coverage_degraded',
      message: Math.round(telemetry_quality.qualified_session_coverage_rate * 100) + '% of last-24h qualified events carry usable session dedupe evidence.',
      action: 'repair_session_instrumentation_before_conversion_tuning',
    });
  }
  if (current24.unique_offer_view_sessions >= DECISION_THRESHOLDS.qualified_offer_views && current24.continue_clicks === 0) {
    operator_alerts.push({
      severity: 'P1',
      code: 'qualified_offer_view_zero_continue',
      message: current24.offer_views + ' qualified offer view(s) produced zero continue clicks in the last 24 hours.',
      action: 'repair_offer_trust_value_or_primary_cta',
    });
  }
  if (current24.unique_continue_sessions >= DECISION_THRESHOLDS.qualified_continue_clicks && current24.checkout_starts === 0) {
    operator_alerts.push({
      severity: 'P1',
      code: 'continue_zero_checkout',
      message: current24.continue_clicks + ' qualified continue click(s) produced zero checkout starts in the last 24 hours.',
      action: 'inspect_buyer_handoff_and_checkout_friction',
    });
  }
  if (current24.unique_checkout_sessions >= DECISION_THRESHOLDS.qualified_checkout_starts && current24.verified_payments === 0) {
    operator_alerts.push({
      severity: 'P1',
      code: 'checkout_zero_verified_payment',
      message: current24.checkout_starts + ' checkout start(s) have no provider-verified payment in the last 24 hours.',
      action: 'inspect_checkout_to_payment_dropoff_with_authoritative_receipts',
    });
  }

  const qualifiedEventTimes = accepted
    .filter((event) => event._source_kind === 'public_acquisition_https' && QUALIFIED_BUYER_CLASSES.has(actorClass(event)))
    .map((event) => clean(event.occurred_at))
    .filter(Boolean)
    .sort();
  const buyer_milestones = {
    first_qualified_event_at: qualifiedEventTimes[0] || null,
    latest_qualified_event_at: qualifiedEventTimes.at(-1) || null,
    qualified_event_count: qualifiedEventTimes.length,
    first_buyer_tripwire_armed: qualifiedEventTimes.length === 0,
  };

  const priorityWeight = { P0: 0, P1: 1, P2: 2, P3: 3 };
  const action_queue = products
    .map((row) => ({
      public_id: row.public_id,
      product_key: row.product_key,
      priority: actionForDiagnosis(row.diagnosis).priority,
      action: actionForDiagnosis(row.diagnosis).action,
      diagnosis: row.diagnosis,
      unique_buyer_sessions: row.unique_buyer_sessions,
      unique_offer_view_sessions: row.unique_offer_view_sessions,
      unique_continue_sessions: row.unique_continue_sessions,
      unique_checkout_sessions: row.unique_checkout_sessions,
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
    telemetry_quality,
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
      exported_session_dedupe_is_one_way_and_product_scoped: true,
      journey_attribution_is_aggregate_and_does_not_expose_session_buckets: true,
      conversion_repair_requires_minimum_sample_before_action: true,
    },
    decision_thresholds: DECISION_THRESHOLDS,
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
    campaign_breakdown,
    surface_breakdown,
    experiment_breakdown,
    journey_attribution,
    buyer_milestones,
    operator_alerts,
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
    `Telemetry quality state: ${telemetry_quality.state}`,
    `Telemetry v2 coverage (24h): ${telemetry_quality.v2_coverage_rate ?? 'n/a'}`,
    `Qualified session coverage (24h): ${telemetry_quality.qualified_session_coverage_rate ?? 'n/a'}`,
    `Conversion decision safe: ${telemetry_quality.conversion_decision_safe}`,
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
    '## Operator alerts',
    '',
    ...(operator_alerts.length
      ? operator_alerts.map((alert) => `- ${alert.severity} :: ${alert.code} :: ${alert.message} :: ${alert.action}`)
      : ['- No operator alerts.']),
    `First-buyer tripwire armed: ${buyer_milestones.first_buyer_tripwire_armed}`,
    `First qualified event: ${buyer_milestones.first_qualified_event_at || 'none'}`,
    `Latest qualified event: ${buyer_milestones.latest_qualified_event_at || 'none'}`,
    '',
    '## Attribution lineage',
    '',
    `Campaign quality: ${JSON.stringify(campaign_breakdown.slice(0, 20))}`,
    `Surface quality: ${JSON.stringify(surface_breakdown.slice(0, 20))}`,
    `Experiment quality: ${JSON.stringify(experiment_breakdown.slice(0, 20))}`,
    `Journey attribution: ${JSON.stringify(journey_attribution)}`,
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
