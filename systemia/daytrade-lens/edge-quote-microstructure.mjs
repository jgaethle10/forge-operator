function clean(value){
  return String(value??"").trim();
}

const SIP_QUOTE_SIZE_SHARES_EFFECTIVE_DATE="2025-11-03";

function quoteSizeUnit(feed,timestamp){
  const normalized=clean(feed).toLowerCase();
  if(normalized==="sip"){
    const date=isoDate(timestamp);
    return date && date>=SIP_QUOTE_SIZE_SHARES_EFFECTIVE_DATE
      ?"shares"
      :"round_lots";
  }
  if(normalized==="iex") return "round_lots";
  return "unknown";
}

function sleep(ms){
  const delay=Math.max(0,Number(ms||0));
  return delay?new Promise((resolve)=>setTimeout(resolve,delay)):Promise.resolve();
}

function uniq(values){
  return [...new Set((values||[]).filter(Boolean))];
}

function finite(value){
  if(value===null||value===undefined||value==="") return null;
  const n=Number(value);
  return Number.isFinite(n)?n:null;
}
function expectedSign(direction){
  return direction==="NEGATIVE_EXCESS_RETURN"?-1:1;
}


function percentile(values,p){
  if(!values.length) return null;
  const sorted=[...values].sort((a,b)=>a-b);
  const index=Math.max(0,Math.min(sorted.length-1,Math.floor((sorted.length-1)*p)));
  return sorted[index];
}

function mean(values){
  return values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
}

function isoDate(timestamp){
  const date=new Date(timestamp);
  if(!Number.isFinite(date.getTime())) return null;
  return date.toISOString().slice(0,10);
}

export function normalizeAlpacaQuote(row){
  const timestamp=clean(row?.t||row?.timestamp);
  const bid=finite(row?.bp??row?.bid_price);
  const ask=finite(row?.ap??row?.ask_price);
  const bidSize=finite(row?.bs??row?.bid_size);
  const askSize=finite(row?.as??row?.ask_size);
  if(!timestamp||!Number.isFinite(new Date(timestamp).getTime())) return null;
  if(!(bid>0)||!(ask>0)||ask<bid) return null;
  const midpoint=(bid+ask)/2;
  const spread=ask-bid;
  return {
    t:new Date(timestamp).toISOString(),
    bid_price:bid,
    ask_price:ask,
    bid_size:bidSize,
    ask_size:askSize,
    bid_exchange:clean(row?.bx??row?.bid_exchange)||null,
    ask_exchange:clean(row?.ax??row?.ask_exchange)||null,
    conditions:Array.isArray(row?.c)?[...row.c]:[],
    tape:clean(row?.z??row?.tape)||null,
    midpoint,
    spread,
    spread_bps:midpoint>0?(spread/midpoint)*10000:null,
    half_spread_bps:midpoint>0?(spread/midpoint)*5000:null,
  };
}

export function quoteAtOrAfter(rows,timestamp,{
  max_delay_ms=30000,
}={}){
  const target=new Date(timestamp).getTime();
  if(!Number.isFinite(target)) return null;
  const normalized=(rows||[])
    .map(normalizeAlpacaQuote)
    .filter(Boolean)
    .sort((a,b)=>new Date(a.t)-new Date(b.t));
  let lo=0;
  let hi=normalized.length;
  while(lo<hi){
    const mid=(lo+hi)>>1;
    if(new Date(normalized[mid].t).getTime()<target) lo=mid+1;
    else hi=mid;
  }
  if(lo>=normalized.length) return null;
  const quote=normalized[lo];
  const delayMs=new Date(quote.t).getTime()-target;
  if(delayMs<0||delayMs>Number(max_delay_ms)) return null;
  return {
    ...quote,
    target_time:new Date(target).toISOString(),
    quote_delay_ms:delayMs,
    no_pre_target_quote_used:true,
  };
}

export async function fetchAlpacaQuotes(symbol,{
  start,
  end,
  key,
  secret,
  feed="iex",
  fetchImpl=fetch,
  max_pages=100,
}={}){
  if(!key||!secret) throw new Error("edge_quote_alpaca_credentials_missing");
  const normalizedFeed=clean(feed).toLowerCase();
  if(!["iex","sip"].includes(normalizedFeed)){
    throw new Error("edge_quote_feed_must_be_iex_or_sip");
  }
  const all=[];
  let pageToken=null;
  const seen=new Set();
  for(let page=0;page<max_pages;page++){
    const url=new URL(
      `https://data.alpaca.markets/v2/stocks/${encodeURIComponent(symbol)}/quotes`
    );
    url.searchParams.set("start",start);
    url.searchParams.set("end",end);
    url.searchParams.set("feed",normalizedFeed);
    url.searchParams.set("sort","asc");
    url.searchParams.set("limit","10000");
    if(pageToken) url.searchParams.set("page_token",pageToken);
    const response=await fetchImpl(url,{
      headers:{
        "APCA-API-KEY-ID":key,
        "APCA-API-SECRET-KEY":secret,
        accept:"application/json",
      }
    });
    if(!response.ok){
      const error=new Error(`edge_quote_alpaca_${symbol}_${normalizedFeed}_http_${response.status}`);
      error.status=response.status;
      throw error;
    }
    const payload=await response.json();
    if(Array.isArray(payload?.quotes)) all.push(...payload.quotes);
    const next=clean(payload?.next_page_token);
    if(!next) return all;
    if(seen.has(next)) throw new Error(`edge_quote_alpaca_${symbol}_pagination_loop`);
    seen.add(next);
    pageToken=next;
  }
  throw new Error(`edge_quote_alpaca_${symbol}_pagination_limit`);
}

