import assert from "node:assert/strict";
import {
  evaluateTailDependence,
  runTailDependenceLab,
} from "./edge-tail-dependence.mjs";

const candidate={
  signal_key:"ai_models|sec_8_k|SOXX|1d",
  status:"RESEARCH_CANDIDATE",
  learned_direction:"POSITIVE_EXCESS_RETURN",
};

const stable=Array.from({length:80},(_,i)=>({
  measurement_id:"stable:"+i,
  signal_key:candidate.signal_key,
  observed_at:new Date(Date.UTC(2025,0,1+i*3)).toISOString(),
  forward_return:0.004+((i%7)-3)*0.00015,
  benchmark_return:0.001,
}));
const stableReview=evaluateTailDependence(candidate,stable,{
  transaction_cost_bps:5,
});
assert.equal(
  stableReview.status,
  "TAIL_DEPENDENCE_LOWER_FRAGILITY_DIAGNOSTIC"
);
assert.equal(stableReview.interpretation.event_sequence_lag_not_equal_clock_time,true);
assert.equal(
  stableReview.interpretation.finite_sample_cannot_establish_infinite_fourth_moment,
  true
);

const clustered=Array.from({length:80},(_,i)=>{
  const high=i>=40;
  const amplitude=high?0.025:0.001;
  return {
    measurement_id:"clustered:"+i,
    signal_key:candidate.signal_key,
    observed_at:new Date(Date.UTC(2025,0,1+i*3)).toISOString(),
    forward_return:0.003+(i%2?1:-1)*amplitude,
    benchmark_return:0,
  };
});
const clusteredReview=evaluateTailDependence(candidate,clustered,{
  transaction_cost_bps:0,
});
assert.equal(
  clusteredReview.status,
  "TAIL_DEPENDENCE_FRAGILE_DIAGNOSTIC"
);
assert.ok(clusteredReview.lag1_squared_return_autocorrelation>0.2);
assert.equal(clusteredReview.flags.squared_return_clustering_high,true);

const tailConcentrated=Array.from({length:80},(_,i)=>({
  measurement_id:"tail:"+i,
  signal_key:candidate.signal_key,
  observed_at:new Date(Date.UTC(2025,0,1+i*3)).toISOString(),
  forward_return:i===79?0.30:0.002,
  benchmark_return:0,
}));
const tailReview=evaluateTailDependence(candidate,tailConcentrated,{
  transaction_cost_bps:0,
});
assert.equal(
  tailReview.status,
  "TAIL_DEPENDENCE_FRAGILE_DIAGNOSTIC"
);
assert.equal(tailReview.flags.top_five_percent_variance_concentrated,true);

const lab=runTailDependenceLab({
  evaluations:[candidate],
  measurements:clustered,
});
assert.equal(lab.candidate_count,1);
assert.equal(lab.reviews.length,1);
assert.equal(lab.eligibility_mutated,false);
assert.equal(lab.live_trade_authority,false);

console.log(JSON.stringify({
  ok:true,
  schema:"evercraft.daytrade.edge-tail-dependence-proof.v1",
  skew_kurtosis:true,
  event_sequence_dependence:true,
  squared_return_volatility_clustering:true,
  tail_variance_concentration:true,
  infinite_moment_not_claimed:true,
  empirical_null_companion:true,
  exploratory_only:true,
  eligibility_mutated:false,
  live_trade_authority:false
}));
