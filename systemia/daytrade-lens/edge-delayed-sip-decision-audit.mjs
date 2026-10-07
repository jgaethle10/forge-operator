import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {fetchAlpacaQuotes, quoteAtOrAfter} from "./edge-quote-microstructure.mjs";
import {selectIndependentPracticeWindows} from "./edge-practice-independence.mjs";

const HERE=path.dirname(fileURLToPath(import.meta.url));
const RECEIPT_DIR=path.join(HERE,"paper-receipts");
const OUTPUT=process.env.DAYTRADE_SIP_DECISION_AUDIT_OUTPUT ||
  "artifacts/daytrade-edge/delayed-sip-decision-audit-2026-10-07.json";
const HOLD_MS=60000;
const THRESHOLD_BPS=3;

function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
function finite(v){
  if(v===null||v===undefined||v==="") return null;
  const n=Number(v);
  return Number.isFinite(n)?n:null;
}
function phaseEt(timestamp){
  const d=new Date(timestamp);
  const parts=Object.fromEntries(
    new Intl.DateTimeFormat("en-US",{
      timeZone:"America/New_York",
      year:"numeric",month:"2-digit",day:"2-digit",
      hour:"2-digit",minute:"2-digit",hourCycle:"h23",
    }).formatToParts(d)
      .filter(x=>x.type!=="literal")
      .map(x=>[x.type,x.value])
  );
  const m=Number(parts.hour)*60+Number(parts.minute);
  if(m>=570&&m<630) return "OPENING";
  if(m>=630&&m<900) return "MIDDAY";
  if(m>=900&&m<960) return "CLOSING";
  return "OUTSIDE_CORE";
}
async function sipQuoteAt(symbol,target,{key,secret}){
  const t=new Date(target).getTime();
  const start=new Date(t-5000).toISOString();
  const end=new Date(t+35000).toISOString();
  try{
    const rows=await fetchAlpacaQuotes(symbol,{
      start,end,key,secret,feed:"sip"
    });
    const quote=quoteAtOrAfter(rows,target,{max_delay_ms:30000});
    return {
      ok:Boolean(quote),
      quote,
      row_count:rows.length,
      error:quote?null:"sip_quote_at_or_after_missing",
      status:null,
    };
  }catch(error){
    return {
      ok:false,
      quote:null,
      row_count:0,
      error:error?.message||String(error),
      status:error?.status??null,
    };
  }
}

