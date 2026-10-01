const ALPACA_HISTORICAL_QUOTES_URL =
  "https://data.alpaca.markets/v2/stocks";

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const out = Number(value);
  return Number.isFinite(out) ? out : null;
}

function mean(values) {
  const xs = values.filter(Number.isFinite);
  return xs.length ? xs.reduce((a,b)=>a+b,0)/xs.length : null;
}

function percentile(values,p) {
  const xs=values.filter(Number.isFinite).sort((a,b)=>a-b);
  if(!xs.length) return null;
  const index=Math.max(0,Math.min(xs.length-1,Math.floor((xs.length-1)*p)));
  return xs[index];
}

function expectedSign(candidate) {
  return candidate?.learned_direction === "NEGATIVE_EXCESS_RETURN" ? -1 : 1;
}

function targetKey(instrument,timestamp) {
  return String(instrument||"") + "|" + String(timestamp||"");
}

function validQuote(row,targetMs) {
  const bid=finite(row?.bp);
  const ask=finite(row?.ap);
  const timestamp=Date.parse(String(row?.t||""));
  return (
    Number.isFinite(timestamp) &&
    timestamp >= targetMs &&
    Number.isFinite(bid) &&
    Number.isFinite(ask) &&
    bid > 0 &&
    ask >= bid
  );
}

function normalizeQuote(row,{symbol,target,requestedFeed,usedFeed}) {
  const bid=finite(row.bp);
  const ask=finite(row.ap);
  const mid=(bid+ask)/2;
  const quoteMs=Date.parse(row.t);
  const targetMs=Date.parse(target);
  return {
    schema:"evercraft.daytrade.alpaca-entry-quote.v1",
    symbol,
    target_time:target,
    quote_time:row.t,
    quote_delay_ms:quoteMs-targetMs,
    bid_price:bid,
    ask_price:ask,
    bid_size:finite(row.bs),
    ask_size:finite(row.as),
    bid_exchange:row.bx || null,
    ask_exchange:row.ax || null,
    midpoint:mid,
    spread:ask-bid,
    spread_bps:mid>0?((ask-bid)/mid)*10000:null,
    requested_feed:requestedFeed,
    used_feed:usedFeed,
    evidence_state:"observed_historical_quote",
    live_trade_authority:false,
  };
}

async function queryQuoteWindow(symbol,{
  timestamp,
  key,
  secret,
  feed,
  fetchImpl,
  window_seconds,
}){
  const startMs=Date.parse(timestamp);
  if(!Number.isFinite(startMs)) throw new Error("quote_target_timestamp_invalid");
  const end=new Date(startMs+Math.max(1,Number(window_seconds||60))*1000).toISOString();
  const url=new URL(
    ALPACA_HISTORICAL_QUOTES_URL + "/" + encodeURIComponent(symbol) + "/quotes"
  );
  url.searchParams.set("start",timestamp);
  url.searchParams.set("end",end);
  url.searchParams.set("feed",feed);
  url.searchParams.set("sort","asc");
  url.searchParams.set("limit","10000");

  const response=await fetchImpl(url,{
    headers:{
      "APCA-API-KEY-ID":key,
      "APCA-API-SECRET-KEY":secret,
      accept:"application/json",
    }
  });
  if(!response.ok){
    return {
      ok:false,
      status:response.status,
      feed,
      error:"alpaca_quote_http_"+response.status,
    };
  }
  const payload=await response.json();
  const quotes=Array.isArray(payload?.quotes)?payload.quotes:[];
  const quote=quotes.find((row)=>validQuote(row,startMs)) || null;
  return {
    ok:true,
    status:response.status,
    feed,
    quote,
    result_count:quotes.length,
    next_page_token:payload?.next_page_token || null,
  };
}

export async function fetchAlpacaEntryQuote(symbol,{
  timestamp,
  key,
  secret,
  feed="sip",
  fallback_feed="iex",
  fetchImpl=fetch,
  window_seconds=60,
}={}){
  if(!key||!secret) throw new Error("edge_lab_alpaca_credentials_missing");
  const requestedFeed=String(feed||"sip");
  const feeds=[requestedFeed];
  if(
    fallback_feed &&
    fallback_feed!==requestedFeed
  ){
    feeds.push(String(fallback_feed));
  }

  const attempts=[];
  for(const candidateFeed of feeds){
    const result=await queryQuoteWindow(symbol,{
      timestamp,key,secret,feed:candidateFeed,fetchImpl,window_seconds
    });
    attempts.push({
      feed:candidateFeed,
      http_status:result.status,
      result_count:result.result_count ?? null,
      error:result.error || null,
    });
    if(result.ok && result.quote){
      return {
        status:"QUOTE_FOUND",
        quote:normalizeQuote(result.quote,{
          symbol,
          target:timestamp,
          requestedFeed,
          usedFeed:candidateFeed,
        }),
        attempts,
        fallback_used:candidateFeed!==requestedFeed,
        live_trade_authority:false,
      };
    }
    if(result.ok && !result.quote){
      return {
        status:"QUOTE_MISSING_IN_WINDOW",
        quote:null,
        attempts,
        fallback_used:candidateFeed!==requestedFeed,
        live_trade_authority:false,
      };
    }
    if(![403,422].includes(Number(result.status))){
      return {
        status:"QUOTE_FETCH_FAILED",
        quote:null,
        attempts,
        fallback_used:candidateFeed!==requestedFeed,
        live_trade_authority:false,
      };
    }
  }

  return {
    status:"QUOTE_FEED_UNAVAILABLE",
    quote:null,
    attempts,
    fallback_used:attempts.length>1,
    live_trade_authority:false,
  };
}

