function finite(value){
  if(value===null||value===undefined||value==="") return null;
  const n=Number(value);
  return Number.isFinite(n)?n:null;
}

export function buildLiquidityStateContract(
  candidate,
  quoteMicrostructureLab,
  capitalScaleImpactEnvelopeLab
){
  const signal=candidate?.signal_key||null;
  const quote=quoteMicrostructureLab?.by_signal?.[signal]||null;
  const impact=(capitalScaleImpactEnvelopeLab?.reviews||[])
    .find((row)=>row.signal_key===signal)||null;
  const quoteScope=quoteMicrostructureLab?.quote_scope||null;
  const feed=quoteMicrostructureLab?.feed||null;
  const sizeState=quote?.top_of_book_state||null;
  const volumeState=quote?.volume_is_not_liquidity_negative_control||null;

  return {
    schema:"evercraft.daytrade.edge-liquidity-state-contract.v1",
    signal_key:signal,
    cluster_key:[
      candidate?.rockies_range,
      candidate?.observation_kind,
      candidate?.benchmark||"SPY",
    ].join("|"),
    source_feed:{
      feed,
      quote_scope:quoteScope,
      consolidated_nbbo:quoteScope==="consolidated_sip_nbbo",
      fallback_feed_used:quoteMicrostructureLab?.fallback_feed_used??null,
    },
    spread:{
      measurement_state:"observed_selected_feed",
      full_spread_bps_definition:"(ask-bid)/midpoint*10000",
      observation_count:Number(quote?.quote_count||0),
      mean_bps:finite(quote?.mean_spread_bps),
      median_bps:finite(quote?.median_spread_bps),
      p90_bps:finite(quote?.p90_spread_bps),
      missing_is_zero:false,
    },
    visible_top_of_book_size:{
      measurement_state:"observed_selected_feed",
      is_full_market_depth:false,
      observation_count:Number(sizeState?.observations||0),
      quote_size_unit_requirement:"shares",
      median_visible_touch_size_shares:
        finite(sizeState?.median_visible_touch_size),
      cross_symbol_raw_size_comparison_allowed:false,
      hidden_liquidity_observed:false,
      replenishment_observed:false,
    },
    full_depth:{
      measurement_state:"unavailable_not_observed",
      book_levels_observed:1,
      full_l2_l3_book_observed:false,
      missing_is_zero:false,
      substitute_top_of_book_for_full_depth:false,
    },
    imbalance:{
      measurement_state:"observed_top_of_book_only",
      definition:"(bid_size-ask_size)/(bid_size+ask_size)",
      full_depth_imbalance_claimed:false,
    },
    activity_volume:{
      measurement_state:"observed_5m_bar_activity",
      equated_with_liquidity:false,
      negative_control_status:volumeState?.status||null,
    },
    impact:{
      measurement_state:
        impact?.status==="CAPITAL_SCALE_IMPACT_ENVELOPE_READY"
          ?"modeled_sensitivity_not_observed"
          :"unavailable_not_observed",
      calibrated_market_impact_estimate:false,
      sensitivity_status:impact?.status||null,
      stress_function:"coefficient * local_realized_volatility_5m * sqrt(order_shares / entry_bar_activity_shares)",
      coefficient_is_fitted_parameter:false,
      local_activity_is_daily_metaorder_volume:false,
      hidden_depth_used:false,
      impact_observed_from_order_specific_fills:false,
    },
    fill_execution:{
      measurement_state:"separate_order_specific_evidence_path",
      market_quote_touch_is_realized_fill:false,
      order_activity_receipt_module:
        "systemia/daytrade-lens/edge-order-execution-receipt.mjs",
    },
    status:
      quote &&
      impact?.status==="CAPITAL_SCALE_IMPACT_ENVELOPE_READY"
        ?"LIQUIDITY_STATE_CONTRACT_READY"
        :"LIQUIDITY_STATE_CONTRACT_PARTIAL",
    invariants:{
      spread_is_not_depth:true,
      visible_top_of_book_is_not_full_depth:true,
      volume_is_not_liquidity:true,
      modeled_impact_is_not_observed_impact:true,
      quote_touch_is_not_realized_fill:true,
      missing_is_never_zero:true,
    },
    historical_diagnostic_only:true,
    historical_exploratory_only:true,
    eligibility_mutated:false,
    live_trade_authority:false,
  };
}

export function buildLiquidityStateContracts(
  report,
  quoteMicrostructureLab,
  capitalScaleImpactEnvelopeLab
){
  const candidates=(report?.evaluations||[]).filter(
    (row)=>row.status==="RESEARCH_CANDIDATE"
  );
  const reviews=candidates.map((candidate)=>
    buildLiquidityStateContract(
      candidate,
      quoteMicrostructureLab,
      capitalScaleImpactEnvelopeLab
    )
  );
  const counts={};
  for(const review of reviews){
    counts[review.status]=Number(counts[review.status]||0)+1;
  }
  return {
    schema:"evercraft.daytrade.edge-liquidity-state-contracts.v1",
    generated_at:new Date().toISOString(),
    candidate_count:reviews.length,
    status_counts:counts,
    reviews,
    measurement_state_taxonomy:[
      "observed_selected_feed",
      "observed_top_of_book_only",
      "observed_5m_bar_activity",
      "modeled_sensitivity_not_observed",
      "unavailable_not_observed",
      "separate_order_specific_evidence_path",
    ],
    live_trade_authority:false,
  };
}
