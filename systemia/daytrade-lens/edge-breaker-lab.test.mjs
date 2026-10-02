import assert from "node:assert/strict";
import {
  runEdgeBreakerLab,
  eventDayClusteredBootstrap,
  leaveOneIssuerOut,
  topKWinnerRemovalStress,
  winsorizedStress,
  temporalBlockBootstrap,
  eventDensityWeightedStress,
} from "./edge-breaker-lab.mjs";

const rows=[];
for(let i=0;i<96;i++){
  rows.push({
    measurement_id:"m"+i,
    signal_key:"ai_models|sec_8_k|SOXX|1d",
    observed_at:new Date(Date.UTC(2025,0,1+i*3)).toISOString(),
    origin_entity_ref:"issuer:"+(i%6),
    forward_return:0.012+(i%5)*0.001,
    benchmark_return:0.003,
  });
}

const marketDayProof=eventDayClusteredBootstrap([
  {observed_at:"2026-01-01T23:30:00Z",origin_entity_ref:"a",forward_return:0.01,benchmark_return:0},
  {observed_at:"2026-01-02T00:30:00Z",origin_entity_ref:"b",forward_return:0.01,benchmark_return:0},
  {observed_at:"2026-01-02T15:00:00Z",origin_entity_ref:"c",forward_return:0.01,benchmark_return:0},
],{iterations:50,seed:"market-day-proof"});
assert.equal(marketDayProof.cluster_count,2);

const looIssuer=leaveOneIssuerOut(rows);
assert.equal(looIssuer.origin_count,6);
assert.equal(looIssuer.all_positive,true);

const topK=topKWinnerRemovalStress(rows);
assert.deepEqual(topK.scenarios.map(x=>x.removed),[1,3,5]);
assert.equal(topK.all_positive,true);

const winsorized=winsorizedStress(rows);
assert.equal(winsorized.pass,true);
assert.equal(winsorized.median_positive,true);

const block=temporalBlockBootstrap(rows,{iterations:100,seed:"block-proof",block_size_days:5});
assert.equal(block.pass,true);
assert.equal(block.block_size_days,5);

const densityRows=[
  ...Array.from({length:20},(_,i)=>({
    observed_at:"2026-02-02T15:"+String(i).padStart(2,"0")+":00Z",
    origin_entity_ref:"crowded:"+i,
    forward_return:0.05,
    benchmark_return:0,
  })),
  ...Array.from({length:20},(_,i)=>({
    observed_at:new Date(Date.UTC(2026,1,3+i,15,0)).toISOString(),
    origin_entity_ref:"spread:"+i,
    forward_return:-0.004,
    benchmark_return:0,
  })),
];
const densityStress=eventDensityWeightedStress(densityRows);
assert.ok(densityStress.raw_mean_signed_net>0);
assert.ok(densityStress.event_day_equal_weight_mean_signed_net<0);
assert.equal(densityStress.pass,false);
assert.equal(densityStress.event_days,21);

const report={
  evaluations:[{signal_key:"ai_models|sec_8_k|SOXX|1d",status:"RESEARCH_CANDIDATE",learned_direction:"POSITIVE_EXCESS_RETURN"}],
  measurements:rows,
};
const good=runEdgeBreakerLab(report);
assert.equal(good.breaker_survivor_count,1);
assert.equal(good.extended_breaker_survivor_count,1);
assert.equal(good.reviews[0].live_trade_authority,false);
assert.equal(good.reviews[0].historical_exploratory_only,true);
assert.equal(good.reviews[0].eligibility_mutated,false);

const dominated=rows.map((r)=>({...r,forward_return:r.origin_entity_ref==="issuer:0"?0.2:0.002}));
const bad=runEdgeBreakerLab({...report,measurements:dominated});
assert.equal(bad.breaker_survivor_count,0);

const spiky=rows.map((r,i)=>({
  ...r,
  forward_return:i<3?0.25:-0.004,
  benchmark_return:0,
}));
const spikyResult=runEdgeBreakerLab({...report,measurements:spiky});
assert.equal(spikyResult.breaker_survivor_count,0);
assert.equal(
  spikyResult.reviews[0].checks.survives_top_5pct_winner_removal,
  false
);
assert.equal(
  spikyResult.reviews[0].exploratory_checks.survives_top_1_top_3_top_5_winner_removal,
  false
);

const issuerDependent=rows.map((r)=>({
  ...r,
  forward_return:r.origin_entity_ref==="issuer:0"?0.30:-0.001,
  benchmark_return:0,
}));
const issuerDependentLoo=leaveOneIssuerOut(issuerDependent);
assert.equal(issuerDependentLoo.all_positive,false);

const negativeRows=rows.map((r)=>({
  ...r,
  signal_key:"ai_models|sec_8_k|SOXX|negative",
  forward_return:-0.012,
  benchmark_return:0,
}));
const negativeReport={
  evaluations:[{signal_key:"ai_models|sec_8_k|SOXX|negative",status:"RESEARCH_CANDIDATE",learned_direction:"NEGATIVE_EXCESS_RETURN"}],
  measurements:negativeRows,
};
assert.equal(runEdgeBreakerLab(negativeReport).breaker_survivor_count,1);
assert.equal(runEdgeBreakerLab(negativeReport).extended_breaker_survivor_count,1);

const weakNegativeRows=negativeRows.map((r)=>({...r,forward_return:-0.0002}));
assert.equal(runEdgeBreakerLab({...negativeReport,measurements:weakNegativeRows}).breaker_survivor_count,0);

console.log(JSON.stringify({
  ok:true,
  schema:"evercraft.daytrade.edge-breaker-lab-proof.v2",
  origin_day_dedupe:true,
  leave_one_quarter_out:true,
  leave_one_issuer_out:true,
  issuer_contribution_cap:true,
  trimmed_mean:true,
  winsorized_mean:true,
  median_performance:true,
  downside_tail_analysis:true,
  clustered_bootstrap:true,
  issuer_clustered_bootstrap:true,
  event_day_clustered_bootstrap:true,
  temporal_block_bootstrap:true,
  new_york_market_day_clustering:true,
  top_winner_removal:true,
  top_1_top_3_top_5_winner_removal:true,
  event_density_weighting:true,
  exploratory_only:true,
  eligibility_mutated:false,
  live_trade_authority:false,
}));
