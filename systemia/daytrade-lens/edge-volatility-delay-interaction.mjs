function finite(value){
  if(value===null||value===undefined||value==="") return null;
  const n=Number(value);
  return Number.isFinite(n)?n:null;
}
function mean(values){
  return values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
}
function percentile(values,p){
  if(!values.length) return null;
  const sorted=[...values].sort((a,b)=>a-b);
  if(sorted.length===1) return sorted[0];
  const position=Math.max(0,Math.min(sorted.length-1,(sorted.length-1)*p));
  const lower=Math.floor(position);
  const upper=Math.ceil(position);
  if(lower===upper) return sorted[lower];
  const weight=position-lower;
  return sorted[lower]*(1-weight)+sorted[upper]*weight;
}
function expectedSign(candidate){
  return candidate?.learned_direction==="NEGATIVE_EXCESS_RETURN"?-1:1;
}
function signedDelayedNet(row,delayKey,sign,costBps){
  const delayed=row?.execution_delay_stress?.[delayKey];
  if(!delayed) return null;
  const forward=finite(delayed.forward_return);
  const benchmark=finite(delayed.benchmark_return);
  if(!Number.isFinite(forward)||!Number.isFinite(benchmark)) return null;
  return sign*(forward-benchmark)-Number(costBps)/10000;
}
function bucket(value,low,high){
  if(!Number.isFinite(value)) return "missing";
  if(value<=low) return "low";
  if(value>=high) return "high";
  return "mid";
}
function summarizeDelay(rows,delayKey,sign,costBps){
  const values=rows
    .map((row)=>signedDelayedNet(row,delayKey,sign,costBps))
    .filter(Number.isFinite);
  return {
    delay_key:delayKey,
    observations:values.length,
    mean_signed_net:mean(values),
    positive_rate:values.length
      ?values.filter((value)=>value>0).length/values.length
      :null,
  };
}

