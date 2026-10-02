function mean(values){
  return values.length?values.reduce((a,b)=>a+b,0)/values.length:0;
}
function sampleStd(values){
  if(values.length<2) return 0;
  const m=mean(values);
  return Math.sqrt(
    values.reduce((sum,x)=>sum+(x-m)**2,0)/(values.length-1)
  );
}
function autocorrelation(values,lag=1){
  if(values.length<=lag) return null;
  const x=values.slice(lag);
  const y=values.slice(0,-lag);
  const mx=mean(x), my=mean(y);
  let cov=0, vx=0, vy=0;
  for(let i=0;i<x.length;i++){
    const dx=x[i]-mx, dy=y[i]-my;
    cov+=dx*dy; vx+=dx*dx; vy+=dy*dy;
  }
  return vx>0&&vy>0?cov/Math.sqrt(vx*vy):0;
}
function moments(values){
  if(!values.length){
    return {n:0,mean:0,std:0,skewness:null,kurtosis_non_excess:null};
  }
  const m=mean(values);
  const centered=values.map((x)=>x-m);
  const m2=mean(centered.map((x)=>x**2));
  const sigma=Math.sqrt(Math.max(0,m2));
  const m3=mean(centered.map((x)=>x**3));
  const m4=mean(centered.map((x)=>x**4));
  return {
    n:values.length,
    mean:m,
    std:sampleStd(values),
    skewness:sigma>0?m3/(sigma**3):0,
    kurtosis_non_excess:sigma>0?m4/(sigma**4):3,
  };
}
function topShare(values,fraction){
  if(!values.length) return null;
  const magnitudes=values.map((x)=>x*x).sort((a,b)=>b-a);
  const total=magnitudes.reduce((a,b)=>a+b,0);
  if(!(total>0)) return 0;
  const k=Math.max(1,Math.ceil(magnitudes.length*fraction));
  return magnitudes.slice(0,k).reduce((a,b)=>a+b,0)/total;
}
function excess(row){
  return Number(row.forward_return||0)-Number(row.benchmark_return||0);
}
function candidateReturns(candidate,measurements,{
  development_fraction=0.70,
  transaction_cost_bps=5,
}={}){
  const rows=(measurements||[])
    .filter((row)=>row.signal_key===candidate.signal_key)
    .filter((row)=>
      row.observed_at &&
      Number.isFinite(Number(row.forward_return)) &&
      Number.isFinite(Number(row.benchmark_return))
    )
    .sort((a,b)=>new Date(a.observed_at)-new Date(b.observed_at));
  const splitAt=Math.max(1,Math.floor(rows.length*development_fraction));
  const dev=rows.slice(0,splitAt).map(excess);
  const learnedSign=mean(dev)>0?1:mean(dev)<0?-1:0;
  const cost=Number(transaction_cost_bps)/10000;
  return {
    rows,
    learned_sign:learnedSign,
    strategy_returns:learnedSign===0
      ?rows.map(()=>0)
      :rows.map((row)=>learnedSign*excess(row)-cost),
  };
}

export function evaluateTailDependence(candidate,measurements,{
  development_fraction=0.70,
  transaction_cost_bps=5,
  minimum_observations=30,
  kurtosis_fragility_threshold=10,
  squared_return_autocorrelation_threshold=0.20,
  top_five_percent_variance_share_threshold=0.35,
}={}){
  const prepared=candidateReturns(candidate,measurements,{
    development_fraction,
    transaction_cost_bps,
  });
  const values=prepared.strategy_returns;
  const m=moments(values);
  const returnLag1=autocorrelation(values,1);
  const squaredLag1=autocorrelation(values.map((x)=>x*x),1);
  const top1=topShare(values,0.01);
  const top5=topShare(values,0.05);
  const top10=topShare(values,0.10);
  const ready=values.length>=minimum_observations;
  const flags={
    kurtosis_high:
      Number.isFinite(m.kurtosis_non_excess) &&
      m.kurtosis_non_excess>Number(kurtosis_fragility_threshold),
    squared_return_clustering_high:
      Number.isFinite(squaredLag1) &&
      squaredLag1>Number(squared_return_autocorrelation_threshold),
    top_five_percent_variance_concentrated:
      Number.isFinite(top5) &&
      top5>Number(top_five_percent_variance_share_threshold),
  };
  const fragile=Object.values(flags).some(Boolean);
  return {
    schema:"evercraft.daytrade.edge-tail-dependence-candidate.v1",
    signal_key:candidate.signal_key,
    learned_direction:candidate.learned_direction,
    observations:values.length,
    learned_sign_from_development:prepared.learned_sign,
    transaction_cost_bps,
    mean_strategy_return_net:m.mean,
    std_strategy_return_net:m.std,
    skewness:m.skewness,
    kurtosis_non_excess:m.kurtosis_non_excess,
    lag1_strategy_return_autocorrelation:returnLag1,
    lag1_squared_return_autocorrelation:squaredLag1,
    top_1pct_squared_return_share:top1,
    top_5pct_squared_return_share:top5,
    top_10pct_squared_return_share:top10,
    thresholds:{
      kurtosis_fragility_threshold:Number(kurtosis_fragility_threshold),
      squared_return_autocorrelation_threshold:Number(
        squared_return_autocorrelation_threshold
      ),
      top_five_percent_variance_share_threshold:Number(
        top_five_percent_variance_share_threshold
      ),
    },
    flags,
    status:!ready
      ?"TAIL_DEPENDENCE_INSUFFICIENT_DIAGNOSTIC"
      :fragile
        ?"TAIL_DEPENDENCE_FRAGILE_DIAGNOSTIC"
        :"TAIL_DEPENDENCE_LOWER_FRAGILITY_DIAGNOSTIC",
    interpretation:{
      event_sequence_lag_not_equal_clock_time:true,
      finite_sample_cannot_establish_infinite_fourth_moment:true,
      classical_gaussian_sharpe_inference_not_granted_by_this_receipt:true,
      block_bootstrap_companion:"edge-breaker-lab.mjs",
      empirical_search_null_companion:"edge-family-max-null.mjs",
      closed_form_dsr_companion:"edge-deflated-sharpe.mjs",
      thresholds_are_exploratory_not_frozen_promotion_rules:true,
    },
    historical_diagnostic_only:true,
    historical_exploratory_only:true,
    eligibility_mutated:false,
    live_trade_authority:false,
  };
}

export function runTailDependenceLab(report,options={}){
  const candidates=(report?.evaluations||[]).filter(
    (row)=>row.status==="RESEARCH_CANDIDATE"
  );
  const reviews=candidates.map((candidate)=>
    evaluateTailDependence(candidate,report?.measurements||[],options)
  );
  const counts={};
  for(const review of reviews){
    counts[review.status]=Number(counts[review.status]||0)+1;
  }
  return {
    schema:"evercraft.daytrade.edge-tail-dependence-lab.v1",
    generated_at:new Date().toISOString(),
    candidate_count:reviews.length,
    status_counts:counts,
    reviews,
    formula_context_source:{
      title:"Signal-to-Noise Ratio Inference under Volatility Clustering and Heavy Tails",
      authors:"Marcos Lopez de Prado; Emilio Porcu; Vincent Zoonekynd; Robert F. Engle",
      url:"https://papers.ssrn.com/sol3/papers.cfm?abstract_id=6568702",
    },
    historical_diagnostic_only:true,
    historical_exploratory_only:true,
    eligibility_mutated:false,
    live_trade_authority:false,
  };
}
