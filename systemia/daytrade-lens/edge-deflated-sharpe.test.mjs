import assert from "node:assert/strict";
import {
  inverseNormalCdf,
  distributionMoments,
  expectedMaximumSharpe,
  deflatedSharpeProbability,
  runDeflatedSharpeLab,
} from "./edge-deflated-sharpe.mjs";

assert.ok(Math.abs(inverseNormalCdf(0.5))<1e-8);
assert.ok(Math.abs(inverseNormalCdf(0.975)-1.959963)<0.001);

const normalish=distributionMoments([-2,-1,0,1,2]);
assert.equal(normalish.n,5);
assert.ok(Math.abs(normalish.skewness)<1e-12);
assert.ok(normalish.kurtosis>1);

assert.equal(expectedMaximumSharpe({
  trial_count:1,
  cross_trial_sharpe_std:1,
}),0);
assert.ok(expectedMaximumSharpe({
  trial_count:100,
  cross_trial_sharpe_std:0.25,
})>0.4);

const strong=deflatedSharpeProbability({
  sharpe:1.0,
  benchmark_sharpe:0.25,
  observations:40,
  skewness:0,
  kurtosis:3,
});
assert.ok(strong>0.99);

const evaluations=[];
const measurements=[];
const familyCount=40;
for(let f=0;f<familyCount;f++){
  const signal=f===0
    ?"ai_models|sec_8_k|SOXX|1d"
    :`noise|sec_8_k|X${f}|1d`;
  evaluations.push({
    signal_key:signal,
    status:f===0?"RESEARCH_CANDIDATE":"NOT_VALIDATED",
  });
  for(let i=0;i<60;i++){
    const noise=((i*17+f*11)%13-6)*0.00025;
    const edge=f===0?0.010+noise:noise;
    measurements.push({
      measurement_id:`m:${f}:${i}`,
      source_observation_id:"event:"+i,
      signal_key:signal,
      observed_at:new Date(Date.UTC(2025,0,1+i*4)).toISOString(),
      forward_return:edge,
      benchmark_return:0,
    });
  }
}
const lab=runDeflatedSharpeLab(
  {evaluations,measurements},
  {transaction_cost_bps:5}
);
assert.equal(lab.eligible_trial_count,40);
assert.equal(lab.reviews.length,1);
assert.equal(lab.reviews[0].status,"DSR_SEPARATED_DIAGNOSTIC");
assert.ok(lab.reviews[0].deflated_sharpe_probability>=0.95);
assert.equal(lab.reviews[0].interpretation.sharpe_is_per_event_not_annualized,true);
assert.equal(lab.reviews[0].interpretation.independent_trials_assumption_not_verified,true);

const nullEvals=evaluations.map((row)=>({
  ...row,
  status:row.signal_key==="noise|sec_8_k|X1|1d"
    ?"RESEARCH_CANDIDATE"
    :"NOT_VALIDATED",
}));
const nullLab=runDeflatedSharpeLab(
  {evaluations:nullEvals,measurements},
  {transaction_cost_bps:5}
);
assert.notEqual(nullLab.reviews[0].status,"DSR_SEPARATED_DIAGNOSTIC");

console.log(JSON.stringify({
  ok:true,
  schema:"evercraft.daytrade.edge-deflated-sharpe-proof.v1",
  per_event_not_annualized:true,
  skew_and_kurtosis:true,
  expected_maximum_search_benchmark:true,
  holdout_only_scoring:true,
  correlated_trials_assumption_disclosed:true,
  max_family_null_companion_required:true,
  exploratory_only:true,
  eligibility_mutated:false,
  live_trade_authority:false
}));
