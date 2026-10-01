import {
  classifyAnnouncementProximity,
  OFFICIAL_MACRO_CALENDAR_PROVENANCE,
} from "./edge-event-contamination.mjs";

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
function summarize(rows){
  const quoteRows=rows.filter((row)=>row.quote_available===true);
  const spreads=quoteRows.map((row)=>finite(row.spread_bps)).filter(Number.isFinite);
  const entrySlip=quoteRows
    .map((row)=>finite(row.entry_slippage_vs_bar_bps))
    .filter(Number.isFinite);
  const pairRows=rows.filter(
    (row)=>row.two_sided_quote_available===true
  );
  const degradation=pairRows
    .map((row)=>finite(row.strategy_net_degradation_from_two_sided_quotes))
    .filter(Number.isFinite);
  const touchMarkout30=quoteRows
    .map((row)=>finite(row.passive_touch_markout_30s_bps))
    .filter(Number.isFinite);
  return {
    observations:rows.length,
    quote_observations:quoteRows.length,
    two_sided_execution_observations:pairRows.length,
    mean_spread_bps:mean(spreads),
    median_spread_bps:percentile(spreads,0.50),
    p90_spread_bps:percentile(spreads,0.90),
    mean_entry_slippage_vs_bar_bps:mean(entrySlip),
    mean_two_sided_strategy_net_degradation:mean(degradation),
    mean_passive_touch_markout_30s_bps:mean(touchMarkout30),
  };
}
function ratio(a,b){
  const x=finite(a), y=finite(b);
  return Number.isFinite(x)&&Number.isFinite(y)&&y!==0?x/y:null;
}
function delta(a,b){
  const x=finite(a), y=finite(b);
  return Number.isFinite(x)&&Number.isFinite(y)?x-y:null;
}

