import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {
  fetchAlpacaQuotes,
  normalizeAlpacaQuote,
} from "./edge-quote-microstructure.mjs";

const HERE=path.dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH=path.join(
  HERE,
  "practice-rules",
  "oct7-sip-reconciliation-manifest.json"
);
const OUTPUT=process.env.DAYTRADE_SIP_RECONCILIATION_OUTPUT ||
  "artifacts/daytrade-edge/sip-reconciliation-2026-10-07.json";
const MAX_STATE_AGE_MS=30000;

function finite(v){
  if(v===null||v===undefined||v==="") return null;
  const n=Number(v);
  return Number.isFinite(n)?n:null;
}
function sum(xs){return xs.reduce((a,b)=>a+b,0);}
function mean(xs){
  const vals=xs.filter(Number.isFinite);
  return vals.length?sum(vals)/vals.length:null;
}
function around(timestamp,beforeMs=300000,afterMs=1000){
  const t=new Date(timestamp).getTime();
  if(!Number.isFinite(t)) throw new Error("sip_reconciliation_timestamp_invalid");
  return {
    start:new Date(t-beforeMs).toISOString(),
    end:new Date(t+afterMs).toISOString(),
  };
}

async function sipQuoteStateAt(symbol,timestamp,{key,secret}){
  const target=new Date(timestamp).getTime();
  const range=around(timestamp);
  let rows;
  try{
    rows=await fetchAlpacaQuotes(symbol,{
      start:range.start,
      end:range.end,
      key,
      secret,
      feed:"sip",
    });
  }catch(error){
    return {
      available:false,
      target_time:new Date(target).toISOString(),
      unavailable_reason:error?.message||String(error),
      no_post_target_quote_used:true,
    };
  }

  const normalized=(rows||[])
    .map(normalizeAlpacaQuote)
    .filter(Boolean)
    .filter(q=>new Date(q.t).getTime()<=target)
    .sort((a,b)=>new Date(a.t)-new Date(b.t));
  const q=normalized.at(-1)||null;
  if(!q){
    return {
      available:false,
      target_time:new Date(target).toISOString(),
      unavailable_reason:"NO_PRE_TARGET_SIP_STATE",
      no_post_target_quote_used:true,
    };
  }

  const age=target-new Date(q.t).getTime();
  const base={
    ...q,
    target_time:new Date(target).toISOString(),
    quote_state_age_ms:age,
    quote_state_age_over_5s:age>5000,
    quote_state_age_over_30s:age>MAX_STATE_AGE_MS,
    no_post_target_quote_used:true,
  };
  if(age<0||age>MAX_STATE_AGE_MS){
    return {
      ...base,
      available:false,
      unavailable_reason:"SIP_STATE_TOO_OLD_FOR_RECONCILIATION",
    };
  }
  return {...base,available:true};
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
  if(!(threshold>0)||!(notional>0)){
    throw new Error("sip_reconciliation_manifest_invalid");
  }

  const windows=[];
  for(const spec of manifest.windows||[]){
    const receiptPath=path.resolve(process.cwd(),spec.receipt_path);
    const receipt=JSON.parse(fs.readFileSync(receiptPath,"utf8"));
    const rows=[];

    for(const original of receipt.results||[]){
      const symbol=original.symbol;
      const targets=spec.targets?.[symbol];
      if(!targets) throw new Error("sip_reconciliation_targets_missing_"+symbol);

      const [entryState,exitState]=await Promise.all([
        sipQuoteStateAt(symbol,targets.entry,{key,secret}),
        sipQuoteStateAt(symbol,targets.exit,{key,secret}),
      ]);

      const eligible=entryState.available===true&&exitState.available===true;
      const sipSpread=eligible?finite(entryState.spread_bps):null;
      const sipDecision=eligible
        ?(sipSpread<=threshold?"SIMULATE_MARKETABLE_LONG":"ABSTAIN")
        :null;
      const sipAlways=eligible?sipRoute(entryState,exitState,notional):null;
      const sipGoverned=!eligible
        ?null
        :sipDecision==="SIMULATE_MARKETABLE_LONG"
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
        sip_reconciliation_eligible:eligible,
        sip_reconciliation_censored_reason:eligible
          ?null
          :entryState.unavailable_reason||exitState.unavailable_reason||"UNKNOWN",
        original_iex:{
          entry_spread_bps:finite(original.entry_spread_bps),
          decision:original.decision,
          governed_pnl_usd:finite(original.governed_pnl_usd),
          always_cross_pnl_usd:finite(original.always_cross_pnl_usd),
        },
        delayed_sip:{
          entry_target:targets.entry,
          exit_target:targets.exit,
          entry_quote:entryState,
          exit_quote:exitState,
          entry_spread_bps:sipSpread,
          decision:sipDecision,
          simulated_governed:sipGoverned,
          simulated_always_cross:sipAlways,
        },
        decision_flip:eligible?original.decision!==sipDecision:null,
        iex_minus_sip_entry_spread_bps:eligible
          ?finite(original.entry_spread_bps)-sipSpread
          :null,
      });
    }

    const eligibleRows=rows.filter(x=>x.sip_reconciliation_eligible);
    const sipGovernedTotal=sum(
      eligibleRows.map(x=>finite(x.delayed_sip?.simulated_governed?.simulated_pnl_usd)||0)
    );
    const sipAlwaysTotal=sum(
      eligibleRows.map(x=>finite(x.delayed_sip?.simulated_always_cross?.simulated_pnl_usd)||0)
    );
    const originalGoverned=sum(
      eligibleRows.map(x=>finite(x.original_iex.governed_pnl_usd)||0)
    );
    const originalAlways=sum(
      eligibleRows.map(x=>finite(x.original_iex.always_cross_pnl_usd)||0)
    );

    windows.push({
      window_id:spec.window_id,
      source_run_id:spec.source_run_id,
      rows,
      aggregate:{
        instrument_decisions:rows.length,
        eligible_instrument_decisions:eligibleRows.length,
        censored_instrument_decisions:rows.length-eligibleRows.length,
        decision_flips:eligibleRows.filter(x=>x.decision_flip).length,
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
  const eligibleRows=allRows.filter(x=>x.sip_reconciliation_eligible);
  const receipt={
    schema:"evercraft.daytrade.sip-reconciliation.v2",
    generated_at:new Date().toISOString(),
    delayed_historical_sip:true,
    max_accepted_sip_state_age_ms:MAX_STATE_AGE_MS,
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
      eligible_instrument_decisions:eligibleRows.length,
      censored_instrument_decisions:allRows.length-eligibleRows.length,
      decision_flips:eligibleRows.filter(x=>x.decision_flip).length,
      iex_abstain_to_sip_trade_flips:eligibleRows.filter(
        x=>x.original_iex.decision==="ABSTAIN" &&
           x.delayed_sip.decision==="SIMULATE_MARKETABLE_LONG"
      ).length,
      iex_trade_to_sip_abstain_flips:eligibleRows.filter(
        x=>x.original_iex.decision==="SIMULATE_MARKETABLE_LONG" &&
           x.delayed_sip.decision==="ABSTAIN"
      ).length,
      mean_iex_minus_sip_entry_spread_bps:
        mean(eligibleRows.map(x=>x.iex_minus_sip_entry_spread_bps)),
      original_iex_governed_pnl_usd:
        sum(windows.map(x=>x.aggregate.original_iex_governed_pnl_usd)),
      delayed_sip_governed_touch_pnl_usd:
        sum(windows.map(x=>x.aggregate.delayed_sip_governed_touch_pnl_usd)),
    },
    interpretation:{
      delayed_sip_is_after_the_fact_only:true,
      delayed_sip_uses_latest_pre_target_quote_state:true,
      no_post_target_quote_lookahead:true,
      sip_states_over_30s_are_censored_not_used:true,
      delayed_sip_touch_is_not_real_fill:true,
      decision_flip_means_feed_choice_changes_rule_outcome:true,
      original_rule_was_frozen_on_iex_observations:true,
      do_not_retroactively_rewrite_prospective_receipts:true,
      if_many_flips_occur_rule_may_be_feed_specific_not_true_nbbo_specific:true,
      not_signal_validation:true,
      not_live_authorized:true
    },
    live_trade_authority:false
  };

  fs.mkdirSync(path.dirname(OUTPUT),{recursive:true});
  fs.writeFileSync(OUTPUT,JSON.stringify(receipt,null,2)+"\n");
  console.log(JSON.stringify({
    ok:true,
    output:OUTPUT,
    aggregate:receipt.aggregate,
    windows:windows.map(w=>({
      window_id:w.window_id,
      eligible_instrument_decisions:w.aggregate.eligible_instrument_decisions,
      censored_instrument_decisions:w.aggregate.censored_instrument_decisions,
      decision_flips:w.aggregate.decision_flips
    })),
    simulation_only:true,
    capital_at_risk_usd:0
  }));
}

main().catch(error=>{
  console.error("SIP reconciliation failed:",error?.message||String(error));
  process.exitCode=1;
});
