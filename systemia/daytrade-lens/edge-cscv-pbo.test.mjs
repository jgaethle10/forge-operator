import assert from "node:assert/strict";
import {
  evaluateClusterCscvPbo,
  runCscvPboLab,
} from "./edge-cscv-pbo.mjs";

const cluster="ai_models|sec_8_k|SPY";
const evaluations=[];
const measurements=[];
const families=[
  "ai_models|sec_8_k|SOXX|1d",
  "ai_models|sec_8_k|SMH|1d",
  "ai_models|sec_8_k|QQQ|1d",
  "ai_models|sec_8_k|SOXX|3d",
  "ai_models|sec_8_k|SMH|3d",
  "ai_models|sec_8_k|QQQ|3d",
];

for(const signal of families){
  evaluations.push({
    signal_key:signal,
    rockies_range:"ai_models",
    observation_kind:"sec_8_k",
    benchmark:"SPY",
    status:signal===families[0]?"RESEARCH_CANDIDATE":"NOT_VALIDATED",
  });
}

for(let i=0;i<48;i++){
  for(let f=0;f<families.length;f++){
    const edge=f===0?0.015:0.001*((i+f)%3-1);
    measurements.push({
      measurement_id:`true:${f}:${i}`,
      source_observation_id:"event:"+i,
      signal_key:families[f],
      observed_at:new Date(Date.UTC(2025,0,1+i*5)).toISOString(),
      forward_return:edge,
      benchmark_return:0,
    });
  }
}

const robust=evaluateClusterCscvPbo(
  {evaluations,measurements},
  cluster,
  {slices:6,transaction_cost_bps:5,minimum_common_events:36}
);
assert.equal(robust.family_count,6);
assert.equal(robust.common_event_count,48);
assert.equal(robust.path_count,20);
assert.ok(robust.pbo<=0.25);
assert.equal(robust.status,"CSCV_PBO_LOWER_OVERFIT_DIAGNOSTIC");
assert.ok(robust.selected_family_counts[families[0]]>0);
assert.equal(robust.interpretation.common_panel_required,true);

// Deliberately overfit fixture: each family owns one time block and loses elsewhere.
const switching=[];
for(let i=0;i<48;i++){
  const block=Math.min(5,Math.floor(i/8));
  for(let f=0;f<families.length;f++){
    switching.push({
      measurement_id:`switch:${f}:${i}`,
      source_observation_id:"switch-event:"+i,
      signal_key:families[f],
      observed_at:new Date(Date.UTC(2025,0,1+i*5)).toISOString(),
      forward_return:f===block?0.03:-0.006,
      benchmark_return:0,
    });
  }
}
const overfit=evaluateClusterCscvPbo(
  {evaluations,measurements:switching},
  cluster,
  {slices:6,transaction_cost_bps:5,minimum_common_events:36}
);
assert.ok(overfit.pbo>=0.50);
assert.equal(overfit.status,"CSCV_PBO_HIGH_OVERFIT_DIAGNOSTIC");

const lab=runCscvPboLab(
  {evaluations,measurements},
  {slices:6,transaction_cost_bps:5,minimum_common_events:36}
);
assert.equal(lab.candidate_cluster_count,1);
assert.equal(lab.reviews.length,1);
assert.equal(lab.eligibility_mutated,false);
assert.equal(lab.live_trade_authority,false);

const insufficient=evaluateClusterCscvPbo(
  {evaluations,measurements:measurements.slice(0,30)},
  cluster,
  {slices:6,minimum_common_events:36}
);
assert.equal(insufficient.status,"CSCV_PBO_INSUFFICIENT_COMMON_PANEL");

console.log(JSON.stringify({
  ok:true,
  schema:"evercraft.daytrade.edge-cscv-pbo-proof.v1",
  common_event_panel_required:true,
  combinatorially_symmetric_splits:true,
  train_best_ranked_out_of_sample:true,
  overfit_fixture_detected:true,
  persistent_edge_fixture_lower_pbo:true,
  incomparable_panels_not_forced:true,
  exploratory_only:true,
  eligibility_mutated:false,
  live_trade_authority:false
}));
