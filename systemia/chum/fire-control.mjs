#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function readJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function readNdjson(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try { return [JSON.parse(line)]; } catch { return []; }
    });
}

function clean(value) {
  return String(value ?? '').trim();
}

function hostOf(value) {
  try { return new URL(clean(value)).host.toLowerCase(); } catch { return ''; }
}

function normalize(value) {
  return clean(value).toLowerCase();
}

function productKeysForOffer(offer, probeSuite) {
  const offerHost = hostOf(offer.public_url);
  const offerName = normalize(offer.name);
  const matches = new Set();

  for (const testCase of probeSuite?.cases || []) {
    if (!testCase?.enabled || !testCase?.expected_fit || !testCase?.product_key) continue;
    const hosts = (testCase.expected_hosts || []).map((x) => normalize(x)).filter(Boolean);
    const expected = normalize(testCase.expected_product);
    const aliases = (testCase.expected_aliases || []).map((x) => normalize(x)).filter(Boolean);

    if (
      (offerHost && hosts.some((host) => offerHost === host || offerHost.endsWith('.' + host) || host.endsWith('.' + offerHost))) ||
      (expected && (offerName.includes(expected) || expected.includes(offerName))) ||
      aliases.some((alias) => alias && (offerName.includes(alias) || alias.includes(offerName)))
    ) {
      matches.add(testCase.product_key);
    }
  }

  const fallback = normalize(offer.public_id)
    .replace(/-v\d+$/, '')
    .replace(/-(?:machine|service|report|snapshot|audit|mission|package|router|intelligence|opportunity).*$/, '');

  if (!matches.size && fallback) matches.add(fallback);
  return [...matches];
}

function mapRadar(radar) {
  const map = new Map();
  for (const row of radar?.surfaces || []) {
    if (!row?.product_key) continue;
    const key = normalize(row.product_key);
    const list = map.get(key) || [];
    list.push(row);
    map.set(key, list);
  }
  return map;
}

function mapProviderProbes(receipt) {
  const map = new Map();
  for (const row of receipt?.results || []) {
    if (!row?.product_key) continue;
    const key = normalize(row.product_key);
    const list = map.get(key) || [];
    list.push(row);
    map.set(key, list);
  }
  return map;
}

function mapCommerce(receipt) {
  return new Map((receipt?.results || []).filter((row) => row?.public_id).map((row) => [row.public_id, row]));
}

function paymentEvents(events) {
  return events.filter((event) =>
    event?.schema === 'evercraft.revenue-event.v1' &&
    event?.stage === 'paid' &&
    event?.provider_verified === true
  );
}

function eventsForOffer(events, offer, productKeys) {
  const keys = new Set(productKeys.map(normalize));
  return events.filter((event) =>
    event?.public_id === offer.public_id ||
    (event?.product_key && keys.has(normalize(event.product_key)))
  );
}

function verifiedRevenueByCurrency(events) {
  const totals = {};
  for (const event of paymentEvents(events)) {
    const currency = clean(event.currency).toUpperCase() || 'UNKNOWN';
    totals[currency] = Number(totals[currency] || 0) + Number(event.amount_cents ?? event.amount ?? 0);
  }
  return totals;
}

function firstBrokenStage(stages, commercialState) {
  if (!stages.published) return 'published';
  if (!stages.announced) return 'announced';
  if (!stages.crawler_observed) return 'crawler_observed';
  if (!stages.provider_pickup) return 'provider_pickup';
  if (commercialState === 'sell_now' && !stages.money_path_readable) return 'money_path_readable';
  if (commercialState === 'sell_now' && !stages.acquisition_measurement_ready) return 'acquisition_measurement_ready';
  if (commercialState === 'sell_now' && !stages.payment_measurement_ready) return 'payment_measurement_ready';
  if (commercialState === 'sell_now' && !stages.provider_verified_payment) return 'provider_verified_payment';
  return null;
}

