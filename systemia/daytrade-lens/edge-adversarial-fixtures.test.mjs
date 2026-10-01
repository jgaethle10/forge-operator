import assert from "node:assert/strict";
import { evaluateRockiesEdgeCandidate } from "./rockies-edge-fabric.mjs";
import { runEdgeBreakerLab } from "./edge-breaker-lab.mjs";

function mean(values){
  return values.length ? values.reduce((a,b)=>a+b,0)/values.length : 0;
}

function row(i, forwardReturn, {
  signalKey="synthetic|fixture|SOXX|1d",
  origin="issuer:"+(i%6),
}={}){
  return {
    measurement_id:"synthetic:"+i,
    source_observation_id:"synthetic-observation:"+i,
    signal_key:signalKey,
    observed_at:new Date(Date.UTC(2025,0,2+i*3)).toISOString(),
    origin_entity_ref:origin,
    source_family:"synthetic_fixture",
    source_authority_class:"synthetic_test_only",
    forward_return:forwardReturn,
    benchmark_return:0,
    research_only:true,
    live_trade_authority:false,
  };
}

// Fake alpha: the average and directional hit-rate look attractive because five
// giant winners are sprinkled through the chronology. Removing the top five
// winners reveals that the apparent edge is not distributed through the sample.
const fakeRows=Array.from({length:100},(_,i)=>{
  if(i%20===0) return row(i,0.10);
  return row(i,i%10<6?0.0012:-0.0020);
});
const fakeNaiveMean=mean(fakeRows.map(r=>r.forward_return-r.benchmark_return));
const fakeNaiveHitRate=fakeRows.filter(r=>r.forward_return>r.benchmark_return).length/fakeRows.length;
assert.ok(fakeNaiveMean>0);
assert.ok(fakeNaiveHitRate>0.5);

const fakeBase=evaluateRockiesEdgeCandidate(fakeRows,{
  transaction_cost_bps:5,
  minimum_abs_holdout_mean_bps:1,
});
assert.equal(fakeBase.status,"RESEARCH_CANDIDATE");

const fakeReport={
  evaluations:[{
    signal_key:"synthetic|fixture|SOXX|1d",
    status:"RESEARCH_CANDIDATE",
    learned_direction:"POSITIVE_EXCESS_RETURN",
  }],
  measurements:fakeRows,
};
const fakeBroken=runEdgeBreakerLab(fakeReport);
assert.equal(fakeBroken.reviews[0].top_k_winner_removal_stress.all_positive,false);
assert.equal(
  fakeBroken.reviews[0].exploratory_checks.survives_top_1_top_3_top_5_winner_removal,
  false
);
assert.equal(fakeBroken.reviews[0].extended_breaker_status,"EXTENDED_BREAKER_CRACKED");

// True-edge fixture: modest positive excess return is distributed across
// issuers, quarters, and chronology rather than concentrated in a few events.
const trueRows=Array.from({length:120},(_,i)=>{
  const wiggle=((i%7)-3)*0.00015;
  return row(i,0.006+wiggle,{signalKey:"synthetic|true-edge|SOXX|1d"});
});
const trueBase=evaluateRockiesEdgeCandidate(trueRows,{
  transaction_cost_bps:5,
  minimum_abs_holdout_mean_bps:1,
});
assert.equal(trueBase.status,"RESEARCH_CANDIDATE");

const trueReport={
  evaluations:[{
    signal_key:"synthetic|true-edge|SOXX|1d",
    status:"RESEARCH_CANDIDATE",
    learned_direction:"POSITIVE_EXCESS_RETURN",
  }],
  measurements:trueRows,
};
const trueSurvivor=runEdgeBreakerLab(trueReport);
assert.equal(trueSurvivor.breaker_survivor_count,1);
assert.equal(trueSurvivor.extended_breaker_survivor_count,1);
assert.equal(trueSurvivor.reviews[0].live_trade_authority,false);

console.log(JSON.stringify({
  ok:true,
  schema:"evercraft.daytrade.edge-adversarial-synthetic-fixtures-proof.v1",
  fake_alpha_fools_naive_mean:true,
  fake_alpha_fools_naive_hit_rate:true,
  fake_alpha_survives_base_candidate_screen:true,
  fake_alpha_killed_by_extended_breaker:true,
  distributed_true_edge_survives_extended_breaker:true,
  synthetic_test_only:true,
  live_trade_authority:false,
}));
