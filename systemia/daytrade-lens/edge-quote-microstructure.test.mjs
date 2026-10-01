import assert from "node:assert/strict";
import {
  normalizeAlpacaQuote,
  quoteAtOrAfter,
  fetchAlpacaQuotes,
  fetchAlpacaTrades,
  normalizeAlpacaTrade,
  buildQuoteMicrostructureTargets,
  summarizeQuoteSignal,
  runQuoteMicrostructureLab,
} from "./edge-quote-microstructure.mjs";

const q=normalizeAlpacaQuote({
  t:"2026-09-01T13:30:00.100Z",
  bp:99.9,
  ap:100.1,
  bs:8,
  as:12,
  bx:"V",
  ax:"V",
  c:["R"],
  z:"C",
});
assert.ok(q);
assert.equal(q.midpoint,100);
assert.ok(Math.abs(q.spread_bps-20)<1e-9);
assert.ok(Math.abs(q.half_spread_bps-10)<1e-9);

assert.equal(normalizeAlpacaQuote({
  t:"2026-09-01T13:30:00Z",
  bp:null,
  ap:100,
}),null);
assert.equal(normalizeAlpacaQuote({
  t:"2026-09-01T13:30:00Z",
  bp:101,
  ap:100,
}),null);

const selected=quoteAtOrAfter([
  {t:"2026-09-01T13:29:59.900Z",bp:99,ap:101},
  {t:"2026-09-01T13:30:00.250Z",bp:99.95,ap:100.05},
],"2026-09-01T13:30:00.000Z");
assert.equal(selected.t,"2026-09-01T13:30:00.250Z");
assert.equal(selected.quote_delay_ms,250);
assert.equal(selected.no_pre_target_quote_used,true);

assert.equal(quoteAtOrAfter([
  {t:"2026-09-01T13:31:00Z",bp:99.95,ap:100.05},
],"2026-09-01T13:30:00Z",{max_delay_ms:30000}),null);

const trade=normalizeAlpacaTrade({
  t:"2026-09-01T13:30:01.000Z",
  p:99.9,
  s:25,
  x:"V",
  c:["@"],
  z:"C",
});
assert.ok(trade);
assert.equal(trade.price,99.9);
assert.equal(trade.size,25);
assert.equal(normalizeAlpacaTrade({t:"bad",p:100}),null);
assert.equal(normalizeAlpacaTrade({t:"2026-09-01T13:30:00Z",p:null}),null);

let requestedUrl="";
const fakeFetch=async(url)=>({
  ok:true,
  json:async()=>{
    requestedUrl=String(url);
    return {
      quotes:[
        {t:"2026-09-01T13:30:00.100Z",bp:99.9,ap:100.1,bs:10,as:11}
      ],
      next_page_token:null,
    };
  }
});
const fetched=await fetchAlpacaQuotes("SOXX",{
  start:"2026-09-01T13:29:30Z",
  end:"2026-09-01T13:31:00Z",
  key:"proof-key",
  secret:"proof-secret",
  feed:"iex",
  fetchImpl:fakeFetch,
});
assert.equal(fetched.length,1);
assert.ok(requestedUrl.includes("/v2/stocks/SOXX/quotes"));
assert.ok(requestedUrl.includes("feed=iex"));

const fetchedTrades=await fetchAlpacaTrades("SOXX",{
  start:"2026-09-01T13:30:00Z",
  end:"2026-09-01T13:31:00Z",
  key:"proof-key",
  secret:"proof-secret",
  feed:"iex",
  fetchImpl:async()=>({
    ok:true,
    json:async()=>({
      trades:[{t:"2026-09-01T13:30:00.500Z",p:100,s:4}],
      next_page_token:null,
    }),
  }),
});
assert.equal(fetchedTrades.length,1);

const report={
  evaluations:[{
    signal_key:"ai_models|sec_8_k|SOXX|1d",
    status:"RESEARCH_CANDIDATE",
    learned_direction:"POSITIVE_EXCESS_RETURN",
  }],
  measurements:[{
    measurement_id:"m1",
    signal_key:"ai_models|sec_8_k|SOXX|1d",
    instrument:"SOXX",
    lag_key:"1d",
    observation_market_phase:"continuous_session",
    instrument_start_time:"2026-09-01T13:30:00.000Z",
    instrument_end_time:"2026-09-02T13:30:00.000Z",
    instrument_start_price:100,
    instrument_end_price:101.5,
    forward_return:0.015,
    benchmark_return:0.002,
    instrument_start_volume:250000,
    instrument_realized_volatility_5m:0.0015,
    execution_delay_stress:{
      "5m":{instrument_start_time:"2026-09-01T13:35:00.000Z"},
      "15m":{instrument_start_time:"2026-09-01T13:45:00.000Z"},
    },
  }],
};
assert.equal(buildQuoteMicrostructureTargets(report).length,4);

