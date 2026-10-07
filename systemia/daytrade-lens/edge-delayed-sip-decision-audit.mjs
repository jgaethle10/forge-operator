import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {fetchAlpacaQuotes, quoteAtOrAfter} from "./edge-quote-microstructure.mjs";
import {selectIndependentPracticeWindows} from "./edge-practice-independence.mjs";

const HERE=path.dirname(fileURLToPath(import.meta.url));
const RECEIPT_DIR=path.join(HERE,"paper-receipts");
const OUTPUT=process.env.DAYTRADE_SIP_DECISION_AUDIT_OUTPUT ||
  "artifacts/daytrade-edge/delayed-sip-decision-audit.json";
const HOLD_MS=60000;
const THRESHOLD_BPS=3;

function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
function finite(v){
  if(v===null||v===undefined||v==="") return null;
  const n=Number(v);
  return Number.isFinite(n)?n:null;
}
function mean(xs){return xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;}
function median(xs){
  if(!xs.length) return null;
  const s=[...xs].sort((a,b)=>a-b);
  const m=Math.floor(s.length/2);
  return s.length%2?s[m]:(s[m-1]+s[m])/2;
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
function fallbackWindowEntry(generatedAt){
  return new Date(new Date(generatedAt).getTime()-HOLD_MS).toISOString();
}
function entryTarget(receipt,result){
  if(result?.entry_quote_timestamp){
    return {
      timestamp:result.entry_quote_timestamp,
      source:"exact_symbol_entry_quote_timestamp"
    };
  }
  if(receipt?.window_start_at){
    return {
      timestamp:receipt.window_start_at,
      source:"exact_window_start_at"
    };
  }
  return {
    timestamp:fallbackWindowEntry(receipt.generated_at),
    source:"inferred_generated_at_minus_60000ms"
  };
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

export function summarizeSipDecisionAudit(auditedWindows){
  const decisions=(auditedWindows||[]).flatMap(w=>
    (w.symbols||[]).map(s=>({...s,phase:w.phase}))
  );
  const available=decisions.filter(x=>x.sip_quote_available);
  const disagreements=available.filter(x=>x.decision_disagreement);
  const bySymbol={};
  for(const symbol of [...new Set(available.map(x=>x.symbol))].sort()){
    const rows=available.filter(x=>x.symbol===symbol);
    const ratios=rows
      .map(x=>x.sip_spread_bps>0?x.recorded_iex_spread_bps/x.sip_spread_bps:null)
      .filter(Number.isFinite);
    bySymbol[symbol]={
      available_decisions:rows.length,
      disagreements:rows.filter(x=>x.decision_disagreement).length,
      disagreement_fraction:rows.length
        ?rows.filter(x=>x.decision_disagreement).length/rows.length
        :null,
      mean_iex_spread_bps:mean(rows.map(x=>x.recorded_iex_spread_bps)),
      mean_sip_spread_bps:mean(rows.map(x=>x.sip_spread_bps)),
      mean_iex_minus_sip_spread_bps:
        mean(rows.map(x=>x.recorded_iex_spread_bps-x.sip_spread_bps)),
      median_iex_to_sip_spread_ratio:median(ratios),
    };
  }
  const byPhase={};
  for(const phase of [...new Set(available.map(x=>x.phase))].sort()){
    const rows=available.filter(x=>x.phase===phase);
    byPhase[phase]={
      available_decisions:rows.length,
      disagreements:rows.filter(x=>x.decision_disagreement).length,
      disagreement_fraction:rows.length
        ?rows.filter(x=>x.decision_disagreement).length/rows.length
        :null,
    };
  }
  return {
    instrument_decisions:decisions.length,
    sip_quotes_available:available.length,
    sip_quotes_unavailable:decisions.length-available.length,
    decision_disagreements:disagreements.length,
    disagreement_fraction_available:
      available.length?disagreements.length/available.length:null,
    iex_abstain_vs_sip_trade_count:disagreements.filter(
      x=>x.recorded_iex_decision==="ABSTAIN" &&
         x.sip_counterfactual_decision==="SIMULATE_MARKETABLE_LONG"
    ).length,
    iex_trade_vs_sip_abstain_count:disagreements.filter(
      x=>x.recorded_iex_decision==="SIMULATE_MARKETABLE_LONG" &&
         x.sip_counterfactual_decision==="ABSTAIN"
    ).length,
    by_symbol:bySymbol,
    by_phase:byPhase,
    timing_sources:decisions.reduce((acc,x)=>{
      acc[x.entry_time_source]=(acc[x.entry_time_source]||0)+1;
      return acc;
    },{}),
  };
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
      receipt,
      results:Array.isArray(receipt.results)?receipt.results:[],
      phase:receipt?.interpretation?.market_phase_et||phaseEt(receipt.generated_at),
    });
  }

  const independence=selectIndependentPracticeWindows(raw);
  const audited=[];
  for(const window of independence.independent){
    const symbols=[];
    for(const row of window.results){
      if(!row?.symbol) continue;
      const target=entryTarget(window.receipt,row);
      const iexSpread=finite(row.entry_spread_bps);
      const recordedDecision=String(row.decision||"");
      const sip=await sipQuoteAt(row.symbol,target.timestamp,{key,secret});
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
        entry_target:target.timestamp,
        entry_time_source:target.source,
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
      symbols,
    });
  }

  const summary=summarizeSipDecisionAudit(audited);
  const receipt={
    schema:"evercraft.daytrade.delayed-sip-decision-audit.v2",
    generated_at:new Date().toISOString(),
    rule_threshold_bps:THRESHOLD_BPS,
    raw_prospective_windows:independence.raw_count,
    independent_windows:independence.independent_count,
    near_duplicate_windows_excluded:independence.excluded_count,
    ...summary,
    audit_windows:audited,
    interpretation:{
      purpose:"Test whether the frozen 3 bps decision is sensitive to IEX-only spread observations versus delayed consolidated SIP quotes.",
      delayed_sip_is_after_the_fact_only:true,
      delayed_sip_does_not_drive_real_time_practice_decisions:true,
      decision_disagreement_does_not_prove_which_route_would_fill:true,
      no_sip_execution_pnl_is_inferred:true,
      exact_entry_timestamps_preferred_when_available:true,
      inferred_entry_time_used_only_as_fallback:true,
      material_disagreement_challenges_feed_portability:true,
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
    by_symbol:receipt.by_symbol,
    by_phase:receipt.by_phase,
    timing_sources:receipt.timing_sources,
    live_trade_authority:false
  }));
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
  main().catch(error=>{
    console.error("Delayed SIP decision audit failed:",error?.message||String(error));
    process.exitCode=1;
  });
}