async function main(){
  const key=process.env.ALPACA_TRADING;
  const secret=process.env.ALPACA_TRADING_SECRET;
  if(!key||!secret) throw new Error("sip_decision_audit_credentials_missing");

  const raw=[];
  for(const file of fs.readdirSync(RECEIPT_DIR).filter(x=>x.endsWith(".json")).sort()){
    const receipt=JSON.parse(fs.readFileSync(path.join(RECEIPT_DIR,file),"utf8"));
    if(receipt?.schema!=="evercraft.daytrade.prospective-spread-rule-practice-summary.v1"){
      continue;
    }
    raw.push({
      file,
      generated_at:receipt.generated_at,
      source_run_id:receipt.source_run_id??null,
      results:Array.isArray(receipt.results)?receipt.results:[],
      phase:receipt?.interpretation?.market_phase_et||phaseEt(receipt.generated_at),
    });
  }

  const independence=selectIndependentPracticeWindows(raw);
  const audited=[];
  for(const window of independence.independent){
    const generatedMs=new Date(window.generated_at).getTime();
    const inferredEntry=new Date(generatedMs-HOLD_MS).toISOString();
    const symbols=[];
    for(const row of window.results){
      if(!row?.symbol) continue;
      const iexSpread=finite(row.entry_spread_bps);
      const recordedDecision=String(row.decision||"");
      const sip=await sipQuoteAt(row.symbol,inferredEntry,{key,secret});
      const sipSpread=finite(sip?.quote?.spread_bps);
      const sipDecision=Number.isFinite(sipSpread)
        ?(sipSpread<=THRESHOLD_BPS?"SIMULATE_MARKETABLE_LONG":"ABSTAIN")
        :"UNAVAILABLE";
      const disagreement=
        sipDecision!=="UNAVAILABLE" &&
        recordedDecision &&
        sipDecision!==recordedDecision;
      symbols.push({
        symbol:row.symbol,
        recorded_iex_spread_bps:iexSpread,
        recorded_iex_decision:recordedDecision,
        inferred_entry_target:inferredEntry,
        sip_quote_available:sip.ok,
        sip_quote_delay_ms:sip?.quote?.quote_delay_ms??null,
        sip_spread_bps:sipSpread,
        sip_counterfactual_decision:sipDecision,
        decision_disagreement:disagreement,
        disagreement_type:disagreement
          ?recordedDecision+"__VS__"+sipDecision
          :null,
        sip_error:sip.error,
        sip_status:sip.status,
      });
      await sleep(80);
    }
    audited.push({
      file:window.file,
      generated_at:window.generated_at,
      phase:window.phase,
      source_run_id:window.source_run_id,
      entry_time_inference:{
        method:"generated_at_minus_60000ms",
        inferred_entry_target:inferredEntry,
        exact_entry_timestamp_not_present_in_summary_receipt:true,
      },
      symbols,
    });
  }

  const decisions=audited.flatMap(w=>w.symbols);
  const available=decisions.filter(x=>x.sip_quote_available);
  const disagreements=available.filter(x=>x.decision_disagreement);
  const iexAbstainSipTrade=disagreements.filter(
    x=>x.recorded_iex_decision==="ABSTAIN" &&
       x.sip_counterfactual_decision==="SIMULATE_MARKETABLE_LONG"
  );
  const iexTradeSipAbstain=disagreements.filter(
    x=>x.recorded_iex_decision==="SIMULATE_MARKETABLE_LONG" &&
       x.sip_counterfactual_decision==="ABSTAIN"
  );

  const receipt={
    schema:"evercraft.daytrade.delayed-sip-decision-audit.v1",
    generated_at:new Date().toISOString(),
    rule_threshold_bps:THRESHOLD_BPS,
    raw_prospective_windows:independence.raw_count,
    independent_windows:independence.independent_count,
    near_duplicate_windows_excluded:independence.excluded_count,
    instrument_decisions:decisions.length,
    sip_quotes_available:available.length,
    sip_quotes_unavailable:decisions.length-available.length,
    decision_disagreements:disagreements.length,
    disagreement_fraction_available:
      available.length?disagreements.length/available.length:null,
    iex_abstain_vs_sip_trade_count:iexAbstainSipTrade.length,
    iex_trade_vs_sip_abstain_count:iexTradeSipAbstain.length,
    audit_windows:audited,
    interpretation:{
      purpose:"Test whether the frozen 3 bps decision is sensitive to IEX-only spread observations versus delayed consolidated SIP quotes.",
      delayed_sip_is_after_the_fact_only:true,
      delayed_sip_does_not_drive_real_time_practice_decisions:true,
      decision_disagreement_does_not_prove_which_route_would_fill:true,
      no_sip_execution_pnl_is_inferred:true,
      summary_entry_time_is_approximated_from_generated_at_minus_hold:true,
      future_receipts_should_store_exact_entry_timestamp:true,
      material_disagreement_would_challenge_feed_portability_of_rule:true,
      no_threshold_retuning:true,
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
    independent_windows:receipt.independent_windows,
    instrument_decisions:receipt.instrument_decisions,
    sip_quotes_available:receipt.sip_quotes_available,
    decision_disagreements:receipt.decision_disagreements,
    disagreement_fraction_available:receipt.disagreement_fraction_available,
    iex_abstain_vs_sip_trade_count:receipt.iex_abstain_vs_sip_trade_count,
    iex_trade_vs_sip_abstain_count:receipt.iex_trade_vs_sip_abstain_count,
    live_trade_authority:false
  }));
}

main().catch(error=>{
  console.error("Delayed SIP decision audit failed:",error?.message||String(error));
  process.exitCode=1;
});
