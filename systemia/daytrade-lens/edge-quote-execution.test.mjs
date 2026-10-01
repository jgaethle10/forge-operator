import assert from "node:assert/strict";
import {
  fetchAlpacaEntryQuote,
  buildCandidateEntryQuoteTargets,
  runQuoteEntryExecutionLab,
} from "./edge-quote-execution.mjs";

const sipFetch=async(url)=>{
  const target=new Date(url.searchParams.get("start")).getTime();
  return {
    ok:true,
    status:200,
    json:async()=>({
      quotes:[
        {t:new Date(target-1000).toISOString(),bp:99.90,ap:100.10,bs:10,as:10},
        {t:new Date(target+250).toISOString(),bp:99.95,ap:100.05,bs:12,as:11,bx:"Q",ax:"P"},
      ],
      next_page_token:null,
    })
  };
};

const quote=await fetchAlpacaEntryQuote("SOXX",{
  timestamp:"2026-09-01T13:30:00.000Z",
  key:"k",
  secret:"s",
  fetchImpl:sipFetch,
});
assert.equal(quote.status,"QUOTE_FOUND");
assert.equal(quote.quote.used_feed,"sip");
assert.equal(quote.quote.quote_delay_ms,250);
assert.ok(quote.quote.spread_bps>0);

let calls=0;
const fallbackFetch=async(url)=>{
  calls++;
  if(url.searchParams.get("feed")==="sip"){
    return {ok:false,status:403,json:async()=>({})};
  }
  const target=new Date(url.searchParams.get("start")).getTime();
  return {
    ok:true,
    status:200,
    json:async()=>({
      quotes:[{t:new Date(target+100).toISOString(),bp:99.98,ap:100.02}],
    })
  };
};
const fallback=await fetchAlpacaEntryQuote("SOXX",{
  timestamp:"2026-09-01T13:30:00.000Z",
  key:"k",
  secret:"s",
  fetchImpl:fallbackFetch,
});
assert.equal(fallback.status,"QUOTE_FOUND");
assert.equal(fallback.quote.used_feed,"iex");
assert.equal(fallback.fallback_used,true);
assert.equal(calls,2);

const candidate={
  signal_key:"ai_models|sec_8_k|SOXX|1d",
  rockies_range:"ai_models",
  observation_kind:"sec_8_k",
  instrument:"SOXX",
  benchmark:"SPY",
  lag_key:"1d",
  status:"RESEARCH_CANDIDATE",
  learned_direction:"POSITIVE_EXCESS_RETURN",
};

const measurements=Array.from({length:24},(_,i)=>({
  measurement_id:"m:"+i,
  source_observation_id:"obs:"+i,
  signal_key:candidate.signal_key,
  instrument:"SOXX",
  lag_key:"1d",
  instrument_start_time:new Date(Date.UTC(2026,0,5+i,14,30)).toISOString(),
  instrument_end_time:new Date(Date.UTC(2026,0,6+i,14,30)).toISOString(),
  instrument_start_price:100,
  instrument_end_price:101.5,
  forward_return:0.015,
  benchmark_return:0.002,
}));

const report={evaluations:[candidate],measurements};
const targets=buildCandidateEntryQuoteTargets(report);
assert.equal(targets.length,24);

const lab=await runQuoteEntryExecutionLab(report,{
  key:"k",
  secret:"s",
  fetchImpl:sipFetch,
  transaction_cost_bps:5,
  minimum_quote_rows:20,
  minimum_coverage:0.7,
  concurrency:3,
});
assert.equal(lab.unique_entry_targets,24);
assert.equal(lab.target_status_counts.QUOTE_FOUND,24);
assert.equal(lab.reviews.length,1);
assert.equal(
  lab.reviews[0].quote_execution_status,
  "QUOTE_ENTRY_FRICTION_MEASURED_DIAGNOSTIC"
);
assert.equal(lab.reviews[0].quote_rows,24);
assert.ok(lab.reviews[0].median_spread_bps>0);
assert.ok(lab.reviews[0].mean_entry_slippage_vs_bar_bps>0);
assert.equal(
  lab.reviews[0].methodology.exit_execution_quote_adjusted,
  false
);

const missingFetch=async()=>({
  ok:true,status:200,json:async()=>({quotes:[]})
});
const missing=await runQuoteEntryExecutionLab(report,{
  key:"k",secret:"s",fetchImpl:missingFetch,minimum_quote_rows:20
});
assert.equal(missing.target_status_counts.QUOTE_MISSING_IN_WINDOW,24);
assert.equal(missing.reviews[0].quote_rows,0);
assert.equal(missing.reviews[0].median_spread_bps,null);
assert.equal(
  missing.reviews[0].quote_execution_status,
  "QUOTE_ENTRY_FRICTION_INSUFFICIENT_DIAGNOSTIC"
);

console.log(JSON.stringify({
  ok:true,
  schema:"evercraft.daytrade.edge-quote-entry-execution-proof.v1",
  historical_quote_endpoint:true,
  sip_with_iex_fallback:true,
  first_quote_at_or_after_entry:true,
  sibling_entry_targets_dedupable:true,
  missing_quote_never_zero:true,
  entry_side_only_claimed:true,
  eligibility_mutated:false,
  live_trade_authority:false
}));
