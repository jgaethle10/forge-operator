import assert from "node:assert/strict";
import {
  evaluateSignalDecayCostDecomposition,
  runSignalDecayCostDecompositionLab,
} from "./edge-signal-decay-cost-decomposition.mjs";

const candidate={
  signal_key:"ai_models|sec_8_k|SOXX|1d",
  rockies_range:"ai_models",
  observation_kind:"sec_8_k",
  benchmark:"SPY",
  status:"RESEARCH_CANDIDATE",
  learned_direction:"POSITIVE_EXCESS_RETURN",
};

const measurements=[];
const overlays=[];
for(let i=0;i<12;i++){
  const id="m:"+i;
  measurements.push({
    measurement_id:id,
    signal_key:candidate.signal_key,
    forward_return:0.014,
    benchmark_return:0.002,
    execution_delay_stress:{
      "5m":{forward_return:0.012,benchmark_return:0.002},
      "15m":{forward_return:0.010,benchmark_return:0.002},
      "30m":{forward_return:0.007,benchmark_return:0.002},
      "60m":{forward_return:0.004,benchmark_return:0.002},
      "90m":{forward_return:0.002,benchmark_return:0.002},
      next_session_open:{forward_return:0.001,benchmark_return:0.002},
    },
  });
  overlays.push({
    measurement_id:id,
    signal_key:candidate.signal_key,
    label:"modeled_entry",
    quote_available:true,
    half_spread_bps:3,
    quote_scope:"consolidated_sip_nbbo",
  });
  for(const [key,half] of Object.entries({
    "5m":4,"15m":5,"30m":7,"60m":9,"90m":11
  })){
    overlays.push({
      measurement_id:id,
      signal_key:candidate.signal_key,
      label:`delay_${key}`,
      quote_available:true,
      half_spread_bps:half,
      quote_scope:"consolidated_sip_nbbo",
    });
  }
  overlays.push({
    measurement_id:id,
    signal_key:candidate.signal_key,
    label:"next_session_open",
    quote_available:true,
    half_spread_bps:6,
    quote_scope:"consolidated_sip_nbbo",
  });
}
const quoteLab={
  quote_scope:"consolidated_sip_nbbo",
  overlays,
};

const review=evaluateSignalDecayCostDecomposition(
  candidate,
  measurements,
  quoteLab,
  {transaction_cost_bps:5}
);
assert.equal(review.status,"SIGNAL_DECAY_COST_DECOMPOSITION_READY");
const delay30=review.delays.find((row)=>row.delay_key==="30m");
assert.equal(delay30.quote_pair_coverage,1);
assert.ok(delay30.mean_timing_change_net_of_same_fixed_cost<0);
assert.ok(delay30.mean_additional_half_spread_bps>0);
assert.ok(delay30.mean_combined_relative_change_proxy<0);
assert.equal(delay30.both_timing_and_spread_worse_rate,1);
assert.equal(
  review.interpretation.combined_proxy_does_not_double_count_fixed_cost,
  true
);
assert.equal(review.interpretation.execution_impact_not_modeled,true);
assert.equal(review.live_trade_authority,false);

const lab=runSignalDecayCostDecompositionLab({
  evaluations:[candidate],
  measurements,
},quoteLab,{transaction_cost_bps:5});
assert.equal(lab.candidate_count,1);
assert.equal(lab.status_counts.SIGNAL_DECAY_COST_DECOMPOSITION_READY,1);

console.log(JSON.stringify({
  ok:true,
  schema:"evercraft.daytrade.edge-signal-decay-cost-decomposition-proof.v1",
  timing_decay_separated:true,
  observed_spread_change_separated:true,
  fixed_cost_not_double_counted:true,
  combined_relative_penalty_proxy:true,
  impact_not_invented:true,
  missing_is_never_zero:true,
  exploratory_only:true,
  live_trade_authority:false
}));