export function evaluateVolatilityDelayInteraction(candidate,rows,{
  transaction_cost_bps=5,
  delay_keys=["5m","15m","30m","60m","90m","next_session_open"],
  minimum_bucket_delay_events=5,
}={}){
  const sign=expectedSign(candidate);
  const eligible=(rows||[]).filter((row)=>
    Number.isFinite(finite(row.benchmark_realized_volatility_5m))
  );
  const vols=eligible
    .map((row)=>finite(row.benchmark_realized_volatility_5m))
    .filter(Number.isFinite);
  if(vols.length<3){
    return {
      schema:"evercraft.daytrade.edge-volatility-delay-interaction-candidate.v1",
      signal_key:candidate.signal_key,
      status:"VOLATILITY_DELAY_INTERACTION_INSUFFICIENT",
      observations:eligible.length,
      live_trade_authority:false,
    };
  }
  const low=percentile(vols,1/3);
  const high=percentile(vols,2/3);
  const groups={low:[],mid:[],high:[]};
  for(const row of eligible){
    const key=bucket(finite(row.benchmark_realized_volatility_5m),low,high);
    if(groups[key]) groups[key].push(row);
  }

  const matrix={};
  for(const regime of ["low","mid","high"]){
    matrix[regime]=delay_keys.map((delayKey)=>
      summarizeDelay(groups[regime],delayKey,sign,transaction_cost_bps)
    );
  }
  const index=(regime)=>Object.fromEntries(
    matrix[regime].map((row)=>[row.delay_key,row])
  );
  const lowBy=index("low");
  const highBy=index("high");
  const interactions=delay_keys.map((delayKey)=>{
    const lowRow=lowBy[delayKey];
    const highRow=highBy[delayKey];
    const ready=
      Number(lowRow?.observations||0)>=minimum_bucket_delay_events &&
      Number(highRow?.observations||0)>=minimum_bucket_delay_events;
    return {
      delay_key:delayKey,
      low_volatility_observations:lowRow?.observations||0,
      high_volatility_observations:highRow?.observations||0,
      low_volatility_mean_signed_net:lowRow?.mean_signed_net??null,
      high_volatility_mean_signed_net:highRow?.mean_signed_net??null,
      high_minus_low_mean_signed_net:
        ready &&
        Number.isFinite(finite(highRow?.mean_signed_net)) &&
        Number.isFinite(finite(lowRow?.mean_signed_net))
          ?highRow.mean_signed_net-lowRow.mean_signed_net
          :null,
      sample_ready:ready,
    };
  });
  const ready=interactions.filter((row)=>row.sample_ready);
  const requiredKeys=["30m","60m"];
  const coreReady=requiredKeys.every((key)=>
    interactions.find((row)=>row.delay_key===key)?.sample_ready===true
  );
  const highFive=finite(highBy["5m"]?.mean_signed_net);
  const highLongDelays=requiredKeys
    .map((key)=>finite(highBy[key]?.mean_signed_net))
    .filter(Number.isFinite);
  const highDelayDecayVs5m=
    Number.isFinite(highFive)&&highLongDelays.length
      ?mean(highLongDelays)-highFive
      :null;
  const lowFive=finite(lowBy["5m"]?.mean_signed_net);
  const lowLongDelays=requiredKeys
    .map((key)=>finite(lowBy[key]?.mean_signed_net))
    .filter(Number.isFinite);
  const lowDelayDecayVs5m=
    Number.isFinite(lowFive)&&lowLongDelays.length
      ?mean(lowLongDelays)-lowFive
      :null;

  return {
    schema:"evercraft.daytrade.edge-volatility-delay-interaction-candidate.v1",
    signal_key:candidate.signal_key,
    cluster_key:[
      candidate.rockies_range,
      candidate.observation_kind,
      candidate.benchmark||"SPY",
    ].join("|"),
    learned_direction:candidate.learned_direction,
    transaction_cost_bps:Number(transaction_cost_bps),
    observations:eligible.length,
    volatility_thresholds:{
      lower_tertile:low,
      upper_tertile:high,
    },
    bucket_counts:Object.fromEntries(
      Object.entries(groups).map(([key,value])=>[key,value.length])
    ),
    delay_by_volatility_regime:matrix,
    interactions,
    high_volatility_delay_decay_vs_5m:highDelayDecayVs5m,
    low_volatility_delay_decay_vs_5m:lowDelayDecayVs5m,
    differential_delay_decay_high_minus_low:
      Number.isFinite(highDelayDecayVs5m)&&Number.isFinite(lowDelayDecayVs5m)
        ?highDelayDecayVs5m-lowDelayDecayVs5m
        :null,
    ready_delay_count:ready.length,
    status:coreReady
      ?"VOLATILITY_DELAY_INTERACTION_READY"
      :"VOLATILITY_DELAY_INTERACTION_INSUFFICIENT",
    interpretation:{
      volatility_bucketed_from_benchmark_realized_5m_volatility:true,
      delay_is_conditioned_within_volatility_regime:true,
      direction_frozen_from_candidate:true,
      transaction_costs_applied_to_each_cell:true,
      interaction_is_descriptive_not_a_frozen_threshold:true,
      missing_delayed_measurements_are_not_zero:true,
    },
    historical_diagnostic_only:true,
    historical_exploratory_only:true,
    eligibility_mutated:false,
    live_trade_authority:false,
  };
}

export function runVolatilityDelayInteractionLab(report,options={}){
  const candidates=(report?.evaluations||[]).filter(
    (row)=>row.status==="RESEARCH_CANDIDATE"
  );
  const measurements=report?.measurements||[];
  const reviews=candidates.map((candidate)=>
    evaluateVolatilityDelayInteraction(
      candidate,
      measurements.filter((row)=>row.signal_key===candidate.signal_key),
      options
    )
  );
  const counts={};
  for(const review of reviews){
    counts[review.status]=Number(counts[review.status]||0)+1;
  }
  return {
    schema:"evercraft.daytrade.edge-volatility-delay-interaction-lab.v1",
    generated_at:new Date().toISOString(),
    candidate_count:reviews.length,
    status_counts:counts,
    reviews,
    historical_diagnostic_only:true,
    historical_exploratory_only:true,
    eligibility_mutated:false,
    live_trade_authority:false,
  };
}
