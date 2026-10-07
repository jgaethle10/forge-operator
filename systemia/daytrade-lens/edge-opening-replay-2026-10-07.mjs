import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {
  fetchAlpacaQuotes,
  quoteAtOrAfter,
} from "./edge-quote-microstructure.mjs";

const HERE=path.dirname(fileURLToPath(import.meta.url));
const RULE_PATH=path.join(HERE,"practice-rules","spread-abstention-v1.json");
const OUTPUT=process.env.DAYTRADE_OPENING_REPLAY_OUTPUT ||
  "artifacts/daytrade-edge/opening-replay-2026-10-07.json";

const ENTRY_TARGET="2026-10-07T13:35:00.000Z";
const EXIT_TARGET="2026-10-07T13:36:00.000Z";
const QUERY_START="2026-10-07T13:34:55.000Z";
const QUERY_END="2026-10-07T13:36:35.000Z";

function finite(v){
  if(v===null||v===undefined||v==="") return null;
  const n=Number(v);
  return Number.isFinite(n)?n:null;
}
function sum(xs){return xs.reduce((a,b)=>a+b,0);}
function route(entry,exit,notional){
  const qty=notional/entry.ask_price;
  const exitValue=qty*exit.bid_price;
  const pnl=exitValue-notional;
  return {
    entry_ask:entry.ask_price,
    exit_bid:exit.bid_price,
    quantity:qty,
    exit_value_usd:exitValue,
    pnl_usd:pnl,
    return_pct:pnl/notional*100,
  };
}

async function main(){
  const rule=JSON.parse(fs.readFileSync(RULE_PATH,"utf8"));
  const threshold=finite(rule?.entry_rule?.max_observed_entry_spread_bps);
  const symbols=Array.isArray(rule?.symbols)?rule.symbols:[];
  const notional=finite(rule?.simulated_notional_usd);
  if(!(threshold>0)||!symbols.length||!(notional>0)){
    throw new Error("opening_replay_rule_invalid");
  }

  const key=process.env.ALPACA_TRADING;
  const secret=process.env.ALPACA_TRADING_SECRET;
  if(!key||!secret) throw new Error("opening_replay_credentials_missing");

  const rows=[];
  for(const symbol of symbols){
    const quotes=await fetchAlpacaQuotes(symbol,{
      start:QUERY_START,
      end:QUERY_END,
      key,
      secret,
      feed:"iex",
    });
    const entry=quoteAtOrAfter(quotes,ENTRY_TARGET,{max_delay_ms:30000});
    const exit=quoteAtOrAfter(quotes,EXIT_TARGET,{max_delay_ms:30000});
    if(!entry||!exit){
      throw new Error("opening_replay_quote_missing_"+symbol);
    }
    const always=route(entry,exit,notional);
    const decision=entry.spread_bps<=threshold
      ?"SIMULATE_MARKETABLE_LONG"
      :"ABSTAIN";
    const governed=decision==="SIMULATE_MARKETABLE_LONG"
      ?{...always}
      :{
          entry_ask:null,
          exit_bid:null,
          quantity:0,
          exit_value_usd:notional,
          pnl_usd:0,
          return_pct:0,
          abstained:true,
        };
    rows.push({
      symbol,
      entry_target:ENTRY_TARGET,
      exit_target:EXIT_TARGET,
      entry_quote:entry,
      exit_quote:exit,
      entry_spread_bps:entry.spread_bps,
      threshold_bps:threshold,
      decision,
      governed_route:governed,
      always_cross_counterfactual:always,
      avoided_pnl_usd:governed.pnl_usd-always.pnl_usd,
    });
  }

  const governedTotal=sum(rows.map(x=>x.governed_route.pnl_usd));
  const alwaysTotal=sum(rows.map(x=>x.always_cross_counterfactual.pnl_usd));
  const receipt={
    schema:"evercraft.daytrade.opening-replay-diagnostic.v1",
    generated_at:new Date().toISOString(),
    market_date_et:"2026-10-07",
    market_phase_et:"OPENING",
    replay_only:true,
    counts_toward_prospective_diversity:false,
    frozen_rule_preceded_market_date:true,
    simulation_only:true,
    capital_at_risk_usd:0,
    broker_order_submitted:false,
    live_order_submitted:false,
    feed:"iex",
    entry_target:ENTRY_TARGET,
    exit_target:EXIT_TARGET,
    rule,
    rows,
    aggregate:{
      traded_count:rows.filter(x=>x.decision==="SIMULATE_MARKETABLE_LONG").length,
      abstained_count:rows.filter(x=>x.decision==="ABSTAIN").length,
      governed_total_pnl_usd:governedTotal,
      always_cross_total_pnl_usd:alwaysTotal,
      rule_improvement_vs_always_cross_usd:governedTotal-alwaysTotal,
    },
    interpretation:{
      after_the_fact_market_replay:true,
      frozen_rule_was_not_retuned_for_this_date:true,
      not_counted_as_live_prospective_window:true,
      useful_for_opening_regime_diagnostic_only:true,
      iex_is_not_consolidated_sip_nbbo:true,
      historical_quote_touch_is_not_real_fill:true,
      not_signal_validation:true,
      not_live_authorized:true,
    },
    live_trade_authority:false,
  };

  fs.mkdirSync(path.dirname(OUTPUT),{recursive:true});
  fs.writeFileSync(OUTPUT,JSON.stringify(receipt,null,2)+"\n");
  console.log(JSON.stringify({
    ok:true,
    output:OUTPUT,
    aggregate:receipt.aggregate,
    rows:rows.map(x=>({
      symbol:x.symbol,
      spread_bps:x.entry_spread_bps,
      decision:x.decision,
      governed_pnl_usd:x.governed_route.pnl_usd,
      always_cross_pnl_usd:x.always_cross_counterfactual.pnl_usd,
    })),
    replay_only:true,
    capital_at_risk_usd:0,
  }));
}
main().catch(error=>{
  console.error("Opening replay failed:",error?.message||String(error));
  process.exitCode=1;
});
