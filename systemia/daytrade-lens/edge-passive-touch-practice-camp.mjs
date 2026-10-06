import fs from "node:fs";
import path from "node:path";

const SYMBOLS=["SOXX","SMH","QQQ"];
const NOTIONAL_USD=20;
const WINDOW_MS=90000;
const OUTPUT=process.env.DAYTRADE_PASSIVE_PRACTICE_OUTPUT ||
  "artifacts/daytrade-edge/passive-touch-practice-2026-10-06-b.json";

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
  if(!r.ok) throw new Error("passive_quote_"+symbol+"_http_"+r.status);
  const p=await r.json();
  const q=p?.quote||p?.quotes?.[symbol]||null;
  const bid=finite(q?.bp??q?.bid_price);
  const ask=finite(q?.ap??q?.ask_price);
  if(!(bid>0)||!(ask>0)||ask<bid){
    throw new Error("passive_quote_"+symbol+"_invalid");
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
async function trades(symbol,{key,secret,start,end}){
  const url=new URL(
    "https://data.alpaca.markets/v2/stocks/"+encodeURIComponent(symbol)+"/trades"
  );
  url.searchParams.set("feed","iex");
  url.searchParams.set("start",start);
  url.searchParams.set("end",end);
  url.searchParams.set("sort","asc");
  url.searchParams.set("limit","10000");
  const r=await fetch(url,{method:"GET",headers:authHeaders(key,secret)});
  if(!r.ok) throw new Error("passive_trades_"+symbol+"_http_"+r.status);
  const p=await r.json();
  return Array.isArray(p?.trades)?p.trades:[];
}
function tradePrice(row){return finite(row?.p??row?.price);}
function tradeTime(row){
  const raw=clean(row?.t??row?.timestamp);
  const d=new Date(raw);
  return Number.isFinite(d.getTime())?d.toISOString():null;
}
function marketableRoute(entryQuote,exitQuote){
  const qty=NOTIONAL_USD/entryQuote.ask;
  const exitValue=qty*exitQuote.bid;
  return {
    entry_price:entryQuote.ask,
    exit_price:exitQuote.bid,
    simulated_quantity:qty,
    exit_value_usd:exitValue,
    pnl_usd:exitValue-NOTIONAL_USD,
    return_pct:(exitValue-NOTIONAL_USD)/NOTIONAL_USD*100,
  };
}
function passiveUpperBound(entryQuote,exitQuote,touch){
  if(!touch) return null;
  const qty=NOTIONAL_USD/entryQuote.bid;
  const exitValue=qty*exitQuote.bid;
  return {
    hypothetical_entry_price:entryQuote.bid,
    exit_price:exitQuote.bid,
    hypothetical_quantity:qty,
    hypothetical_exit_value_usd:exitValue,
    hypothetical_pnl_usd:exitValue-NOTIONAL_USD,
    hypothetical_return_pct:(exitValue-NOTIONAL_USD)/NOTIONAL_USD*100,
    realized_fill_claimed:false,
  };
}
async function main(){
  const key=process.env.ALPACA_TRADING;
  const secret=process.env.ALPACA_TRADING_SECRET;
  if(!key||!secret) throw new Error("passive_practice_credentials_missing");

  const entries=Object.fromEntries(
    await Promise.all(SYMBOLS.map(async s=>[s,await latestQuote(s,{key,secret})]))
  );
  const startAt=new Date().toISOString();
  await sleep(WINDOW_MS);
  const exits=Object.fromEntries(
    await Promise.all(SYMBOLS.map(async s=>[s,await latestQuote(s,{key,secret})]))
  );
  const endAt=new Date().toISOString();

  const rows=[];
  for(const symbol of SYMBOLS){
    const entry=entries[symbol];
    const exit=exits[symbol];
    const tape=await trades(symbol,{
      key,secret,start:entry.timestamp,end:endAt
    });
    const normalized=tape
      .map(row=>({price:tradePrice(row),time:tradeTime(row)}))
      .filter(row=>Number.isFinite(row.price)&&row.time);
    const touch=normalized.find(row=>row.price<=entry.bid)||null;
    const marketable=marketableRoute(entry,exit);
    const passive=passiveUpperBound(entry,exit,touch);
    const passiveImprovementBps=
      ((entry.ask-entry.bid)/entry.ask)*10000;
    rows.push({
      symbol,
      entry_quote:entry,
      exit_quote:exit,
      public_trade_count:normalized.length,
      passive_limit_price:entry.bid,
      passive_price_touch_observed:Boolean(touch),
      first_touch_trade_time:touch?.time||null,
      first_touch_trade_price:touch?.price??null,
      touch_delay_ms:touch
        ?new Date(touch.time).getTime()-new Date(entry.timestamp).getTime()
        :null,
      passive_outcome_state:touch
        ?"PASSIVE_PRICE_TOUCHED_FILL_UNDETERMINED"
        :"PASSIVE_NO_PRICE_TOUCH_OBSERVED_WITHIN_WINDOW",
      marketable_route:marketable,
      passive_price_improvement_bps_vs_marketable_entry:
        passiveImprovementBps,
      touch_supported_passive_upper_bound:passive,
      queue_position_observed:false,
      passive_fill_claimed:false,
      partial_fill_probability_modeled:false,
    });
  }

  const receipt={
    schema:"evercraft.daytrade.passive-touch-practice-camp.v1",
    generated_at:new Date().toISOString(),
    simulation_only:true,
    broker_order_submitted:false,
    live_order_submitted:false,
    capital_at_risk_usd:0,
    notional_per_drill_usd:NOTIONAL_USD,
    window_ms:WINDOW_MS,
    start_at:startAt,
    end_at:endAt,
    rows,
    aggregate:{
      touch_count:rows.filter(x=>x.passive_price_touch_observed).length,
      no_touch_count:rows.filter(x=>!x.passive_price_touch_observed).length,
      mean_marketable_pnl_usd:
        rows.reduce((a,x)=>a+x.marketable_route.pnl_usd,0)/rows.length,
      touched_passive_upper_bound_mean_pnl_usd:(()=>{
        const xs=rows
          .map(x=>x.touch_supported_passive_upper_bound?.hypothetical_pnl_usd)
          .filter(Number.isFinite);
        return xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;
      })(),
    },
    lessons:{
      public_trade_touch_is_not_fill:true,
      passive_price_improvement_is_only_an_upper_bound_without_order_receipts:true,
      no_touch_is_a_real_execution_outcome:true,
      queue_position_unobserved:true,
      iex_is_not_consolidated_sip_nbbo:true,
      arbitrary_midday_rehearsal_not_signal_validation:true,
    },
    live_trade_authority:false,
  };

  fs.mkdirSync(path.dirname(OUTPUT),{recursive:true});
  fs.writeFileSync(OUTPUT,JSON.stringify(receipt,null,2)+"\n");

  console.log(JSON.stringify({
    ok:true,
    schema:receipt.schema,
    output:OUTPUT,
    rows:rows.map(x=>({
      symbol:x.symbol,
      passive_touch:x.passive_price_touch_observed,
      touch_delay_ms:x.touch_delay_ms,
      marketable_pnl_usd:x.marketable_route.pnl_usd,
      passive_improvement_bps:
        x.passive_price_improvement_bps_vs_marketable_entry,
      passive_upper_bound_pnl_usd:
        x.touch_supported_passive_upper_bound?.hypothetical_pnl_usd??null,
    })),
    aggregate:receipt.aggregate,
    simulation_only:true,
    capital_at_risk_usd:0,
  }));
}
main().catch((error)=>{
  console.error("Passive-touch practice failed:",error?.message||String(error));
  process.exitCode=1;
});