function repairFor({ broken, providerRows, radarRows, commerce, commercialState, providerBridgeConfigured, moneyRow }) {
  if (broken === 'published') {
    return { priority: 'P0', action: 'publish_truthful_machine_surface', owner: 'CHUM' };
  }
  if (broken === 'announced') {
    return { priority: 'P0', action: 'verify_live_bytes_and_broadcast_crawl_pressure', owner: 'CHUM' };
  }
  if (broken === 'crawler_observed') {
    return { priority: 'P0', action: 'promote_surface_in_hot_queue_and_measure_crawler_fetch', owner: 'CHUM+SONAR' };
  }
  if (broken === 'provider_pickup') {
    const completed = providerRows.filter((row) => row.status === 'completed').length;
    const blocked = providerRows.filter((row) => row.status === 'blocked').length;
    if (!providerBridgeConfigured) {
      return { priority: 'P0', action: 'restore_authorized_provider_probe_bridge_then_run_brand_blind_probe', owner: 'MISSILE_LOCK' };
    }
    if (!providerRows.length) {
      return { priority: commercialState === 'sell_now' ? 'P1' : 'P2', action: 'schedule_brand_blind_probe_for_unmeasured_product', owner: 'MISSILE_LOCK' };
    }
    if (blocked > 0 && completed === 0) {
      return { priority: 'P0', action: 'resolve_provider_probe_block_then_reprobe', owner: 'MISSILE_LOCK' };
    }
    return { priority: 'P1', action: 'repair_answer_doors_schema_crosslinks_and_registry_presence_then_reprobe', owner: 'CHUM+MISSILE_LOCK' };
  }
  if (broken === 'money_path_readable') {
    return {
      priority: 'P0',
      action: commerce?.reason ? `repair_money_path:${commerce.reason}` : 'repair_money_path_and_rerun_commerce_canary',
      owner: 'MONEY_RADAR'
    };
  }
  if (broken === 'acquisition_measurement_ready') {
    return {
      priority: 'P0',
      action: 'restore_owned_acquisition_funnel_feed',
      owner: 'MONEY_RADAR'
    };
  }
  if (broken === 'payment_measurement_ready') {
    return {
      priority: 'P0',
      action: 'connect_authoritative_payment_receipt_feed_without_treating_acquisition_as_revenue',
      owner: 'MONEY_RADAR'
    };
  }
  if (broken === 'provider_verified_payment') {
    const funnel = moneyRow?.funnel_state || 'no_attributed_traffic';
    if (funnel === 'checkout_started_no_verified_payment') {
      return { priority: 'P1', action: 'inspect_checkout_to_payment_dropoff_with_authoritative_receipts', owner: 'MONEY_RADAR' };
    }
    if (funnel === 'continue_clicked_no_checkout') {
      return { priority: 'P1', action: 'inspect_buyer_handoff_and_checkout_friction', owner: 'MONEY_RADAR' };
    }
    if (funnel === 'offer_view_no_continue') {
      return { priority: 'P1', action: 'repair_offer_trust_value_or_primary_cta', owner: 'MONEY_RADAR+PRODUCT' };
    }
    if (funnel === 'landing_no_offer_view') {
      return { priority: 'P1', action: 'inspect_discovery_to_offer_frontage_dropoff', owner: 'CHUM+MONEY_RADAR' };
    }
    return {
      priority: commercialState === 'sell_now' ? 'P2' : 'P3',
      action: 'increase_qualified_discovery_traffic_and_measure_conversion',
      owner: 'CHUM+MONEY_RADAR'
    };
  }
  return { priority: 'P3', action: 'hold_and_measure', owner: 'FIRE_CONTROL' };
}

function stageCount(rows, name) {
  return rows.filter((row) => row.stages[name]).length;
}

