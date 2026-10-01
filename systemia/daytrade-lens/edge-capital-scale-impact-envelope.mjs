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
  const index=Math.max(
    0,
    Math.min(sorted.length-1,Math.floor((sorted.length-1)*p))
  );
  return sorted[index];
}
function signalRows(candidate,quoteLab){
  const entryByMeasurement=new Map(
    (quoteLab?.overlays||[])
      .filter((row)=>
        row.signal_key===candidate.signal_key &&
        row.label==="modeled_entry" &&
        row.quote_available===true
      )
      .map((row)=>[row.measurement_id,row])
  );
  return (quoteLab?.execution_pairs||[])
    .filter((row)=>
      row.signal_key===candidate.signal_key &&
      row.two_sided_quote_available===true
    )
    .map((pair)=>({
      pair,
      entry:entryByMeasurement.get(pair.measurement_id)||null,
    }))
    .filter(({pair,entry})=>
      entry &&
      Number.isFinite(finite(pair.quote_two_sided_strategy_net)) &&
      Number.isFinite(finite(entry.marketable_entry_price)) &&
      finite(entry.marketable_entry_price)>0 &&
      Number.isFinite(finite(entry.instrument_start_volume)) &&
      finite(entry.instrument_start_volume)>0 &&
      Number.isFinite(finite(entry.instrument_realized_volatility_5m)) &&
      finite(entry.instrument_realized_volatility_5m)>=0
    );
}

export function evaluateCapitalScaleImpactEnvelope(
  candidate,
  quoteMicrostructureLab,
  {
    hypothetical_order_notionals_usd=[20,100,1000,5000,10000],
    impact_coefficients=[0.25,0.50,1.00],
    minimum_observations=8,
  }={}
){
  const rows=signalRows(candidate,quoteMicrostructureLab);
  const grid=hypothetical_order_notionals_usd.map((notional)=>{
    const scenarios=impact_coefficients.map((coefficient)=>{
      const observations=rows.map(({pair,entry})=>{
        const price=finite(entry.marketable_entry_price);
        const orderShares=Number(notional)/price;
        const activityShares=finite(entry.instrument_start_volume);
        const localVol=finite(entry.instrument_realized_volatility_5m);
        const participation=orderShares/activityShares;
        const oneWayImpactProxy=
          Number(coefficient)*localVol*Math.sqrt(Math.max(0,participation));
        const roundTripImpactProxy=2*oneWayImpactProxy;
        const quoteNet=finite(pair.quote_two_sided_strategy_net);
        const stressedNet=quoteNet-roundTripImpactProxy;
        return {
          measurement_id:pair.measurement_id,
          hypothetical_order_notional_usd:Number(notional),
          hypothetical_order_shares:orderShares,
          entry_bar_activity_shares:activityShares,
          order_to_entry_bar_activity_ratio:participation,
          local_realized_volatility_5m:localVol,
          impact_coefficient:Number(coefficient),
          one_way_local_square_root_impact_proxy_return:oneWayImpactProxy,
          one_way_local_square_root_impact_proxy_bps:oneWayImpactProxy*10000,
          round_trip_local_square_root_impact_proxy_return:roundTripImpactProxy,
          quote_two_sided_strategy_net:quoteNet,
          stressed_quote_strategy_net:stressedNet,
          survives_stress:stressedNet>0,
        };
      });
      const impactBps=observations
        .map((row)=>finite(row.one_way_local_square_root_impact_proxy_bps))
        .filter(Number.isFinite);
      const stressed=observations
        .map((row)=>finite(row.stressed_quote_strategy_net))
        .filter(Number.isFinite);
      return {
        impact_coefficient:Number(coefficient),
        observations:observations.length,
        mean_one_way_impact_proxy_bps:mean(impactBps),
        p90_one_way_impact_proxy_bps:percentile(impactBps,0.90),
        mean_stressed_quote_strategy_net:mean(stressed),
        positive_rate_after_stress:stressed.length
          ?stressed.filter((value)=>value>0).length/stressed.length
          :null,
        observations_detail:observations,
      };
    });
    return {
      hypothetical_order_notional_usd:Number(notional),
      scenarios,
    };
  });

  return {
    schema:"evercraft.daytrade.edge-capital-scale-impact-envelope-candidate.v1",
    signal_key:candidate.signal_key,
    cluster_key:[
      candidate.rockies_range,
      candidate.observation_kind,
      candidate.benchmark||"SPY",
    ].join("|"),
    quote_scope:quoteMicrostructureLab?.quote_scope||null,
    eligible_observations:rows.length,
    grid,
    status:rows.length>=minimum_observations
      ?"CAPITAL_SCALE_IMPACT_ENVELOPE_READY"
      :"CAPITAL_SCALE_IMPACT_ENVELOPE_INSUFFICIENT",
    interpretation:{
      square_root_shape_is_sensitivity_function_not_calibrated_impact_estimate:true,
      local_5m_volatility_used_not_daily_volatility:true,
      entry_bar_volume_is_activity_proxy_not_metaorder_daily_volume:true,
      coefficients_are_scenario_multipliers_not_fitted_parameters:true,
      round_trip_penalty_applied_symmetrically_for_stress_only:true,
      hidden_liquidity_replenishment_and_routing_not_modeled:true,
      quote_two_sided_execution_is_still_not_realized_fill:true,
      benchmark_execution_remains_bar_based:true,
      hypothetical_notionals_are_research_fixtures_not_recommendations:true,
    },
    literature_context:[
      {
        title:"Empirical Confirmation of the Square-Root Law of Market Impact in a U.S. Large-Cap Equity",
        year:2026,
        url:"https://arxiv.org/abs/2606.24019",
        use:"functional-form context only; single-stock coefficient is not imported as calibration",
      },
      {
        title:"How Efficiency Shapes Market Impact",
        year:2013,
        url:"https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2235751",
        use:"square-root impact context only",
      },
    ],
    historical_diagnostic_only:true,
    historical_exploratory_only:true,
    eligibility_mutated:false,
    live_trade_authority:false,
  };
}

export function runCapitalScaleImpactEnvelopeLab(
  report,
  quoteMicrostructureLab,
  options={}
){
  const candidates=(report?.evaluations||[]).filter(
    (row)=>row.status==="RESEARCH_CANDIDATE"
  );
  const reviews=candidates.map((candidate)=>
    evaluateCapitalScaleImpactEnvelope(
      candidate,
      quoteMicrostructureLab,
      options
    )
  );
  const counts={};
  for(const review of reviews){
    counts[review.status]=Number(counts[review.status]||0)+1;
  }
  return {
    schema:"evercraft.daytrade.edge-capital-scale-impact-envelope-lab.v1",
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
