import assert from "node:assert/strict";
import { evaluateClockStructure, runClockStructureLab } from "./edge-clock-structure.mjs";

const candidate={
  signal_key:"ai_models|sec_8_k|SOXX|1d",
  rockies_range:"ai_models",
  observation_kind:"sec_8_k",
  benchmark:"SPY",
  status:"RESEARCH_CANDIDATE",
  learned_direction:"POSITIVE_EXCESS_RETURN",
};

const phases=["after_hours","continuous_session","immediate_post_open"];
const rows=Array.from({length:60},(_,i)=>({
  measurement_id:"clock:"+i,
  signal_key:candidate.signal_key,
  observation_market_phase:phases[i%3],
  forward_return:0.012+(i%4)*0.0001,
  benchmark_return:0.002,
}));
const robust=evaluateClockStructure(candidate,rows,{
  transaction_cost_bps:20,
  minimum_phase_events:8,
});
assert.equal(robust.clock_status,"CLOCK_ROBUST_DIAGNOSTIC");
assert.equal(robust.observation_phase_distribution.length,3);
assert.equal(robust.leave_one_phase_out.all_positive,true);
assert.ok(robust.auction_near_exclusion.observations_after<60);

const concentrated=rows.map((row,i)=>({
  ...row,
  observation_market_phase:i<55?"after_hours":"continuous_session",
}));
assert.equal(
  evaluateClockStructure(candidate,concentrated,{transaction_cost_bps:20}).clock_status,
  "CLOCK_CONCENTRATED_DIAGNOSTIC"
);

const fragile=rows.map((row)=>({
  ...row,
  forward_return:row.observation_market_phase==="immediate_post_open"?-0.02:0.012,
}));
assert.equal(
  evaluateClockStructure(candidate,fragile,{transaction_cost_bps:20}).clock_status,
  "CLOCK_FRAGILE_DIAGNOSTIC"
);

const lab=runClockStructureLab({evaluations:[candidate],measurements:rows},{transaction_cost_bps:20});
assert.equal(lab.candidate_count,1);
assert.equal(lab.status_counts.CLOCK_ROBUST_DIAGNOSTIC,1);
assert.equal(lab.eligibility_mutated,false);
assert.equal(lab.live_trade_authority,false);

console.log(JSON.stringify({
  ok:true,
  schema:"evercraft.daytrade.edge-clock-structure-proof.v1",
  observation_phase_distribution:true,
  auction_near_exclusion:true,
  after_hours_exclusion:true,
  leave_one_phase_out:true,
  concentration_detection:true,
  exploratory_only:true,
  eligibility_mutated:false,
  live_trade_authority:false
}));
