import assert from "node:assert/strict";
import {
  bootstrapEdge,
  originBalancedBootstrap,
  costStress,
  rollingWindowStress,
  permutationNullTest,
  runEdgeStressLab,
} from "./edge-stress-lab.mjs";

const rows=[];
for(let i=0;i<72;i++){
  rows.push({
    measurement_id:"m"+i,
    signal_key:"ai_models|sec_8_k|SOXX|1d",
    observed_at:new Date(Date.UTC(2025,0,1+i*5)).toISOString(),
    origin_entity_ref:"issuer:"+(i%6),
    forward_return:0.012+(i%4)*0.001,
    benchmark_return:0.003+(i%3)*0.0002,
  });
}

const boot=bootstrapEdge(rows,{iterations:500,seed:"proof"});
assert.ok(boot.p05>0);
const origin=originBalancedBootstrap(rows,{iterations:500,seed:"origin-proof"});
assert.equal(origin.origin_count,6);
assert.ok(origin.p05>0);
const costs=costStress(rows);
assert.ok(costs.find(x=>x.transaction_cost_bps===20).mean_signed_net>0);
assert.ok(costs.some(x=>x.transaction_cost_bps===100));
assert.ok(costs.some(x=>x.transaction_cost_bps===150));
assert.ok(
  costs.find(x=>x.transaction_cost_bps===75).mean_signed_net >
  costs.find(x=>x.transaction_cost_bps===100).mean_signed_net
);
assert.ok(
  costs.find(x=>x.transaction_cost_bps===100).mean_signed_net >
  costs.find(x=>x.transaction_cost_bps===150).mean_signed_net
);
const rolling=rollingWindowStress(rows);
assert.ok(rolling.positive_rate>=0.75);
const nullTest=permutationNullTest(rows,{iterations:500,seed:"null-proof"});
assert.ok(nullTest.null_p_value<0.05);


const negativeRows=rows.map((row)=>({
  ...row,
  signal_key:"ai_models|sec_8_k|SOXX|neg",
  forward_return:-0.012,
  benchmark_return:0,
}));
const negativeCosts=costStress(negativeRows,{expected_sign:-1,costs_bps:[5,20,75]});
assert.ok(negativeCosts[0].mean_signed_net>negativeCosts[1].mean_signed_net);
assert.ok(negativeCosts[1].mean_signed_net>negativeCosts[2].mean_signed_net);
assert.ok(negativeCosts[2].mean_signed_net>0);

const report={
  evaluations:[{
    signal_key:"ai_models|sec_8_k|SOXX|1d",
    status:"RESEARCH_CANDIDATE",
    learned_direction:"POSITIVE_EXCESS_RETURN",
  }],
  measurements:rows,
};
const stress=runEdgeStressLab(report);
assert.equal(stress.candidate_count,1);
assert.equal(stress.stress_survivor_count,1);
assert.equal(stress.live_trade_authority,false);

const poisoned=rows.map((row,i)=>i%2?row:{...row,forward_return:-0.08});
const bad=runEdgeStressLab({...report,measurements:poisoned});
assert.equal(bad.stress_survivor_count,0);

console.log(JSON.stringify({
  ok:true,
  schema:"evercraft.daytrade.edge-stress-lab-proof.v1",
  bootstrap:true,
  origin_balanced_bootstrap:true,
  cost_stress:true,
  cost_stress_to_150bps:true,
  rolling_window_stress:true,
  permutation_null:true,
  live_trade_authority:false,
}));
