import fs from "node:fs";
import path from "node:path";
import {
  buildSecRockyObservationBatch,
  DEFAULT_SEC_RESEARCH_UNIVERSE,
} from "../rockies/market-sources/sec-filings-rocky.mjs";
import {
  runEdgeResearchBatch,
  persistEdgeResearchBatch,
} from "./edge-research-factory.mjs";

async function main() {
  const artifactDir = path.resolve(
    process.env.EDGE_LAB_ARTIFACT_DIR || "artifacts/daytrade-edge"
  );
  fs.mkdirSync(artifactDir, { recursive: true });

  const observationBatch = await buildSecRockyObservationBatch({
    universe: DEFAULT_SEC_RESEARCH_UNIVERSE,
    lookback_days: Number(process.env.EDGE_LAB_SEC_LOOKBACK_DAYS || 365),
    publication_delay_buffer_minutes: Number(
      process.env.EDGE_LAB_SEC_PUBLICATION_DELAY_MINUTES || 10
    ),
  });

  const observationFile = path.join(artifactDir, "sec-rocky-observations.json");
  fs.writeFileSync(
    observationFile,
    JSON.stringify(observationBatch, null, 2) + "\n"
  );

  const report = await runEdgeResearchBatch({
    observations: observationBatch.observations,
    key: process.env.ALPACA_TRADING || "",
    secret: process.env.ALPACA_TRADING_SECRET || "",
    transaction_cost_bps: Number(process.env.EDGE_LAB_TRANSACTION_COST_BPS || 5),
  });

  const reportFile = path.join(artifactDir, "sec-edge-research.json");
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + "\n");

  const persistence = persistEdgeResearchBatch(report, {
    stateDir: process.env.EVERCRAFT_EDGE_LAB_STATE_DIR ||
      path.join(artifactDir, "state"),
  });

  const top = (report.evaluations || []).slice(0, 10).map((row) => ({
    signal_key: row.signal_key,
    status: row.status,
    observations: row.observation_count,
    distinct_source_families: row.distinct_source_families,
    development_q_bh: Number(Number(row.development_q_bh || 1).toFixed(6)),
    holdout_mean_excess_return_net: Number(
      Number(row.base_evaluation?.holdout?.mean_excess_return_net || 0).toFixed(6)
    ),
  }));

  const summary = {
    ok: true,
    schema: "evercraft.daytrade.sec-edge-backfill-receipt.v1",
    sec_observations: observationBatch.observation_count,
    sec_misses: observationBatch.misses.length,
    hypotheses: report.hypothesis_count || 0,
    measurements: report.measurement_count || 0,
    signal_families: report.family_count || 0,
    research_candidates: report.research_candidate_count || 0,
    top_screened_families: top,
    exact_public_availability_time_known: false,
    sec_publication_delay_buffer_minutes:
      observationBatch.publication_delay_buffer_minutes,
    live_trade_authority: false,
    files: {
      observations: observationFile,
      research: reportFile,
      state_batch: persistence.batch_file,
    },
  };

  fs.writeFileSync(
    path.join(artifactDir, "summary.json"),
    JSON.stringify(summary, null, 2) + "\n"
  );

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error("SEC Edge backfill failed:", error?.message || String(error));
  process.exitCode = 1;
});