const lab=await runQuoteMicrostructureLab(report,{
  key:"proof-key",
  secret:"proof-secret",
  feed:"iex",
  fetchImpl:async(url)=>({
    ok:true,
    json:async()=>String(url).includes("/trades")
      ?({
          trades:[
            {t:"2026-09-01T13:30:10.000Z",p:100.00,s:20,x:"V"},
            {t:"2026-09-01T13:30:20.000Z",p:99.89,s:15,x:"V"},
          ],
          next_page_token:null,
        })
      :({
          quotes:[
            {t:"2026-09-01T13:30:00.100Z",bp:99.9,ap:100.1,bs:10,as:11},
            {t:"2026-09-01T13:35:00.100Z",bp:99.95,ap:100.05,bs:12,as:12},
            {t:"2026-09-01T13:45:00.100Z",bp:99.98,ap:100.02,bs:14,as:13},
            {t:"2026-09-02T13:30:00.100Z",bp:101.4,ap:101.6,bs:16,as:17},
          ],
          next_page_token:null,
        }),
  }),
});
assert.equal(lab.status,"QUOTE_DATA_AVAILABLE");
assert.equal(lab.target_count,4);
assert.equal(lab.grouped_query_count,2);
assert.equal(lab.coverage,1);
assert.equal(lab.quote_scope,"iex_bbo_not_consolidated_nbbo");
assert.equal(lab.fallback_feed_used,false);
assert.equal(lab.interpretation.missing_is_never_zero,true);
assert.ok(lab.by_signal["ai_models|sec_8_k|SOXX|1d"].mean_spread_bps>0);
assert.equal(
  lab.by_signal["ai_models|sec_8_k|SOXX|1d"].modeled_entry_quote_count,
  1
);
assert.ok(
  lab.by_signal["ai_models|sec_8_k|SOXX|1d"].mean_entry_slippage_vs_bar_bps>0
);
assert.ok(
  Number.isFinite(
    lab.by_signal["ai_models|sec_8_k|SOXX|1d"].mean_quote_entry_strategy_net_partial
  )
);
assert.equal(lab.interpretation.exit_execution_quote_adjusted,true);
assert.equal(lab.execution_pairs.length,1);
assert.equal(lab.execution_pairs[0].two_sided_quote_available,true);
assert.ok(lab.execution_pairs[0].marketable_entry_price>100);
assert.ok(lab.execution_pairs[0].marketable_exit_price<101.5);
assert.ok(lab.execution_pairs[0].total_touch_slippage_vs_bar_bps>0);
assert.ok(
  lab.execution_pairs[0].quote_two_sided_strategy_net <
  lab.execution_pairs[0].bar_strategy_net
);
assert.equal(
  lab.by_signal["ai_models|sec_8_k|SOXX|1d"].two_sided_execution.two_sided_quote_coverage,
  1
);
const modeledEntry=lab.overlays.find((row)=>row.label==="modeled_entry");
assert.equal(modeledEntry.passive_touch_evidence_available,true);
assert.equal(modeledEntry.passive_price_touch_observed,true);
assert.ok(modeledEntry.passive_touch_delay_ms>0);
assert.equal(modeledEntry.passive_queue_position_observed,false);
assert.equal(modeledEntry.passive_hypothetical_fill_claimed,false);
assert.ok(Number.isFinite(modeledEntry.visible_touch_size));
assert.ok(Number.isFinite(modeledEntry.top_of_book_size_imbalance));
assert.equal(modeledEntry.full_market_depth_claimed,false);
assert.equal(
  lab.by_signal["ai_models|sec_8_k|SOXX|1d"].passive_touch_evaluable_count,
  1
);
assert.equal(
  lab.by_signal["ai_models|sec_8_k|SOXX|1d"].passive_touch_rate,
  1
);
assert.equal(lab.live_trade_authority,false);

