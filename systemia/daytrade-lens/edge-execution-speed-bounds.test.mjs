import assert from "node:assert/strict";
import {
  evaluateExecutionSpeedBounds,
  runExecutionSpeedBoundsLab,
} from "./edge-execution-speed-bounds.mjs";

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
  instrument:"SOXX",
  quote_available:true,
  quote_size_unit:"shares",
  quote_scope:"consolidated_sip_nbbo",
  marketable_entry_price:100,
  marketable_touch_shares:i<6?50:500,
  instrument_start_volume:100000+i*1000,
  passive_touch_evidence_available:true,
  passive_observed_touch_trade_size_by_window:{
    "30s":{observed_trade_size_shares:i<6?2:25},
    "60s":{observed_trade_size_shares:i<6?10:80},
    "300s":{observed_trade_size_shares:i<6?40:600},
  },
}));

const quoteLab={
  quote_scope:"consolidated_sip_nbbo",
  overlays,
};

const review=evaluateExecutionSpeedBounds(candidate,quoteLab,{
  minimum_share_observations:8,
});
assert.equal(review.status,"EXECUTION_SPEED_BOUNDS_READY");
assert.equal(review.share_unit_observations,12);
assert.equal(review.passive_public_tape_evaluable_observations,12);

const twenty=review.grid.find(
  (row)=>row.hypothetical_order_notional_usd===20
);
assert.equal(twenty.immediate_visible_touch_sufficient_rate,1);
assert.equal(
  twenty.passive_public_tape_bounds["30s"]
    .public_tape_upper_bound_sufficient_rate,
  1
);

const tenK=review.grid.find(
  (row)=>row.hypothetical_order_notional_usd===10000
);
assert.equal(tenK.immediate_visible_touch_sufficient_rate,0.5);
assert.equal(
  tenK.passive_public_tape_bounds["30s"]
    .public_tape_upper_bound_sufficient_rate,
  0
);
assert.equal(
  tenK.passive_public_tape_bounds["300s"]
    .public_tape_upper_bound_sufficient_rate,
  0.5
);
assert.ok(tenK.median_order_to_entry_bar_volume_ratio>0);
assert.equal(review.interpretation.market_impact_modeled,false);
assert.equal(review.interpretation.entry_bar_volume_is_activity_not_liquidity,true);
assert.equal(review.interpretation.no_fill_probability_claimed,true);
assert.equal(review.live_trade_authority,false);

const lab=runExecutionSpeedBoundsLab({
  evaluations:[candidate],
},quoteLab,{minimum_share_observations:8});
assert.equal(lab.candidate_count,1);
assert.equal(lab.status_counts.EXECUTION_SPEED_BOUNDS_READY,1);

console.log(JSON.stringify({
  ok:true,
  schema:"evercraft.daytrade.edge-execution-speed-bounds-proof.v1",
  immediate_displayed_touch_grid:true,
  passive_30s_60s_300s_public_tape_bounds:true,
  entry_bar_activity_ratio:true,
  hidden_depth_not_invented:true,
  impact_not_invented:true,
  queue_fill_not_invented:true,
  hypothetical_notionals_not_recommendations:true,
  live_trade_authority:false
}));
