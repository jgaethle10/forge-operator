import assert from "node:assert/strict";
import {
  matchNarrativeBlindControls,
  evaluateNarrativeBlindControl,
  runNarrativeBlindControlLab,
} from "./edge-narrative-blind-control.mjs";

const candidate={
  signal_key:"ai_models|sec_8_k|SOXX|1d",
  rockies_range:"ai_models",
  observation_kind:"sec_8_k",
  instrument:"SOXX",
  lag_key:"1d",
  benchmark:"SPY",
  status:"RESEARCH_CANDIDATE",
  learned_direction:"POSITIVE_EXCESS_RETURN",
};

const actual=Array.from({length:30},(_,i)=>({
  measurement_id:"ai:"+i,
  signal_key:candidate.signal_key,
  rockies_range:"ai_models",
  observation_kind:"sec_8_k",
  instrument:"SOXX",
  lag_key:"1d",
  benchmark:"SPY",
  observed_at:new Date(Date.UTC(2025,0,1+i*10)).toISOString(),
  origin_entity_ref:"ai-issuer:"+(i%6),
  source_ticker:"AI"+(i%6),
  forward_return:0.015,
  benchmark_return:0.002,
}));

const controls=Array.from({length:30},(_,i)=>({
  measurement_id:"semi:"+i,
  signal_key:"semiconductors_compute|sec_8_k|SOXX|1d",
  rockies_range:"semiconductors_compute",
  observation_kind:"sec_8_k",
  instrument:"SOXX",
  lag_key:"1d",
  benchmark:"SPY",
  observed_at:new Date(Date.UTC(2025,0,2+i*10)).toISOString(),
  origin_entity_ref:"semi-issuer:"+(i%7),
  source_ticker:"SEMI"+(i%7),
  forward_return:0.004,
  benchmark_return:0.002,
}));

const pairs=matchNarrativeBlindControls(candidate,[...actual,...controls]);
assert.equal(pairs.length,30);
assert.ok(pairs.every((pair)=>pair.distance_days===1));

const separated=evaluateNarrativeBlindControl(
  candidate,
  [...actual,...controls],
  {transaction_cost_bps:20,iterations:2000,seed:"theme-proof"}
);
assert.equal(separated.matched_pairs,30);
assert.equal(separated.actual_distinct_origins,6);
assert.equal(separated.control_distinct_origins,7);
assert.ok(separated.mean_actual_minus_control_signed_net>0);
assert.ok(separated.paired_label_permutation_p_value<0.05);
assert.equal(separated.narrative_control_status,"NARRATIVE_INCREMENTAL_DIAGNOSTIC");

const sameControls=controls.map((row)=>({...row,forward_return:0.015}));
const nullResult=evaluateNarrativeBlindControl(
  candidate,
  [...actual,...sameControls],
  {transaction_cost_bps:20,iterations:1000,seed:"theme-null"}
);
assert.equal(nullResult.narrative_control_status,"NARRATIVE_NOT_INCREMENTAL_DIAGNOSTIC");

const lab=runNarrativeBlindControlLab({
  evaluations:[candidate],
  measurements:[...actual,...controls],
},{transaction_cost_bps:20,iterations:1000});
assert.equal(lab.candidate_count,1);
assert.equal(lab.status_counts.NARRATIVE_INCREMENTAL_DIAGNOSTIC,1);
assert.equal(lab.historical_exploratory_only,true);
assert.equal(lab.live_trade_authority,false);

console.log(JSON.stringify({
  ok:true,
  schema:"evercraft.daytrade.edge-narrative-blind-control-proof.v1",
  matched_non_ai_sec_controls:true,
  identical_instrument_horizon_benchmark:true,
  nearest_date_no_reuse:true,
  paired_permutation:true,
  exploratory_only:true,
  eligibility_mutated:false,
  live_trade_authority:false
}));
