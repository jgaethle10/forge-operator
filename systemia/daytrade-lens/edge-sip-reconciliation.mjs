import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {
  fetchAlpacaQuotes,
  quoteAtOrAfter,
} from "./edge-quote-microstructure.mjs";

const HERE=path.dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH=path.join(
  HERE,
  "practice-rules",
  "oct7-sip-reconciliation-manifest.json"
);
const OUTPUT=process.env.DAYTRADE_SIP_RECONCILIATION_OUTPUT ||
  "artifacts/daytrade-edge/sip-reconciliation-2026-10-07.json";

function finite(v){
  if(v===null||v===undefined||v==="") return null;
  const n=Number(v);
  return Number.isFinite(n)?n:null;
}
function sum(xs){return xs.reduce((a,b)=>a+b,0);}
function around(timestamp,beforeMs=1000,afterMs=5000){
  const t=new Date(timestamp).getTime();
  if(!Number.isFinite(t)) throw new Error("sip_reconciliation_timestamp_invalid");
  return {
    start:new Date(t-beforeMs).toISOString(),
    end:new Date(t+afterMs).toISOString(),
  };
}
async function sipQuoteAt(symbol,timestamp,{key,secret}){
  const range=around(timestamp);
  const rows=await fetchAlpacaQuotes(symbol,{
    start:range.start,
    end:range.end,
    key,
    secret,
    feed:"sip",
  });
  const q=quoteAtOrAfter(rows,timestamp,{max_delay_ms:5000});
  if(!q){
    throw new Error(
      "sip_reconciliation_quote_missing_"+symbol+"_"+timestamp
    );
  }
  return q;
}
function sipRoute(entry,exit,notional){
  const ask=finite(entry?.ask_price);
  const bid=finite(exit?.bid_price);
  if(!(ask>0)||!(bid>0)) return null;
  const qty=notional/ask;
  const exitValue=qty*bid;
  const pnl=exitValue-notional;
  return {
    simulated_entry_ask:ask,
    simulated_exit_bid:bid,
    simulated_quantity:qty,
    simulated_exit_value_usd:exitValue,
    simulated_pnl_usd:pnl,
    simulated_return_pct:pnl/notional*100,
  };
}

