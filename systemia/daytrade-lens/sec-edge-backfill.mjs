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
import { scoreForwardPaperCohort } from "./edge-forward-paper.mjs";
import { scoreForwardPaperClusters } from "./edge-forward-paper-cluster.mjs";
import { loadCanonicalFrozenEnrollment } from "./edge-forward-paper-seed.mjs";
import { ForwardPaperDurableState } from "./edge-forward-paper-durable.mjs";
import { runEdgeStressLab } from "./edge-stress-lab.mjs";
import { summarizeResearchSearchBurden } from "./edge-search-burden.mjs";
import { ResearchTrialCemetery } from "./edge-research-trial-cemetery.mjs";
import { runFamilyMaxNullLab } from "./edge-family-max-null.mjs";
import { runDeflatedSharpeLab } from "./edge-deflated-sharpe.mjs";
import { runTailDependenceLab } from "./edge-tail-dependence.mjs";
import { runCscvPboLab } from "./edge-cscv-pbo.mjs";
import { runEdgeBreakerLab } from "./edge-breaker-lab.mjs";
import { runTimingFragilityLab } from "./edge-timing-fragility.mjs";
import { runVolatilityDelayInteractionLab } from "./edge-volatility-delay-interaction.mjs";
import { runSignalDecayCostDecompositionLab } from "./edge-signal-decay-cost-decomposition.mjs";
import { runOverlapFragilityLab } from "./edge-overlap-fragility.mjs";
import { runMatchedPlaceboLab } from "./edge-matched-placebo.mjs";
import { runRandomPlaceboLab } from "./edge-random-placebo.mjs";
import { runLabelPermutationLab } from "./edge-label-permutation.mjs";
import { runBenchmarkFragilityLab } from "./edge-benchmark-fragility.mjs";
import { runRegimeFragilityLab } from "./edge-regime-fragility.mjs";
import { runClockStructureLab } from "./edge-clock-structure.mjs";
import { runEventContaminationLab } from "./edge-event-contamination.mjs";
import { runAnnouncementExecutionStressLab } from "./edge-announcement-execution-stress.mjs";
import { runNarrativeBlindControlLab } from "./edge-narrative-blind-control.mjs";
import { runHorizonCoherenceLab } from "./edge-horizon-coherence.mjs";
import { runWalkForwardLab } from "./edge-walk-forward.mjs";
import { runExecutionTranslationLab } from "./edge-execution-translation.mjs";
import { runQuoteMicrostructureLab } from "./edge-quote-microstructure.mjs";
import { runExecutionSpeedBoundsLab } from "./edge-execution-speed-bounds.mjs";
import { runCapitalScaleImpactEnvelopeLab } from "./edge-capital-scale-impact-envelope.mjs";
import { buildLiquidityStateContracts } from "./edge-liquidity-state-contract.mjs";
import { buildClusterAdversarialSummary } from "./edge-cluster-adversarial-summary.mjs";
import { evaluatePilotReadiness } from "./edge-pilot-readiness.mjs";

