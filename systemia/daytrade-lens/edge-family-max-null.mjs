import crypto from "node:crypto";

function mean(values){
  return values.length?values.reduce((a,b)=>a+b,0)/values.length:0;
}

function percentile(values,p){
  if(!values.length) return null;
  const sorted=[...values].sort((a,b)=>a-b);
  const i=Math.max(0,Math.min(sorted.length-1,Math.floor((sorted.length-1)*p)));
  return sorted[i];
}

function shaInt(seed){
  return crypto.createHash("sha256").update(String(seed)).digest().readUInt32BE(0);
}

function rng(seed){
  let x=shaInt(seed)||1;
  return ()=>{
    x^=x<<13; x>>>=0;
    x^=x>>>17; x>>>=0;
    x^=x<<5; x>>>=0;
    return (x>>>0)/4294967296;
  };
}

function rawExcess(row){
  return Number(row.forward_return||0)-Number(row.benchmark_return||0);
}

function sourceEventKey(row){
  return String(
    row.source_observation_id ||
    row.hypothesis_id ||
    row.measurement_id ||
    ""
  );
}

function prepareFamilies(report,{
  development_fraction=0.70,
  minimum_samples=40,
  minimum_holdout_samples=10,
}={}){
  const groups=new Map();
  for(const row of report?.measurements||[]){
    if(!row?.signal_key||!row?.observed_at) continue;
    if(!Number.isFinite(Number(row.forward_return))) continue;
    if(!Number.isFinite(Number(row.benchmark_return))) continue;
    if(!groups.has(row.signal_key)) groups.set(row.signal_key,[]);
    groups.get(row.signal_key).push(row);
  }

  const families=[];
  for(const [signalKey,rows] of groups.entries()){
    const sorted=[...rows].sort((a,b)=>new Date(a.observed_at)-new Date(b.observed_at));
    const splitAt=Math.max(1,Math.floor(sorted.length*development_fraction));
    const development=sorted.slice(0,splitAt);
    const holdout=sorted.slice(splitAt);
    if(sorted.length<minimum_samples||holdout.length<minimum_holdout_samples) continue;
    families.push({
      signal_key:signalKey,
      rows:sorted,
      development,
      holdout,
    });
  }
  return families;
}

function evaluateFamily(family,eventSigns,cost){
  const transformed=(rows)=>rows.map((row)=>{
    const flip=eventSigns?.get(sourceEventKey(row))??1;
    return rawExcess(row)*flip;
  });
  const development=transformed(family.development);
  const holdout=transformed(family.holdout);
  const devMean=mean(development);
  const sign=devMean>0?1:devMean<0?-1:0;
  const holdoutMean=sign===0?0:mean(holdout.map((value)=>sign*value-cost));
  return {
    learned_sign:sign,
    development_raw_mean:devMean,
    holdout_strategy_mean_net:holdoutMean,
  };
}

export function runFamilyMaxNullLab(report,{
  transaction_cost_bps=5,
  development_fraction=0.70,
  minimum_samples=40,
  minimum_holdout_samples=10,
  iterations=2000,
  seed="evercraft-edge-family-max-null-v1",
}={}){
  const cost=Number(transaction_cost_bps)/10000;
  const families=prepareFamilies(report,{
    development_fraction,
    minimum_samples,
    minimum_holdout_samples,
  });
  const candidates=(report?.evaluations||[]).filter(
    (row)=>row.status==="RESEARCH_CANDIDATE"
  );

  const observedBySignal=new Map();
  for(const family of families){
    observedBySignal.set(family.signal_key,evaluateFamily(family,null,cost));
  }

  const eventKeys=[...new Set(
    families.flatMap((family)=>family.rows.map(sourceEventKey)).filter(Boolean)
  )];
  const random=rng(seed);
  const nullMaxima=[];
  for(let iteration=0;iteration<iterations;iteration++){
    const signs=new Map();
    for(const eventKey of eventKeys){
      signs.set(eventKey,random()<0.5?-1:1);
    }
    let maximum=-Infinity;
    for(const family of families){
      const score=evaluateFamily(family,signs,cost).holdout_strategy_mean_net;
      if(score>maximum) maximum=score;
    }
    nullMaxima.push(Number.isFinite(maximum)?maximum:0);
  }

  const reviews=candidates.map((candidate)=>{
    const observed=observedBySignal.get(candidate.signal_key);
    if(!observed){
      return {
        schema:"evercraft.daytrade.edge-family-max-null-candidate.v1",
        signal_key:candidate.signal_key,
        observed_family_eligible_for_null:false,
        status:"FAMILY_MAX_NULL_INSUFFICIENT",
        live_trade_authority:false,
      };
    }
    const statistic=observed.holdout_strategy_mean_net;
    const exceed=nullMaxima.filter((value)=>value>=statistic).length;
    const p=(exceed+1)/(nullMaxima.length+1);
    return {
      schema:"evercraft.daytrade.edge-family-max-null-candidate.v1",
      signal_key:candidate.signal_key,
      observed_family_eligible_for_null:true,
      observed_learned_sign:observed.learned_sign,
      observed_development_raw_mean:observed.development_raw_mean,
      observed_holdout_strategy_mean_net:statistic,
      empirical_family_wise_p_value:p,
      null_max_p50:percentile(nullMaxima,0.50),
      null_max_p95:percentile(nullMaxima,0.95),
      null_max_p99:percentile(nullMaxima,0.99),
      status:
        statistic>0&&p<0.05
          ?"MAX_FAMILY_NULL_SEPARATED_DIAGNOSTIC"
          :"MAX_FAMILY_NULL_NOT_SEPARATED_DIAGNOSTIC",
      historical_diagnostic_only:true,
      historical_exploratory_only:true,
      eligibility_mutated:false,
      live_trade_authority:false,
    };
  });

  return {
    schema:"evercraft.daytrade.edge-family-max-null-lab.v1",
    generated_at:new Date().toISOString(),
    iterations,
    searched_family_count:(report?.evaluations||[]).length,
    null_eligible_family_count:families.length,
    underlying_event_count:eventKeys.length,
    development_fraction,
    minimum_samples,
    minimum_holdout_samples,
    transaction_cost_bps,
    null_design:
      "One random sign per underlying source event is shared across all correlated instruments and horizons. Every eligible family relearns direction on its chronological development split. The maximum net holdout mean across the entire eligible family set is recorded each iteration.",
    correlation_preserved_by_underlying_event_sign:true,
    direction_relearned_inside_each_null_iteration:true,
    family_wise_max_statistic:true,
    reviews,
    separated_count:reviews.filter(
      (row)=>row.status==="MAX_FAMILY_NULL_SEPARATED_DIAGNOSTIC"
    ).length,
    historical_diagnostic_only:true,
    historical_exploratory_only:true,
    eligibility_mutated:false,
    live_trade_authority:false,
  };
}