export function evaluateAnnouncementExecutionStress(
  candidate,
  measurements,
  quoteMicrostructureLab,
  {
    macro_window_minutes=120,
    minimum_clean_quote_observations=8,
    minimum_announcement_quote_observations=2,
  }={}
){
  const measurementRows=(measurements||[])
    .filter((row)=>row.signal_key===candidate.signal_key);
  const byMeasurement=new Map(
    measurementRows.map((row)=>[row.measurement_id,row])
  );
  const entryOverlayByMeasurement=new Map(
    (quoteMicrostructureLab?.overlays||[])
      .filter((row)=>
        row.signal_key===candidate.signal_key &&
        row.label==="modeled_entry"
      )
      .map((row)=>[row.measurement_id,row])
  );
  const pairByMeasurement=new Map(
    (quoteMicrostructureLab?.execution_pairs||[])
      .filter((row)=>row.signal_key===candidate.signal_key)
      .map((row)=>[row.measurement_id,row])
  );

  const observations=[];
  for(const [measurementId,measurement] of byMeasurement.entries()){
    const quote=entryOverlayByMeasurement.get(measurementId)||null;
    const pair=pairByMeasurement.get(measurementId)||null;
    if(!quote&&!pair) continue;
    const announcement=classifyAnnouncementProximity(measurement,{
      macro_window_minutes,
    });
    observations.push({
      schema:"evercraft.daytrade.edge-announcement-execution-observation.v1",
      measurement_id:measurementId,
      signal_key:candidate.signal_key,
      observed_at:measurement.observed_at,
      instrument:measurement.instrument,
      source_form:measurement.source_form||null,
      sec_items:Array.isArray(measurement.sec_items)?[...measurement.sec_items]:[],
      announcement,
      quote_available:quote?.quote_available===true,
      quote_scope:quote?.quote_scope||null,
      spread_bps:finite(quote?.spread_bps),
      half_spread_bps:finite(quote?.half_spread_bps),
      entry_slippage_vs_bar_bps:finite(quote?.entry_slippage_vs_bar_bps),
      passive_touch_markout_30s_bps:finite(quote?.passive_touch_markout_30s_bps),
      two_sided_quote_available:pair?.two_sided_quote_available===true,
      strategy_net_degradation_from_two_sided_quotes:
        finite(pair?.strategy_net_degradation_from_two_sided_quotes),
      realized_fill_claimed:false,
      live_trade_authority:false,
    });
  }

  const clean=observations.filter(
    (row)=>!row.announcement.any_announcement_window
  );
  const macro=observations.filter(
    (row)=>row.announcement.major_macro_within_window
  );
  const earnings=observations.filter(
    (row)=>row.announcement.earnings_related
  );
  const any=observations.filter(
    (row)=>row.announcement.any_announcement_window
  );

  const cleanSummary=summarize(clean);
  const macroSummary=summarize(macro);
  const earningsSummary=summarize(earnings);
  const anySummary=summarize(any);
  const enough=
    cleanSummary.quote_observations>=minimum_clean_quote_observations &&
    anySummary.quote_observations>=minimum_announcement_quote_observations;

  return {
    schema:"evercraft.daytrade.edge-announcement-execution-stress-candidate.v1",
    signal_key:candidate.signal_key,
    cluster_key:[
      candidate.rockies_range,
      candidate.observation_kind,
      candidate.benchmark||"SPY",
    ].join("|"),
    macro_window_minutes:Number(macro_window_minutes),
    clean:cleanSummary,
    macro_window:macroSummary,
    earnings_related:earningsSummary,
    any_announcement_window:anySummary,
    execution_cost_ratios:{
      any_to_clean_mean_spread_ratio:
        ratio(anySummary.mean_spread_bps,cleanSummary.mean_spread_bps),
      macro_to_clean_mean_spread_ratio:
        ratio(macroSummary.mean_spread_bps,cleanSummary.mean_spread_bps),
      earnings_to_clean_mean_spread_ratio:
        ratio(earningsSummary.mean_spread_bps,cleanSummary.mean_spread_bps),
    },
    execution_degradation_deltas:{
      any_minus_clean:
        delta(
          anySummary.mean_two_sided_strategy_net_degradation,
          cleanSummary.mean_two_sided_strategy_net_degradation
        ),
      macro_minus_clean:
        delta(
          macroSummary.mean_two_sided_strategy_net_degradation,
          cleanSummary.mean_two_sided_strategy_net_degradation
        ),
      earnings_minus_clean:
        delta(
          earningsSummary.mean_two_sided_strategy_net_degradation,
          cleanSummary.mean_two_sided_strategy_net_degradation
        ),
    },
    status:enough
      ?"ANNOUNCEMENT_EXECUTION_STRESS_READY"
      :"ANNOUNCEMENT_EXECUTION_STRESS_INSUFFICIENT",
    provenance:{
      official_macro_calendar:OFFICIAL_MACRO_CALENDAR_PROVENANCE,
      cpi_scheduled_release_et:"08:30",
      fomc_statement_release_et:"14:00",
      quote_scope:quoteMicrostructureLab?.quote_scope||null,
      fallback_feed_used:quoteMicrostructureLab?.fallback_feed_used??null,
    },
    interpretation:{
      announcement_window_is_clock_based_not_whole_day:true,
      earnings_related_sec_event_is_announcement_itself:true,
      ratios_are_descriptive_not_frozen_thresholds:true,
      missing_quote_data_is_not_zero:true,
      realized_fill_claimed:false,
    },
    observations,
    historical_diagnostic_only:true,
    historical_exploratory_only:true,
    eligibility_mutated:false,
    live_trade_authority:false,
  };
}

export function runAnnouncementExecutionStressLab(
  report,
  quoteMicrostructureLab,
  options={}
){
  const candidates=(report?.evaluations||[]).filter(
    (row)=>row.status==="RESEARCH_CANDIDATE"
  );
  const reviews=candidates.map((candidate)=>
    evaluateAnnouncementExecutionStress(
      candidate,
      report?.measurements||[],
      quoteMicrostructureLab,
      options
    )
  );
  const counts={};
  for(const review of reviews){
    counts[review.status]=Number(counts[review.status]||0)+1;
  }
  return {
    schema:"evercraft.daytrade.edge-announcement-execution-stress-lab.v1",
    generated_at:new Date().toISOString(),
    candidate_count:reviews.length,
    status_counts:counts,
    reviews,
    official_calendar_provenance:OFFICIAL_MACRO_CALENDAR_PROVENANCE,
    historical_diagnostic_only:true,
    historical_exploratory_only:true,
    eligibility_mutated:false,
    live_trade_authority:false,
  };
}