export function buildCandidateEntryQuoteTargets(report){
  const candidateSignals=new Set(
    (report?.evaluations||[])
      .filter((row)=>row.status==="RESEARCH_CANDIDATE")
      .map((row)=>row.signal_key)
  );
  const targets=new Map();
  for(const row of report?.measurements||[]){
    if(!candidateSignals.has(row.signal_key)) continue;
    if(!row.instrument||!row.instrument_start_time) continue;
    const key=targetKey(row.instrument,row.instrument_start_time);
    if(!targets.has(key)){
      targets.set(key,{
        target_key:key,
        instrument:row.instrument,
        timestamp:row.instrument_start_time,
        source_observation_ids:new Set(),
        signal_keys:new Set(),
      });
    }
    const target=targets.get(key);
    if(row.source_observation_id) target.source_observation_ids.add(row.source_observation_id);
    target.signal_keys.add(row.signal_key);
  }
  return [...targets.values()].map((row)=>({
    ...row,
    source_observation_ids:[...row.source_observation_ids].sort(),
    signal_keys:[...row.signal_keys].sort(),
  })).sort((a,b)=>
    new Date(a.timestamp)-new Date(b.timestamp) ||
    a.instrument.localeCompare(b.instrument)
  );
}

async function mapWithConcurrency(items,limit,fn){
  const out=new Array(items.length);
  let cursor=0;
  const workers=Array.from(
    {length:Math.max(1,Math.min(Number(limit||4),items.length||1))},
    async()=>{
      while(true){
        const index=cursor++;
        if(index>=items.length) return;
        out[index]=await fn(items[index],index);
      }
    }
  );
  await Promise.all(workers);
  return out;
}

function evaluateCandidateQuoteFriction(candidate,rows,quoteByTarget,{
  transaction_cost_bps=5,
  minimum_quote_rows=20,
  minimum_coverage=0.70,
}={}){
  const sign=expectedSign(candidate);
  const receipts=[];
  for(const row of rows){
    const target=quoteByTarget.get(targetKey(row.instrument,row.instrument_start_time));
    const quote=target?.quote || null;
    if(!quote) continue;

    const barStart=finite(row.instrument_start_price);
    const endPrice=finite(row.instrument_end_price);
    const benchmarkReturn=finite(row.benchmark_return);
    const marketableEntry=sign>0?quote.ask_price:quote.bid_price;
    if(
      !Number.isFinite(barStart) ||
      !Number.isFinite(endPrice) ||
      !Number.isFinite(benchmarkReturn) ||
      !Number.isFinite(marketableEntry) ||
      marketableEntry<=0
    ) continue;

    const barStrategyNet=
      sign*(Number(row.forward_return)-benchmarkReturn)-
      Number(transaction_cost_bps)/10000;
    const quoteEntryForward=endPrice/marketableEntry-1;
    const quoteEntryStrategyNet=
      sign*(quoteEntryForward-benchmarkReturn)-
      Number(transaction_cost_bps)/10000;
    const entrySlippageBps=
      sign*((marketableEntry-barStart)/barStart)*10000;

    receipts.push({
      measurement_id:row.measurement_id,
      source_observation_id:row.source_observation_id,
      instrument:row.instrument,
      lag_key:row.lag_key,
      quote_time:quote.quote_time,
      quote_delay_ms:quote.quote_delay_ms,
      used_feed:quote.used_feed,
      spread_bps:quote.spread_bps,
      bar_start_price:barStart,
      marketable_entry_price:marketableEntry,
      entry_slippage_vs_bar_bps:entrySlippageBps,
      bar_strategy_net:barStrategyNet,
      quote_entry_strategy_net_partial:quoteEntryStrategyNet,
      strategy_net_degradation_from_quote_entry:
        barStrategyNet-quoteEntryStrategyNet,
      exit_execution_not_quote_adjusted:true,
    });
  }

  const coverage=rows.length?receipts.length/rows.length:0;
  const spreadValues=receipts.map((row)=>row.spread_bps);
  const slippageValues=receipts.map((row)=>row.entry_slippage_vs_bar_bps);
  const degradation=receipts.map(
    (row)=>row.strategy_net_degradation_from_quote_entry
  );
  const quoteNet=receipts.map((row)=>row.quote_entry_strategy_net_partial);

  return {
    schema:"evercraft.daytrade.edge-quote-entry-execution-candidate.v1",
    signal_key:candidate.signal_key,
    cluster_key:[
      candidate.rockies_range,
      candidate.observation_kind,
      candidate.benchmark||"SPY",
    ].join("|"),
    learned_direction:candidate.learned_direction,
    measurement_rows:rows.length,
    quote_rows:receipts.length,
    quote_coverage:coverage,
    median_spread_bps:percentile(spreadValues,0.5),
    p90_spread_bps:percentile(spreadValues,0.9),
    mean_entry_slippage_vs_bar_bps:mean(slippageValues),
    mean_strategy_net_degradation_from_quote_entry:mean(degradation),
    mean_quote_entry_strategy_net_partial:mean(quoteNet),
    quote_execution_status:
      receipts.length>=minimum_quote_rows && coverage>=minimum_coverage
        ?"QUOTE_ENTRY_FRICTION_MEASURED_DIAGNOSTIC"
        :"QUOTE_ENTRY_FRICTION_INSUFFICIENT_DIAGNOSTIC",
    methodology:{
      entry_side_quote_adjusted:true,
      marketable_entry_policy:sign>0?"ask_for_long":"bid_for_short",
      exit_execution_quote_adjusted:false,
      benchmark_entry_quote_adjusted:false,
      no_missing_quote_as_zero:true,
      historical_exploratory_only:true,
    },
    receipts,
    eligibility_mutated:false,
    live_trade_authority:false,
  };
}

