import fs from "node:fs";
import path from "node:path";

const LONG_SYMBOLS=["SOXX","SMH","QQQ"];
const BENCHMARK="SPY";
const GROSS_NOTIONAL_USD=20;
const LEG_NOTIONAL_USD=10;
const HOLD_MS=60000;
const OUTPUT=process.env.DAYTRADE_RELATIVE_VALUE_OUTPUT ||
  "artifacts/daytrade-edge/relative-value-practice-2026-10-06-e.json";

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
async function quote(symbol,{key,secret}){
  const url=new URL(
    "https://data.alpaca.markets/v2/stocks/"+encodeURIComponent(symbol)+"/quotes/latest"
  );
  url.searchParams.set("feed","iex");
  const r=await fetch(url,{method:"GET",headers:headers(key,secret)});
  if(!r.ok) throw new Error("relative_value_quote_"+symbol+"_http_"+r.status);
  const p=await r.json();
  const q=p?.quote||p?.quotes?.[symbol]||null;
  const bid=finite(q?.bp??q?.bid_price);
  const ask=finite(q?.ap??q?.ask_price);
  if(!(bid>0)||!(ask>0)||ask<bid){
    throw new Error("relative_value_quote_"+symbol+"_invalid");
  }
  const midpoint=(bid+ask)/2;
  return {
    timestamp:clean(q?.t??q?.timestamp)||new Date().toISOString(),
    bid,ask,midpoint,
    spread_bps:((ask-bid)/midpoint)*10000,
    feed:"iex",
  };
}
async function snapshot({key,secret}){
  const symbols=[...LONG_SYMBOLS,BENCHMARK];
  const pairs=await Promise.all(
    symbols.map(async symbol=>[symbol,await quote(symbol,{key,secret})])
  );
  return {
    observed_at:new Date().toISOString(),
    quotes:Object.fromEntries(pairs),
  };
}
function longLeg(entry,exit,notional){
  const qty=notional/entry.ask;
  const exitValue=qty*exit.bid;
  const pnl=exitValue-notional;
  return {
    side:"long",
    entry_price:entry.ask,
    exit_price:exit.bid,
    quantity:qty,
    pnl_usd:pnl,
    return_on_leg_pct:pnl/notional*100,
  };
}
function shortLeg(entry,exit,notional){
  const qty=notional/entry.bid;
  const entryProceeds=qty*entry.bid;
  const coverCost=qty*exit.ask;
  const pnl=entryProceeds-coverCost;
  return {
    side:"short",
    entry_price:entry.bid,
    exit_price:exit.ask,
    quantity:qty,
    pnl_usd:pnl,
    return_on_leg_pct:pnl/notional*100,
  };
}
function nakedLong(entry,exit){
  return longLeg(entry,exit,GROSS_NOTIONAL_USD);
}

async function main(){
  const key=process.env.ALPACA_TRADING;
  const secret=process.env.ALPACA_TRADING_SECRET;
  if(!key||!secret) throw new Error("relative_value_credentials_missing");

  const entry=await snapshot({key,secret});
  await sleep(HOLD_MS);
  const exit=await snapshot({key,secret});

  const benchmarkShort=shortLeg(
    entry.quotes[BENCHMARK],
    exit.quotes[BENCHMARK],
    LEG_NOTIONAL_USD
  );

  const rows=LONG_SYMBOLS.map(symbol=>{
    const long=longLeg(
      entry.quotes[symbol],
      exit.quotes[symbol],
      LEG_NOTIONAL_USD
    );
    const pairPnl=long.pnl_usd+benchmarkShort.pnl_usd;
    const naked=nakedLong(entry.quotes[symbol],exit.quotes[symbol]);
    const longMidBps=
      ((exit.quotes[symbol].midpoint-entry.quotes[symbol].midpoint)/
        entry.quotes[symbol].midpoint)*10000;
    const spyMidBps=
      ((exit.quotes[BENCHMARK].midpoint-entry.quotes[BENCHMARK].midpoint)/
        entry.quotes[BENCHMARK].midpoint)*10000;
    return {
      signal_symbol:symbol,
      benchmark:BENCHMARK,
      gross_notional_usd:GROSS_NOTIONAL_USD,
      long_leg_notional_usd:LEG_NOTIONAL_USD,
      short_leg_notional_usd:LEG_NOTIONAL_USD,
      long_leg:long,
      short_benchmark_leg:{...benchmarkShort},
      pair_pnl_usd:pairPnl,
      pair_return_on_gross_pct:pairPnl/GROSS_NOTIONAL_USD*100,
      naked_long_20usd:naked,
      hedge_effect_vs_naked_usd:pairPnl-naked.pnl_usd,
      midpoint_relative_move_bps:longMidBps-spyMidBps,
      long_midpoint_move_bps:longMidBps,
      benchmark_midpoint_move_bps:spyMidBps,
    };
  });

  const receipt={
    schema:"evercraft.daytrade.relative-value-practice-camp.v1",
    generated_at:new Date().toISOString(),
    simulation_only:true,
    capital_at_risk_usd:0,
    broker_order_submitted:false,
    live_order_submitted:false,
    hold_ms:HOLD_MS,
    gross_notional_per_pair_usd:GROSS_NOTIONAL_USD,
    leg_notional_usd:LEG_NOTIONAL_USD,
    entry_snapshot:entry,
    exit_snapshot:exit,
    rows,
    lessons:{
      frozen_edge_is_relative_to_spy_not_absolute_direction:true,
      pair_execution_requires_crossing_two_books:true,
      naked_long_and_relative_pair_are_not_equivalent:true,
      midpoint_relative_move_separated_from_execution_cost:true,
      arbitrary_intraday_rehearsal_not_one_day_signal_validation:true,
      short_leg_is_simulated_only:true,
      borrow_availability_and_short_locate_unobserved:true,
      iex_is_not_consolidated_sip_nbbo:true,
    },
    live_trade_authority:false,
  };

  fs.mkdirSync(path.dirname(OUTPUT),{recursive:true});
  fs.writeFileSync(OUTPUT,JSON.stringify(receipt,null,2)+"\n");

  console.log(JSON.stringify({
    ok:true,
    schema:receipt.schema,
    output:OUTPUT,
    benchmark_short:benchmarkShort,
    rows:rows.map(x=>({
      symbol:x.signal_symbol,
      pair_pnl_usd:x.pair_pnl_usd,
      pair_return_on_gross_pct:x.pair_return_on_gross_pct,
      naked_long_pnl_usd:x.naked_long_20usd.pnl_usd,
      hedge_effect_vs_naked_usd:x.hedge_effect_vs_naked_usd,
      midpoint_relative_move_bps:x.midpoint_relative_move_bps,
    })),
    simulation_only:true,
    capital_at_risk_usd:0,
  }));
}
main().catch((error)=>{
  console.error("Relative-value practice failed:",error?.message||String(error));
  process.exitCode=1;
});