export function normalizeAlpacaTrade(row){
  const timestamp=clean(row?.t||row?.timestamp);
  const price=finite(row?.p??row?.price);
  const size=finite(row?.s??row?.size);
  if(!timestamp||!Number.isFinite(new Date(timestamp).getTime())) return null;
  if(!(price>0)) return null;
  return {
    t:new Date(timestamp).toISOString(),
    price,
    size,
    exchange:clean(row?.x??row?.exchange)||null,
    conditions:Array.isArray(row?.c)?[...row.c]:[],
    tape:clean(row?.z??row?.tape)||null,
  };
}

export async function fetchAlpacaTrades(symbol,{
  start,
  end,
  key,
  secret,
  feed="iex",
  fetchImpl=fetch,
  max_pages=100,
}={}){
  if(!key||!secret) throw new Error("edge_trade_alpaca_credentials_missing");
  const normalizedFeed=clean(feed).toLowerCase();
  if(!["iex","sip"].includes(normalizedFeed)){
    throw new Error("edge_trade_feed_must_be_iex_or_sip");
  }
  const all=[];
  let pageToken=null;
  const seen=new Set();
  for(let page=0;page<max_pages;page++){
    const url=new URL(
      `https://data.alpaca.markets/v2/stocks/${encodeURIComponent(symbol)}/trades`
    );
    url.searchParams.set("start",start);
    url.searchParams.set("end",end);
    url.searchParams.set("feed",normalizedFeed);
    url.searchParams.set("sort","asc");
    url.searchParams.set("limit","10000");
    if(pageToken) url.searchParams.set("page_token",pageToken);
    const response=await fetchImpl(url,{
      headers:{
        "APCA-API-KEY-ID":key,
        "APCA-API-SECRET-KEY":secret,
        accept:"application/json",
      }
    });
    if(!response.ok){
      const error=new Error(`edge_trade_alpaca_${symbol}_${normalizedFeed}_http_${response.status}`);
      error.status=response.status;
      throw error;
    }
    const payload=await response.json();
    if(Array.isArray(payload?.trades)) all.push(...payload.trades);
    const next=clean(payload?.next_page_token);
    if(!next) return all;
    if(seen.has(next)) throw new Error(`edge_trade_alpaca_${symbol}_pagination_loop`);
    seen.add(next);
    pageToken=next;
  }
  throw new Error(`edge_trade_alpaca_${symbol}_pagination_limit`);
}

function passiveTouchEvidence(trades,quote,direction,{
  touch_window_ms=300000,
}={}){
  if(!quote) return null;
  const sign=expectedSign(direction);
  const quoteTime=new Date(quote.t).getTime();
  const passiveLimit=sign>0?finite(quote.bid_price):finite(quote.ask_price);
  if(!Number.isFinite(quoteTime)||!(passiveLimit>0)) return null;

  const normalized=(trades||[])
    .map(normalizeAlpacaTrade)
    .filter(Boolean)
    .filter((trade)=>{
      const time=new Date(trade.t).getTime();
      return time>=quoteTime && time<=quoteTime+Number(touch_window_ms);
    })
    .sort((a,b)=>new Date(a.t)-new Date(b.t));

  const firstTouch=normalized.find((trade)=>
    sign>0
      ?trade.price<=passiveLimit
      :trade.price>=passiveLimit
  )||null;

  return {
    passive_limit_price:passiveLimit,
    touch_window_ms:Number(touch_window_ms),
    observed_trade_count_in_window:normalized.length,
    passive_price_touch_observed:Boolean(firstTouch),
    first_touch_trade_time:firstTouch?.t||null,
    first_touch_trade_price:firstTouch?.price??null,
    touch_delay_ms:firstTouch
      ?new Date(firstTouch.t).getTime()-quoteTime
      :null,
    queue_position_observed:false,
    hypothetical_fill_claimed:false,
    interpretation:
      "A trade at or through the passive limit is necessary-but-not-sufficient evidence that a hypothetical order could have filled; queue priority and order-specific execution are unobserved.",
  };
}

function passiveTouchMarkouts(quotes,passiveEvidence,direction,{
  horizons_ms=[30000,60000],
  max_quote_delay_ms=30000,
}={}){
  const touchTime=passiveEvidence?.first_touch_trade_time;
  const limit=finite(passiveEvidence?.passive_limit_price);
  if(!touchTime||!(limit>0)) return {};
  const sign=expectedSign(direction);
  const base=new Date(touchTime).getTime();
  if(!Number.isFinite(base)) return {};
  const out={};
  for(const horizon of horizons_ms){
    const ms=Math.max(0,Number(horizon||0));
    const quote=quoteAtOrAfter(
      quotes,
      new Date(base+ms).toISOString(),
      {max_delay_ms:max_quote_delay_ms}
    );
    const midpoint=finite(quote?.midpoint);
    const key=Math.round(ms/1000)+"s";
    out[key]={
      target_time:new Date(base+ms).toISOString(),
      quote_time:quote?.t||null,
      midpoint,
      markout_bps:
        Number.isFinite(midpoint)&&limit>0
          ?sign*((midpoint-limit)/limit)*10000
          :null,
      interpretation:
        "Direction-adjusted midpoint move after the first public-tape touch. It is an adverse-selection diagnostic, not proof the hypothetical passive order filled.",
    };
  }
  return out;
}

