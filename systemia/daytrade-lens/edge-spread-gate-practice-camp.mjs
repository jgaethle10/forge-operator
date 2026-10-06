import fs from "node:fs";
import path from "node:path";

const SYMBOLS=["SOXX","SMH","QQQ"];
const THRESHOLDS_BPS=[0.5,1,2,3,5,7];
const NOTIONAL_USD=20;
const HOLD_MS=60000;
const OUTPUT=process.env.DAYTRADE_SPREAD_GATE_OUTPUT ||
  "artifacts/daytrade-edge/spread-gate-practice-2026-10-06-c.json";

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
  if(!r.ok) throw new Error("spread_gate_quote_"+symbol+"_http_"+r.status);
  const p=await r.json();
  const q=p?.quote||p?.quotes?.[symbol]||null;
  const bid=finite(q?.bp??q?.bid_price);
  const ask=finite(q?.ap??q?.ask_price);
  if(!(bid>0)||!(ask>0)||ask<bid){
    throw new Error("spread_gate_quote_"+symbol+"_invalid");
  }
  const midpoint=(bid+ask)/2;
  return {
    timestamp:clean(q?.t??q?.timestamp)||new Date().toISOString(),
    bid,ask,midpoint,
    spread_bps:((ask-bid)/midpoint)*10000,
    feed:"iex",
  };
}
function route(entry,exit){
  const qty=NOTIONAL_USD/entry.ask;
  const value=qty*exit.bid;
  return {
    entry_ask:entry.ask,
    exit_bid:exit.bid,
    quantity:qty,
    exit_value_usd:value,
    pnl_usd:value-NOTIONAL_USD,
    return_pct:(value-NOTIONAL_USD)/NOTIONAL_USD*100,
    entry_spread_bps:entry.spread_bps,
  };
}
function sum(xs){return xs.reduce((a,b)=>a+b,0);}
function mean(xs){return xs.length?sum(xs)/xs.length:null;}

async function main(){
  const key=process.env.ALPACA_TRADING;
  const secret=process.env.ALPACA_TRADING_SECRET;
  if(!key||!secret) throw new Error("spread_gate_credentials_missing");

  const entry=Object.fromEntries(
    await Promise.all(SYMBOLS.map(async s=>[s,await quote(s,{key,secret})]))
  );
  await sleep(HOLD_MS);
  const exit=Object.fromEntries(
    await Promise.all(SYMBOLS.map(async s=>[s,await quote(s,{key,secret})]))
  );

  const routes=SYMBOLS.map(symbol=>({
    symbol,
    entry_quote:entry[symbol],
    exit_quote:exit[symbol],
    marketable_route:route(entry[symbol],exit[symbol]),
  }));

  const alwaysCrossTotal=sum(routes.map(x=>x.marketable_route.pnl_usd));
  const grid=THRESHOLDS_BPS.map(threshold=>{
    const eligible=routes.filter(
      x=>x.entry_quote.spread_bps<=threshold
    );
    const skipped=routes.filter(
      x=>x.entry_quote.spread_bps>threshold
    );
    const pnls=eligible.map(x=>x.marketable_route.pnl_usd);
    return {
      max_entry_spread_bps:threshold,
      traded_symbols:eligible.map(x=>x.symbol),
      skipped_symbols:skipped.map(x=>x.symbol),
      traded_count:eligible.length,
      skipped_count:skipped.length,
      total_pnl_usd:sum(pnls),
      mean_pnl_usd:mean(pnls),
      avoided_always_cross_pnl_usd:
        alwaysCrossTotal-sum(pnls),
      interpretation:
        "Exploratory abstention grid only. Thresholds are not optimized or authorized as a live trading rule.",
    };
  });

  const receipt={
    schema:"evercraft.daytrade.spread-gate-practice-camp.v1",
    generated_at:new Date().toISOString(),
    simulation_only:true,
    capital_at_risk_usd:0,
    broker_order_submitted:false,
    live_order_submitted:false,
    notional_per_trade_usd:NOTIONAL_USD,
    hold_ms:HOLD_MS,
    thresholds_bps:THRESHOLDS_BPS,
    routes,
    always_cross:{
      total_pnl_usd:alwaysCrossTotal,
      mean_pnl_usd:mean(routes.map(x=>x.marketable_route.pnl_usd)),
    },
    threshold_grid:grid,
    lessons:{
      abstention_is_an_execution_choice:true,
      spread_gate_grid_not_optimized:true,
      same_sample_used_only_for_practice:true,
      arbitrary_midday_rehearsal_not_signal_validation:true,
      iex_is_not_consolidated_sip_nbbo:true,
      observed_quote_touch_not_real_fill:true,
    },
    live_trade_authority:false,
  };

  fs.mkdirSync(path.dirname(OUTPUT),{recursive:true});
  fs.writeFileSync(OUTPUT,JSON.stringify(receipt,null,2)+"\n");
  console.log(JSON.stringify({
    ok:true,
    schema:receipt.schema,
    output:OUTPUT,
    routes:routes.map(x=>({
      symbol:x.symbol,
      entry_spread_bps:x.entry_quote.spread_bps,
      pnl_usd:x.marketable_route.pnl_usd,
    })),
    always_cross:receipt.always_cross,
    threshold_grid:grid,
    simulation_only:true,
    capital_at_risk_usd:0,
  }));
}
main().catch((error)=>{
  console.error("Spread-gate practice failed:",error?.message||String(error));
  process.exitCode=1;
});