export async function runQuoteEntryExecutionLab(report,{
  key,
  secret,
  feed="sip",
  fallback_feed="iex",
  fetchImpl=fetch,
  window_seconds=60,
  concurrency=4,
  transaction_cost_bps=5,
  minimum_quote_rows=20,
  minimum_coverage=0.70,
}={}){
  const candidates=(report?.evaluations||[]).filter(
    (row)=>row.status==="RESEARCH_CANDIDATE"
  );
  const targets=buildCandidateEntryQuoteTargets(report);

  if(!candidates.length){
    return {
      schema:"evercraft.daytrade.edge-quote-entry-execution-lab.v1",
      generated_at:new Date().toISOString(),
      candidate_count:0,
      unique_entry_targets:0,
      target_status_counts:{},
      reviews:[],
      eligibility_mutated:false,
      live_trade_authority:false,
    };
  }

  if(!key||!secret){
    return {
      schema:"evercraft.daytrade.edge-quote-entry-execution-lab.v1",
      generated_at:new Date().toISOString(),
      candidate_count:candidates.length,
      unique_entry_targets:targets.length,
      status:"QUOTE_EXECUTION_CREDENTIALS_UNAVAILABLE",
      target_status_counts:{},
      reviews:[],
      evidence_state:"unavailable_not_zero",
      eligibility_mutated:false,
      live_trade_authority:false,
    };
  }

  const targetReceipts=await mapWithConcurrency(
    targets,
    concurrency,
    async(target)=>({
      ...target,
      ...(await fetchAlpacaEntryQuote(target.instrument,{
        timestamp:target.timestamp,
        key,
        secret,
        feed,
        fallback_feed,
        fetchImpl,
        window_seconds,
      }))
    })
  );

  const targetStatusCounts={};
  const quoteByTarget=new Map();
  for(const target of targetReceipts){
    targetStatusCounts[target.status]=Number(targetStatusCounts[target.status]||0)+1;
    quoteByTarget.set(target.target_key,target);
  }

  const reviews=candidates.map((candidate)=>
    evaluateCandidateQuoteFriction(
      candidate,
      (report?.measurements||[]).filter(
        (row)=>row.signal_key===candidate.signal_key
      ),
      quoteByTarget,
      {
        transaction_cost_bps,
        minimum_quote_rows,
        minimum_coverage,
      }
    )
  );

  const statusCounts={};
  for(const review of reviews){
    statusCounts[review.quote_execution_status]=
      Number(statusCounts[review.quote_execution_status]||0)+1;
  }

  return {
    schema:"evercraft.daytrade.edge-quote-entry-execution-lab.v1",
    generated_at:new Date().toISOString(),
    source:{
      provider:"Alpaca Market Data",
      endpoint_pattern:
        "https://data.alpaca.markets/v2/stocks/{symbol}/quotes",
      requested_feed:feed,
      fallback_feed,
      historical_quotes:true,
    },
    candidate_count:candidates.length,
    unique_entry_targets:targets.length,
    target_status_counts:targetStatusCounts,
    review_status_counts:statusCounts,
    target_receipts:targetReceipts,
    reviews,
    historical_diagnostic_only:true,
    historical_exploratory_only:true,
    eligibility_mutated:false,
    live_trade_authority:false,
  };
}
