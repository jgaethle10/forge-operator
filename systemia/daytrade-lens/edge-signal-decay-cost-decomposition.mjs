function finite(value){
  if(value===null||value===undefined||value==="") return null;
  const n=Number(value);
  return Number.isFinite(n)?n:null;
}
function mean(values){
  return values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
}
function expectedSign(candidate){
  return candidate?.learned_direction==="NEGATIVE_EXCESS_RETURN"?-1:1;
}
function strategyNet(forward,benchmark,sign,costBps){
  const f=finite(forward);
  const b=finite(benchmark);
  if(!Number.isFinite(f)||!Number.isFinite(b)) return null;
  return sign*(f-b)-Number(costBps)/10000;
}
function labelForDelay(key){
  return key==="next_session_open"?"next_session_open":`delay_${key}`;
}

export function evaluateSignalDecayCostDecomposition(
  candidate,
  rows,
  quoteMicrostructureLab,
  {
    transaction_cost_bps=5,
    delay_keys=["5m","15m","30m","60m","90m","next_session_open"],
    minimum_quote_pair_coverage=0.80,
    required_delay_keys=["5m","15m","30m"],
  }={}
){
  const sign=expectedSign(candidate);
  const overlays=(quoteMicrostructureLab?.overlays||[])
    .filter((row)=>row.signal_key===candidate.signal_key);
  const overlayMap=new Map(
    overlays.map((row)=>[`${row.measurement_id}|${row.label}`,row])
  );

  const delayRows=[];
  for(const row of rows||[]){
    if(row.signal_key!==candidate.signal_key) continue;
    const baseNet=strategyNet(
      row.forward_return,
      row.benchmark_return,
      sign,
      transaction_cost_bps
    );
    const baseQuote=overlayMap.get(`${row.measurement_id}|modeled_entry`)||null;
    const baseHalf=finite(baseQuote?.half_spread_bps);
    for(const delayKey of delay_keys){
      const delayed=row?.execution_delay_stress?.[delayKey];
      if(!delayed) continue;
      const delayedNet=strategyNet(
        delayed.forward_return,
        delayed.benchmark_return,
        sign,
        transaction_cost_bps
      );
      const delayedQuote=overlayMap.get(
        `${row.measurement_id}|${labelForDelay(delayKey)}`
      )||null;
      const delayedHalf=finite(delayedQuote?.half_spread_bps);
      const pairedSpread=
        Number.isFinite(baseHalf)&&Number.isFinite(delayedHalf);
      const timingChange=
        Number.isFinite(baseNet)&&Number.isFinite(delayedNet)
          ?delayedNet-baseNet
          :null;
      const additionalHalfSpreadBps=pairedSpread
        ?delayedHalf-baseHalf
        :null;
      const combinedRelativeChange=
        Number.isFinite(timingChange)&&Number.isFinite(additionalHalfSpreadBps)
          ?timingChange-additionalHalfSpreadBps/10000
          :null;
      delayRows.push({
        measurement_id:row.measurement_id,
        signal_key:candidate.signal_key,
        delay_key:delayKey,
        base_strategy_net_fixed_cost:baseNet,
        delayed_strategy_net_fixed_cost:delayedNet,
        timing_change_net_of_same_fixed_cost:timingChange,
        base_half_spread_bps:baseHalf,
        delayed_half_spread_bps:delayedHalf,
        additional_half_spread_bps:additionalHalfSpreadBps,
        combined_relative_change_proxy:combinedRelativeChange,
        base_quote_available:baseQuote?.quote_available===true,
        delayed_quote_available:delayedQuote?.quote_available===true,
        quote_scope:
          delayedQuote?.quote_scope||
          baseQuote?.quote_scope||
          quoteMicrostructureLab?.quote_scope||
          null,
      });
    }
  }

  const delays=delay_keys.map((delayKey)=>{
    const group=delayRows.filter((row)=>row.delay_key===delayKey);
    const paired=group.filter((row)=>
      Number.isFinite(row.base_half_spread_bps)&&
      Number.isFinite(row.delayed_half_spread_bps)
    );
    const timing=group
      .map((row)=>finite(row.timing_change_net_of_same_fixed_cost))
      .filter(Number.isFinite);
    const spread=paired
      .map((row)=>finite(row.additional_half_spread_bps))
      .filter(Number.isFinite);
    const combined=paired
      .map((row)=>finite(row.combined_relative_change_proxy))
      .filter(Number.isFinite);
    const bothWorse=paired.filter((row)=>
      finite(row.timing_change_net_of_same_fixed_cost)<0 &&
      finite(row.additional_half_spread_bps)>0
    );
    return {
      delay_key:delayKey,
      observations:group.length,
      quote_pair_observations:paired.length,
      quote_pair_coverage:group.length?paired.length/group.length:0,
      mean_timing_change_net_of_same_fixed_cost:mean(timing),
      mean_additional_half_spread_bps:mean(spread),
      mean_combined_relative_change_proxy:mean(combined),
      both_timing_and_spread_worse_rate:paired.length
        ?bothWorse.length/paired.length
        :null,
    };
  });

  const byDelay=Object.fromEntries(delays.map((row)=>[row.delay_key,row]));
  const ready=required_delay_keys.every((key)=>
    Number(byDelay[key]?.observations||0)>0 &&
    Number(byDelay[key]?.quote_pair_coverage||0)>=minimum_quote_pair_coverage
  );

  return {
    schema:"evercraft.daytrade.edge-signal-decay-cost-decomposition-candidate.v1",
    signal_key:candidate.signal_key,
    cluster_key:[
      candidate.rockies_range,
      candidate.observation_kind,
      candidate.benchmark||"SPY",
    ].join("|"),
    learned_direction:candidate.learned_direction,
    transaction_cost_bps:Number(transaction_cost_bps),
    quote_scope:quoteMicrostructureLab?.quote_scope||null,
    delays,
    observations:delayRows,
    status:ready
      ?"SIGNAL_DECAY_COST_DECOMPOSITION_READY"
      :"SIGNAL_DECAY_COST_DECOMPOSITION_INSUFFICIENT",
    interpretation:{
      timing_change_compares_same_fixed_cost_assumption:true,
      additional_half_spread_is_relative_quote_cost_change:true,
      combined_proxy_does_not_double_count_fixed_cost:true,
      one_way_half_spread_is_not_realized_fill_cost:true,
      execution_impact_not_modeled:true,
      missing_quote_data_is_not_zero:true,
    },
    historical_diagnostic_only:true,
    historical_exploratory_only:true,
    eligibility_mutated:false,
    live_trade_authority:false,
  };
}

export function runSignalDecayCostDecompositionLab(
  report,
  quoteMicrostructureLab,
  options={}
){
  const candidates=(report?.evaluations||[]).filter(
    (row)=>row.status==="RESEARCH_CANDIDATE"
  );
  const reviews=candidates.map((candidate)=>
    evaluateSignalDecayCostDecomposition(
      candidate,
      (report?.measurements||[]).filter(
        (row)=>row.signal_key===candidate.signal_key
      ),
      quoteMicrostructureLab,
      options
    )
  );
  const counts={};
  for(const review of reviews){
    counts[review.status]=Number(counts[review.status]||0)+1;
  }
  return {
    schema:"evercraft.daytrade.edge-signal-decay-cost-decomposition-lab.v1",
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
