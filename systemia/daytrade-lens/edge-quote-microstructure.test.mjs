import assert from "node:assert/strict";
import {
  normalizeAlpacaQuote,
  quoteAtOrAfter,
  fetchAlpacaQuotes,
  buildQuoteMicrostructureTargets,
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

const report={
  evaluations:[{
    signal_key:"ai_models|sec_8_k|SOXX|1d",
    status:"RESEARCH_CANDIDATE",
  }],
  measurements:[{
    measurement_id:"m1",
    signal_key:"ai_models|sec_8_k|SOXX|1d",
    instrument:"SOXX",
    lag_key:"1d",
    observation_market_phase:"continuous_session",
    instrument_start_time:"2026-09-01T13:30:00.000Z",
    execution_delay_stress:{
      "5m":{instrument_start_time:"2026-09-01T13:35:00.000Z"},
      "15m":{instrument_start_time:"2026-09-01T13:45:00.000Z"},
    },
  }],
};
assert.equal(buildQuoteMicrostructureTargets(report).length,3);

const lab=await runQuoteMicrostructureLab(report,{
  key:"proof-key",
  secret:"proof-secret",
  feed:"iex",
  fetchImpl:async()=>({
    ok:true,
    json:async()=>({
      quotes:[
        {t:"2026-09-01T13:30:00.100Z",bp:99.9,ap:100.1,bs:10,as:11},
        {t:"2026-09-01T13:35:00.100Z",bp:99.95,ap:100.05,bs:12,as:12},
        {t:"2026-09-01T13:45:00.100Z",bp:99.98,ap:100.02,bs:14,as:13},
      ],
      next_page_token:null,
    }),
  }),
});
assert.equal(lab.status,"QUOTE_DATA_AVAILABLE");
assert.equal(lab.target_count,3);
assert.equal(lab.grouped_query_count,1);
assert.equal(lab.coverage,1);
assert.equal(lab.quote_scope,"iex_bbo_not_consolidated_nbbo");
assert.equal(lab.fallback_feed_used,false);
assert.equal(lab.interpretation.missing_is_never_zero,true);
assert.ok(lab.by_signal["ai_models|sec_8_k|SOXX|1d"].mean_spread_bps>0);
assert.equal(lab.live_trade_authority,false);

const partial=await runQuoteMicrostructureLab(report,{
  key:"proof-key",
  secret:"proof-secret",
  feed:"iex",
  fetchImpl:async()=>({
    ok:true,
    json:async()=>({
      quotes:[
        {t:"2026-09-01T13:30:00.100Z",bp:99.9,ap:100.1}
      ],
      next_page_token:null,
    }),
  }),
});
assert.equal(partial.status,"QUOTE_DATA_PARTIAL");
assert.equal(partial.quote_overlay_count,1);

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
  no_silent_feed_fallback:true,
  missing_never_zero:true,
  live_trade_authority:false
}));
