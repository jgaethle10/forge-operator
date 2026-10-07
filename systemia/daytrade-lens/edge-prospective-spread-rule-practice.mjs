import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const HERE=path.dirname(fileURLToPath(import.meta.url));
const RULE_PATH=path.join(HERE,"practice-rules","spread-abstention-v1.json");
const OUTPUT=process.env.DAYTRADE_PROSPECTIVE_SPREAD_OUTPUT ||
  "artifacts/daytrade-edge/prospective-spread-rule-practice-2026-10-06-f.json";

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
  if(!r.ok) throw new Error("prospective_spread_quote_"+symbol+"_http_"+r.status);
  const p=await r.json();
  const q=p?.quote||p?.quotes?.[symbol]||null;
  const bid=finite(q?.bp??q?.bid_price);
  const ask=finite(q?.ap??q?.ask_price);
  if(!(bid>0)||!(ask>0)||ask<bid){
    throw new Error("prospective_spread_quote_"+symbol+"_invalid");
  }
  const midpoint=(bid+ask)/2;
  return {
    timestamp:clean(q?.t??q?.timestamp)||new Date().toISOString(),
    bid,ask,midpoint,
    spread_bps:((ask-bid)/midpoint)*10000,
    feed:"iex",
  };
}
async function snapshot(symbols,{key,secret}){
  const observed_at=new Date().toISOString();
  const pairs=await Promise.all(
    symbols.map(async symbol=>[symbol,await quote(symbol,{key,secret})])
  );
  return {observed_at,quotes:Object.fromEntries(pairs)};
}
function route(entry,exit,notional){
  const qty=notional/entry.ask;
  const exitValue=qty*exit.bid;
  const pnl=exitValue-notional;
  return {
    entry_ask:entry.ask,
    exit_bid:exit.bid,
    quantity:qty,
    exit_value_usd:exitValue,
    pnl_usd:pnl,
    return_pct:pnl/notional*100,
  };
}
function sum(xs){return xs.reduce((a,b)=>a+b,0);}

async function main(){
  const rule=JSON.parse(fs.readFileSync(RULE_PATH,"utf8"));
  if(rule?.schema!=="evercraft.daytrade.practice-rule.v1"){
    throw new Error("prospective_spread_rule_schema_invalid");
  }
  if(rule?.rule_id!=="spread-abstention-v1"){
    throw new Error("prospective_spread_rule_id_invalid");
  }
  const explicitFreeze=
    rule?.frozen_before_test===true ||
    rule?.frozen_before_first_prospective_window===true;
  if(explicitFreeze!==true||rule?.live_trade_authority!==false){
    throw new Error("prospective_spread_rule_authority_invalid");
  }
  const threshold=finite(rule?.entry_rule?.max_observed_entry_spread_bps);
  const symbols=Array.isArray(rule?.symbols)?rule.symbols:[];
  const notional=finite(rule?.simulated_notional_usd);
  const holdMs=finite(rule?.hold_ms);
  if(!(threshold>0)||!symbols.length||!(notional>0)||!(holdMs>0)){
    throw new Error("prospective_spread_rule_fields_invalid");
  }

  const key=process.env.ALPACA_TRADING;
  const secret=process.env.ALPACA_TRADING_SECRET;
  if(!key||!secret) throw new Error("prospective_spread_credentials_missing");

  const entry=await snapshot(symbols,{key,secret});
  const decisions=symbols.map(symbol=>({
    symbol,
    entry_spread_bps:entry.quotes[symbol].spread_bps,
    decision:
      entry.quotes[symbol].spread_bps<=threshold
        ?"SIMULATE_MARKETABLE_LONG"
        :"ABSTAIN",
    threshold_bps:threshold,
  }));

  await sleep(holdMs);
  const exit=await snapshot(symbols,{key,secret});

  const rows=decisions.map(decision=>{
    const alwaysCross=route(
      entry.quotes[decision.symbol],
      exit.quotes[decision.symbol],
      notional
    );
    const governed=
      decision.decision==="SIMULATE_MARKETABLE_LONG"
        ?{...alwaysCross}
        :{
            entry_ask:null,
            exit_bid:null,
            quantity:0,
            exit_value_usd:notional,
            pnl_usd:0,
            return_pct:0,
            abstained:true,
          };
    return {
      ...decision,
      entry_quote:entry.quotes[decision.symbol],
      exit_quote:exit.quotes[decision.symbol],
      governed_route:governed,
      always_cross_counterfactual:alwaysCross,
      avoided_pnl_usd:
        governed.pnl_usd-alwaysCross.pnl_usd,
    };
  });

  const governedTotal=sum(rows.map(x=>x.governed_route.pnl_usd));
  const alwaysCrossTotal=sum(rows.map(x=>x.always_cross_counterfactual.pnl_usd));
  const receipt={
    schema:"evercraft.daytrade.prospective-spread-rule-practice.v1",
    generated_at:new Date().toISOString(),
    window_start_at:entry.observed_at,
    window_end_at:exit.observed_at,
    configured_hold_ms:holdMs,
    decision_feed:"iex",
    market_data_provider:"alpaca",
    entry_quote_timestamps:Object.fromEntries(
      symbols.map(symbol=>[symbol,entry.quotes[symbol].timestamp])
    ),
    exit_quote_timestamps:Object.fromEntries(
      symbols.map(symbol=>[symbol,exit.quotes[symbol].timestamp])
    ),
    simulation_only:true,
    capital_at_risk_usd:0,
    broker_order_submitted:false,
    live_order_submitted:false,
    rule,
    entry_snapshot:entry,
    exit_snapshot:exit,
    rows,
    aggregate:{
      traded_count:rows.filter(x=>x.decision==="SIMULATE_MARKETABLE_LONG").length,
      abstained_count:rows.filter(x=>x.decision==="ABSTAIN").length,
      governed_total_pnl_usd:governedTotal,
      always_cross_total_pnl_usd:alwaysCrossTotal,
      rule_improvement_vs_always_cross_usd:
        governedTotal-alwaysCrossTotal,
    },
    interpretation:{
      rule_was_frozen_before_this_snapshot:true,
      no_threshold_retuning_after_observing_this_window:true,
      selected_from_same_day_prior_practice:true,
      not_independent_market_validation:true,
      not_signal_validation:true,
      iex_is_not_consolidated_sip_nbbo:true,
      decision_feed_is_explicitly_iex:true,
      delayed_sip_feed_portability_validation_required:true,
      iex_rule_must_not_be_assumed_equivalent_to_sip:true,
    },
    live_trade_authority:false,
  };

  fs.mkdirSync(path.dirname(OUTPUT),{recursive:true});
  fs.writeFileSync(OUTPUT,JSON.stringify(receipt,null,2)+"\n");
  console.log(JSON.stringify({
    ok:true,
    schema:receipt.schema,
    output:OUTPUT,
    threshold_bps:threshold,
    decisions:rows.map(x=>({
      symbol:x.symbol,
      spread_bps:x.entry_spread_bps,
      decision:x.decision,
      governed_pnl_usd:x.governed_route.pnl_usd,
      always_cross_pnl_usd:x.always_cross_counterfactual.pnl_usd,
      avoided_pnl_usd:x.avoided_pnl_usd,
    })),
    aggregate:receipt.aggregate,
    simulation_only:true,
    capital_at_risk_usd:0,
  }));
}
main().catch((error)=>{
  console.error("Prospective spread-rule practice failed:",error?.message||String(error));
  process.exitCode=1;
});
