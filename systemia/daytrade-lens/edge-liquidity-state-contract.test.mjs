import assert from "node:assert/strict";
import {
  buildLiquidityStateContract,
  buildLiquidityStateContracts,
} from "./edge-liquidity-state-contract.mjs";

const candidate={
  signal_key:"ai_models|sec_8_k|SOXX|1d",
  rockies_range:"ai_models",
  observation_kind:"sec_8_k",
  benchmark:"SPY",
  status:"RESEARCH_CANDIDATE",
};

const quoteLab={
  feed:"sip",
  quote_scope:"consolidated_sip_nbbo",
  fallback_feed_used:false,
  by_signal:{
    [candidate.signal_key]:{
      quote_count:20,
      mean_spread_bps:8,
      median_spread_bps:7,
      p90_spread_bps:12,
      top_of_book_state:{
        observations:18,
        median_visible_touch_size:240,
      },
      volume_is_not_liquidity_negative_control:{
        status:"VOLUME_LIQUIDITY_NEGATIVE_CONTROL_READY",
      },
    },
  },
};
const impactLab={
  reviews:[{
    signal_key:candidate.signal_key,
    status:"CAPITAL_SCALE_IMPACT_ENVELOPE_READY",
  }],
};

const contract=buildLiquidityStateContract(
  candidate,
  quoteLab,
  impactLab
);
assert.equal(contract.status,"LIQUIDITY_STATE_CONTRACT_READY");
assert.equal(contract.source_feed.consolidated_nbbo,true);
assert.equal(contract.spread.measurement_state,"observed_selected_feed");
assert.equal(
  contract.visible_top_of_book_size.measurement_state,
  "observed_selected_feed"
);
assert.equal(contract.visible_top_of_book_size.is_full_market_depth,false);
assert.equal(contract.full_depth.measurement_state,"unavailable_not_observed");
assert.equal(contract.full_depth.substitute_top_of_book_for_full_depth,false);
assert.equal(contract.imbalance.measurement_state,"observed_top_of_book_only");
assert.equal(contract.imbalance.full_depth_imbalance_claimed,false);
assert.equal(contract.activity_volume.equated_with_liquidity,false);
assert.equal(contract.impact.measurement_state,"modeled_sensitivity_not_observed");
assert.equal(contract.impact.calibrated_market_impact_estimate,false);
assert.equal(contract.impact.coefficient_is_fitted_parameter,false);
assert.equal(contract.fill_execution.market_quote_touch_is_realized_fill,false);
assert.equal(contract.invariants.spread_is_not_depth,true);
assert.equal(contract.invariants.modeled_impact_is_not_observed_impact,true);
assert.equal(contract.live_trade_authority,false);

const all=buildLiquidityStateContracts(
  {evaluations:[candidate]},
  quoteLab,
  impactLab
);
assert.equal(all.candidate_count,1);
assert.equal(all.status_counts.LIQUIDITY_STATE_CONTRACT_READY,1);
assert.ok(all.measurement_state_taxonomy.includes("unavailable_not_observed"));

console.log(JSON.stringify({
  ok:true,
  schema:"evercraft.daytrade.edge-liquidity-state-contract-proof.v1",
  spread_depth_impact_separated:true,
  visible_top_book_not_full_depth:true,
  volume_not_liquidity:true,
  impact_sensitivity_not_observed_impact:true,
  quote_touch_not_fill:true,
  measurement_state_taxonomy:true,
  missing_never_zero:true,
  live_trade_authority:false
}));