const shortReport={
  evaluations:[{
    signal_key:"ai_models|sec_8_k|SOXX|1d:short-proof",
    status:"RESEARCH_CANDIDATE",
    learned_direction:"NEGATIVE_EXCESS_RETURN",
  }],
  measurements:[{
    measurement_id:"short-m1",
    signal_key:"ai_models|sec_8_k|SOXX|1d:short-proof",
    instrument:"SOXX",
    lag_key:"1d",
    instrument_start_time:"2026-09-03T13:35:00.000Z",
    instrument_end_time:"2026-09-04T13:35:00.000Z",
    instrument_start_price:100,
    instrument_end_price:98,
    forward_return:-0.02,
    benchmark_return:0,
    execution_delay_stress:{},
  }],
};
const shortLab=await runQuoteMicrostructureLab(shortReport,{
  key:"proof-key",
  secret:"proof-secret",
  feed:"sip",
  fetchImpl:async(url)=>({
    ok:true,
    json:async()=>String(url).includes("/trades")
      ?({trades:[],next_page_token:null})
      :({quotes:[
          {t:"2026-09-03T13:35:00.100Z",bp:99.9,ap:100.1,bs:100,as:100},
          {t:"2026-09-04T13:35:00.100Z",bp:97.9,ap:98.1,bs:100,as:100},
        ],next_page_token:null}),
  }),
});
const shortPair=shortLab.execution_pairs[0];
assert.equal(shortPair.two_sided_quote_available,true);
assert.equal(shortPair.marketable_entry_price,99.9);
assert.equal(shortPair.marketable_exit_price,98.1);
assert.ok(shortPair.quote_two_sided_strategy_net>0);
assert.ok(shortPair.total_touch_slippage_vs_bar_bps>0);
assert.ok(shortPair.quote_two_sided_strategy_net<shortPair.bar_strategy_net);

const partial=await runQuoteMicrostructureLab(report,{
  key:"proof-key",
  secret:"proof-secret",
  feed:"iex",
  fetchImpl:async(url)=>({
    ok:true,
    json:async()=>String(url).includes("/trades")
      ?({trades:[],next_page_token:null})
      :({
          quotes:[
            {t:"2026-09-01T13:30:00.100Z",bp:99.9,ap:100.1}
          ],
          next_page_token:null,
        }),
  }),
});
assert.equal(partial.status,"QUOTE_DATA_PARTIAL");
assert.equal(partial.quote_overlay_count,1);


const microRows=Array.from({length:12},(_,i)=>({
  label:"modeled_entry",
  quote_available:true,
  entry_slippage_vs_bar_bps:2+i*0.1,
  quote_entry_strategy_net_partial:0.01-i*0.0001,
  strategy_net_degradation_from_quote_entry:0.0002+i*0.00001,
  spread_bps:i>=6?18+i:6+i*0.2,
  half_spread_bps:i>=6?9+i/2:3+i*0.1,
  bid_size:i<6?100+i*5:20+i,
  ask_size:i<6?110+i*5:18+i,
  visible_touch_size:i<6?210+i*10:38+i*2,
  visible_touch_size_shares:i<6?210+i*10:38+i*2,
  quote_size_unit:"shares",
  marketable_touch_notional_usd:i<6?25000+i*1000:3000+i*250,
  top_of_book_size_imbalance:0.05,
  instrument:"SOXX",
  instrument_realized_volatility_5m:i<6?0.0005+i*0.00002:0.002+i*0.00005,
  instrument_start_volume:i<6?50000+i*1000:500000+i*10000,
  passive_touch_evidence_available:true,
  passive_price_touch_observed:i%2===0,
  passive_touch_delay_ms:1000+i*100,
}));
const microSummary=summarizeQuoteSignal(microRows);
assert.equal(
  microSummary.top_of_book_state.status,
  "VISIBLE_TOUCH_SIZE_X_VOLATILITY_STRESS_READY"
);
assert.equal(microSummary.top_of_book_state.full_market_depth_claimed,false);
assert.equal(microSummary.top_of_book_state.single_instrument_required,true);
assert.equal(microSummary.top_of_book_state.cross_symbol_size_comparison_forbidden,true);
assert.ok(
  microSummary.top_of_book_state.low_visible_size_high_volatility_count>=2
);
assert.equal(
  microSummary.volume_is_not_liquidity_negative_control.status,
  "VOLUME_LIQUIDITY_NEGATIVE_CONTROL_READY"
);
assert.equal(
  microSummary.volume_is_not_liquidity_negative_control.volume_equated_with_liquidity,
  false
);
assert.equal(
  microSummary.capital_scale_visibility.status,
  "CAPITAL_VISIBLE_TOUCH_DIAGNOSTIC_READY"
);
assert.equal(microSummary.capital_scale_visibility.market_impact_modeled,false);
assert.equal(microSummary.capital_scale_visibility.scale_invariance_claimed,false);
assert.equal(
  microSummary.capital_scale_visibility.tiers.find(
    (row)=>row.hypothetical_order_notional_usd===20
  ).visible_touch_sufficient_rate,
  1
);
assert.ok(
  microSummary.volume_is_not_liquidity_negative_control.high_volume_mean_spread_bps >
  microSummary.volume_is_not_liquidity_negative_control.low_volume_mean_spread_bps
);

