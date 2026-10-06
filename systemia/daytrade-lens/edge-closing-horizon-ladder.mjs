import fs from "node:fs";
import path from "node:path";

const SYMBOLS=["SOXX","SMH","QQQ"];
const HORIZONS_MS=[30000,60000,120000];
const NOTIONAL_USD=20;
const THRESHOLD_BPS=3;
const DATA_ORIGIN="https://data.alpaca.markets";
const OUTPUT=process.env.DAYTRADE_HORIZON_LADDER_OUTPUT ||
  "artifacts/daytrade-edge/closing-horizon-ladder-2026-10-06.json";

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
  const url=new URL(DATA_ORIGIN+"/v2/stocks/"+encodeURIComponent(symbol)+"/quotes/latest");
  if(url.origin!==DATA_ORIGIN) throw new Error("horizon_data_origin_guard_failed");
  url.searchParams.set("feed","iex");
  const r=await fetch(url,{method:"GET",headers:headers(key,secret)});
  if(!r.ok) throw new Error("horizon_quote_"+symbol+"_http_"+r.status);
  const p=await r.json();
  const q=p?.quote||p?.quotes?.[symbol]||null;
  const bid=finite(q?.bp??q?.bid_price);
  const ask=finite(q?.ap??q?.ask_price);
  if(!(bid>0)||!(ask>0)||ask<bid) throw new Error("horizon_quote_"+symbol+"_invalid");
  const midpoint=(bid+ask)/2;
  return {
    timestamp:clean(q?.t??q?.timestamp)||new Date().toISOString(),
    bid,ask,midpoint,
    spread_bps:((ask-bid)/midpoint)*10000,
    feed:"iex"
  };
}
async function snapshot({key,secret}){
  const observed_at=new Date().toISOString();
  return {
    observed_at,
    quotes:Object.fromEntries(
      await Promise.all(SYMBOLS.map(async s=>[s,await quote(s,{key,secret})]))
    )
  };
}
function measure(entry,exit){
  const qty=NOTIONAL_USD/entry.ask;
  const exitValue=qty*exit.bid;
  const entryMidValue=qty*entry.midpoint;
  const exitMidValue=qty*exit.midpoint;
  const pnl=exitValue-NOTIONAL_USD;
  const midpointMove=exitMidValue-entryMidValue;
  const spreadDrag=(NOTIONAL_USD-entryMidValue)+(exitMidValue-exitValue);
  return {
    simulated_quantity:qty,
    exit_value_usd:exitValue,
    marketable_pnl_usd:pnl,
    marketable_return_pct:pnl/NOTIONAL_USD*100,
    midpoint_move_pnl_usd:midpointMove,
    observed_spread_drag_usd:spreadDrag,
    decomposition_error_usd:pnl-(midpointMove-spreadDrag)
  };
}
async function main(){
  const key=process.env.ALPACA_TRADING;
  const secret=process.env.ALPACA_TRADING_SECRET;
  if(!key||!secret) throw new Error("horizon_credentials_missing");

  const entry=await snapshot({key,secret});
  const started=Date.now();
  const exits=[];
  let elapsed=0;
  for(const horizon of HORIZONS_MS){
    await sleep(Math.max(0,horizon-elapsed));
    elapsed=horizon;
    exits.push({horizon_ms:horizon,snapshot:await snapshot({key,secret})});
  }

  const rows=SYMBOLS.map(symbol=>{
    const eq=entry.quotes[symbol];
    return {
      symbol,
      entry_quote:eq,
      frozen_rule_decision:
        eq.spread_bps<=THRESHOLD_BPS
          ?"SIMULATE_MARKETABLE_LONG"
          :"ABSTAIN",
      horizons:exits.map(x=>({
        horizon_ms:x.horizon_ms,
        horizon_seconds:x.horizon_ms/1000,
        exit_quote:x.snapshot.quotes[symbol],
        ...measure(eq,x.snapshot.quotes[symbol])
      }))
    };
  });

  const receipt={
    schema:"evercraft.daytrade.closing-horizon-ladder.v1",
    generated_at:new Date().toISOString(),
    simulation_only:true,
    capital_at_risk_usd:0,
    broker_order_submitted:false,
    live_order_submitted:false,
    market_phase:"CLOSING",
    started_at:new Date(started).toISOString(),
    entry_snapshot:entry,
    horizons_ms:HORIZONS_MS,
    notional_per_symbol_usd:NOTIONAL_USD,
    frozen_threshold_bps:THRESHOLD_BPS,
    rows,
    interpretation:{
      same_entry_across_horizons:true,
      midpoint_move_separated_from_spread_drag:true,
      horizon_ladder_is_execution_practice_not_signal_validation:true,
      iex_is_not_consolidated_sip_nbbo:true
    },
    live_trade_authority:false
  };

  fs.mkdirSync(path.dirname(OUTPUT),{recursive:true});
  fs.writeFileSync(OUTPUT,JSON.stringify(receipt,null,2)+"\n");
  console.log(JSON.stringify({
    ok:true,output:OUTPUT,
    rows:rows.map(r=>({
      symbol:r.symbol,
      decision:r.frozen_rule_decision,
      entry_spread_bps:r.entry_quote.spread_bps,
      horizons:r.horizons.map(h=>({
        seconds:h.horizon_seconds,
        pnl_usd:h.marketable_pnl_usd,
        midpoint_move_pnl_usd:h.midpoint_move_pnl_usd,
        spread_drag_usd:h.observed_spread_drag_usd
      }))
    })),
    capital_at_risk_usd:0
  }));
}
main().catch(error=>{
  console.error("Closing horizon ladder failed:",error?.message||String(error));
  process.exitCode=1;
});
