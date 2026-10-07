import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {fetchAlpacaQuotes,quoteAtOrAfter} from "./edge-quote-microstructure.mjs";

const HERE=path.dirname(fileURLToPath(import.meta.url));
const RULE_PATH=path.join(HERE,"practice-rules","spread-abstention-v1.json");
const OUTPUT=process.env.DAYTRADE_OPENING_LADDER_OUTPUT ||
  "artifacts/daytrade-edge/opening-replay-ladder-2026-10-07.json";

const WINDOWS=[
  {label:"09:35",entry:"2026-10-07T13:35:00.000Z",exit:"2026-10-07T13:36:00.000Z"},
  {label:"09:45",entry:"2026-10-07T13:45:00.000Z",exit:"2026-10-07T13:46:00.000Z"},
  {label:"10:00",entry:"2026-10-07T14:00:00.000Z",exit:"2026-10-07T14:01:00.000Z"},
];
const QUERY_START="2026-10-07T13:34:55.000Z";
const QUERY_END="2026-10-07T14:01:35.000Z";

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
    pnl_usd:pnl,
    return_pct:pnl/notional*100,
  };
}

async function main(){
  const rule=JSON.parse(fs.readFileSync(RULE_PATH,"utf8"));
  const symbols=rule.symbols||[];
  const threshold=finite(rule?.entry_rule?.max_observed_entry_spread_bps);
  const notional=finite(rule.simulated_notional_usd);
  if(!symbols.length||!(threshold>0)||!(notional>0)){
    throw new Error("opening_ladder_rule_invalid");
  }
  const key=process.env.ALPACA_TRADING;
  const secret=process.env.ALPACA_TRADING_SECRET;
  if(!key||!secret) throw new Error("opening_ladder_credentials_missing");

  const quoteBook={};
  for(const symbol of symbols){
    quoteBook[symbol]=await fetchAlpacaQuotes(symbol,{
      start:QUERY_START,end:QUERY_END,key,secret,feed:"iex"
    });
  }

  const windows=WINDOWS.map(window=>{
    const rows=symbols.map(symbol=>{
      const entry=quoteAtOrAfter(quoteBook[symbol],window.entry,{max_delay_ms:30000});
      const exit=quoteAtOrAfter(quoteBook[symbol],window.exit,{max_delay_ms:30000});
      if(!entry||!exit) throw new Error("opening_ladder_quote_missing_"+symbol+"_"+window.label);
      const always=route(entry,exit,notional);
      const decision=entry.spread_bps<=threshold
        ?"SIMULATE_MARKETABLE_LONG"
        :"ABSTAIN";
      const governed=decision==="SIMULATE_MARKETABLE_LONG"
        ?{...always}
        :{pnl_usd:0,return_pct:0,abstained:true};
      return {
        symbol,
        entry_spread_bps:entry.spread_bps,
        decision,
        entry_quote_time:entry.t,
        exit_quote_time:exit.t,
        governed_pnl_usd:governed.pnl_usd,
        always_cross_pnl_usd:always.pnl_usd,
        avoided_pnl_usd:governed.pnl_usd-always.pnl_usd,
      };
    });
    const governed=sum(rows.map(x=>x.governed_pnl_usd));
    const always=sum(rows.map(x=>x.always_cross_pnl_usd));
    return {
      label:window.label,
      entry_target:window.entry,
      exit_target:window.exit,
      rows,
      aggregate:{
        governed_total_pnl_usd:governed,
        always_cross_total_pnl_usd:always,
        rule_improvement_vs_always_cross_usd:governed-always,
        traded_count:rows.filter(x=>x.decision==="SIMULATE_MARKETABLE_LONG").length,
        abstained_count:rows.filter(x=>x.decision==="ABSTAIN").length,
      },
    };
  });

  const improvements=windows.map(x=>x.aggregate.rule_improvement_vs_always_cross_usd);
  const receipt={
    schema:"evercraft.daytrade.opening-replay-ladder.v1",
    generated_at:new Date().toISOString(),
    market_date_et:"2026-10-07",
    market_phase_et:"OPENING",
    replay_only:true,
    counts_toward_prospective_diversity:false,
    frozen_rule_preceded_market_date:true,
    simulation_only:true,
    capital_at_risk_usd:0,
    feed:"iex",
    threshold_bps:threshold,
    windows,
    aggregate:{
      windows:windows.length,
      helped:improvements.filter(x=>x>0).length,
      hurt:improvements.filter(x=>x<0).length,
      neutral:improvements.filter(x=>x===0).length,
      cumulative_rule_improvement_usd:sum(improvements),
      cumulative_governed_pnl_usd:sum(windows.map(x=>x.aggregate.governed_total_pnl_usd)),
      cumulative_always_cross_pnl_usd:sum(windows.map(x=>x.aggregate.always_cross_total_pnl_usd)),
    },
    interpretation:{
      opening_timing_sensitivity_diagnostic:true,
      replay_only_not_prospective:true,
      no_rule_retuning:true,
      not_signal_validation:true,
      not_live_fill_validation:true,
      iex_is_not_consolidated_sip_nbbo:true,
      not_live_authorized:true,
    },
    live_trade_authority:false,
  };
  fs.mkdirSync(path.dirname(OUTPUT),{recursive:true});
  fs.writeFileSync(OUTPUT,JSON.stringify(receipt,null,2)+"\n");
  console.log(JSON.stringify({
    ok:true,
    aggregate:receipt.aggregate,
    windows:windows.map(x=>({
      label:x.label,
      improvement:x.aggregate.rule_improvement_vs_always_cross_usd,
      governed:x.aggregate.governed_total_pnl_usd,
      always:x.aggregate.always_cross_total_pnl_usd,
    })),
    capital_at_risk_usd:0
  }));
}
main().catch(error=>{
  console.error("Opening replay ladder failed:",error?.message||String(error));
  process.exitCode=1;
});
