import fs from "node:fs";
import path from "node:path";

export const DATA_ORIGIN="https://data.alpaca.markets";
export const SYMBOLS=["SOXX","SMH","QQQ"];
export const NOTIONAL_USD=20;
export const FROZEN_SPREAD_THRESHOLD_BPS=3;
export const HOLD_MS=60000;
export const MAX_QUOTE_AGE_MS=120000;
export const FROZEN_RULE_SOURCE_COMMIT="c7e62faefb5afda1e4a6ab22a418015969342985";

const SCHEDULE_PHASES=new Map([
  ["45 13 * * 1-5","OPENING"],
  ["45 14 * * 1-5","OPENING"],
  ["30 17 * * 1-5","MIDDAY"],
  ["30 19 * * 1-5","CLOSING"],
  ["30 20 * * 1-5","CLOSING"],
]);

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
export function marketPhaseEt(timestamp=new Date()){
  const d=timestamp instanceof Date?timestamp:new Date(timestamp);
  if(!Number.isFinite(d.getTime())) return "UNKNOWN";
  const parts=Object.fromEntries(
    new Intl.DateTimeFormat("en-US",{
      timeZone:"America/New_York",
      weekday:"short",
      hour:"2-digit",
      minute:"2-digit",
      hourCycle:"h23",
    }).formatToParts(d)
      .filter(x=>x.type!=="literal")
      .map(x=>[x.type,x.value])
  );
  if(["Sat","Sun"].includes(parts.weekday)) return "WEEKEND";
  const minute=Number(parts.hour)*60+Number(parts.minute);
  if(minute>=570&&minute<630) return "OPENING";
  if(minute>=630&&minute<900) return "MIDDAY";
  if(minute>=900&&minute<960) return "CLOSING";
  return "OUTSIDE_CORE";
}
export function expectedPhaseForSchedule(schedule){
  const key=clean(schedule);
  return SCHEDULE_PHASES.get(key)||"AUTO";
}
export function buildDataUrl(symbol){
  const value=clean(symbol).toUpperCase();
  if(!/^[A-Z][A-Z0-9.\-]{0,14}$/.test(value)){
    throw new Error("practice_scheduler_symbol_invalid");
  }
  const url=new URL(
    DATA_ORIGIN+"/v2/stocks/"+encodeURIComponent(value)+"/quotes/latest"
  );
  url.searchParams.set("feed","iex");
  if(url.origin!==DATA_ORIGIN){
    throw new Error("practice_scheduler_data_origin_required");
  }
  return url;
}
async function latestQuote(symbol,{key,secret,fetchImpl=fetch}){
  const url=buildDataUrl(symbol);
  const r=await fetchImpl(url,{method:"GET",headers:authHeaders(key,secret)});
  if(!r.ok) throw new Error("practice_scheduler_quote_"+symbol+"_http_"+r.status);
  const p=await r.json();
  const q=p?.quote||p?.quotes?.[symbol]||null;
  const bid=finite(q?.bp??q?.bid_price);
  const ask=finite(q?.ap??q?.ask_price);
  const timestamp=clean(q?.t??q?.timestamp);
  const quoteMs=Date.parse(timestamp);
  if(!(bid>0)||!(ask>0)||ask<bid||!Number.isFinite(quoteMs)){
    throw new Error("practice_scheduler_quote_"+symbol+"_invalid");
  }
  const midpoint=(bid+ask)/2;
  return {
    timestamp,
    bid,ask,midpoint,
    spread_bps:((ask-bid)/midpoint)*10000,
    feed:"iex",
    age_ms:Date.now()-quoteMs,
  };
}
async function snapshot({key,secret,fetchImpl=fetch}){
  const observed_at=new Date().toISOString();
  const pairs=await Promise.all(
    SYMBOLS.map(async symbol=>[
      symbol,
      await latestQuote(symbol,{key,secret,fetchImpl})
    ])
  );
  return {observed_at,quotes:Object.fromEntries(pairs)};
}
function route(entry,exit){
  const qty=NOTIONAL_USD/entry.ask;
  const exitValue=qty*exit.bid;
  const pnl=exitValue-NOTIONAL_USD;
  return {
    entry_ask:entry.ask,
    exit_bid:exit.bid,
    simulated_quantity:qty,
    simulated_exit_value_usd:exitValue,
    pnl_usd:pnl,
    return_pct:pnl/NOTIONAL_USD*100,
  };
}
function writeReceipt(output,receipt){
  fs.mkdirSync(path.dirname(output),{recursive:true});
  fs.writeFileSync(output,JSON.stringify(receipt,null,2)+"\n");
}
export function staleSymbols(snapshot,maxAgeMs=MAX_QUOTE_AGE_MS){
  return SYMBOLS.filter(symbol=>{
    const age=finite(snapshot?.quotes?.[symbol]?.age_ms);
    return age===null||age<0||age>maxAgeMs;
  });
}

