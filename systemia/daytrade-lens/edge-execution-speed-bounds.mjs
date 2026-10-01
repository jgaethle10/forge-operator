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
  const index=Math.max(0,Math.min(sorted.length-1,Math.floor((sorted.length-1)*p)));
  return sorted[index];
}
function passiveSize(row,key){
  if(row?.passive_touch_evidence_available!==true) return null;
  return finite(
    row?.passive_observed_touch_trade_size_by_window?.[key]
      ?.observed_trade_size_shares
  );
}

export function evaluateExecutionSpeedBounds(candidate,quoteMicrostructureLab,{
  hypothetical_order_notionals_usd=[20,100,1000,5000,10000],
  passive_windows=["30s","60s","300s"],
  minimum_share_observations=8,
}={}){
  const rows=(quoteMicrostructureLab?.overlays||[]).filter((row)=>
    row.signal_key===candidate.signal_key &&
    row.label==="modeled_entry" &&
    row.quote_available===true &&
    row.quote_size_unit==="shares" &&
    Number.isFinite(finite(row.marketable_entry_price)) &&
    finite(row.marketable_entry_price)>0 &&
    Number.isFinite(finite(row.marketable_touch_shares))
  );

  const grid=hypothetical_order_notionals_usd.map((notional)=>{
    const observations=rows.map((row)=>{
      const price=finite(row.marketable_entry_price);
      const orderShares=Number(notional)/price;
      const visibleShares=finite(row.marketable_touch_shares);
      const entryBarVolume=finite(row.instrument_start_volume);
      const passive={};
      for(const window of passive_windows){
        const observed=passiveSize(row,window);
        passive[window]={
          observed_touch_trade_size_shares:observed,
          public_tape_size_bound_available:Number.isFinite(observed),
          public_tape_upper_bound_sufficient:
            Number.isFinite(observed)?observed>=orderShares:null,
        };
      }
      return {
        measurement_id:row.measurement_id,
        instrument:row.instrument,
        marketable_entry_price:price,
        hypothetical_order_notional_usd:Number(notional),
        hypothetical_order_shares:orderShares,
        displayed_marketable_touch_shares:visibleShares,
        immediate_visible_touch_sufficient:
          Number.isFinite(visibleShares)?visibleShares>=orderShares:null,
        entry_bar_volume_shares:entryBarVolume,
        order_to_entry_bar_volume_ratio:
          Number.isFinite(entryBarVolume)&&entryBarVolume>0
            ?orderShares/entryBarVolume
            :null,
        passive,
      };
    });
    const immediate=observations
      .map((row)=>row.immediate_visible_touch_sufficient)
      .filter((value)=>typeof value==="boolean");
    const activity=observations
      .map((row)=>finite(row.order_to_entry_bar_volume_ratio))
      .filter(Number.isFinite);
    const passiveSummary={};
    for(const window of passive_windows){
      const values=observations
        .map((row)=>row.passive[window]?.public_tape_upper_bound_sufficient)
        .filter((value)=>typeof value==="boolean");
      passiveSummary[window]={
        observations:values.length,
        public_tape_upper_bound_sufficient_rate:values.length
          ?values.filter(Boolean).length/values.length
          :null,
      };
    }
    return {
      hypothetical_order_notional_usd:Number(notional),
      observations:observations.length,
      immediate_visible_touch_observations:immediate.length,
      immediate_visible_touch_sufficient_rate:immediate.length
        ?immediate.filter(Boolean).length/immediate.length
        :null,
      median_order_to_entry_bar_volume_ratio:percentile(activity,0.50),
      mean_order_to_entry_bar_volume_ratio:mean(activity),
      passive_public_tape_bounds:passiveSummary,
      rows:observations,
    };
  });

  const passiveEvaluable=rows.filter(
    (row)=>row.passive_touch_evidence_available===true
  ).length;
  return {
    schema:"evercraft.daytrade.edge-execution-speed-bounds-candidate.v1",
    signal_key:candidate.signal_key,
    cluster_key:[
      candidate.rockies_range,
      candidate.observation_kind,
      candidate.benchmark||"SPY",
    ].join("|"),
    quote_scope:quoteMicrostructureLab?.quote_scope||null,
    share_unit_observations:rows.length,
    passive_public_tape_evaluable_observations:passiveEvaluable,
    grid,
    status:
      rows.length>=minimum_share_observations &&
      passiveEvaluable>=minimum_share_observations
        ?"EXECUTION_SPEED_BOUNDS_READY"
        :"EXECUTION_SPEED_BOUNDS_INSUFFICIENT",
    interpretation:{
      immediate_capacity_is_displayed_touch_only:true,
      passive_capacity_is_public_tape_upper_bound_only:true,
      queue_position_observed:false,
      hidden_liquidity_observed:false,
      replenishment_observed:false,
      market_impact_modeled:false,
      routing_modeled:false,
      entry_bar_volume_is_activity_not_liquidity:true,
      hypothetical_notional_is_research_fixture_not_recommendation:true,
      no_fill_probability_claimed:true,
    },
    historical_diagnostic_only:true,
    historical_exploratory_only:true,
    eligibility_mutated:false,
    live_trade_authority:false,
  };
}

export function runExecutionSpeedBoundsLab(report,quoteMicrostructureLab,options={}){
  const candidates=(report?.evaluations||[]).filter(
    (row)=>row.status==="RESEARCH_CANDIDATE"
  );
  const reviews=candidates.map((candidate)=>
    evaluateExecutionSpeedBounds(candidate,quoteMicrostructureLab,options)
  );
  const counts={};
  for(const review of reviews){
    counts[review.status]=Number(counts[review.status]||0)+1;
  }
  return {
    schema:"evercraft.daytrade.edge-execution-speed-bounds-lab.v1",
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
