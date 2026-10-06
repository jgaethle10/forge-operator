import fs from "node:fs";
import path from "node:path";

const SYMBOL="SOXX";
const NOTIONAL_USD=20;
const HOLD_MS=60000;
const OUTPUT=process.env.DAYTRADE_MARKETDATA_PAPER_OUTPUT ||
  "artifacts/daytrade-edge/marketdata-paper-roundtrip-2026-10-06.json";

function clean(v){return String(v??"").trim();}
function finite(v){
  if(v===null||v===undefined||v==="") return null;
  const n=Number(v);
  return Number.isFinite(n)?n:null;
}
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
function headers(key,secret){
  return {
    "APCA-API-KEY-ID":key,
    "APCA-API-SECRET-KEY":secret,
    accept:"application/json",
  };
}
async function latestQuote({key,secret}){
  const url=new URL(
    "https://data.alpaca.markets/v2/stocks/"+SYMBOL+"/quotes/latest"
  );
  url.searchParams.set("feed","iex");
  const r=await fetch(url,{method:"GET",headers:headers(key,secret)});
  if(!r.ok) throw new Error("marketdata_paper_quote_http_"+r.status);
  const p=await r.json();
  const q=p?.quote||p?.quotes?.[SYMBOL]||null;
  const bid=finite(q?.bp??q?.bid_price);
  const ask=finite(q?.ap??q?.ask_price);
  if(!(bid>0)||!(ask>0)||ask<bid){
    throw new Error("marketdata_paper_quote_invalid");
  }
  const midpoint=(bid+ask)/2;
  return {
    timestamp:clean(q?.t??q?.timestamp)||new Date().toISOString(),
    bid,
    ask,
    midpoint,
    spread:ask-bid,
    spread_bps:midpoint>0?((ask-bid)/midpoint)*10000:null,
    feed:"iex",
  };
}

async function main(){
  const key=process.env.ALPACA_TRADING;
  const secret=process.env.ALPACA_TRADING_SECRET;
  if(!key||!secret) throw new Error("marketdata_paper_credentials_missing");

  const entryDecisionTime=new Date().toISOString();
  const entry=await latestQuote({key,secret});
  const simulatedEntryPrice=entry.ask;
  const simulatedQty=NOTIONAL_USD/simulatedEntryPrice;
  const midpointEntryValue=simulatedQty*entry.midpoint;
  const entrySpreadDragUsd=NOTIONAL_USD-midpointEntryValue;

  await sleep(HOLD_MS);

  const exitDecisionTime=new Date().toISOString();
  const exit=await latestQuote({key,secret});
  const simulatedExitPrice=exit.bid;
  const exitNotional=simulatedQty*simulatedExitPrice;
  const grossPnlUsd=exitNotional-NOTIONAL_USD;
  const grossReturnPct=(grossPnlUsd/NOTIONAL_USD)*100;
  const midpointMarkedExitValue=simulatedQty*exit.midpoint;
  const midpointMovePnlUsd=midpointMarkedExitValue-midpointEntryValue;
  const exitSpreadDragUsd=midpointMarkedExitValue-exitNotional;
  const totalObservedSpreadDragUsd=entrySpreadDragUsd+exitSpreadDragUsd;

  const receipt={
    schema:"evercraft.daytrade.marketdata-paper-roundtrip.v1",
    generated_at:new Date().toISOString(),
    simulation_only:true,
    broker_order_submitted:false,
    live_order_submitted:false,
    capital_at_risk_usd:0,
    requested_simulated_notional_usd:NOTIONAL_USD,
    symbol:SYMBOL,
    side:"long",
    hold_ms:HOLD_MS,
    frozen_protocol_reference:{
      signal_key:"ai_models|sec_8_k|SOXX|1d",
      cohort_id:"edgepaper_29a22b58b874a6e2e67f",
      learned_direction:"POSITIVE_EXCESS_RETURN",
      protocol_hash:"29a22b58b874a6e2e67f335ce623907533236a0661661fbca5f51a593a80a50a",
      protocol_live_trade_authority:false,
    },
    entry:{
      decision_time:entryDecisionTime,
      quote:entry,
      simulated_fill_rule:"marketable long entry at observed ask",
      simulated_fill_price:simulatedEntryPrice,
      simulated_quantity:simulatedQty,
      entry_spread_drag_usd_vs_midpoint:entrySpreadDragUsd,
    },
    exit:{
      decision_time:exitDecisionTime,
      quote:exit,
      simulated_fill_rule:"marketable long exit at observed bid",
      simulated_fill_price:simulatedExitPrice,
      simulated_exit_notional_usd:exitNotional,
      exit_spread_drag_usd_vs_midpoint:exitSpreadDragUsd,
    },
    result:{
      gross_pnl_usd:grossPnlUsd,
      gross_return_pct:grossReturnPct,
      midpoint_move_pnl_usd:midpointMovePnlUsd,
      total_observed_spread_drag_usd:totalObservedSpreadDragUsd,
      profitable:grossPnlUsd>0,
    },
    limitations:{
      iex_is_not_consolidated_sip_nbbo:true,
      simulated_touch_is_not_real_fill:true,
      queue_position_unobserved:true,
      market_impact_unobserved:true,
      hidden_liquidity_unobserved:true,
      broker_latency_unobserved:true,
      sixty_second_roundtrip_does_not_test_one_day_signal_profitability:true,
      purpose:"Zero-capital execution rehearsal using observed market data only.",
    },
    autonomous_live_order_authority:false,
    live_trade_authority:false,
  };

  fs.mkdirSync(path.dirname(OUTPUT),{recursive:true});
  fs.writeFileSync(OUTPUT,JSON.stringify(receipt,null,2)+"\n");
  console.log(JSON.stringify({
    ok:true,
    schema:receipt.schema,
    output:OUTPUT,
    symbol:SYMBOL,
    simulated_notional_usd:NOTIONAL_USD,
    hold_ms:HOLD_MS,
    entry_ask:simulatedEntryPrice,
    exit_bid:simulatedExitPrice,
    simulated_quantity:simulatedQty,
    gross_pnl_usd:grossPnlUsd,
    gross_return_pct:grossReturnPct,
    observed_spread_drag_usd:totalObservedSpreadDragUsd,
    capital_at_risk_usd:0,
    simulation_only:true,
  }));
}

main().catch((error)=>{
  console.error("Market-data paper roundtrip failed:",error?.message||String(error));
  process.exitCode=1;
});