export function buildFireControl({
  root = process.cwd(),
  generatedAt = new Date().toISOString(),
  catalog = null,
  probeSuite = null,
  radar = null,
  providerProbes = null,
  commerceCanary = null,
  revenueEvents = null,
  moneyRadar = null,
} = {}) {
  const publicDir = path.join(root, 'public');
  const artifactDir = path.join(root, 'artifacts', 'chum');

  const machineCatalog = catalog || readJson(path.join(publicDir, '.well-known', 'evercraft-machine-catalog.json'), { offers: [] });
  const suite = probeSuite || readJson(path.join(root, 'chum-probes', 'probe-suite.json'), { cases: [] });
  const crawlerRadar = radar || readJson(path.join(artifactDir, 'crawler-radar-latest.json'), { surfaces: [] });
  const probes = providerProbes || readJson(path.join(artifactDir, 'provider-probe-latest.json'), { results: [], bridge_configured: false });
  const commerce = commerceCanary || readJson(path.join(artifactDir, 'commerce-canary-latest.json'), { results: [] });
  const events = revenueEvents || readNdjson(path.join(artifactDir, 'revenue-events.ndjson'));
  const money = moneyRadar || readJson(path.join(artifactDir, 'money-radar-latest.json'), { measurement_state: 'blocked_source_not_configured', products: [] });
  const moneyByOffer = new Map((money?.products || []).filter((row) => row?.public_id).map((row) => [row.public_id, row]));

  const radarByProduct = mapRadar(crawlerRadar);
  const probesByProduct = mapProviderProbes(probes);
  const commerceByOffer = mapCommerce(commerce);
  const verifiedPayments = paymentEvents(events);

  const rows = (machineCatalog?.offers || []).map((offer) => {
    const productKeys = productKeysForOffer(offer, suite);
    const radarRows = productKeys.flatMap((key) => radarByProduct.get(normalize(key)) || []);
    const providerRows = productKeys.flatMap((key) => probesByProduct.get(normalize(key)) || []);
    const commerceRow = commerceByOffer.get(offer.public_id) || null;
    const moneyRow = moneyByOffer.get(offer.public_id) || null;
    const offerEvents = eventsForOffer(events, offer, productKeys);
    const paidEvents = paymentEvents(offerEvents);

    const stages = {
      published: Boolean(offer.public_id && offer.public_url),
      announced: radarRows.some((row) => row.indexnow_pending === false),
      crawler_observed: radarRows.some((row) => Boolean(row.last_observed_crawler_fetch)),
      provider_pickup: providerRows.some((row) => row.status === 'completed' && row.evaluation?.pickup_observed === true),
      money_path_readable: offer.commercial_state !== 'sell_now' ? true : commerceRow?.valid === true,
      acquisition_measurement_ready: offer.commercial_state !== 'sell_now' ? true : money?.acquisition_measurement_state === 'measured',
      payment_measurement_ready: offer.commercial_state !== 'sell_now' ? true : money?.payment_measurement_state === 'measured',
      provider_verified_payment: paidEvents.length > 0,
    };

    const broken = firstBrokenStage(stages, offer.commercial_state);
    const repair = repairFor({
      broken,
      providerRows,
      radarRows,
      commerce: commerceRow,
      commercialState: offer.commercial_state,
      providerBridgeConfigured: probes?.bridge_configured === true,
      moneyRow,
    });

    return {
      public_id: offer.public_id,
      name: offer.name,
      public_url: offer.public_url,
      commercial_state: offer.commercial_state,
      machine_state: offer.machine_state,
      product_keys: productKeys,
      stages,
      first_broken_stage: broken,
      next_action: repair,
      evidence: {
        crawler_surface_count: radarRows.length,
        crawler_fetch_observed_count: radarRows.filter((row) => row.last_observed_crawler_fetch).length,
        provider_probe_state: !probes?.bridge_configured
          ? 'bridge_unavailable'
          : !providerRows.length
            ? 'unmeasured'
            : providerRows.some((row) => row.status === 'completed')
              ? 'measured'
              : 'blocked',
        provider_probe_count: providerRows.length,
        provider_probe_completed: providerRows.filter((row) => row.status === 'completed').length,
        provider_pickup_count: providerRows.filter((row) => row.evaluation?.pickup_observed).length,
        commerce_canary_present: Boolean(commerceRow),
        commerce_canary_valid: commerceRow?.valid === true,
        money_radar_state: money?.measurement_state || 'unknown',
        acquisition_measurement_state: money?.acquisition_measurement_state || 'unknown',
        payment_measurement_state: money?.payment_measurement_state || 'unknown',
        attributed_landings: moneyRow?.landings || 0,
        attributed_offer_views: moneyRow?.offer_views || 0,
        attributed_continue_clicks: moneyRow?.continue_clicks || 0,
        attributed_checkout_starts: moneyRow?.checkout_starts || 0,
        money_funnel_state: moneyRow?.funnel_state || 'no_attributed_traffic',
        revenue_event_count: offerEvents.length,
        provider_verified_payment_count: paidEvents.length,
        provider_verified_revenue_by_currency: verifiedRevenueByCurrency(paidEvents),
      },
    };
  });

  const priorityWeight = { P0: 0, P1: 1, P2: 2, P3: 3 };
  const actionQueue = rows
    .filter((row) => row.first_broken_stage)
    .sort((a, b) =>
      (priorityWeight[a.next_action.priority] ?? 9) - (priorityWeight[b.next_action.priority] ?? 9) ||
      Number(b.commercial_state === 'sell_now') - Number(a.commercial_state === 'sell_now') ||
      a.name.localeCompare(b.name)
    )
    .map((row) => ({
      public_id: row.public_id,
      name: row.name,
      broken_stage: row.first_broken_stage,
      priority: row.next_action.priority,
      owner: row.next_action.owner,
      action: row.next_action.action,
    }));

  const sellNowRows = rows.filter((row) => row.commercial_state === 'sell_now');
  const receipt = {
    schema: 'evercraft.chum.fire-control.v1',
    generated_at: generatedAt,
    coordinator: 'Systemia / CHUM',
    doctrine: {
      purpose: 'Close the loop from public capability publication through legitimate crawler attention, provider pickup and provider-verified revenue.',
      crawler_fetch_is_not_indexing: true,
      indexing_is_not_ranking: true,
      ranking_is_not_provider_recommendation: true,
      checkout_is_not_payment: true,
      payment_requires_provider_verification: true,
      no_unsolicited_human_outreach: true,
      no_bot_impersonation: true,
      no_access_control_bypass: true,
      no_fake_pickup_or_revenue: true,
    },
    inputs: {
      catalog_offers: machineCatalog?.offers?.length || 0,
      crawler_radar_present: crawlerRadar?.schema === 'evercraft.chum.crawler-radar.v1',
      provider_probe_receipt_present: probes?.schema === 'evercraft.chum.cross-llm-run-receipt.v1',
      provider_probe_bridge_configured: probes?.bridge_configured === true,
      commerce_canary_present: commerce?.schema === 'evercraft.chum.commerce-canary.v1',
      money_radar_present: money?.schema === 'evercraft.chum.money-radar.v1',
      money_radar_measurement_state: money?.measurement_state || 'unknown',
      acquisition_measurement_state: money?.acquisition_measurement_state || 'unknown',
      payment_measurement_state: money?.payment_measurement_state || 'unknown',
      revenue_events: events.length,
      provider_verified_payment_events: verifiedPayments.length,
    },
    funnel: {
      all_offers: {
        total: rows.length,
        published: stageCount(rows, 'published'),
        announced: stageCount(rows, 'announced'),
        crawler_observed: stageCount(rows, 'crawler_observed'),
        provider_pickup: stageCount(rows, 'provider_pickup'),
      },
      sell_now: {
        total: sellNowRows.length,
        published: stageCount(sellNowRows, 'published'),
        announced: stageCount(sellNowRows, 'announced'),
        crawler_observed: stageCount(sellNowRows, 'crawler_observed'),
        provider_pickup: stageCount(sellNowRows, 'provider_pickup'),
        money_path_readable: stageCount(sellNowRows, 'money_path_readable'),
        acquisition_measurement_ready: stageCount(sellNowRows, 'acquisition_measurement_ready'),
        payment_measurement_ready: stageCount(sellNowRows, 'payment_measurement_ready'),
        provider_verified_payment: stageCount(sellNowRows, 'provider_verified_payment'),
      },
    },
    action_queue: actionQueue,
    offers: rows,
  };

  fs.mkdirSync(artifactDir, { recursive: true });
  fs.writeFileSync(path.join(artifactDir, 'fire-control-latest.json'), JSON.stringify(receipt, null, 2) + '\n');

  const md = [
    '# CHUM Fire Control',
    '',
    `Generated: ${receipt.generated_at}`,
    `Offers: ${receipt.funnel.all_offers.total}`,
    `Sell-now: ${receipt.funnel.sell_now.total}`,
    `Sell-now crawler observed: ${receipt.funnel.sell_now.crawler_observed}`,
    `Sell-now provider pickup: ${receipt.funnel.sell_now.provider_pickup}`,
    `Sell-now healthy money paths: ${receipt.funnel.sell_now.money_path_readable}`,
    `Sell-now acquisition measurement ready: ${receipt.funnel.sell_now.acquisition_measurement_ready}`,
    `Sell-now payment measurement ready: ${receipt.funnel.sell_now.payment_measurement_ready}`,
    `Sell-now provider-verified payments: ${receipt.funnel.sell_now.provider_verified_payment}`,
    '',
    '## Action queue',
    '',
    ...(actionQueue.length
      ? actionQueue.slice(0, 100).map((row) => `- [${row.priority}] ${row.name} :: ${row.broken_stage} :: ${row.action} :: ${row.owner}`)
      : ['- No broken stage detected in the current evidence set.']),
    '',
    '## Truth boundary',
    '',
    'Fire Control records evidence transitions only. A crawler fetch does not prove indexing, indexing does not prove recommendation, and checkout does not prove payment. Paid state requires a provider-verified revenue event.',
    '',
  ];
  fs.writeFileSync(path.join(artifactDir, 'fire-control-latest.md'), md.join('\n'));

  return receipt;
}

async function main() {
  const receipt = buildFireControl();
  console.log(JSON.stringify({
    ok: true,
    schema: receipt.schema,
    offers: receipt.funnel.all_offers.total,
    sell_now: receipt.funnel.sell_now.total,
    provider_pickup: receipt.funnel.sell_now.provider_pickup,
    healthy_money_paths: receipt.funnel.sell_now.money_path_readable,
    verified_payments: receipt.funnel.sell_now.provider_verified_payment,
    p0_actions: receipt.action_queue.filter((row) => row.priority === 'P0').length,
  }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
