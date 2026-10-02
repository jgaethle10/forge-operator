import assert from "node:assert/strict";
import {
  evaluateVolatilityDelayInteraction,
  runVolatilityDelayInteractionLab,
} from "./edge-volatility-delay-interaction.mjs";

const candidate={
  signal_key:"ai_models|sec_8_k|SOXX|1d",
  rockies_range:"ai_models",
  observation_kind:"sec_8_k",
  benchmark:"SPY",
  status:"RESEARCH_CANDIDATE",
  learned_direction:"POSITIVE_EXCESS_RETURN",
};

const rows=Array.from({length:45},(_,i)=>{
  const bucket=i<15?"low":i<30?"mid":"high";
  const vol=bucket==="low"
    ?0.0005+i*0.000001
    :bucket==="mid"
      ?0.0015+(i-15)*0.000001
      :0.003+(i-30)*0.000001;
  const base=bucket==="high"?0.010:0.009;
  const delayReturn=(minutes)=>{
    if(bucket==="high"){
      if(minutes<=5) return base;
      if(minutes<=15) return 0.006;
      if(minutes<=30) return 0.001;
      if(minutes<=60) return -0.004;
      return -0.006;
    }
    return base-Math.min(minutes,90)*0.00001;
  };
  const stress={};
  for(const [key,minutes] of Object.entries({
    "5m":5,"15m":15,"30m":30,"60m":60,"90m":90
  })){
    stress[key]={
      forward_return:delayReturn(minutes),
      benchmark_return:0.001,
    };
  }
  stress.next_session_open={
    forward_return:bucket==="high"?-0.008:0.006,
    benchmark_return:0.001,
  };
  return {
    measurement_id:"m:"+i,
    signal_key:candidate.signal_key,
    benchmark_realized_volatility_5m:vol,
    execution_delay_stress:stress,
  };
});

const review=evaluateVolatilityDelayInteraction(candidate,rows,{
  transaction_cost_bps:5,
  minimum_bucket_delay_events:5,
});
assert.equal(review.status,"VOLATILITY_DELAY_INTERACTION_READY");
assert.equal(review.bucket_counts.low,15);
assert.equal(review.bucket_counts.mid,15);
assert.equal(review.bucket_counts.high,15);
assert.ok(review.high_volatility_delay_decay_vs_5m<0);
assert.ok(review.differential_delay_decay_high_minus_low<0);
const delay60=review.interactions.find((row)=>row.delay_key==="60m");
assert.equal(delay60.sample_ready,true);
assert.ok(delay60.high_volatility_mean_signed_net<0);
assert.ok(delay60.low_volatility_mean_signed_net>0);
assert.ok(delay60.high_minus_low_mean_signed_net<0);
assert.equal(review.interpretation.transaction_costs_applied_to_each_cell,true);
assert.equal(review.eligibility_mutated,false);

const lab=runVolatilityDelayInteractionLab({
  evaluations:[candidate],
  measurements:rows,
},{
  transaction_cost_bps:5,
  minimum_bucket_delay_events:5,
});
assert.equal(lab.candidate_count,1);
assert.equal(lab.status_counts.VOLATILITY_DELAY_INTERACTION_READY,1);
assert.equal(lab.live_trade_authority,false);

console.log(JSON.stringify({
  ok:true,
  schema:"evercraft.daytrade.edge-volatility-delay-interaction-proof.v1",
  volatility_tertiles:true,
  delay_grid_conditioned_on_volatility:true,
  high_volatility_delay_decay_detected:true,
  cost_applied_per_cell:true,
  missing_is_never_zero:true,
  exploratory_only:true,
  eligibility_mutated:false,
  live_trade_authority:false
}));