async function main(){
  const output=process.env.DAYTRADE_SCHEDULED_PRACTICE_OUTPUT ||
    "artifacts/daytrade-practice/receipt.json";
  const schedule=process.env.DAYTRADE_SCHEDULE_EXPR||"";
  const expected=expectedPhaseForSchedule(schedule);
  const now=new Date();
  const actual=marketPhaseEt(now);

  const base={
    schema:"evercraft.daytrade.scheduled-practice-receipt.v1",
    generated_at:now.toISOString(),
    schedule_expression:clean(schedule)||null,
    expected_market_phase_et:expected,
    actual_market_phase_et:actual,
    frozen_rule:{
      rule_id:"spread-abstention-v1",
      max_entry_spread_bps:FROZEN_SPREAD_THRESHOLD_BPS,
      source_commit:FROZEN_RULE_SOURCE_COMMIT,
    },
    simulation_only:true,
    capital_at_risk_usd:0,
    broker_order_submitted:false,
    live_order_submitted:false,
    allowed_network_origin:DATA_ORIGIN,
    live_trade_authority:false,
  };

  if(expected!=="AUTO"&&actual!==expected){
    const receipt={
      ...base,
      status:"SKIPPED_PHASE_MISMATCH",
      reason:"DST-safe paired cron did not land inside its intended ET market phase.",
    };
    writeReceipt(output,receipt);
    console.log(JSON.stringify(receipt));
    return;
  }
  if(!["OPENING","MIDDAY","CLOSING"].includes(actual)){
    const receipt={
      ...base,
      status:"SKIPPED_OUTSIDE_CORE_SESSION",
    };
    writeReceipt(output,receipt);
    console.log(JSON.stringify(receipt));
    return;
  }

  const key=process.env.ALPACA_TRADING;
  const secret=process.env.ALPACA_TRADING_SECRET;
  if(!key||!secret) throw new Error("practice_scheduler_credentials_missing");

  const entry=await snapshot({key,secret});
  const staleEntry=staleSymbols(entry);
  if(staleEntry.length){
    const receipt={
      ...base,
      status:"SKIPPED_STALE_OR_CLOSED_MARKET",
      stale_symbols:staleEntry,
      entry_snapshot:entry,
    };
    writeReceipt(output,receipt);
    console.log(JSON.stringify(receipt));
    return;
  }

  const decisions=SYMBOLS.map(symbol=>({
    symbol,
    entry_spread_bps:entry.quotes[symbol].spread_bps,
    decision:
      entry.quotes[symbol].spread_bps<=FROZEN_SPREAD_THRESHOLD_BPS
        ?"SIMULATE_MARKETABLE_LONG"
        :"ABSTAIN",
  }));

  await sleep(HOLD_MS);
  const exit=await snapshot({key,secret});
  const staleExit=staleSymbols(exit);
  if(staleExit.length){
    const receipt={
      ...base,
      status:"SKIPPED_STALE_OR_CLOSED_MARKET",
      stale_symbols:staleExit,
      entry_snapshot:entry,
      exit_snapshot:exit,
      decisions,
    };
    writeReceipt(output,receipt);
    console.log(JSON.stringify(receipt));
    return;
  }

  const rows=decisions.map(decision=>{
    const counterfactual=route(
      entry.quotes[decision.symbol],
      exit.quotes[decision.symbol]
    );
    const governed=decision.decision==="ABSTAIN"
      ?{
          entry_ask:null,
          exit_bid:null,
          simulated_quantity:0,
          simulated_exit_value_usd:NOTIONAL_USD,
          pnl_usd:0,
          return_pct:0,
          abstained:true,
        }
      :counterfactual;
    return {
      ...decision,
      governed_route:governed,
      always_cross_counterfactual:counterfactual,
      avoided_pnl_usd:governed.pnl_usd-counterfactual.pnl_usd,
    };
  });
  const sum=xs=>xs.reduce((a,b)=>a+b,0);
  const governed=sum(rows.map(x=>x.governed_route.pnl_usd));
  const always=sum(rows.map(x=>x.always_cross_counterfactual.pnl_usd));
  const receipt={
    ...base,
    status:"COMPLETED",
    hold_ms:HOLD_MS,
    notional_per_symbol_usd:NOTIONAL_USD,
    entry_snapshot:entry,
    exit_snapshot:exit,
    rows,
    aggregate:{
      traded_count:rows.filter(x=>x.decision==="SIMULATE_MARKETABLE_LONG").length,
      abstained_count:rows.filter(x=>x.decision==="ABSTAIN").length,
      governed_total_pnl_usd:governed,
      always_cross_total_pnl_usd:always,
      rule_improvement_vs_always_cross_usd:governed-always,
    },
    limitations:{
      market_data_only:true,
      iex_is_not_consolidated_sip_nbbo:true,
      observed_quote_touch_not_real_fill:true,
      broker_latency_unobserved:true,
      queue_position_unobserved:true,
      market_impact_unobserved:true,
      practice_not_signal_validation:true,
      practice_not_live_fill_validation:true,
    },
  };
  writeReceipt(output,receipt);
  console.log(JSON.stringify({
    ok:true,
    status:receipt.status,
    phase:actual,
    aggregate:receipt.aggregate,
    capital_at_risk_usd:0,
    live_trade_authority:false,
  }));
}

if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname)){
  main().catch(error=>{
    console.error("Scheduled practice failed:",error?.message||String(error));
    process.exitCode=1;
  });
}