const sipShareLab=await runQuoteMicrostructureLab({
  evaluations:[{
    signal_key:"ai_models|sec_8_k|SOXX|1d",
    status:"RESEARCH_CANDIDATE",
    learned_direction:"POSITIVE_EXCESS_RETURN",
  }],
  measurements:[{
    measurement_id:"sip-share",
    signal_key:"ai_models|sec_8_k|SOXX|1d",
    instrument:"SOXX",
    lag_key:"1d",
    instrument_start_time:"2026-01-05T14:35:00.000Z",
    instrument_end_time:"2026-01-06T14:35:00.000Z",
    instrument_start_price:100,
    instrument_end_price:101,
    instrument_start_volume:500000,
    instrument_realized_volatility_5m:0.002,
    forward_return:0.01,
    benchmark_return:0.001,
    execution_delay_stress:{},
  }],
},{
  key:"proof-key",
  secret:"proof-secret",
  feed:"sip",
  request_interval_ms:0,
  fetchImpl:async(url)=>({
    ok:true,
    json:async()=>String(url).includes("/trades")
      ?({trades:[],next_page_token:null})
      :({quotes:[{
          t:"2026-01-05T14:35:00.100Z",
          bp:99.95,ap:100.05,bs:200,as:300
        }],next_page_token:null}),
  }),
});
const sipEntry=sipShareLab.overlays.find((row)=>row.label==="modeled_entry");
assert.equal(sipEntry.quote_size_unit,"shares");
assert.equal(sipEntry.visible_touch_size_shares,500);
assert.equal(sipEntry.marketable_touch_shares,300);
assert.ok(sipEntry.marketable_touch_notional_usd>30000);

const mixedInstrumentSummary=summarizeQuoteSignal([
  ...microRows.slice(0,6),
  ...microRows.slice(6).map((row)=>({...row,instrument:"QQQ"})),
]);
assert.equal(
  mixedInstrumentSummary.top_of_book_state.status,
  "VISIBLE_TOUCH_SIZE_X_VOLATILITY_INSUFFICIENT"
);
assert.equal(mixedInstrumentSummary.top_of_book_state.observations,0);
assert.equal(
  mixedInstrumentSummary.volume_is_not_liquidity_negative_control.status,
  "VOLUME_LIQUIDITY_NEGATIVE_CONTROL_INSUFFICIENT"
);

await assert.rejects(
  ()=>fetchAlpacaQuotes("SOXX",{
    start:"2026-09-01T13:30:00Z",
    end:"2026-09-01T13:31:00Z",
    key:"proof-key",
    secret:"proof-secret",
    feed:"mystery",
    fetchImpl:fakeFetch,
  }),
  /edge_quote_feed_must_be_iex_or_sip/
);

console.log(JSON.stringify({
  ok:true,
  schema:"evercraft.daytrade.edge-quote-microstructure-proof.v1",
  first_quote_at_or_after_target:true,
  pre_target_quote_forbidden:true,
  spread_and_half_spread:true,
  grouped_target_queries:true,
  explicit_feed_provenance:true,
  marketable_entry_friction:true,
  entry_side_partial_strategy_net:true,
  two_sided_marketable_execution:true,
  long_entry_ask_exit_bid:true,
  short_entry_bid_exit_ask:true,
  total_touch_slippage_degrades_bar_result:true,
  historical_trade_touch_evidence:true,
  passive_touch_never_claimed_as_fill:true,
  top_of_book_size_imbalance:true,
  visible_touch_size_not_full_depth:true,
  volume_is_not_liquidity_negative_control:true,
  low_visible_size_high_volatility_cross_stress:true,
  cross_symbol_quote_size_comparison_forbidden:true,
  sip_post_2025_11_03_sizes_treated_as_shares:true,
  capital_visible_touch_not_market_impact:true,
  no_silent_feed_fallback:true,
  missing_never_zero:true,
  live_trade_authority:false
}));
