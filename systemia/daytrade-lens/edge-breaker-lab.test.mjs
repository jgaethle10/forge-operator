import assert from "node:assert/strict";
import { runEdgeBreakerLab } from "./edge-breaker-lab.mjs";

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
const report={
  evaluations:[{signal_key:"ai_models|sec_8_k|SOXX|1d",status:"RESEARCH_CANDIDATE",learned_direction:"POSITIVE_EXCESS_RETURN"}],
  measurements:rows,
};
const good=runEdgeBreakerLab(report);
assert.equal(good.breaker_survivor_count,1);
assert.equal(good.reviews[0].live_trade_authority,false);

const dominated=rows.map((r,i)=>({...r,forward_return:r.origin_entity_ref==="issuer:0"?0.2:0.002}));
const bad=runEdgeBreakerLab({...report,measurements:dominated});
assert.equal(bad.breaker_survivor_count,0);

console.log(JSON.stringify({
  ok:true,
  schema:"evercraft.daytrade.edge-breaker-lab-proof.v1",
  origin_day_dedupe:true,
  leave_one_quarter_out:true,
  issuer_contribution_cap:true,
  trimmed_mean:true,
  sign_consistency:true,
  clustered_bootstrap:true,
  live_trade_authority:false,
}));
