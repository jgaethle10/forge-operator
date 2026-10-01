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
import {
  loadCanonicalFrozenCohorts,
  scoreForwardPaperCohort,
  scoreForwardPaperCluster,
} from "./edge-forward-paper.mjs";
import { ForwardPaperDurableState } from "./edge-forward-paper-durable.mjs";
import { runEdgeStressLab } from "./edge-stress-lab.mjs";
import { runEdgeBreakerLab } from "./edge-breaker-lab.mjs";
import { runTimingFragilityLab } from "./edge-timing-fragility.mjs";
import { runOverlapFragilityLab } from "./edge-overlap-fragility.mjs";
import { runMatchedPlaceboLab } from "./edge-matched-placebo.mjs";
import { runBenchmarkFragilityLab } from "./edge-benchmark-fragility.mjs";

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

  const stressLab = runEdgeStressLab(report);
  const stressFile = path.join(artifactDir, "sec-edge-stress-lab.json");
  fs.writeFileSync(stressFile, JSON.stringify(stressLab, null, 2) + "\n");

  const breakerLab = runEdgeBreakerLab(report);
  const breakerFile = path.join(artifactDir, "sec-edge-breaker-lab.json");
  fs.writeFileSync(breakerFile, JSON.stringify(breakerLab, null, 2) + "\n");

  const timingLab = runTimingFragilityLab(report, {
    transaction_cost_bps: Number(process.env.EDGE_LAB_TRANSACTION_COST_BPS || 5),
  });
  const timingFile = path.join(artifactDir, "sec-edge-timing-fragility.json");
  fs.writeFileSync(timingFile, JSON.stringify(timingLab, null, 2) + "\n");

  const overlapLab = runOverlapFragilityLab(report, {
    transaction_cost_bps: Number(process.env.EDGE_LAB_TRANSACTION_COST_BPS || 5),
  });
  const overlapFile = path.join(artifactDir, "sec-edge-overlap-fragility.json");
  fs.writeFileSync(overlapFile, JSON.stringify(overlapLab, null, 2) + "\n");

  const placeboLab = runMatchedPlaceboLab(report, {
    transaction_cost_bps: Number(process.env.EDGE_LAB_TRANSACTION_COST_BPS || 5),
  });
  const placeboFile = path.join(artifactDir, "sec-edge-matched-placebo.json");
  fs.writeFileSync(placeboFile, JSON.stringify(placeboLab, null, 2) + "\n");

  const benchmarkLab = runBenchmarkFragilityLab(report, {
    transaction_cost_bps: Number(process.env.EDGE_LAB_TRANSACTION_COST_BPS || 5),
  });
  const benchmarkFile = path.join(artifactDir, "sec-edge-benchmark-fragility.json");
  fs.writeFileSync(benchmarkFile, JSON.stringify(benchmarkLab, null, 2) + "\n");

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

  const canonicalForwardPaper = loadCanonicalFrozenCohorts();
  const frozenCohorts = canonicalForwardPaper.cohorts;

  const forwardPaperRunScores = frozenCohorts.map((protocol) =>
    scoreForwardPaperCohort(protocol, report.measurements || [])
  );
  const clusterKeys = [...new Set(frozenCohorts.map((protocol) => protocol.cluster_key))];
  const forwardPaperRunClusterScores = clusterKeys.map((clusterKey) =>
    scoreForwardPaperCluster(
      frozenCohorts.filter((protocol) => protocol.cluster_key === clusterKey),
      report.measurements || []
    )
  );
  const forwardPaperRunScoreFile = path.join(
    artifactDir,
    "forward-paper-current-run-scores.json"
  );
  fs.writeFileSync(
    forwardPaperRunScoreFile,
    JSON.stringify({
      schema: "evercraft.daytrade.forward-paper-current-run-scores.v1",
      generated_at: report.generated_at,
      canonical_enrollment_at:
        canonicalForwardPaper.source.original_manifest_generated_at,
      canonical_artifact_digest:
        canonicalForwardPaper.source.github_artifact_digest,
      scores: forwardPaperRunScores,
      cluster_scores: forwardPaperRunClusterScores,
      durable_cross_run_state_claimed: false,
      prospective_relative_to_frozen_cutoff: true,
      eligibility_mutated: false,
      live_trade_authority: false,
    }, null, 2) + "\n"
  );
  let durableState = {
    configured: false,
    restart_reopen_verified: false,
    cohort_count: 0,
    cluster_count: 0,
    journal_records: 0,
    measurement_count: 0,
    head_hash: null,
    root: null,
    ingest_receipt: null,
  };
  let durableScoreFile = null;
  let durableClusterScores = [];

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
    durableClusterScores = reopened.scoreAllClusters();
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
        cluster_scores: durableClusterScores,
        correlated_cluster_members_not_independent_edges: true,
        live_trade_authority: false,
      }, null, 2) + "\n"
    );

    durableState = {
      configured: true,
      restart_reopen_verified: true,
      cohort_count: afterRestart.cohort_count,
      cluster_count: afterRestart.cluster_count,
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
      schema: "evercraft.daytrade.forward-paper-enrollment.v2",
      generated_at: canonicalForwardPaper.source.original_manifest_generated_at,
      refreshed_at: report.generated_at,
      canonical_source: canonicalForwardPaper.source,
      cohort_count: frozenCohorts.length,
      cohorts: frozenCohorts,
      regenerated_from_current_historical_results: false,
      eligibility_mutated: false,
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
    current_historical_forward_paper_eligible:
      adversarial.forward_paper_eligible_count || 0,
    canonical_frozen_forward_paper_cohorts: frozenCohorts.length,
    canonical_forward_paper_enrollment_at:
      canonicalForwardPaper.source.original_manifest_generated_at,
    canonical_forward_paper_artifact_digest:
      canonicalForwardPaper.source.github_artifact_digest,
    forward_paper_cohorts_regenerated: false,
    forward_paper_current_run_status_counts: Object.fromEntries(
      [...new Set(forwardPaperRunScores.map((row) => row.status))].map((status) => [
        status,
        forwardPaperRunScores.filter((row) => row.status === status).length,
      ])
    ),
    forward_paper_current_run_cluster_status_counts: Object.fromEntries(
      [...new Set(forwardPaperRunClusterScores.map((row) => row.status))].map((status) => [
        status,
        forwardPaperRunClusterScores.filter((row) => row.status === status).length,
      ])
    ),
    stress_survivors: stressLab.stress_survivor_count || 0,
    breaker_survivors: breakerLab.breaker_survivor_count || 0,
    timing_robust_diagnostics: timingLab.timing_robust_count || 0,
    overlap_robust_diagnostics: overlapLab.overlap_robust_count || 0,
    placebo_separated_diagnostics: placeboLab.placebo_separated_count || 0,
    benchmark_fragility_status_counts: benchmarkLab.status_counts || {},
    frozen_forward_paper_cohorts: frozenCohorts.length,
    durable_forward_paper_state_configured: durableState.configured,
    durable_forward_paper_restart_reopen_verified: durableState.restart_reopen_verified,
    durable_forward_paper_cluster_count: durableState.cluster_count || 0,
    durable_forward_paper_cluster_status_counts: Object.fromEntries(
      [...new Set(durableClusterScores.map((row) => row.status))].map((status) => [
        status,
        durableClusterScores.filter((row) => row.status === status).length,
      ])
    ),
    correlated_cluster_members_not_independent_edges: true,
    top_screened_families: top,
    exact_public_availability_time_known: false,
    sec_publication_delay_buffer_minutes:
      observationBatch.publication_delay_buffer_minutes,
    live_trade_authority: false,
    files: {
      observations: observationFile,
      research: reportFile,
      stress_lab: stressFile,
      breaker_lab: breakerFile,
      timing_fragility_lab: timingFile,
      overlap_fragility_lab: overlapFile,
      matched_placebo_lab: placeboFile,
      benchmark_fragility_lab: benchmarkFile,
      adversarial_review: adversarialFile,
      forward_paper_cohorts: forwardPaperFile,
      forward_paper_current_run_scores: forwardPaperRunScoreFile,
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
