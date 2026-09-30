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
import { adversarialValidateCandidates } from "./edge-adversarial-validation.mjs";
import { persistFrozenCohorts } from "./edge-forward-paper.mjs";
import { ForwardPaperDurableState } from "./edge-forward-paper-durable.mjs";

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

  const adversarial = adversarialValidateCandidates(report, {
    transaction_cost_bps: Number(process.env.EDGE_LAB_TRANSACTION_COST_BPS || 5),
  });
  const adversarialFile = path.join(artifactDir, "sec-edge-adversarial-review.json");
  fs.writeFileSync(adversarialFile, JSON.stringify(adversarial, null, 2) + "\n");

  const stateDir = process.env.EVERCRAFT_EDGE_LAB_STATE_DIR ||
    path.join(artifactDir, "state");

  const persistence = persistEdgeResearchBatch(report, {
    stateDir,
  });

  const frozenCohorts = persistFrozenCohorts(adversarial, report, {
    state_dir: path.join(stateDir, "forward-paper"),
    enrolled_at: report.generated_at,
    transaction_cost_bps: Number(process.env.EDGE_LAB_TRANSACTION_COST_BPS || 5),
  });
  let durableState = {
    configured: false,
    restart_reopen_verified: false,
    cohort_count: 0,
    journal_records: 0,
    measurement_count: 0,
    head_hash: null,
    root: null,
    ingest_receipt: null,
  };
  let durableScoreFile = null;

  const durableRoot = String(process.env.EVERCRAFT_EDGE_LAB_DURABLE_ROOT || "").trim();
  if (durableRoot) {
    const durable = new ForwardPaperDurableState({ root: durableRoot });
    const enrollment = frozenCohorts.map((cohort) => durable.enroll(cohort));
    const ingestReceipt = durable.ingestResearchReport(report);
    const beforeRestart = durable.summary();

    const reopened = new ForwardPaperDurableState({ root: durableRoot });
    const afterRestart = reopened.summary();
    if (
      beforeRestart.cohort_count !== afterRestart.cohort_count ||
      beforeRestart.measurement_count !== afterRestart.measurement_count ||
      beforeRestart.head_hash !== afterRestart.head_hash
    ) {
      throw new Error("edge_forward_paper_durable_reopen_mismatch");
    }

    const scores = [...reopened.cohorts.values()].map((protocol) =>
      reopened.score(protocol.cohort_id)
    );
    durableScoreFile = path.join(artifactDir, "durable-forward-paper-scores.json");
    fs.writeFileSync(
      durableScoreFile,
      JSON.stringify({
        schema: "evercraft.daytrade.forward-paper-durable-scores.v1",
        generated_at: report.generated_at,
        enrollments: enrollment.map((row) => ({
          state: row.state,
          cohort_id: row.cohort?.cohort_id || null,
          signal_key: row.cohort?.signal_key || null,
          rejected_new_cohort_id: row.rejected_new_cohort_id || null,
        })),
        ingest_receipt: ingestReceipt,
        scores,
        live_trade_authority: false,
      }, null, 2) + "\n"
    );

    durableState = {
      configured: true,
      restart_reopen_verified: true,
      cohort_count: afterRestart.cohort_count,
      journal_records: afterRestart.journal_records,
      measurement_count: afterRestart.measurement_count,
      head_hash: afterRestart.head_hash,
      root: path.resolve(durableRoot),
      ingest_receipt: {
        cohort_count: ingestReceipt.cohort_count,
        measurement_rows_seen: ingestReceipt.measurement_rows_seen,
        appended: ingestReceipt.cohorts.reduce((n, row) => n + row.appended, 0),
        duplicates: ingestReceipt.cohorts.reduce((n, row) => n + row.duplicates, 0),
      },
    };
  }

  const forwardPaperFile = path.join(artifactDir, "forward-paper-cohorts.json");
  fs.writeFileSync(
    forwardPaperFile,
    JSON.stringify({
      schema: "evercraft.daytrade.forward-paper-enrollment.v1",
      generated_at: report.generated_at,
      cohort_count: frozenCohorts.length,
      cohorts: frozenCohorts,
      persistent_state_verified: durableState.configured && durableState.restart_reopen_verified,
      persistence_note: durableState.configured
        ? "Frozen cohorts were enrolled into the configured host filesystem journal and successfully reopened in this run. Power-loss behavior remains a separate hardware validation boundary."
        : "This run writes immutable cohort artifacts. Durable cross-run Yard state remains separately verified before longitudinal scoring is claimed.",
      durable_state: durableState,
      live_trade_authority: false,
    }, null, 2) + "\n"
  );

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
    candidate_clusters: adversarial.candidate_cluster_count || 0,
    forward_paper_eligible: adversarial.forward_paper_eligible_count || 0,
    frozen_forward_paper_cohorts: frozenCohorts.length,
    durable_forward_paper_state_configured: durableState.configured,
    durable_forward_paper_restart_reopen_verified: durableState.restart_reopen_verified,
    top_screened_families: top,
    exact_public_availability_time_known: false,
    sec_publication_delay_buffer_minutes:
      observationBatch.publication_delay_buffer_minutes,
    live_trade_authority: false,
    files: {
      observations: observationFile,
      research: reportFile,
      adversarial_review: adversarialFile,
      forward_paper_cohorts: forwardPaperFile,
      durable_forward_paper_scores: durableScoreFile,
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