async function main() {
  const artifactDir = path.resolve(
    process.env.EDGE_LAB_ARTIFACT_DIR || "artifacts/daytrade-edge"
  );
  fs.mkdirSync(artifactDir, { recursive: true });

  const canonicalEnrollment = loadCanonicalFrozenEnrollment();
  const requestedLookbackDays = Number(
    process.env.EDGE_LAB_SEC_LOOKBACK_DAYS || 365
  );
  const cutoffAgeDays = Math.max(
    0,
    Math.ceil(
      (Date.now() - new Date(canonicalEnrollment.generated_at).getTime()) /
        86400000
    )
  );
  const effectiveLookbackDays = Math.max(
    requestedLookbackDays,
    cutoffAgeDays + 14
  );

  const observationBatch = await buildSecRockyObservationBatch({
    universe: DEFAULT_SEC_RESEARCH_UNIVERSE,
    lookback_days: effectiveLookbackDays,
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

  const quoteSignalKeys = [...new Set([
    ...(report.evaluations || [])
      .filter((row) => row.status === "RESEARCH_CANDIDATE")
      .map((row) => row.signal_key),
    ...canonicalEnrollment.cohorts.map((row) => row.signal_key),
  ].filter(Boolean))];
  const quoteDirectionBySignal = Object.fromEntries(
    canonicalEnrollment.cohorts.map((row) => [
      row.signal_key,
      row.learned_direction || row.direction || null,
    ])
  );
  const quoteMicrostructureLab = await runQuoteMicrostructureLab(report, {
    key: process.env.ALPACA_TRADING || "",
    secret: process.env.ALPACA_TRADING_SECRET || "",
    feed: process.env.EDGE_LAB_ALPACA_QUOTE_FEED || "iex",
    signal_keys: quoteSignalKeys,
    direction_by_signal: quoteDirectionBySignal,
    transaction_cost_bps: Number(
      process.env.EDGE_LAB_TRANSACTION_COST_BPS || 5
    ),
    request_interval_ms: Number(
      process.env.EDGE_LAB_QUOTE_REQUEST_INTERVAL_MS || 0
    ),
  });
  const quoteMicrostructureFile = path.join(
    artifactDir,
    "sec-edge-quote-microstructure.json"
  );
  fs.writeFileSync(
    quoteMicrostructureFile,
    JSON.stringify(quoteMicrostructureLab, null, 2) + "\n"
  );

  const executionSpeedBoundsLab = runExecutionSpeedBoundsLab(
    report,
    quoteMicrostructureLab
  );
  const executionSpeedBoundsFile = path.join(
    artifactDir,
    "sec-edge-execution-speed-bounds.json"
  );
  fs.writeFileSync(
    executionSpeedBoundsFile,
    JSON.stringify(executionSpeedBoundsLab, null, 2) + "\n"
  );

  const capitalScaleImpactEnvelopeLab =
    runCapitalScaleImpactEnvelopeLab(report, quoteMicrostructureLab);
  const capitalScaleImpactEnvelopeFile = path.join(
    artifactDir,
    "sec-edge-capital-scale-impact-envelope.json"
  );
  fs.writeFileSync(
    capitalScaleImpactEnvelopeFile,
    JSON.stringify(capitalScaleImpactEnvelopeLab, null, 2) + "\n"
  );

  const liquidityStateContracts = buildLiquidityStateContracts(
    report,
    quoteMicrostructureLab,
    capitalScaleImpactEnvelopeLab
  );
  const liquidityStateContractsFile = path.join(
    artifactDir,
    "sec-edge-liquidity-state-contracts.json"
  );
  fs.writeFileSync(
    liquidityStateContractsFile,
    JSON.stringify(liquidityStateContracts, null, 2) + "\n"
  );

  const searchBurden = summarizeResearchSearchBurden(report);
  const searchBurdenFile = path.join(
    artifactDir,
    "sec-edge-search-burden.json"
  );
  fs.writeFileSync(
    searchBurdenFile,
    JSON.stringify(searchBurden, null, 2) + "\n"
  );

  const familyMaxNullLab = runFamilyMaxNullLab(report, {
    transaction_cost_bps: Number(process.env.EDGE_LAB_TRANSACTION_COST_BPS || 5),
  });
  const familyMaxNullFile = path.join(
    artifactDir,
    "sec-edge-family-max-null.json"
  );
  fs.writeFileSync(
    familyMaxNullFile,
    JSON.stringify(familyMaxNullLab, null, 2) + "\n"
  );

  const deflatedSharpeLab = runDeflatedSharpeLab(report, {
    transaction_cost_bps: Number(process.env.EDGE_LAB_TRANSACTION_COST_BPS || 5),
  });
  const deflatedSharpeFile = path.join(
    artifactDir,
    "sec-edge-deflated-sharpe.json"
  );
  fs.writeFileSync(
    deflatedSharpeFile,
    JSON.stringify(deflatedSharpeLab, null, 2) + "\n"
  );

  const tailDependenceLab = runTailDependenceLab(report, {
    transaction_cost_bps: Number(process.env.EDGE_LAB_TRANSACTION_COST_BPS || 5),
  });
  const tailDependenceFile = path.join(
    artifactDir,
    "sec-edge-tail-dependence.json"
  );
  fs.writeFileSync(
    tailDependenceFile,
    JSON.stringify(tailDependenceLab, null, 2) + "\n"
  );

  const cscvPboLab = runCscvPboLab(report, {
    transaction_cost_bps: Number(process.env.EDGE_LAB_TRANSACTION_COST_BPS || 5),
  });
  const cscvPboFile = path.join(artifactDir, "sec-edge-cscv-pbo.json");
  fs.writeFileSync(cscvPboFile, JSON.stringify(cscvPboLab, null, 2) + "\n");

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

  const volatilityDelayInteractionLab =
    runVolatilityDelayInteractionLab(report, {
      transaction_cost_bps: Number(
        process.env.EDGE_LAB_TRANSACTION_COST_BPS || 5
      ),
    });
  const volatilityDelayInteractionFile = path.join(
    artifactDir,
    "sec-edge-volatility-delay-interaction.json"
  );
  fs.writeFileSync(
    volatilityDelayInteractionFile,
    JSON.stringify(volatilityDelayInteractionLab, null, 2) + "\n"
  );

  const signalDecayCostDecompositionLab =
    runSignalDecayCostDecompositionLab(report, quoteMicrostructureLab, {
      transaction_cost_bps: Number(
        process.env.EDGE_LAB_TRANSACTION_COST_BPS || 5
      ),
    });
  const signalDecayCostDecompositionFile = path.join(
    artifactDir,
    "sec-edge-signal-decay-cost-decomposition.json"
  );
  fs.writeFileSync(
    signalDecayCostDecompositionFile,
    JSON.stringify(signalDecayCostDecompositionLab, null, 2) + "\n"
  );

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

  const randomPlaceboLab = runRandomPlaceboLab(report, {
    transaction_cost_bps: Number(process.env.EDGE_LAB_TRANSACTION_COST_BPS || 5),
  });
  const randomPlaceboFile = path.join(
    artifactDir,
    "sec-edge-random-placebo.json"
  );
  fs.writeFileSync(
    randomPlaceboFile,
    JSON.stringify(randomPlaceboLab, null, 2) + "\n"
  );

  const labelPermutationLab = runLabelPermutationLab(report, {
    transaction_cost_bps: Number(process.env.EDGE_LAB_TRANSACTION_COST_BPS || 5),
  });
  const labelPermutationFile = path.join(
    artifactDir,
    "sec-edge-label-permutation.json"
  );
  fs.writeFileSync(
    labelPermutationFile,
    JSON.stringify(labelPermutationLab, null, 2) + "\n"
  );

  const regimeFragilityLab = runRegimeFragilityLab(report, {
    transaction_cost_bps: Number(process.env.EDGE_LAB_TRANSACTION_COST_BPS || 5),
  });
  const regimeFragilityFile = path.join(
    artifactDir,
    "sec-edge-regime-fragility.json"
  );
  fs.writeFileSync(
    regimeFragilityFile,
    JSON.stringify(regimeFragilityLab, null, 2) + "\n"
  );

  const benchmarkLab = runBenchmarkFragilityLab(report, {
    transaction_cost_bps: Number(process.env.EDGE_LAB_TRANSACTION_COST_BPS || 5),
  });
  const benchmarkFile = path.join(artifactDir, "sec-edge-benchmark-fragility.json");
  fs.writeFileSync(benchmarkFile, JSON.stringify(benchmarkLab, null, 2) + "\n");

  const clockStructureLab = runClockStructureLab(report, {
    transaction_cost_bps: Number(process.env.EDGE_LAB_TRANSACTION_COST_BPS || 5),
  });
  const clockStructureFile = path.join(
    artifactDir,
    "sec-edge-clock-structure.json"
  );
  fs.writeFileSync(
    clockStructureFile,
    JSON.stringify(clockStructureLab, null, 2) + "\n"
  );

  const eventContaminationLab = runEventContaminationLab(report, {
    transaction_cost_bps: Number(process.env.EDGE_LAB_TRANSACTION_COST_BPS || 5),
  });
  const eventContaminationFile = path.join(
    artifactDir,
    "sec-edge-event-contamination.json"
  );
  fs.writeFileSync(
    eventContaminationFile,
    JSON.stringify(eventContaminationLab, null, 2) + "\n"
  );

  const announcementExecutionStressLab =
    runAnnouncementExecutionStressLab(report, quoteMicrostructureLab);
  const announcementExecutionStressFile = path.join(
    artifactDir,
    "sec-edge-announcement-execution-stress.json"
  );
  fs.writeFileSync(
    announcementExecutionStressFile,
    JSON.stringify(announcementExecutionStressLab, null, 2) + "\n"
  );

  const narrativeBlindControlLab = runNarrativeBlindControlLab(report, {
    transaction_cost_bps: Number(process.env.EDGE_LAB_TRANSACTION_COST_BPS || 5),
  });
  const narrativeBlindControlFile = path.join(
    artifactDir,
    "sec-edge-narrative-blind-control.json"
  );
  fs.writeFileSync(
    narrativeBlindControlFile,
    JSON.stringify(narrativeBlindControlLab, null, 2) + "\n"
  );

  const horizonCoherenceLab = runHorizonCoherenceLab(report, {
    transaction_cost_bps: Number(process.env.EDGE_LAB_TRANSACTION_COST_BPS || 5),
  });
  const horizonCoherenceFile = path.join(
    artifactDir,
    "sec-edge-horizon-coherence.json"
  );
  fs.writeFileSync(
    horizonCoherenceFile,
    JSON.stringify(horizonCoherenceLab, null, 2) + "\n"
  );

  const walkForwardLab = runWalkForwardLab(report, {
    transaction_cost_bps: Number(process.env.EDGE_LAB_TRANSACTION_COST_BPS || 5),
  });
  const walkForwardFile = path.join(artifactDir, "sec-edge-walk-forward.json");
  fs.writeFileSync(walkForwardFile, JSON.stringify(walkForwardLab, null, 2) + "\n");

  const executionTranslationLab = runExecutionTranslationLab(report, {
    transaction_cost_bps_per_leg: Number(process.env.EDGE_LAB_TRANSACTION_COST_BPS || 5),
  });
  const executionTranslationFile = path.join(
    artifactDir,
    "sec-edge-execution-translation.json"
  );
  fs.writeFileSync(
    executionTranslationFile,
    JSON.stringify(executionTranslationLab, null, 2) + "\n"
  );

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

  const frozenCohorts = canonicalEnrollment.cohorts;

  const currentRunMeasurementsByCohort = new Map();
  const currentRunForwardScores = [];
  for (const protocol of frozenCohorts) {
    const cutoff = new Date(protocol.observation_cutoff).getTime();
    const rows = (report.measurements || []).filter((row) =>
      row.signal_key === protocol.signal_key &&
      new Date(row.observed_at).getTime() > cutoff
    );
    currentRunMeasurementsByCohort.set(protocol.cohort_id, rows);
    currentRunForwardScores.push(scoreForwardPaperCohort(protocol, rows));
  }
  const currentRunForwardClusterScores = scoreForwardPaperClusters(
    frozenCohorts,
    currentRunMeasurementsByCohort
  );
  const currentRunForwardScoreFile = path.join(
    artifactDir,
    "forward-paper-current-run-scores.json"
  );
  fs.writeFileSync(
    currentRunForwardScoreFile,
    JSON.stringify({
      schema: "evercraft.daytrade.forward-paper-current-run-scores.v1",
      generated_at: report.generated_at,
      canonical_enrollment_at: canonicalEnrollment.generated_at,
      canonical_artifact_digest: canonicalEnrollment.source_artifact_digest,
      scores: currentRunForwardScores,
      cluster_scores: currentRunForwardClusterScores,
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
    journal_records: 0,
    measurement_count: 0,
    head_hash: null,
    root: null,
    ingest_receipt: null,
  };
  let durableScoreFile = null;
  let durableScores = [];
  let durableClusterScores = { scores: [] };

  let trialCemeteryState = {
    configured: false,
    restart_reopen_verified: false,
    run_count: 0,
    trial_observation_count: 0,
    unique_trial_configuration_count: 0,
    journal_records: 0,
    head_hash: null,
    root: null,
    ingest_receipt: null,
  };
  const trialCemeteryFile = path.join(
    artifactDir,
    "research-trial-cemetery-summary.json"
  );

  const durableRoot = String(process.env.EVERCRAFT_EDGE_LAB_DURABLE_ROOT || "").trim();
  const configuredTrialCemeteryRoot = String(
    process.env.EVERCRAFT_EDGE_LAB_TRIAL_CEMETERY_ROOT ||
      (durableRoot ? path.join(durableRoot, "research-trial-cemetery") : "")
  ).trim();

  if (configuredTrialCemeteryRoot) {
    const cemetery = new ResearchTrialCemetery({
      root: configuredTrialCemeteryRoot,
    });
    const ingestReceipt = cemetery.ingestReport(report, {
      research_config: {
        transaction_cost_bps: Number(
          process.env.EDGE_LAB_TRANSACTION_COST_BPS || 5
        ),
        sec_publication_delay_buffer_minutes:
          observationBatch.publication_delay_buffer_minutes,
        bar_minutes: 5,
        development_fraction: 0.70,
        false_discovery_rate: 0.10,
      },
      source_digest:
        report.source_digest ||
        observationBatch.source_digest ||
        null,
    });
    const beforeRestart = cemetery.summary();
    const reopenedCemetery = new ResearchTrialCemetery({
      root: configuredTrialCemeteryRoot,
    });
    const afterRestart = reopenedCemetery.summary();
    if (
      beforeRestart.trial_observation_count !==
        afterRestart.trial_observation_count ||
      beforeRestart.run_count !== afterRestart.run_count ||
      beforeRestart.head_hash !== afterRestart.head_hash
    ) {
      throw new Error("edge_trial_cemetery_reopen_mismatch");
    }
    trialCemeteryState = {
      configured: true,
      restart_reopen_verified: true,
      run_count: afterRestart.run_count,
      trial_observation_count: afterRestart.trial_observation_count,
      unique_trial_configuration_count:
        afterRestart.unique_trial_configuration_count,
      journal_records: afterRestart.journal_records,
      head_hash: afterRestart.head_hash,
      root: path.resolve(configuredTrialCemeteryRoot),
      ingest_receipt: ingestReceipt,
      all_statuses_retained: afterRestart.all_statuses_retained,
      winner_only_storage_forbidden:
        afterRestart.winner_only_storage_forbidden,
    };
  }

  fs.writeFileSync(
    trialCemeteryFile,
    JSON.stringify({
      schema: "evercraft.daytrade.research-trial-cemetery-runtime-receipt.v1",
      ...trialCemeteryState,
      configured_storage_required_for_cross_run_claim: true,
      ephemeral_artifact_storage_is_not_lifetime_memory: true,
      live_trade_authority: false,
    }, null, 2) + "\n"
  );


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
    const clusterScores = reopened.scoreClusters();
    durableScores = scores;
    durableClusterScores = clusterScores;
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
        cluster_scores: clusterScores,
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
      schema: "evercraft.daytrade.forward-paper-enrollment.v2",
      generated_at: canonicalEnrollment.generated_at,
      refreshed_at: report.generated_at,
      canonical_source: {
        run_id: canonicalEnrollment.source_run_id,
        head_sha: canonicalEnrollment.source_head_sha,
        artifact_id: canonicalEnrollment.source_artifact_id,
        artifact_digest: canonicalEnrollment.source_artifact_digest,
      },
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

  const clusterAdversarialSummary = buildClusterAdversarialSummary({
    report,
    adversarial,
    stressLab,
    breakerLab,
    timingLab,
    volatilityDelayInteractionLab,
    signalDecayCostDecompositionLab,
    overlapLab,
    placeboLab,
    randomPlaceboLab,
    labelPermutationLab,
    regimeFragilityLab,
    clockStructureLab,
    eventContaminationLab,
    announcementExecutionStressLab,
    narrativeBlindControlLab,
    benchmarkLab,
    horizonCoherenceLab,
    walkForwardLab,
    executionTranslationLab,
    quoteMicrostructureLab,
    executionSpeedBoundsLab,
    capitalScaleImpactEnvelopeLab,
    familyMaxNullLab,
    deflatedSharpeLab,
    tailDependenceLab,
    cscvPboLab,
    currentRunForwardClusterScores,
    durableForwardClusterScores: durableClusterScores,
  });
  const clusterAdversarialSummaryFile = path.join(
    artifactDir,
    "sec-edge-cluster-adversarial-summary.json"
  );
  fs.writeFileSync(
    clusterAdversarialSummaryFile,
    JSON.stringify(clusterAdversarialSummary, null, 2) + "\n"
  );

  const pilotReadiness = evaluatePilotReadiness({
    report,
    adversarial,
    stressLab,
    breakerLab,
    timingLab,
    overlapLab,
    placeboLab,
    benchmarkLab,
    walkForwardLab,
    executionTranslationLab,
    quoteMicrostructureLab,
    forwardScores: durableScores,
    forwardClusterScores: durableClusterScores,
    durableState,
    trialCemeteryState,
  });
  const pilotReadinessFile = path.join(artifactDir, "sec-edge-pilot-readiness.json");
  fs.writeFileSync(
    pilotReadinessFile,
    JSON.stringify(pilotReadiness, null, 2) + "\n"
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
    requested_sec_lookback_days: requestedLookbackDays,
    effective_sec_lookback_days: effectiveLookbackDays,
    frozen_cutoff_age_days: cutoffAgeDays,
    frozen_cutoff_retained_in_source_window:
      effectiveLookbackDays >= cutoffAgeDays,
    hypotheses: report.hypothesis_count || 0,
    measurements: report.measurement_count || 0,
    signal_families: report.family_count || 0,
    research_candidates: report.research_candidate_count || 0,
    quote_microstructure_status: quoteMicrostructureLab.status,
    quote_microstructure_feed: quoteMicrostructureLab.feed,
    quote_microstructure_scope: quoteMicrostructureLab.quote_scope,
    quote_microstructure_coverage: quoteMicrostructureLab.coverage,
    search_burden_signal_families: searchBurden.signal_family_count || 0,
    search_burden_candidate_share: searchBurden.candidate_share || 0,
    family_max_null_eligible_families:
      familyMaxNullLab.null_eligible_family_count || 0,
    family_max_null_separated_candidates:
      familyMaxNullLab.separated_count || 0,
    deflated_sharpe_status_counts:
      deflatedSharpeLab.status_counts || {},
    tail_dependence_status_counts:
      tailDependenceLab.status_counts || {},
    cscv_pbo_status_counts: cscvPboLab.status_counts || {},
    candidate_clusters: adversarial.candidate_cluster_count || 0,
    cluster_adversarial_summary_count:
      clusterAdversarialSummary.cluster_count || 0,
    current_historical_forward_paper_eligible:
      adversarial.forward_paper_eligible_count || 0,
    canonical_frozen_forward_paper_cohorts: frozenCohorts.length,
    canonical_forward_paper_enrollment_at: canonicalEnrollment.generated_at,
    canonical_forward_paper_artifact_digest:
      canonicalEnrollment.source_artifact_digest,
    forward_paper_cohorts_regenerated: false,
    forward_paper_current_run_status_counts: Object.fromEntries(
      [...new Set(currentRunForwardScores.map((row) => row.status))].map((status) => [
        status,
        currentRunForwardScores.filter((row) => row.status === status).length,
      ])
    ),
    forward_paper_current_run_cluster_status_counts: Object.fromEntries(
      [...new Set(currentRunForwardClusterScores.scores.map((row) => row.status))].map((status) => [
        status,
        currentRunForwardClusterScores.scores.filter((row) => row.status === status).length,
      ])
    ),
    stress_survivors: stressLab.stress_survivor_count || 0,
    breaker_survivors: breakerLab.breaker_survivor_count || 0,
    timing_robust_diagnostics: timingLab.timing_robust_count || 0,
    volatility_delay_interaction_status_counts:
      volatilityDelayInteractionLab.status_counts || {},
    signal_decay_cost_decomposition_status_counts:
      signalDecayCostDecompositionLab.status_counts || {},
    overlap_robust_diagnostics: overlapLab.overlap_robust_count || 0,
    placebo_separated_diagnostics: placeboLab.placebo_separated_count || 0,
    random_placebo_separated_diagnostics: randomPlaceboLab.separated_count || 0,
    label_permutation_bh_separated_diagnostics:
      labelPermutationLab.bh_separated_count || 0,
    label_permutation_bonferroni_separated_diagnostics:
      labelPermutationLab.bonferroni_separated_count || 0,
    regime_fragility_status_counts: regimeFragilityLab.status_counts || {},
    clock_structure_status_counts: clockStructureLab.status_counts || {},
    event_contamination_status_counts:
      eventContaminationLab.status_counts || {},
    announcement_execution_stress_status_counts:
      announcementExecutionStressLab.status_counts || {},
    narrative_blind_control_status_counts:
      narrativeBlindControlLab.status_counts || {},
    benchmark_fragility_status_counts: benchmarkLab.status_counts || {},
    horizon_coherent_diagnostics: horizonCoherenceLab.coherent_count || 0,
    walk_forward_robust_diagnostics: walkForwardLab.walk_forward_robust_count || 0,
    execution_translation_status_counts: executionTranslationLab.status_counts || {},
    execution_speed_bounds_status_counts:
      executionSpeedBoundsLab.status_counts || {},
    capital_scale_impact_envelope_status_counts:
      capitalScaleImpactEnvelopeLab.status_counts || {},
    liquidity_state_contract_status_counts:
      liquidityStateContracts.status_counts || {},
    frozen_forward_paper_cohorts: frozenCohorts.length,
    durable_forward_paper_state_configured: durableState.configured,
    durable_forward_paper_restart_reopen_verified: durableState.restart_reopen_verified,
    research_trial_cemetery_configured: trialCemeteryState.configured,
    research_trial_cemetery_restart_reopen_verified:
      trialCemeteryState.restart_reopen_verified,
    research_trial_cemetery_run_count: trialCemeteryState.run_count,
    research_trial_cemetery_trial_observation_count:
      trialCemeteryState.trial_observation_count,
    pilot_evidence_ready_count: pilotReadiness.evidence_ready_count || 0,
    pilot_readiness_status: pilotReadiness.overall_status,
    top_screened_families: top,
    exact_public_availability_time_known: false,
    sec_publication_delay_buffer_minutes:
      observationBatch.publication_delay_buffer_minutes,
    live_trade_authority: false,
    files: {
      observations: observationFile,
      research: reportFile,
      search_burden: searchBurdenFile,
      research_trial_cemetery: trialCemeteryFile,
      family_max_null: familyMaxNullFile,
      deflated_sharpe: deflatedSharpeFile,
      tail_dependence: tailDependenceFile,
      cscv_pbo: cscvPboFile,
      quote_microstructure: quoteMicrostructureFile,
      execution_speed_bounds: executionSpeedBoundsFile,
      capital_scale_impact_envelope: capitalScaleImpactEnvelopeFile,
      liquidity_state_contracts: liquidityStateContractsFile,
      stress_lab: stressFile,
      breaker_lab: breakerFile,
      timing_fragility_lab: timingFile,
      volatility_delay_interaction_lab: volatilityDelayInteractionFile,
      signal_decay_cost_decomposition_lab: signalDecayCostDecompositionFile,
      overlap_fragility_lab: overlapFile,
      matched_placebo_lab: placeboFile,
      random_placebo_lab: randomPlaceboFile,
      label_permutation_lab: labelPermutationFile,
      regime_fragility_lab: regimeFragilityFile,
      clock_structure_lab: clockStructureFile,
      event_contamination_lab: eventContaminationFile,
      announcement_execution_stress_lab: announcementExecutionStressFile,
      narrative_blind_control_lab: narrativeBlindControlFile,
      benchmark_fragility_lab: benchmarkFile,
      horizon_coherence_lab: horizonCoherenceFile,
      walk_forward_lab: walkForwardFile,
      execution_translation_lab: executionTranslationFile,
      adversarial_review: adversarialFile,
      forward_paper_cohorts: forwardPaperFile,
      forward_paper_current_run_scores: currentRunForwardScoreFile,
      durable_forward_paper_scores: durableScoreFile,
      pilot_readiness: pilotReadinessFile,
      cluster_adversarial_summary: clusterAdversarialSummaryFile,
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
