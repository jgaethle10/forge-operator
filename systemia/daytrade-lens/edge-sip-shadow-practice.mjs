import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const HERE=path.dirname(fileURLToPath(import.meta.url));
const RULE_PATH=path.join(HERE,"practice-rules","spread-abstention-v1.json");
const OUTPUT=process.env.DAYTRADE_SIP_SHADOW_OUTPUT ||
  "artifacts/daytrade-edge/sip-shadow-practice-2026-10-07.json";
const HOLD_MS=60000;

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
async function latestQuote(symbol,feed,{key,secret}){
  const url=new URL(
    "https://data.alpaca.markets/v2/stocks/"+encodeURIComponent(symbol)+"/quotes/latest"
  );
  url.searchParams.set("feed",feed);
  const r=await fetch(url,{method:"GET",headers:headers(key,secret)});
  if(!r.ok){
    return {
      ok:false,
      http_status:r.status,
      feed,
      symbol,
    };
  }
  const p=await r.json();
  const q=p?.quote||p?.quotes?.[symbol]||null;
  const bid=finite(q?.bp??q?.bid_price);
  const ask=finite(q?.ap??q?.ask_price);
  if(!(bid>0)||!(ask>0)||ask<bid){
    return {ok:false,http_status:200,feed,symbol,invalid_quote:true};
  }
  const midpoint=(bid+ask)/2;
  return {
    ok:true,
    feed,
    symbol,
    timestamp:String(q?.t??q?.timestamp??new Date().toISOString()),
    bid,
    ask,
    midpoint,
    spread_bps:((ask-bid)/midpoint)*10000,
  };
}
function route(entry,exit,notional){
  if(!entry?.ok||!exit?.ok) return null;
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
async function snapshot(symbols,feeds,creds){
  const observed_at=new Date().toISOString();
  const rows=await Promise.all(
    symbols.flatMap(symbol=>
      feeds.map(async feed=>({
        symbol,
        feed,
        quote:await latestQuote(symbol,feed,creds),
      }))
    )
  );
  return {observed_at,rows};
}
function byKey(snapshot){
  return Object.fromEntries(
    snapshot.rows.map(x=>[x.symbol+"|"+x.feed,x.quote])
  );
}

async function main(){
  const rule=JSON.parse(fs.readFileSync(RULE_PATH,"utf8"));
  const threshold=finite(rule?.entry_rule?.max_observed_entry_spread_bps);
  const symbols=Array.isArray(rule?.symbols)?rule.symbols:[];
  const notional=finite(rule?.simulated_notional_usd);
  if(!(threshold>0)||!symbols.length||!(notional>0)){
    throw new Error("sip_shadow_rule_invalid");
  }
  const key=process.env.ALPACA_TRADING;
  const secret=process.env.ALPACA_TRADING_SECRET;
  if(!key||!secret) throw new Error("sip_shadow_credentials_missing");

  const feeds=["iex","sip"];
  const entry=await snapshot(symbols,feeds,{key,secret});
  await sleep(HOLD_MS);
  const exit=await snapshot(symbols,feeds,{key,secret});
  const e=byKey(entry), x=byKey(exit);

  const rows=symbols.map(symbol=>{
    const iexEntry=e[symbol+"|iex"];
    const sipEntry=e[symbol+"|sip"];
    const iexExit=x[symbol+"|iex"];
    const sipExit=x[symbol+"|sip"];
    const iexDecision=iexEntry?.ok
      ?(iexEntry.spread_bps<=threshold?"SIMULATE_MARKETABLE_LONG":"ABSTAIN")
      :"UNAVAILABLE";
    const sipDecision=sipEntry?.ok
      ?(sipEntry.spread_bps<=threshold?"SHADOW_TRADE":"SHADOW_ABSTAIN")
      :"UNAVAILABLE";
    return {
      symbol,
      threshold_bps:threshold,
      iex:{
        entry:iexEntry,
        exit:iexExit,
        decision:iexDecision,
        route:route(iexEntry,iexExit,notional),
      },
      sip_shadow:{
        entry:sipEntry,
        exit:sipExit,
        decision:sipDecision,
        route:route(sipEntry,sipExit,notional),
      },
      entry_spread_delta_bps:
        iexEntry?.ok&&sipEntry?.ok
          ?sipEntry.spread_bps-iexEntry.spread_bps
          :null,
      decision_agreement:
        iexEntry?.ok&&sipEntry?.ok
          ?((iexDecision==="SIMULATE_MARKETABLE_LONG")===
            (sipDecision==="SHADOW_TRADE"))
          :null,
    };
  });

  const sipAvailable=rows.every(x=>x.sip_shadow.entry?.ok&&x.sip_shadow.exit?.ok);
  const disagreementCount=rows.filter(x=>x.decision_agreement===false).length;
  const receipt={
    schema:"evercraft.daytrade.sip-shadow-practice.v1",
    generated_at:new Date().toISOString(),
    simulation_only:true,
    capital_at_risk_usd:0,
    broker_order_submitted:false,
    live_order_submitted:false,
    sip_available_for_all_symbols:sipAvailable,
    frozen_rule_feed_remains:"iex",
    sip_shadow_does_not_modify_frozen_rule:true,
    rule_threshold_bps:threshold,
    hold_ms:HOLD_MS,
    entry_snapshot_at:entry.observed_at,
    exit_snapshot_at:exit.observed_at,
    rows,
    aggregate:{
      decision_disagreement_count:disagreementCount,
      symbols_compared:rows.length,
      sip_available_for_all_symbols:sipAvailable,
    },
    interpretation:{
      sip_is_consolidated_feed_shadow_only:true,
      no_rule_retuning_from_shadow:true,
      do_not_count_as_prospective_spread_rule_window:true,
      sip_shadow_not_live_fill_validation:true,
      not_signal_validation:true,
      not_live_authorized:true,
    },
    live_trade_authority:false,
  };
  fs.mkdirSync(path.dirname(OUTPUT),{recursive:true});
  fs.writeFileSync(OUTPUT,JSON.stringify(receipt,null,2)+"\n");
  console.log(JSON.stringify({
    ok:true,
    sip_available_for_all_symbols:sipAvailable,
    decision_disagreement_count:disagreementCount,
    rows:rows.map(r=>({
      symbol:r.symbol,
      iex_entry_spread_bps:r.iex.entry?.spread_bps??null,
      sip_entry_spread_bps:r.sip_shadow.entry?.spread_bps??null,
      iex_decision:r.iex.decision,
      sip_shadow_decision:r.sip_shadow.decision,
      sip_http_status:r.sip_shadow.entry?.http_status??200,
    })),
    capital_at_risk_usd:0
  }));
}
main().catch(error=>{
  console.error("SIP shadow practice failed:",error?.message||String(error));
  process.exitCode=1;
});
