import { parseYvlBrowserResult } from './collectors/yvl-events.mjs';
import { emptyLedger, ingestBatch } from './ingest.mjs';
import { buildHouseholdToday } from './surface.mjs';
import sourceRegistry from './source-registry.json' with { type: 'json' };

export function ingestYvlBrowserResult(browserResult, options = {}) {
  const now = options.now instanceof Date
    ? options.now
    : new Date(options.now ?? browserResult?.finished_at ?? Date.now());

  const opportunities = parseYvlBrowserResult(browserResult, {
    observed_at: now.toISOString(),
    source_url: options.source_url,
    source_name: options.source_name,
  });

  const startingLedger = options.ledger ?? emptyLedger();
  const ingested = ingestBatch(startingLedger, opportunities, { now });

  return {
    schema: 'systemia.household-fabric.collector-run.v1',
    collector: 'yvl-browser-snapshot-v1',
    source_url: browserResult.final_url ?? 'https://www.yvl.org/events/',
    browser_evidence_receipt_sha256: browserResult.evidence_receipt_sha256,
    observed_at: now.toISOString(),
    collected_count: opportunities.length,
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