async function main(){
  const key=process.env.ALPACA_TRADING;
  const secret=process.env.ALPACA_TRADING_SECRET;
  if(!key||!secret) throw new Error("sip_reconciliation_credentials_missing");

  const manifest=JSON.parse(fs.readFileSync(MANIFEST_PATH,"utf8"));
  if(manifest?.schema!=="evercraft.daytrade.sip-reconciliation-manifest.v1"){
    throw new Error("sip_reconciliation_manifest_schema_invalid");
  }
  const threshold=finite(manifest.threshold_bps);
  const notional=finite(manifest.simulated_notional_usd);
  if(!(threshold>0)||!(notional>0)) throw new Error("sip_reconciliation_manifest_invalid");

  const windows=[];
  for(const spec of manifest.windows||[]){
    const receiptPath=path.resolve(process.cwd(),spec.receipt_path);
    const receipt=JSON.parse(fs.readFileSync(receiptPath,"utf8"));
    const rows=[];
    for(const original of receipt.results||[]){
      const symbol=original.symbol;
      const targets=spec.targets?.[symbol];
      if(!targets) throw new Error("sip_reconciliation_targets_missing_"+symbol);
      const [sipEntry,sipExit]=await Promise.all([
        sipQuoteAt(symbol,targets.entry,{key,secret}),
        sipQuoteAt(symbol,targets.exit,{key,secret}),
      ]);
      const sipSpread=finite(sipEntry.spread_bps);
      const sipDecision=
        sipSpread<=threshold
          ?"SIMULATE_MARKETABLE_LONG"
          :"ABSTAIN";
      const sipAlways=sipRoute(sipEntry,sipExit,notional);
      const sipGoverned=
        sipDecision==="SIMULATE_MARKETABLE_LONG"
          ?sipAlways
          :{
              simulated_entry_ask:null,
              simulated_exit_bid:null,
              simulated_quantity:0,
              simulated_exit_value_usd:notional,
              simulated_pnl_usd:0,
              simulated_return_pct:0,
              abstained:true,
            };
      rows.push({
        symbol,
        original_iex:{
          entry_spread_bps:finite(original.entry_spread_bps),
          decision:original.decision,
          governed_pnl_usd:finite(original.governed_pnl_usd),
          always_cross_pnl_usd:finite(original.always_cross_pnl_usd),
        },
        delayed_sip:{
          entry_target:targets.entry,
          exit_target:targets.exit,
          entry_quote:sipEntry,
          exit_quote:sipExit,
          entry_spread_bps:sipSpread,
          decision:sipDecision,
          simulated_governed:sipGoverned,
          simulated_always_cross:sipAlways,
        },
        decision_flip:original.decision!==sipDecision,
        iex_minus_sip_entry_spread_bps:
          finite(original.entry_spread_bps)-sipSpread,
      });
    }

    const sipGovernedTotal=sum(
      rows.map(x=>finite(x.delayed_sip?.simulated_governed?.simulated_pnl_usd)||0)
    );
    const sipAlwaysTotal=sum(
      rows.map(x=>finite(x.delayed_sip?.simulated_always_cross?.simulated_pnl_usd)||0)
    );
    const originalGoverned=sum(
      rows.map(x=>finite(x.original_iex.governed_pnl_usd)||0)
    );
    const originalAlways=sum(
      rows.map(x=>finite(x.original_iex.always_cross_pnl_usd)||0)
    );

    windows.push({
      window_id:spec.window_id,
      source_run_id:spec.source_run_id,
      rows,
      aggregate:{
        decision_flips:rows.filter(x=>x.decision_flip).length,
        original_iex_governed_pnl_usd:originalGoverned,
        original_iex_always_cross_pnl_usd:originalAlways,
        delayed_sip_governed_touch_pnl_usd:sipGovernedTotal,
        delayed_sip_always_cross_touch_pnl_usd:sipAlwaysTotal,
        delayed_sip_rule_improvement_vs_always_cross_usd:
          sipGovernedTotal-sipAlwaysTotal,
      },
    });
  }

  const allRows=windows.flatMap(x=>x.rows);
  const receipt={
    schema:"evercraft.daytrade.sip-reconciliation.v1",
    generated_at:new Date().toISOString(),
    delayed_historical_sip:true,
    counts_toward_prospective_diversity:false,
    simulation_only:true,
    capital_at_risk_usd:0,
    broker_order_submitted:false,
    live_order_submitted:false,
    threshold_bps:threshold,
    notional_usd:notional,
    windows,
    aggregate:{
      windows:windows.length,
      instrument_decisions:allRows.length,
      decision_flips:allRows.filter(x=>x.decision_flip).length,
      iex_abstain_to_sip_trade_flips:allRows.filter(
        x=>x.original_iex.decision==="ABSTAIN" &&
           x.delayed_sip.decision==="SIMULATE_MARKETABLE_LONG"
      ).length,
      iex_trade_to_sip_abstain_flips:allRows.filter(
        x=>x.original_iex.decision==="SIMULATE_MARKETABLE_LONG" &&
           x.delayed_sip.decision==="ABSTAIN"
      ).length,
      mean_iex_minus_sip_entry_spread_bps:
        mean(allRows.map(x=>x.iex_minus_sip_entry_spread_bps)),
      original_iex_governed_pnl_usd:
        sum(windows.map(x=>x.aggregate.original_iex_governed_pnl_usd)),
      delayed_sip_governed_touch_pnl_usd:
        sum(windows.map(x=>x.aggregate.delayed_sip_governed_touch_pnl_usd)),
    },
    interpretation:{
      delayed_sip_is_after_the_fact_only:true,
      delayed_sip_touch_is_not_real_fill:true,
      decision_flip_means_feed_choice_changes_rule_outcome:true,
      original_rule_was_frozen_on_iex_observations:true,
      do_not_retroactively_rewrite_prospective_receipts:true,
      if_many_flips_occur_rule_may_be_feed_specific_not_true_nbbo_specific:true,
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
    windows:windows.map(w=>({
      window_id:w.window_id,
      decision_flips:w.aggregate.decision_flips,
      original_iex_governed_pnl_usd:w.aggregate.original_iex_governed_pnl_usd,
      delayed_sip_governed_touch_pnl_usd:w.aggregate.delayed_sip_governed_touch_pnl_usd,
    })),
    simulation_only:true,
    capital_at_risk_usd:0,
  }));
}
function mean(xs){
  const vals=xs.filter(Number.isFinite);
  return vals.length?sum(vals)/vals.length:null;
}
main().catch(error=>{
  console.error("SIP reconciliation failed:",error?.message||String(error));
  process.exitCode=1;
});
