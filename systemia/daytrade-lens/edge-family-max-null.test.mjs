import assert from "node:assert/strict";
import { runFamilyMaxNullLab } from "./edge-family-max-null.mjs";

const evaluations=[];
const measurements=[];
const eventCount=60;
for(let familyIndex=0;familyIndex<30;familyIndex++){
  const signal="noise|sec_8_k|X"+familyIndex+"|1d";
  evaluations.push({
    signal_key:signal,
    status:"NOT_VALIDATED",
  });
  for(let i=0;i<eventCount;i++){
    const base=((i*17+familyIndex*13)%11-5)*0.00015;
    measurements.push({
      measurement_id:`noise:${familyIndex}:${i}`,
      source_observation_id:"event:"+i,
      signal_key:signal,
      observed_at:new Date(Date.UTC(2025,0,1+i*4)).toISOString(),
      forward_return:base,
      benchmark_return:0,
    });
  }
}

const edgeSignal="ai_models|sec_8_k|SOXX|1d";
evaluations.push({
  signal_key:edgeSignal,
  status:"RESEARCH_CANDIDATE",
});
for(let i=0;i<eventCount;i++){
  measurements.push({
    measurement_id:"edge:"+i,
    source_observation_id:"event:"+i,
    signal_key:edgeSignal,
    observed_at:new Date(Date.UTC(2025,0,1+i*4)).toISOString(),
    forward_return:0.02+(i%3)*0.0002,
    benchmark_return:0,
  });
}

const result=runFamilyMaxNullLab(
  {evaluations,measurements},
  {transaction_cost_bps:20,iterations:1000,seed:"family-max-proof"}
);
assert.equal(result.searched_family_count,31);
assert.equal(result.null_eligible_family_count,31);
assert.equal(result.underlying_event_count,60);
assert.equal(result.correlation_preserved_by_underlying_event_sign,true);
assert.equal(result.direction_relearned_inside_each_null_iteration,true);
assert.equal(result.family_wise_max_statistic,true);
assert.equal(result.reviews.length,1);
assert.equal(
  result.reviews[0].status,
  "MAX_FAMILY_NULL_SEPARATED_DIAGNOSTIC"
);
assert.ok(result.reviews[0].empirical_family_wise_p_value<0.05);
assert.ok(
  result.reviews[0].observed_holdout_strategy_mean_net>
  result.reviews[0].null_max_p99
);
assert.equal(result.eligibility_mutated,false);
assert.equal(result.live_trade_authority,false);

const fakeCandidateSignal="noise|sec_8_k|X0|1d";
const fake=runFamilyMaxNullLab({
  evaluations:evaluations.map((row)=>({
    ...row,
    status:row.signal_key===fakeCandidateSignal?"RESEARCH_CANDIDATE":"NOT_VALIDATED",
  })),
  measurements:measurements.filter((row)=>row.signal_key!==edgeSignal),
},{
  transaction_cost_bps:20,
  iterations:500,
  seed:"family-max-noise-proof",
});
assert.equal(
  fake.reviews[0].status,
  "MAX_FAMILY_NULL_NOT_SEPARATED_DIAGNOSTIC"
);

console.log(JSON.stringify({
  ok:true,
  schema:"evercraft.daytrade.edge-family-max-null-proof.v1",
  full_family_search_null:true,
  chronological_70_30_split:true,
  direction_relearned_inside_null:true,
  shared_event_flip_preserves_sibling_correlation:true,
  empirical_family_wise_max_p_value:true,
  fake_alpha_rejected:true,
  true_edge_fixture_survives:true,
  exploratory_only:true,
  eligibility_mutated:false,
  live_trade_authority:false
}));
