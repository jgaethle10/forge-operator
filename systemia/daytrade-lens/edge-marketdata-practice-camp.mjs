import fs from "node:fs";
import path from "node:path";

const SYMBOLS=["SOXX","SMH","QQQ"];
const NOTIONAL_USD=20;
const DELAY_MS=30000;
const TOTAL_HOLD_MS=90000;
const OUTPUT=process.env.DAYTRADE_PRACTICE_OUTPUT ||
  "artifacts/daytrade-edge/practice-camp-2026-10-06-a.json";

function clean(v){return String(v??"").trim();}
function finite(v){
  if(v===null||v===undefined||v==="") return null;
  const n=Number(v);
  return Number.isFinite(n)?n:null;
}
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
function authHeaders(key,secret){
  return {
    "APCA-API-KEY-ID":key,
    "APCA-API-SECRET-KEY":secret,
    accept:"application/json",
  };
}
async function latestQuote(symbol,{key,secret}){
  const url=new URL(
    "https://data.alpaca.markets/v2/stocks/"+encodeURIComponent(symbol)+"/quotes/latest"
  );
  url.searchParams.set("feed","iex");
  const r=await fetch(url,{method:"GET",headers:authHeaders(key,secret)});
  if(!r.ok) throw new Error("practice_quote_"+symbol+"_http_"+r.status);
  const p=await r.json();
  const q=p?.quote||p?.quotes?.[symbol]||null;
  const bid=finite(q?.bp??q?.bid_price);
  const ask=finite(q?.ap??q?.ask_price);
  if(!(bid>0)||!(ask>0)||ask<bid){
    throw new Error("practice_quote_"+symbol+"_invalid");
  }
  const midpoint=(bid+ask)/2;
  return {
    timestamp:clean(q?.t??q?.timestamp)||new Date().toISOString(),
    bid,
    ask,
    midpoint,
    spread_bps:((ask-bid)/midpoint)*10000,
    feed:"iex",
  };
}
async function snapshot(label,{key,secret}){
  const observed_at=new Date().toISOString();
  const pairs=await Promise.all(
    SYMBOLS.map(async(symbol)=>[symbol,await latestQuote(symbol,{key,secret})])
  );
  return {
    label,
    observed_at,
    quotes:Object.fromEntries(pairs),
  };
}
function route(symbol,entryQuote,exitQuote){
  const entry=entryQuote.ask;
  const exit=exitQuote.bid;
  const qty=NOTIONAL_USD/entry;
  const exitValue=qty*exit;
  const pnl=exitValue-NOTIONAL_USD;
  const returnPct=pnl/NOTIONAL_USD*100;
  const entryMidValue=qty*entryQuote.midpoint;
  const exitMidValue=qty*exitQuote.midpoint;
  const midpointPnl=exitMidValue-entryMidValue;
  const entrySpreadDrag=NOTIONAL_USD-entryMidValue;
  const exitSpreadDrag=exitMidValue-exitValue;
  return {
    symbol,
    entry_ask:entry,
    exit_bid:exit,
    simulated_quantity:qty,
    simulated_exit_value_usd:exitValue,
    gross_pnl_usd:pnl,
    gross_return_pct:returnPct,
    midpoint_move_pnl_usd:midpointPnl,
    observed_spread_drag_usd:entrySpreadDrag+exitSpreadDrag,
    profitable:pnl>0,
  };
}
function mean(values){
  const xs=values.filter(Number.isFinite);
  return xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;
}

async function main(){
  const key=process.env.ALPACA_TRADING;
  const secret=process.env.ALPACA_TRADING_SECRET;
  if(!key||!secret) throw new Error("practice_credentials_missing");

  const t0=await snapshot("t0",{key,secret});
  await sleep(DELAY_MS);
  const t30=await snapshot("t30",{key,secret});
  await sleep(TOTAL_HOLD_MS-DELAY_MS);
  const t90=await snapshot("t90",{key,secret});

  const drills=SYMBOLS.map((symbol)=>{
    const immediate=route(symbol,t0.quotes[symbol],t90.quotes[symbol]);
    const delayed=route(symbol,t30.quotes[symbol],t90.quotes[symbol]);
    return {
      symbol,
      immediate_entry:immediate,
      delayed_30s_entry:delayed,
      delay_effect_usd:delayed.gross_pnl_usd-immediate.gross_pnl_usd,
      delay_effect_bps:
        ((delayed.gross_pnl_usd-immediate.gross_pnl_usd)/NOTIONAL_USD)*10000,
      same_profitability_sign:
        immediate.profitable===delayed.profitable,
    };
  });

  const immediatePnls=drills.map(x=>x.immediate_entry.gross_pnl_usd);
  const delayedPnls=drills.map(x=>x.delayed_30s_entry.gross_pnl_usd);
  const spreadCosts=drills.map(x=>x.immediate_entry.observed_spread_drag_usd);

  const receipt={
    schema:"evercraft.daytrade.marketdata-practice-camp.v1",
    generated_at:new Date().toISOString(),
    simulation_only:true,
    broker_order_submitted:false,
    live_order_submitted:false,
    capital_at_risk_usd:0,
    notional_per_drill_usd:NOTIONAL_USD,
    symbols:SYMBOLS,
    timing:{
      delay_entry_ms:DELAY_MS,
      common_exit_ms_from_t0:TOTAL_HOLD_MS,
    },
    snapshots:{t0,t30,t90},
    drills,
    aggregate:{
      mean_immediate_pnl_usd:mean(immediatePnls),
      mean_delayed_pnl_usd:mean(delayedPnls),
      immediate_profitable_count:drills.filter(x=>x.immediate_entry.profitable).length,
      delayed_profitable_count:drills.filter(x=>x.delayed_30s_entry.profitable).length,
      mean_immediate_observed_spread_drag_usd:mean(spreadCosts),
      mean_delay_effect_usd:mean(drills.map(x=>x.delay_effect_usd)),
    },
    lessons:{
      execution_timing_compared:true,
      spread_drag_measured:true,
      same_exit_used_for_immediate_and_delayed_entries:true,
      event_signal_not_triggered:true,
      arbitrary_midday_rehearsal_not_signal_validation:true,
      iex_is_not_consolidated_sip_nbbo:true,
      observed_quote_touch_not_real_fill:true,
      queue_position_unobserved:true,
      market_impact_unobserved:true,
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
    symbols:SYMBOLS,
    immediate:drills.map(x=>({
      symbol:x.symbol,
      pnl_usd:x.immediate_entry.gross_pnl_usd,
      return_pct:x.immediate_entry.gross_return_pct,
      spread_drag_usd:x.immediate_entry.observed_spread_drag_usd,
    })),
    delayed:drills.map(x=>({
      symbol:x.symbol,
      pnl_usd:x.delayed_30s_entry.gross_pnl_usd,
      return_pct:x.delayed_30s_entry.gross_return_pct,
      delay_effect_usd:x.delay_effect_usd,
    })),
    aggregate:receipt.aggregate,
    simulation_only:true,
    capital_at_risk_usd:0,
  }));
}
main().catch((error)=>{
  console.error("Practice camp failed:",error?.message||String(error));
  process.exitCode=1;
});
