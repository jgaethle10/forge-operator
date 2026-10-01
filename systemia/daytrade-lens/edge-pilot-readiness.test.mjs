import assert from "node:assert/strict";
import { evaluatePilotReadiness } from "./edge-pilot-readiness.mjs";

const candidate = {
  signal_key: "ai_models|sec_8_k|SOXX|1d",
  rockies_range: "ai_models",
  observation_kind: "sec_8_k",
  benchmark: "SPY",
  status: "RESEARCH_CANDIDATE",
};

const clusterKey = "ai_models|sec_8_k|SPY";
const common = {
  report: { evaluations: [candidate] },
  adversarial: { candidate_reviews: [{ signal_key: candidate.signal_key, adversarial_status: "FORWARD_PAPER_ELIGIBLE" }] },
  stressLab: { reviews: [{ signal_key: candidate.signal_key, stress_status: "STRESS_SURVIVOR" }] },
  breakerLab: { reviews: [{ signal_key: candidate.signal_key, breaker_status: "BREAKER_SURVIVOR" }] },
  timingLab: { reviews: [{ signal_key: candidate.signal_key, timing_status: "TIMING_ROBUST_DIAGNOSTIC" }] },
  overlapLab: { reviews: [{ signal_key: candidate.signal_key, overlap_status: "OVERLAP_ROBUST_DIAGNOSTIC" }] },
  placeboLab: { reviews: [{ signal_key: candidate.signal_key, placebo_status: "PLACEBO_SEPARATED_DIAGNOSTIC" }] },
  benchmarkLab: { reviews: [{ signal_key: candidate.signal_key, benchmark_status: "BENCHMARK_ROBUST_DIAGNOSTIC" }] },
  walkForwardLab: { reviews: [{ signal_key: candidate.signal_key, walk_forward_status: "WALK_FORWARD_ROBUST_DIAGNOSTIC" }] },
  executionTranslationLab: { reviews: [{ signal_key: candidate.signal_key, translation_status: "UNHEDGED_AND_PAIR_TRANSLATE_DIAGNOSTIC" }] },
  quoteMicrostructureLab: {
    feed: "sip",
    quote_scope: "consolidated_sip_nbbo",
    fallback_feed_used: false,
    overlays: Array.from({ length: 20 }, (_, i) => ({
      signal_key: candidate.signal_key,
      label: "modeled_entry",
      quote_available: i < 19,
    })),
    execution_pairs: Array.from({ length: 20 }, (_, i) => ({
      signal_key: candidate.signal_key,
      two_sided_quote_available: i < 19,
    })),
  },
  forwardScores: [{
    cohort_id: "edgepaper:test",
    signal_key: candidate.signal_key,
    status: "FORWARD_PAPER_PASS",
    sample_ready: true,
  }],
  forwardClusterScores: {
    scores: [{
      cluster_key: clusterKey,
      status: "FORWARD_CLUSTER_PASS",
      sample_ready: true,
    }],
  },
  durableState: {
    configured: true,
    restart_reopen_verified: true,
  },
};

const ready = evaluatePilotReadiness(common);
assert.equal(ready.evidence_ready_count, 1);
assert.equal(ready.overall_status, "AT_LEAST_ONE_SIGNAL_EVIDENCE_READY");
assert.equal(ready.reviews[0].status, "EDGE_PILOT_EVIDENCE_READY");
assert.equal(ready.capital_amount_authorized, 0);
assert.equal(ready.live_trade_authority, false);

const noDurability = evaluatePilotReadiness({
  ...common,
  durableState: { configured: false, restart_reopen_verified: false },
});
assert.equal(noDurability.evidence_ready_count, 0);
assert.ok(noDurability.reviews[0].blockers.includes("durable_state_configured"));

const forwardPending = evaluatePilotReadiness({
  ...common,
  forwardScores: [{
    cohort_id: "edgepaper:test",
    signal_key: candidate.signal_key,
    status: "FORWARD_PAPER_PENDING",
    sample_ready: false,
  }],
});
assert.equal(forwardPending.evidence_ready_count, 0);
assert.ok(forwardPending.reviews[0].blockers.includes("individual_forward_paper_pass"));

const iexOnly = evaluatePilotReadiness({
  ...common,
  quoteMicrostructureLab: {
    ...common.quoteMicrostructureLab,
    feed: "iex",
    quote_scope: "iex_bbo_not_consolidated_nbbo",
  },
});
assert.equal(iexOnly.evidence_ready_count, 0);
assert.ok(iexOnly.reviews[0].blockers.includes("consolidated_sip_nbbo_scope"));
assert.equal(
  iexOnly.reviews[0].quote_execution_evidence.iex_bbo_is_not_consolidated_nbbo,
  true
);

const lowQuoteCoverage = evaluatePilotReadiness({
  ...common,
  quoteMicrostructureLab: {
    ...common.quoteMicrostructureLab,
    overlays: Array.from({ length: 20 }, (_, i) => ({
      signal_key: candidate.signal_key,
      label: "modeled_entry",
      quote_available: i < 10,
    })),
  },
});
assert.equal(lowQuoteCoverage.evidence_ready_count, 0);
assert.ok(lowQuoteCoverage.reviews[0].blockers.includes("modeled_entry_quote_coverage"));

const lowTwoSidedCoverage = evaluatePilotReadiness({
  ...common,
  quoteMicrostructureLab: {
    ...common.quoteMicrostructureLab,
    execution_pairs: Array.from({ length: 20 }, (_, i) => ({
      signal_key: candidate.signal_key,
      two_sided_quote_available: i < 10,
    })),
  },
});
assert.equal(lowTwoSidedCoverage.evidence_ready_count, 0);
assert.ok(
  lowTwoSidedCoverage.reviews[0].blockers.includes("two_sided_quote_coverage")
);
assert.equal(
  lowTwoSidedCoverage.reviews[0].quote_execution_evidence.exit_quote_required_for_pilot,
  true
);

const pairOnly = evaluatePilotReadiness({
  ...common,
  executionTranslationLab: {
    reviews: [{
      signal_key: candidate.signal_key,
      translation_status: "PAIR_ONLY_TRANSLATES_DIAGNOSTIC",
    }],
  },
});
assert.equal(pairOnly.evidence_ready_count, 0);
assert.equal(pairOnly.reviews[0].pair_only_translation_not_sufficient_for_micro_pilot, true);
assert.ok(pairOnly.reviews[0].blockers.includes("unhedged_execution_translation"));

console.log(JSON.stringify({
  ok:true,
  schema:"evercraft.daytrade.edge-pilot-readiness-proof.v1",
  full_evidence_intersection_required:true,
  prospective_forward_pass_required:true,
  correlated_cluster_pass_required:true,
  durable_state_required:true,
  pair_only_micro_pilot_blocked:true,
  sip_nbbo_required_for_micro_pilot:true,
  modeled_entry_quote_coverage_required:true,
  two_sided_entry_exit_quote_coverage_required:true,
  iex_bbo_not_mislabeled_nbbo:true,
  capital_authority_zero:true,
  human_authorization_required:true,
  live_trade_authority:false,
}));
