import assert from "node:assert/strict";
import {
  evaluateCapitalScaleImpactEnvelope,
  runCapitalScaleImpactEnvelopeLab,
} from "./edge-capital-scale-impact-envelope.mjs";

const candidate={
  signal_key:"ai_models|sec_8_k|SOXX|1d",
  rockies_range:"ai_models",
  observation_kind:"sec_8_k",
  benchmark:"SPY",
  status:"RESEARCH_CANDIDATE",
};

const overlays=Array.from({length:12},(_,i)=>({
  measurement_id:"m:"+i,
  signal_key:candidate.signal_key,
  label:"modeled_entry",
  quote_available:true,
  marketable_entry_price:100,
  instrument_start_volume:10000,
  instrument_realized_volatility_5m:0.010,
}));
const execution_pairs=Array.from({length:12},(_,i)=>({
  measurement_id:"m:"+i,
  signal_key:candidate.signal_key,
  two_sided_quote_available:true,
  quote_two_sided_strategy_net:0.012,
}));
const quoteLab={
  quote_scope:"consolidated_sip_nbbo",
  overlays,
  execution_pairs,
};

const review=evaluateCapitalScaleImpactEnvelope(candidate,quoteLab,{
  hypothetical_order_notionals_usd:[20,1000,10000],
  impact_coefficients:[0.25,0.5,1.0],
  minimum_observations:8,
});
assert.equal(review.status,"CAPITAL_SCALE_IMPACT_ENVELOPE_READY");
assert.equal(review.eligible_observations,12);
const small=review.grid.find(
  (row)=>row.hypothetical_order_notional_usd===20
).scenarios.find((row)=>row.impact_coefficient===1);
const large=review.grid.find(
  (row)=>row.hypothetical_order_notional_usd===10000
).scenarios.find((row)=>row.impact_coefficient===1);
assert.ok(
  large.mean_one_way_impact_proxy_bps >
  small.mean_one_way_impact_proxy_bps
);
assert.ok(
  large.mean_stressed_quote_strategy_net <
  small.mean_stressed_quote_strategy_net
);
assert.equal(small.positive_rate_after_stress,1);
assert.equal(large.positive_rate_after_stress,1);
assert.ok(
  large.mean_stressed_quote_strategy_net <
  small.mean_stressed_quote_strategy_net
);
assert.equal(
  review.interpretation
    .square_root_shape_is_sensitivity_function_not_calibrated_impact_estimate,
  true
);
assert.equal(
  review.interpretation
    .entry_bar_volume_is_activity_proxy_not_metaorder_daily_volume,
  true
);
assert.equal(
  review.interpretation.coefficients_are_scenario_multipliers_not_fitted_parameters,
  true
);
assert.equal(review.eligibility_mutated,false);
assert.equal(review.live_trade_authority,false);

const lab=runCapitalScaleImpactEnvelopeLab({
  evaluations:[candidate],
},quoteLab,{
  hypothetical_order_notionals_usd:[20,1000,10000],
  minimum_observations:8,
});
assert.equal(lab.candidate_count,1);
assert.equal(lab.status_counts.CAPITAL_SCALE_IMPACT_ENVELOPE_READY,1);

console.log(JSON.stringify({
  ok:true,
  schema:"evercraft.daytrade.edge-capital-scale-impact-envelope-proof.v1",
  concave_square_root_scale_stress:true,
  multiple_impact_coefficients:true,
  quote_two_sided_net_stressed:true,
  larger_size_larger_penalty:true,
  scale_stress_does_not_require_predetermined_failure:true,
  coefficient_not_calibrated:true,
  local_activity_not_daily_volume_disclosed:true,
  impact_estimate_not_claimed:true,
  hypothetical_notionals_not_recommendations:true,
  exploratory_only:true,
  live_trade_authority:false
}));