function targetRowsForMeasurement(row,learnedDirection=null){
  const targets=[];
  if(row?.instrument_start_time){
    targets.push({
      label:"modeled_entry",
      timestamp:row.instrument_start_time,
      learned_direction:learnedDirection,
      instrument_start_price:finite(row.instrument_start_price),
      instrument_end_price:finite(row.instrument_end_price),
      forward_return:finite(row.forward_return),
      benchmark_return:finite(row.benchmark_return),
      instrument_start_volume:finite(row.instrument_start_volume),
      instrument_realized_volatility_5m:finite(row.instrument_realized_volatility_5m),
    });
  }
  if(row?.instrument_end_time){
    targets.push({
      label:"modeled_exit",
      timestamp:row.instrument_end_time,
      learned_direction:learnedDirection,
      instrument_start_price:finite(row.instrument_start_price),
      instrument_end_price:finite(row.instrument_end_price),
      forward_return:finite(row.forward_return),
      benchmark_return:finite(row.benchmark_return),
      instrument_start_volume:finite(row.instrument_start_volume),
      instrument_realized_volatility_5m:finite(row.instrument_realized_volatility_5m),
    });
  }
  for(const [key,value] of Object.entries(row?.execution_delay_stress||{})){
    const timestamp=value?.instrument_start_time;
    if(!timestamp) continue;
    targets.push({
      label:key==="next_session_open"?"next_session_open":`delay_${key}`,
      timestamp,
    });
  }
  const seen=new Set();
  return targets.filter((target)=>{
    const key=target.label+"|"+target.timestamp;
    if(seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildQuoteMicrostructureTargets(report,{
  signal_keys=null,
  direction_by_signal={},
}={}){
  const allowed=signal_keys?new Set(signal_keys):null;
  const candidateEvaluations=(report?.evaluations||[])
    .filter((row)=>row.status==="RESEARCH_CANDIDATE");
  const candidateKeys=new Set(candidateEvaluations.map((row)=>row.signal_key));
  const evaluationBySignal=new Map(
    candidateEvaluations.map((row)=>[row.signal_key,row])
  );
  const selected=(report?.measurements||[]).filter((row)=>
    allowed?allowed.has(row.signal_key):candidateKeys.has(row.signal_key)
  );
  return selected.flatMap((row)=>
    targetRowsForMeasurement(
      row,
      evaluationBySignal.get(row.signal_key)?.learned_direction ||
        direction_by_signal?.[row.signal_key] ||
        null
    ).map((target)=>({
      ...target,
      measurement_id:row.measurement_id,
      signal_key:row.signal_key,
      instrument:row.instrument,
      lag_key:row.lag_key,
      observation_market_phase:row.observation_market_phase||null,
    }))
  );
}

function groupTargets(targets,paddingSeconds){
  const map=new Map();
  for(const target of targets){
    const date=isoDate(target.timestamp);
    if(!date||!target.instrument) continue;
    const key=target.instrument+"|"+date;
    if(!map.has(key)) map.set(key,{
      symbol:target.instrument,
      date,
      targets:[],
    });
    map.get(key).targets.push(target);
  }
  return [...map.values()].map((group)=>{
    const times=group.targets.map((row)=>new Date(row.timestamp).getTime());
    const padding=Math.max(1,Number(paddingSeconds))*1000;
    return {
      ...group,
      start:new Date(Math.min(...times)-padding).toISOString(),
      end:new Date(Math.max(...times)+padding).toISOString(),
    };
  });
}

export function summarizeQuoteSignal(rows){
  const available=rows.filter((row)=>row.quote_available);
  const spreads=available.map((row)=>finite(row.spread_bps)).filter(Number.isFinite);
  const halfSpreads=available.map((row)=>finite(row.half_spread_bps)).filter(Number.isFinite);
  const modeledEntry=available.filter((row)=>
    row.label==="modeled_entry" &&
    Number.isFinite(finite(row.entry_slippage_vs_bar_bps))
  );
  const entrySlippage=modeledEntry
    .map((row)=>finite(row.entry_slippage_vs_bar_bps))
    .filter(Number.isFinite);
  const degradation=modeledEntry
    .map((row)=>finite(row.strategy_net_degradation_from_quote_entry))
    .filter(Number.isFinite);
  const quoteNet=modeledEntry
    .map((row)=>finite(row.quote_entry_strategy_net_partial))
    .filter(Number.isFinite);

  const instruments=uniq(modeledEntry.map((row)=>row.instrument).filter(Boolean));
  const singleInstrument=instruments.length===1;
  const visibleRows=singleInstrument
    ?modeledEntry.filter((row)=>
        row.quote_size_unit==="shares" &&
        Number.isFinite(finite(row.visible_touch_size_shares)) &&
        finite(row.visible_touch_size_shares)>0 &&
        Number.isFinite(finite(row.instrument_realized_volatility_5m))
      )
    :[];
  const visibleSizeMedian=percentile(
    visibleRows.map((row)=>finite(row.visible_touch_size_shares)),
    0.50
  );
  const volatilityMedian=percentile(
    visibleRows.map((row)=>finite(row.instrument_realized_volatility_5m)),
    0.50
  );
  const lowVisibleHighVol=visibleRows.filter((row)=>
    finite(row.visible_touch_size_shares)<=visibleSizeMedian &&
    finite(row.instrument_realized_volatility_5m)>=volatilityMedian
  );

  const volumeRows=singleInstrument
    ?modeledEntry.filter((row)=>
        Number.isFinite(finite(row.instrument_start_volume)) &&
        Number.isFinite(finite(row.spread_bps))
      )
    :[];
  const entryVolumeMedian=percentile(
    volumeRows.map((row)=>finite(row.instrument_start_volume)),
    0.50
  );
  const highVolumeRows=volumeRows.filter(
    (row)=>finite(row.instrument_start_volume)>=entryVolumeMedian
  );
  const lowVolumeRows=volumeRows.filter(
    (row)=>finite(row.instrument_start_volume)<entryVolumeMedian
  );

  const capitalRows=modeledEntry.filter((row)=>
    row.quote_size_unit==="shares" &&
    Number.isFinite(finite(row.marketable_touch_notional_usd)) &&
    finite(row.marketable_touch_notional_usd)>0
  );
  const capitalTiersUsd=[20,100,1000,5000,10000];
  const capitalVisibility=capitalTiersUsd.map((notional)=>({
    hypothetical_order_notional_usd:notional,
    observations:capitalRows.length,
    visible_touch_sufficient_rate:capitalRows.length
      ?capitalRows.filter(
          (row)=>finite(row.marketable_touch_notional_usd)>=notional
        ).length/capitalRows.length
      :null,
    median_order_to_visible_touch_ratio:percentile(
      capitalRows.map(
        (row)=>notional/finite(row.marketable_touch_notional_usd)
      ).filter(Number.isFinite),
      0.50
    ),
  }));

  return {
    target_count:rows.length,
    quote_count:available.length,
    coverage:rows.length?available.length/rows.length:0,
    mean_spread_bps:mean(spreads),
    median_spread_bps:percentile(spreads,0.50),
    p90_spread_bps:percentile(spreads,0.90),
    mean_half_spread_bps:mean(halfSpreads),
    modeled_entry_quote_count:modeledEntry.length,
    mean_entry_slippage_vs_bar_bps:mean(entrySlippage),
    mean_strategy_net_degradation_from_quote_entry:mean(degradation),
    mean_quote_entry_strategy_net_partial:mean(quoteNet),
    passive_touch_evaluable_count:modeledEntry.filter(
      (row)=>row.passive_touch_evidence_available===true
    ).length,
    passive_touch_rate:(()=>{
      const evaluable=modeledEntry.filter(
        (row)=>row.passive_touch_evidence_available===true
      );
      return evaluable.length
        ?evaluable.filter((row)=>row.passive_price_touch_observed===true).length/evaluable.length
        :null;
    })(),
    passive_outcome_states:Object.fromEntries(
      [...new Set(modeledEntry.map((row)=>row.passive_outcome_state).filter(Boolean))]
        .map((state)=>[
          state,
          modeledEntry.filter((row)=>row.passive_outcome_state===state).length,
        ])
    ),
    marketable_outcome_states:Object.fromEntries(
      [...new Set(modeledEntry.map((row)=>row.marketable_outcome_state).filter(Boolean))]
        .map((state)=>[
          state,
          modeledEntry.filter((row)=>row.marketable_outcome_state===state).length,
        ])
    ),
    partial_fill_probability_modeled:false,
    unfilled_probability_modeled:false,
    aggressive_vs_passive_bounds:(()=>{
      const evaluable=modeledEntry.filter(
        (row)=>row.passive_touch_evidence_available===true
      );
      const touched=evaluable.filter(
        (row)=>row.passive_price_touch_observed===true
      );
      const noTouch=evaluable.filter(
        (row)=>row.passive_price_touch_observed===false
      );
      const posted=evaluable
        .map((row)=>finite(row.posted_passive_price_improvement_bps))
        .filter(Number.isFinite);
      const touchBound=touched
        .map((row)=>finite(row.touch_supported_passive_price_improvement_upper_bound_bps))
        .filter(Number.isFinite);
      const markout30=touched
        .map((row)=>finite(row.passive_touch_markout_30s_bps))
        .filter(Number.isFinite);
      const markout60=touched
        .map((row)=>finite(row.passive_touch_markout_60s_bps))
        .filter(Number.isFinite);
      return {
        marketable_entry_observations:modeledEntry.length,
        passive_evaluable_observations:evaluable.length,
        passive_touch_observations:touched.length,
        passive_no_touch_observations:noTouch.length,
        passive_touch_rate:evaluable.length?touched.length/evaluable.length:null,
        mean_posted_passive_price_improvement_bps:mean(posted),
        mean_touch_supported_price_improvement_upper_bound_bps:mean(touchBound),
        mean_post_touch_markout_30s_bps:mean(markout30),
        mean_post_touch_markout_60s_bps:mean(markout60),
        status:
          evaluable.length>=8 && touched.length>=2 && noTouch.length>=2
            ?"AGGRESSIVE_PASSIVE_BOUNDS_READY"
            :"AGGRESSIVE_PASSIVE_BOUNDS_INSUFFICIENT",
        marketable_touch_is_observed_quote_not_realized_fill:true,
        passive_touch_is_not_fill:true,
        realized_passive_execution_comparison_claimed:false,
        queue_position_observed:false,
      };
    })(),
    median_passive_touch_delay_ms:percentile(
      modeledEntry
        .map((row)=>finite(row.passive_touch_delay_ms))
        .filter(Number.isFinite),
      0.50
    ),
    top_of_book_state:{
      instruments,
      single_instrument_required:true,
      quote_size_native_units_not_normalized_to_shares:true,
      cross_symbol_size_comparison_forbidden:true,
      observations:visibleRows.length,
      median_visible_touch_size:visibleSizeMedian,
      median_realized_volatility_5m:volatilityMedian,
      low_visible_size_high_volatility_count:lowVisibleHighVol.length,
      low_visible_size_high_volatility_mean_spread_bps:mean(
        lowVisibleHighVol.map((row)=>finite(row.spread_bps)).filter(Number.isFinite)
      ),
      low_visible_size_high_volatility_mean_quote_entry_strategy_net_partial:mean(
        lowVisibleHighVol
          .map((row)=>finite(row.quote_entry_strategy_net_partial))
          .filter(Number.isFinite)
      ),
      status:
        visibleRows.length>=8 && lowVisibleHighVol.length>=2
          ?"VISIBLE_TOUCH_SIZE_X_VOLATILITY_STRESS_READY"
          :"VISIBLE_TOUCH_SIZE_X_VOLATILITY_INSUFFICIENT",
      full_market_depth_claimed:false,
    },
    capital_scale_visibility:{
      observations:capitalRows.length,
      quote_size_unit_required:"shares",
      tiers:capitalVisibility,
      status:capitalRows.length>=8
        ?"CAPITAL_VISIBLE_TOUCH_DIAGNOSTIC_READY"
        :"CAPITAL_VISIBLE_TOUCH_DIAGNOSTIC_INSUFFICIENT",
      market_impact_modeled:false,
      full_depth_modeled:false,
      scale_invariance_claimed:false,
      interpretation:
        "Compares hypothetical order notional only with displayed marketable NBBO touch notional where quote size is explicitly in shares. It does not predict impact, hidden liquidity, replenishment, routing, or fill quality."
    },
    volume_is_not_liquidity_negative_control:{
      instruments,
      single_instrument_required:true,
      cross_symbol_volume_comparison_forbidden:true,
      observations:volumeRows.length,
      median_entry_bar_volume:entryVolumeMedian,
      high_volume_observations:highVolumeRows.length,
      low_volume_observations:lowVolumeRows.length,
      high_volume_mean_spread_bps:mean(
        highVolumeRows.map((row)=>finite(row.spread_bps)).filter(Number.isFinite)
      ),
      low_volume_mean_spread_bps:mean(
        lowVolumeRows.map((row)=>finite(row.spread_bps)).filter(Number.isFinite)
      ),
      high_volume_wide_spread_rate:(()=>{
        const overallMedianSpread=percentile(
          volumeRows.map((row)=>finite(row.spread_bps)).filter(Number.isFinite),
          0.50
        );
        if(!highVolumeRows.length || !Number.isFinite(overallMedianSpread)) return null;
        return highVolumeRows.filter(
          (row)=>finite(row.spread_bps)>=overallMedianSpread
        ).length/highVolumeRows.length;
      })(),
      status:volumeRows.length>=8
        ?"VOLUME_LIQUIDITY_NEGATIVE_CONTROL_READY"
        :"VOLUME_LIQUIDITY_NEGATIVE_CONTROL_INSUFFICIENT",
      volume_equated_with_liquidity:false,
    },
  };
}

export async function runQuoteMicrostructureLab(report,{
  key,
  secret,
  feed="iex",
  fetchImpl=fetch,
  signal_keys=null,
  direction_by_signal={},
  max_quote_delay_ms=30000,
  group_padding_seconds=30,
  transaction_cost_bps=5,
  passive_touch_window_ms=300000,
  passive_markout_horizons_ms=[30000,60000],
  passive_markout_max_quote_delay_ms=30000,
  request_interval_ms=0,
}={}){
  const targets=buildQuoteMicrostructureTargets(report,{
    signal_keys,
    direction_by_signal,
  });
  const maxPassiveMarkoutMs=Math.max(
    0,
    ...(passive_markout_horizons_ms||[]).map((value)=>Number(value||0))
  );
  const requiredPaddingSeconds=Math.max(
    Number(group_padding_seconds),
    Math.ceil(
      (Number(passive_touch_window_ms)+maxPassiveMarkoutMs+
        Number(passive_markout_max_quote_delay_ms))/1000
    )
  );
  const groups=groupTargets(targets,requiredPaddingSeconds);
  const quoteCache=new Map();
  const tradeCache=new Map();
  const errors=[];

  for(const group of groups){
    const cacheKey=group.symbol+"|"+group.date;
    try{
      const quotes=await fetchAlpacaQuotes(group.symbol,{
        start:group.start,
        end:group.end,
        key,
        secret,
        feed,
        fetchImpl,
      });
      quoteCache.set(cacheKey,quotes);
      await sleep(request_interval_ms);
    }catch(error){
      errors.push({
        kind:"quotes",
        symbol:group.symbol,
        date:group.date,
        start:group.start,
        end:group.end,
        error:error instanceof Error?error.message:String(error),
      });
      quoteCache.set(cacheKey,[]);
    }

    try{
      const trades=await fetchAlpacaTrades(group.symbol,{
        start:group.start,
        end:group.end,
        key,
        secret,
        feed,
        fetchImpl,
      });
      tradeCache.set(cacheKey,{available:true,trades});
      await sleep(request_interval_ms);
    }catch(error){
      errors.push({
        kind:"trades",
        symbol:group.symbol,
        date:group.date,
        start:group.start,
        end:group.end,
        error:error instanceof Error?error.message:String(error),
      });
      tradeCache.set(cacheKey,{available:false,trades:[]});
    }
  }

  const overlays=targets.map((target)=>{
    const date=isoDate(target.timestamp);
    const cacheKey=target.instrument+"|"+date;
    const quotes=quoteCache.get(cacheKey)||[];
    const tradeState=tradeCache.get(cacheKey)||{available:false,trades:[]};
    const quote=quoteAtOrAfter(quotes,target.timestamp,{max_delay_ms:max_quote_delay_ms});
    const passiveEvidence=
      target.label==="modeled_entry" && quote && tradeState.available
        ?passiveTouchEvidence(
            tradeState.trades,
            quote,
            target.learned_direction,
            {touch_window_ms:passive_touch_window_ms}
          )
        :null;
    const passiveMarkouts=
      passiveEvidence?.passive_price_touch_observed===true
        ?passiveTouchMarkouts(
            quotes,
            passiveEvidence,
            target.learned_direction,
            {
              horizons_ms:passive_markout_horizons_ms,
              max_quote_delay_ms:passive_markout_max_quote_delay_ms,
            }
          )
        :{};
    const sign=expectedSign(target.learned_direction);
    const barStart=finite(target.instrument_start_price);
    const barEnd=finite(target.instrument_end_price);
    const benchmarkReturn=finite(target.benchmark_return);
    const isModeledEntry=target.label==="modeled_entry";
    const isModeledExit=target.label==="modeled_exit";
    const executionSideSign=isModeledExit?-sign:sign;
    const marketableExecution=quote
      ?(executionSideSign>0?finite(quote.ask_price):finite(quote.bid_price))
      :null;
    const marketableEntry=isModeledEntry?marketableExecution:null;
    const marketableExit=isModeledExit?marketableExecution:null;
    const canPriceEntry=
      isModeledEntry &&
      Number.isFinite(barStart) &&
      Number.isFinite(barEnd) &&
      Number.isFinite(benchmarkReturn) &&
      Number.isFinite(marketableEntry) &&
      barStart>0 &&
      marketableEntry>0;
    const canPriceExit=
      isModeledExit &&
      Number.isFinite(barEnd) &&
      Number.isFinite(marketableExit) &&
      barEnd>0 &&
      marketableExit>0;
    const barStrategyNet=canPriceEntry
      ?sign*(Number(target.forward_return)-benchmarkReturn)-
        Number(transaction_cost_bps)/10000
      :null;
    const quoteEntryForward=canPriceEntry
      ?barEnd/marketableEntry-1
      :null;
    const quoteEntryStrategyNet=canPriceEntry
      ?sign*(quoteEntryForward-benchmarkReturn)-
        Number(transaction_cost_bps)/10000
      :null;
    const entrySlippageBps=canPriceEntry
      ?sign*((marketableEntry-barStart)/barStart)*10000
      :null;
    const exitSlippageBps=canPriceExit
      ?sign*((barEnd-marketableExit)/barEnd)*10000
      :null;
    const bidSize=quote?finite(quote.bid_size):null;
    const askSize=quote?finite(quote.ask_size):null;
    const visibleTouchSize=
      Number.isFinite(bidSize) && Number.isFinite(askSize)
        ?bidSize+askSize
        :null;
    const topOfBookSizeImbalance=
      Number.isFinite(bidSize) &&
      Number.isFinite(askSize) &&
      bidSize+askSize>0
        ?(bidSize-askSize)/(bidSize+askSize)
        :null;
    const sizeUnit=quote?quoteSizeUnit(feed,quote.t):null;
    const visibleTouchSizeShares=
      sizeUnit==="shares" ? visibleTouchSize : null;
    const marketableTouchSizeNative=quote
      ?(executionSideSign>0?askSize:bidSize)
      :null;
    const marketableTouchShares=
      sizeUnit==="shares" && Number.isFinite(marketableTouchSizeNative)
        ?marketableTouchSizeNative
        :null;
    const marketableTouchNotionalUsd=
      Number.isFinite(marketableTouchShares) &&
      Number.isFinite(marketableExecution)
        ?marketableTouchShares*marketableExecution
        :null;
    const passiveOutcomeState=
      target.label!=="modeled_entry"
        ?null
        :!quote || tradeState.available!==true
          ?"PASSIVE_OUTCOME_UNOBSERVED"
          :passiveEvidence?.passive_price_touch_observed===true
            ?"PASSIVE_PRICE_TOUCHED_FILL_UNDETERMINED"
            :"PASSIVE_NO_PRICE_TOUCH_OBSERVED_WITHIN_WINDOW";
    const marketableOutcomeState=
      !quote
        ?"MARKETABLE_EXECUTION_UNOBSERVED"
        :"MARKETABLE_TOUCH_OBSERVED_EXECUTION_NOT_VERIFIED";
    const passiveLimit=finite(passiveEvidence?.passive_limit_price);
    const postedPassivePriceImprovementBps=
      target.label==="modeled_entry" &&
      Number.isFinite(marketableEntry) &&
      marketableEntry>0 &&
      Number.isFinite(passiveLimit) &&
      passiveLimit>0
        ?sign*((marketableEntry-passiveLimit)/marketableEntry)*10000
        :null;
    const touchSupportedPassivePriceImprovementUpperBoundBps=
      passiveEvidence?.passive_price_touch_observed===true
        ?postedPassivePriceImprovementBps
        :null;
    return {
      schema:"evercraft.daytrade.edge-quote-overlay.v1",
      ...target,
      feed:clean(feed).toLowerCase(),
      quote_scope:clean(feed).toLowerCase()==="sip"
        ?"consolidated_sip_nbbo"
        :"iex_bbo_not_consolidated_nbbo",
      quote_available:Boolean(quote),
      ...(quote||{
        target_time:new Date(target.timestamp).toISOString(),
        bid_price:null,
        ask_price:null,
        bid_size:null,
        ask_size:null,
        midpoint:null,
        spread:null,
        spread_bps:null,
        half_spread_bps:null,
        quote_delay_ms:null,
        no_pre_target_quote_used:null,
      }),
      marketable_entry_price:canPriceEntry?marketableEntry:null,
      marketable_exit_price:canPriceExit?marketableExit:null,
      entry_slippage_vs_bar_bps:entrySlippageBps,
      exit_slippage_vs_bar_bps:exitSlippageBps,
      bar_strategy_net:barStrategyNet,
      quote_entry_strategy_net_partial:quoteEntryStrategyNet,
      strategy_net_degradation_from_quote_entry:
        canPriceEntry?barStrategyNet-quoteEntryStrategyNet:null,
      entry_execution_adjusted:canPriceEntry,
      exit_execution_quote_adjusted:false,
      benchmark_entry_quote_adjusted:false,
      visible_touch_size:visibleTouchSize,
      quote_size_unit:sizeUnit,
      visible_touch_size_shares:visibleTouchSizeShares,
      marketable_touch_size_native:marketableTouchSizeNative,
      marketable_touch_shares:marketableTouchShares,
      marketable_touch_notional_usd:marketableTouchNotionalUsd,
      top_of_book_size_imbalance:topOfBookSizeImbalance,
      direction_adjusted_top_of_book_imbalance:
        Number.isFinite(topOfBookSizeImbalance)
          ?sign*topOfBookSizeImbalance
          :null,
      full_market_depth_claimed:false,
      passive_touch_evidence_available:
        target.label==="modeled_entry" &&
        Boolean(quote) &&
        tradeState.available===true,
      passive_limit_price:passiveEvidence?.passive_limit_price??null,
      passive_price_touch_observed:
        passiveEvidence?.passive_price_touch_observed??null,
      passive_touch_delay_ms:passiveEvidence?.touch_delay_ms??null,
      passive_touch_trade_price:
        passiveEvidence?.first_touch_trade_price??null,
      passive_touch_trade_time:
        passiveEvidence?.first_touch_trade_time??null,
      passive_observed_trade_count_in_window:
        passiveEvidence?.observed_trade_count_in_window??null,
      passive_queue_position_observed:false,
      passive_hypothetical_fill_claimed:false,
      passive_outcome_state:passiveOutcomeState,
      marketable_outcome_state:marketableOutcomeState,
      posted_passive_price_improvement_bps:postedPassivePriceImprovementBps,
      touch_supported_passive_price_improvement_upper_bound_bps:
        touchSupportedPassivePriceImprovementUpperBoundBps,
      passive_touch_markouts:passiveMarkouts,
      passive_touch_markout_30s_bps:finite(passiveMarkouts?.["30s"]?.markout_bps),
      passive_touch_markout_60s_bps:finite(passiveMarkouts?.["60s"]?.markout_bps),
      realized_passive_execution_comparison_claimed:false,
      partial_fill_probability_modeled:false,
      unfilled_probability_modeled:false,
      passive_touch_interpretation:
        passiveEvidence?.interpretation||
        "Passive fill cannot be inferred without quote and historical trade evidence; queue position remains unobserved.",
      research_only:true,
      live_trade_authority:false,
    };
  });

  const overlaysByMeasurement=new Map();
  for(const row of overlays){
    if(!overlaysByMeasurement.has(row.measurement_id)){
      overlaysByMeasurement.set(row.measurement_id,[]);
    }
    overlaysByMeasurement.get(row.measurement_id).push(row);
  }
  const executionPairs=[];
  for(const [measurementId,rows] of overlaysByMeasurement.entries()){
    const entry=rows.find((row)=>row.label==="modeled_entry")||null;
    const exit=rows.find((row)=>row.label==="modeled_exit")||null;
    if(!entry&&!exit) continue;
    const direction=entry?.learned_direction||exit?.learned_direction||null;
    const sign=expectedSign(direction);
    const entryPrice=finite(entry?.marketable_entry_price);
    const exitPrice=finite(exit?.marketable_exit_price);
    const benchmarkReturn=finite(entry?.benchmark_return??exit?.benchmark_return);
    const canPrice=
      Number.isFinite(entryPrice) &&
      Number.isFinite(exitPrice) &&
      Number.isFinite(benchmarkReturn) &&
      entryPrice>0 &&
      exitPrice>0;
    const quoteForward=canPrice?exitPrice/entryPrice-1:null;
    const quoteStrategyNet=canPrice
      ?sign*(quoteForward-benchmarkReturn)-
        Number(transaction_cost_bps)/10000
      :null;
    const barStrategyNet=finite(entry?.bar_strategy_net);
    const entrySlip=finite(entry?.entry_slippage_vs_bar_bps);
    const exitSlip=finite(exit?.exit_slippage_vs_bar_bps);
    executionPairs.push({
      schema:"evercraft.daytrade.edge-two-sided-execution-pair.v1",
      measurement_id:measurementId,
      signal_key:entry?.signal_key||exit?.signal_key||null,
      instrument:entry?.instrument||exit?.instrument||null,
      lag_key:entry?.lag_key||exit?.lag_key||null,
      learned_direction:direction,
      feed:entry?.feed||exit?.feed||null,
      quote_scope:entry?.quote_scope||exit?.quote_scope||null,
      entry_quote_available:entry?.quote_available===true,
      exit_quote_available:exit?.quote_available===true,
      two_sided_quote_available:canPrice,
      marketable_entry_price:entryPrice,
      marketable_exit_price:exitPrice,
      quote_adjusted_forward_return:quoteForward,
      benchmark_return:benchmarkReturn,
      bar_strategy_net:barStrategyNet,
      quote_two_sided_strategy_net:quoteStrategyNet,
      strategy_net_degradation_from_two_sided_quotes:
        canPrice&&Number.isFinite(barStrategyNet)
          ?barStrategyNet-quoteStrategyNet
          :null,
      entry_slippage_vs_bar_bps:entrySlip,
      exit_slippage_vs_bar_bps:exitSlip,
      total_touch_slippage_vs_bar_bps:
        Number.isFinite(entrySlip)&&Number.isFinite(exitSlip)
          ?entrySlip+exitSlip
          :null,
      entry_quote_time:entry?.t||null,
      exit_quote_time:exit?.t||null,
      benchmark_execution_quote_adjusted:false,
      realized_fill_claimed:false,
      research_only:true,
      live_trade_authority:false,
    });
  }

  function summarizeExecutionPairs(rows){
    const priced=rows.filter((row)=>row.two_sided_quote_available===true);
    const degradation=priced
      .map((row)=>finite(row.strategy_net_degradation_from_two_sided_quotes))
      .filter(Number.isFinite);
    const quoteNet=priced
      .map((row)=>finite(row.quote_two_sided_strategy_net))
      .filter(Number.isFinite);
    const totalSlip=priced
      .map((row)=>finite(row.total_touch_slippage_vs_bar_bps))
      .filter(Number.isFinite);
    return {
      pair_count:rows.length,
      two_sided_quote_count:priced.length,
      two_sided_quote_coverage:rows.length?priced.length/rows.length:0,
      mean_quote_two_sided_strategy_net:mean(quoteNet),
      mean_strategy_net_degradation_from_two_sided_quotes:mean(degradation),
      median_total_touch_slippage_vs_bar_bps:percentile(totalSlip,0.50),
      p90_total_touch_slippage_vs_bar_bps:percentile(totalSlip,0.90),
      benchmark_execution_quote_adjusted:false,
      realized_fill_claimed:false,
    };
  }

  const bySignal={};
  for(const signal of uniq(overlays.map((row)=>row.signal_key))){
    bySignal[signal]={
      ...summarizeQuoteSignal(overlays.filter((row)=>row.signal_key===signal)),
      two_sided_execution:summarizeExecutionPairs(
        executionPairs.filter((row)=>row.signal_key===signal)
      ),
    };
  }
  const byLabel={};
  for(const label of uniq(overlays.map((row)=>row.label))){
    byLabel[label]=summarizeQuoteSignal(overlays.filter((row)=>row.label===label));
  }
  const quoteCount=overlays.filter((row)=>row.quote_available).length;
  const status=targets.length===0
    ?"QUOTE_TARGETS_EMPTY"
    :quoteCount===targets.length
      ?"QUOTE_DATA_AVAILABLE"
      :quoteCount>0
        ?"QUOTE_DATA_PARTIAL"
        :"QUOTE_DATA_UNAVAILABLE";

  return {
    schema:"evercraft.daytrade.edge-quote-microstructure-lab.v1",
    generated_at:new Date().toISOString(),
    feed:clean(feed).toLowerCase(),
    quote_scope:clean(feed).toLowerCase()==="sip"
      ?"consolidated_sip_nbbo"
      :"iex_bbo_not_consolidated_nbbo",
    fallback_feed_used:false,
    target_count:targets.length,
    grouped_query_count:groups.length,
    quote_overlay_count:quoteCount,
    coverage:targets.length?quoteCount/targets.length:0,
    status,
    errors,
    by_signal:bySignal,
    by_entry_label:byLabel,
    overlays,
    execution_pairs:executionPairs,
    two_sided_execution:summarizeExecutionPairs(executionPairs),
    interpretation:{
      full_spread_bps:"Quoted ask minus bid divided by midpoint.",
      half_spread_bps:"One-way midpoint-to-touch cost proxy only; not a realized fill or total implementation shortfall.",
      marketable_entry_price:"Ask for positive-direction candidates and bid for negative-direction candidates at modeled entry only.",
      quote_entry_strategy_net_partial:"Entry-side quote-adjusted strategy return using the existing bar exit and benchmark return; retained as a decomposition component.",
      quote_two_sided_strategy_net:"Instrument entry is priced at the marketable touch after the modeled entry timestamp and exit is priced at the opposite marketable touch after the modeled exit timestamp; benchmark execution remains bar-based.",
      exit_execution_quote_adjusted:true,
      benchmark_entry_quote_adjusted:false,
      passive_touch_evidence:"Trade-at-or-through evidence only. It is not a fill claim because queue position and order-specific execution are unobserved.",
      execution_outcome_states:"Explicit observed/unknown states are emitted for passive and marketable execution. No state is converted into a fill probability.",
      aggressive_vs_passive_bounds:"Immediate marketable touch is compared with posted passive price improvement, public-tape touch/no-touch evidence, time-to-touch and post-touch midpoint markouts. Passive fills remain unobserved and no expected fill value is claimed.",
      passive_touch_window_ms:Number(passive_touch_window_ms),
      visible_touch_size:"Sum of observed top-of-book bid and ask sizes in the provider's native quote-size units. This is not full market depth and is not compared across symbols.",
      sip_quote_size_units:"SIP quote size is treated as shares only on/after 2025-11-03 per Alpaca's CTA/UTP display-change notice; earlier SIP and IEX sizes remain native round-lot units and are excluded from share-notional scaling.",
      capital_scale_visibility:"Displayed NBBO touch notional only where size units are shares; never a market-impact or full-depth model.",
      top_of_book_size_imbalance:"(bid_size - ask_size) / (bid_size + ask_size) on the selected feed.",
      entry_bar_volume:"Activity measure only. It is never substituted for spread, visible touch size, impact, or fill probability.",
      missing_is_never_zero:true,
      sip_is_nbbo_only_when_feed_is_sip:true,
      iex_is_not_labeled_nbbo:true,
    },
    historical_diagnostic_only:true,
    historical_exploratory_only:true,
    eligibility_mutated:false,
    autonomous_order_authority:false,
    live_trade_authority:false,
  };
}
