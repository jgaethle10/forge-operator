import { merchantOfferToOpportunities } from './merchant-feed.mjs';
import { emptyLedger, ingestBatch } from './ingest.mjs';
import { buildHouseholdToday } from './surface.mjs';
import sourceRegistry from './source-registry.json' with { type: 'json' };

export function ingestMerchantOffer(rawOffer, options = {}) {
  const now = options.now instanceof Date
    ? options.now
    : new Date(options.now ?? Date.now());

  const opportunities = merchantOfferToOpportunities(rawOffer, { now });
  const startingLedger = options.ledger ?? emptyLedger();
  const ingested = ingestBatch(startingLedger, opportunities, { now });

  return {
    schema: 'systemia.household-fabric.merchant-run.v1',
    merchant_id: String(rawOffer?.merchant_id ?? ''),
    offer_id: String(rawOffer?.offer_id ?? ''),
    observed_at: now.toISOString(),
    opportunity_count: opportunities.length,
    receipts: ingested.receipts,
    ledger: ingested.ledger,
    today: buildHouseholdToday(ingested.ledger, sourceRegistry, {
      now,
      geography: options.geography ?? 'yakima-wa',
      mode: options.mode ?? 'daily',
      mileage_cost_cents: options.mileage_cost_cents ?? 25,
      time_value_cents_per_hour: options.time_value_cents_per_hour ?? 0,
      friction_cents_per_step: options.friction_cents_per_step ?? 0,
    }),
  };
}
