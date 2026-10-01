function bySignal(rows = [], key = "signal_key") {
  return new Map(
    (rows || [])
      .filter((row) => row?.[key])
      .map((row) => [row[key], row])
  );
}

function forwardBySignal(scores = []) {
  return new Map(
    (scores || [])
      .filter((row) => row?.cohort_id)
      .map((row) => [row.signal_key || row?.protocol?.signal_key || "", row])
      .filter(([signal]) => signal)
  );
}

export function evaluatePilotReadiness({
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
  minimumModeledEntryQuoteCoverage = 0.90,
  minimumTwoSidedQuoteCoverage = 0.90,
  forwardScores = [],
  forwardClusterScores = { scores: [] },
  durableState = {},
} = {}) {
  const candidates = (report?.evaluations || []).filter(
    (row) => row.status === "RESEARCH_CANDIDATE"
  );

  const adversarialMap = bySignal(adversarial?.candidate_reviews || []);
  const stressMap = bySignal(stressLab?.reviews || []);
  const breakerMap = bySignal(breakerLab?.reviews || []);
  const timingMap = bySignal(timingLab?.reviews || []);
  const overlapMap = bySignal(overlapLab?.reviews || []);
  const placeboMap = bySignal(placeboLab?.reviews || []);
  const benchmarkMap = bySignal(benchmarkLab?.reviews || []);
  const walkMap = bySignal(walkForwardLab?.reviews || []);
  const executionMap = bySignal(executionTranslationLab?.reviews || []);
  const quoteOverlays = quoteMicrostructureLab?.overlays || [];
  const quoteExecutionPairs = quoteMicrostructureLab?.execution_pairs || [];
  const forwardMap = forwardBySignal(forwardScores);

  const clusterMap = new Map(
    (forwardClusterScores?.scores || [])
      .filter((row) => row?.cluster_key)
      .map((row) => [row.cluster_key, row])
  );

  const reviews = candidates.map((candidate) => {
    const signal = candidate.signal_key;
    const clusterKey = [
      candidate.rockies_range,
      candidate.observation_kind,
      candidate.benchmark || "SPY",
    ].join("|");

    const adversarialRow = adversarialMap.get(signal);
    const stressRow = stressMap.get(signal);
    const breakerRow = breakerMap.get(signal);
    const timingRow = timingMap.get(signal);
    const overlapRow = overlapMap.get(signal);
    const placeboRow = placeboMap.get(signal);
    const benchmarkRow = benchmarkMap.get(signal);
    const walkRow = walkMap.get(signal);
    const executionRow = executionMap.get(signal);
    const signalModeledEntryQuotes = quoteOverlays.filter(
      (row) => row.signal_key === signal && row.label === "modeled_entry"
    );
    const signalModeledEntryQuoteCount = signalModeledEntryQuotes.filter(
      (row) => row.quote_available === true
    ).length;
    const signalModeledEntryQuoteCoverage = signalModeledEntryQuotes.length
      ? signalModeledEntryQuoteCount / signalModeledEntryQuotes.length
      : 0;
    const signalExecutionPairs = quoteExecutionPairs.filter(
      (row) => row.signal_key === signal
    );
    const signalTwoSidedQuoteCount = signalExecutionPairs.filter(
      (row) => row.two_sided_quote_available === true
    ).length;
    const signalTwoSidedQuoteCoverage = signalExecutionPairs.length
      ? signalTwoSidedQuoteCount / signalExecutionPairs.length
      : 0;
    const forwardRow = forwardMap.get(signal);
    const clusterRow = clusterMap.get(clusterKey);

    const executionStatus = executionRow?.translation_status || "MISSING";
    const unhedgedExecutableDiagnostic =
      executionStatus === "UNHEDGED_AND_PAIR_TRANSLATE_DIAGNOSTIC" ||
      executionStatus === "UNHEDGED_ONLY_TRANSLATES_DIAGNOSTIC";

    const checks = {
      adversarial_forward_paper_eligible:
        adversarialRow?.adversarial_status === "FORWARD_PAPER_ELIGIBLE",
      stress_survivor:
        stressRow?.stress_status === "STRESS_SURVIVOR",
      breaker_survivor:
        breakerRow?.breaker_status === "BREAKER_SURVIVOR",
      timing_robust:
        timingRow?.timing_status === "TIMING_ROBUST_DIAGNOSTIC",
      overlap_robust:
        overlapRow?.overlap_status === "OVERLAP_ROBUST_DIAGNOSTIC",
      matched_placebo_separated:
        placeboRow?.placebo_status === "PLACEBO_SEPARATED_DIAGNOSTIC",
      benchmark_robust:
        benchmarkRow?.benchmark_status === "BENCHMARK_ROBUST_DIAGNOSTIC",
      walk_forward_robust:
        walkRow?.walk_forward_status === "WALK_FORWARD_ROBUST_DIAGNOSTIC",
      unhedged_execution_translation:
        unhedgedExecutableDiagnostic,
      modeled_entry_quote_coverage:
        signalModeledEntryQuotes.length > 0 &&
        signalModeledEntryQuoteCoverage >= Number(minimumModeledEntryQuoteCoverage),
      two_sided_quote_coverage:
        signalExecutionPairs.length > 0 &&
        signalTwoSidedQuoteCoverage >= Number(minimumTwoSidedQuoteCoverage),
      consolidated_sip_nbbo_scope:
        quoteMicrostructureLab?.quote_scope === "consolidated_sip_nbbo" &&
        quoteMicrostructureLab?.fallback_feed_used === false,
      individual_forward_paper_pass:
        forwardRow?.status === "FORWARD_PAPER_PASS" &&
        forwardRow?.sample_ready === true,
      correlated_cluster_forward_pass:
        clusterRow?.status === "FORWARD_CLUSTER_PASS" &&
        clusterRow?.sample_ready === true,
      durable_state_configured:
        durableState?.configured === true,
      durable_restart_reopen_verified:
        durableState?.restart_reopen_verified === true,
    };

    const ready = Object.values(checks).every(Boolean);

    return {
      schema: "evercraft.daytrade.edge-pilot-readiness-signal.v1",
      signal_key: signal,
      cluster_key: clusterKey,
      checks,
      status: ready ? "EDGE_PILOT_EVIDENCE_READY" : "EDGE_PILOT_NOT_READY",
      blockers: Object.entries(checks)
        .filter(([, value]) => !value)
        .map(([key]) => key),
      pair_only_translation_not_sufficient_for_micro_pilot:
        executionStatus === "PAIR_ONLY_TRANSLATES_DIAGNOSTIC",
      quote_execution_evidence: {
        feed: quoteMicrostructureLab?.feed || null,
        quote_scope: quoteMicrostructureLab?.quote_scope || null,
        modeled_entry_targets: signalModeledEntryQuotes.length,
        modeled_entry_quotes: signalModeledEntryQuoteCount,
        modeled_entry_quote_coverage: signalModeledEntryQuoteCoverage,
        minimum_required_coverage: Number(minimumModeledEntryQuoteCoverage),
        two_sided_execution_pairs: signalExecutionPairs.length,
        two_sided_execution_quotes: signalTwoSidedQuoteCount,
        two_sided_quote_coverage: signalTwoSidedQuoteCoverage,
        minimum_required_two_sided_coverage: Number(minimumTwoSidedQuoteCoverage),
        exit_quote_required_for_pilot: true,
        iex_bbo_is_not_consolidated_nbbo:
          quoteMicrostructureLab?.quote_scope === "iex_bbo_not_consolidated_nbbo",
      },
      human_funding_authorization_required: true,
      human_trade_authorization_required: true,
      live_trade_authority: false,
    };
  });

  return {
    schema: "evercraft.daytrade.edge-pilot-readiness.v1",
    generated_at: new Date().toISOString(),
    candidate_count: reviews.length,
    evidence_ready_count: reviews.filter(
      (row) => row.status === "EDGE_PILOT_EVIDENCE_READY"
    ).length,
    overall_status: reviews.some(
      (row) => row.status === "EDGE_PILOT_EVIDENCE_READY"
    )
      ? "AT_LEAST_ONE_SIGNAL_EVIDENCE_READY"
      : "NO_SIGNAL_EVIDENCE_READY",
    reviews,
    capital_amount_authorized: 0,
    autonomous_funding_allowed: false,
    autonomous_order_submission_allowed: false,
    human_funding_authorization_required: true,
    human_trade_authorization_required: true,
    live_trade_authority: false,
  };
}
