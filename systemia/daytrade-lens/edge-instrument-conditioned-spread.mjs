import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {
  selectIndependentPracticeWindows,
} from "./edge-practice-independence.mjs";

const HERE=path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_RECEIPT_DIR=path.join(HERE,"paper-receipts");

function finite(v){
  if(v===null||v===undefined||v==="") return null;
  const n=Number(v);
  return Number.isFinite(n)?n:null;
}
function sum(xs){return xs.reduce((a,b)=>a+b,0);}
function mean(xs){return xs.length?sum(xs)/xs.length:null;}

export function buildInstrumentConditionedSpread({
  receiptDir=DEFAULT_RECEIPT_DIR,
  thresholdBps=3,
}={}){
  const rawWindows=[];
  for(const file of fs.readdirSync(receiptDir).filter(x=>x.endsWith(".json")).sort()){
    const row=JSON.parse(fs.readFileSync(path.join(receiptDir,file),"utf8"));
    if(
      row?.schema!=="evercraft.daytrade.prospective-spread-rule-practice-summary.v1"
    ) continue;
    const decisions=(row.results||[]).map(r=>{
      const spread=finite(r.entry_spread_bps);
      const pnl=finite(r.always_cross_pnl_usd);
      if(!r.symbol||!Number.isFinite(spread)||!Number.isFinite(pnl)) return null;
      return {
        symbol:r.symbol,
        entry_spread_bps:spread,
        always_cross_pnl_usd:pnl,
        bucket:spread>thresholdBps?"WIDE":"TIGHT",
      };
    }).filter(Boolean);
    rawWindows.push({
      file,
      generated_at:row.generated_at||null,
      decisions,
    });
  }

  const independence=selectIndependentPracticeWindows(rawWindows);
  const windows=independence.independent;
  const decisions=windows.flatMap(window=>
    window.decisions.map(decision=>({
      file:window.file,
      generated_at:window.generated_at,
      ...decision,
    }))
  );
  const symbols=[...new Set(decisions.map(x=>x.symbol))].sort();
  const bySymbol={};
  for(const symbol of symbols){
    const rows=decisions.filter(x=>x.symbol===symbol);
    const tight=rows.filter(x=>x.bucket==="TIGHT");
    const wide=rows.filter(x=>x.bucket==="WIDE");
    bySymbol[symbol]={
      windows:rows.length,
      tight:{
        count:tight.length,
        mean_always_cross_pnl_usd:mean(tight.map(x=>x.always_cross_pnl_usd)),
        cumulative_always_cross_pnl_usd:sum(tight.map(x=>x.always_cross_pnl_usd)),
        profitable_count:tight.filter(x=>x.always_cross_pnl_usd>0).length,
        losing_count:tight.filter(x=>x.always_cross_pnl_usd<0).length,
      },
      wide:{
        count:wide.length,
        mean_always_cross_pnl_usd:mean(wide.map(x=>x.always_cross_pnl_usd)),
        cumulative_always_cross_pnl_usd:sum(wide.map(x=>x.always_cross_pnl_usd)),
        profitable_count:wide.filter(x=>x.always_cross_pnl_usd>0).length,
        losing_count:wide.filter(x=>x.always_cross_pnl_usd<0).length,
      },
      wide_minus_tight_mean_pnl_usd:
        wide.length&&tight.length
          ?mean(wide.map(x=>x.always_cross_pnl_usd))-
           mean(tight.map(x=>x.always_cross_pnl_usd))
          :null,
      within_symbol_comparison_ready:wide.length>=2&&tight.length>=2,
    };
  }

  return {
    schema:"evercraft.daytrade.instrument-conditioned-spread.v1",
    generated_at:new Date().toISOString(),
    threshold_bps:Number(thresholdBps),
    raw_windows:rawWindows.length,
    windows:windows.length,
    near_duplicate_windows_excluded:independence.excluded_count,
    minimum_independence_separation_ms:independence.minimum_separation_ms,
    decisions:decisions.length,
    symbols,
    by_symbol:bySymbol,
    controls:{
      purpose:"Test whether spread effect survives conditioning on instrument rather than merely separating SOXX/SMH from QQQ.",
      analysis_uses_independent_windows:true,
      no_causal_claim:true,
      no_threshold_retuning:true,
      not_signal_validation:true,
      not_live_rule_authorization:true,
      live_trade_authority:false,
    },
    live_trade_authority:false,
  };
}

async function main(){
  const receiptDir=process.env.DAYTRADE_PRACTICE_RECEIPT_DIR||DEFAULT_RECEIPT_DIR;
  const output=process.env.DAYTRADE_INSTRUMENT_SPREAD_OUTPUT||"";
  const report=buildInstrumentConditionedSpread({receiptDir});
  if(output){
    fs.mkdirSync(path.dirname(output),{recursive:true});
    fs.writeFileSync(output,JSON.stringify(report,null,2)+"\n");
  }
  console.log(JSON.stringify(report,null,2));
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
  main().catch(error=>{
    console.error("Instrument-conditioned spread diagnostic failed:",error?.message||String(error));
    process.exitCode=1;
  });
}
