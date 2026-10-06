import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {
  selectIndependentPracticeWindows,
} from "./edge-practice-independence.mjs";

const HERE=path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_RECEIPT_DIR=path.join(HERE,"paper-receipts");

function partsEt(timestamp){
  const d=new Date(timestamp);
  if(!Number.isFinite(d.getTime())) return null;
  const fmt=new Intl.DateTimeFormat("en-US",{
    timeZone:"America/New_York",
    year:"numeric",month:"2-digit",day:"2-digit",
    hour:"2-digit",minute:"2-digit",hourCycle:"h23",
  });
  const p=Object.fromEntries(
    fmt.formatToParts(d)
      .filter(x=>x.type!=="literal")
      .map(x=>[x.type,x.value])
  );
  return {
    date:`${p.year}-${p.month}-${p.day}`,
    minuteOfDay:Number(p.hour)*60+Number(p.minute),
  };
}
function phase(timestamp){
  const p=partsEt(timestamp);
  if(!p) return "UNKNOWN";
  if(p.minuteOfDay>=570&&p.minuteOfDay<630) return "OPENING";
  if(p.minuteOfDay>=630&&p.minuteOfDay<900) return "MIDDAY";
  if(p.minuteOfDay>=900&&p.minuteOfDay<960) return "CLOSING";
  return "OUTSIDE_CORE";
}
function finite(v){
  if(v===null||v===undefined||v==="") return null;
  const n=Number(v);
  return Number.isFinite(n)?n:null;
}
function sum(xs){return xs.reduce((a,b)=>a+b,0);}
function mean(xs){return xs.length?sum(xs)/xs.length:null;}

export function buildPracticePhaseScorecard({
  receiptDir=DEFAULT_RECEIPT_DIR,
}={}){
  const rawWindows=[];
  for(const file of fs.readdirSync(receiptDir).filter(x=>x.endsWith(".json")).sort()){
    const row=JSON.parse(fs.readFileSync(path.join(receiptDir,file),"utf8"));
    if(
      row?.schema!=="evercraft.daytrade.prospective-spread-rule-practice-summary.v1"
    ) continue;
    const p=phase(row.generated_at);
    rawWindows.push({
      file,
      generated_at:row.generated_at,
      phase:p,
      governed_pnl_usd:finite(row?.aggregate?.governed_total_pnl_usd),
      always_cross_pnl_usd:finite(row?.aggregate?.always_cross_total_pnl_usd),
      improvement_usd:finite(row?.aggregate?.rule_improvement_vs_always_cross_usd),
      abstained_count:Number(row?.aggregate?.abstained_count||0),
      traded_count:Number(row?.aggregate?.traded_count||0),
    });
  }

  const independence=selectIndependentPracticeWindows(rawWindows);
  const windows=independence.independent;

  const phases=["OPENING","MIDDAY","CLOSING","OUTSIDE_CORE","UNKNOWN"];
  const byPhase={};
  for(const p of phases){
    const rows=windows.filter(x=>x.phase===p);
    const improvements=rows.map(x=>x.improvement_usd).filter(Number.isFinite);
    const governed=rows.map(x=>x.governed_pnl_usd).filter(Number.isFinite);
    const always=rows.map(x=>x.always_cross_pnl_usd).filter(Number.isFinite);
    byPhase[p]={
      windows:rows.length,
      helped:improvements.filter(x=>x>0).length,
      hurt:improvements.filter(x=>x<0).length,
      neutral:improvements.filter(x=>x===0).length,
      cumulative_improvement_usd:sum(improvements),
      mean_improvement_usd:mean(improvements),
      cumulative_governed_pnl_usd:sum(governed),
      cumulative_always_cross_pnl_usd:sum(always),
      total_abstentions:sum(rows.map(x=>x.abstained_count)),
      total_trades:sum(rows.map(x=>x.traded_count)),
    };
  }

  return {
    schema:"evercraft.daytrade.practice-phase-scorecard.v1",
    generated_at:new Date().toISOString(),
    raw_windows:rawWindows.length,
    windows:windows.length,
    near_duplicate_windows_excluded:independence.excluded_count,
    minimum_independence_separation_ms:independence.minimum_separation_ms,
    by_phase:byPhase,
    controls:{
      phase_buckets_use_america_new_york:true,
      phase_metrics_use_independent_windows:true,
      phases_not_pooled_for_authorization:true,
      same_day_selection_bias_not_removed:true,
      practice_not_signal_validation:true,
      practice_not_live_fill_validation:true,
      live_trade_authority:false,
    },
    live_trade_authority:false,
  };
}

async function main(){
  const receiptDir=process.env.DAYTRADE_PRACTICE_RECEIPT_DIR||DEFAULT_RECEIPT_DIR;
  const output=process.env.DAYTRADE_PHASE_SCORECARD_OUTPUT||"";
  const report=buildPracticePhaseScorecard({receiptDir});
  if(output){
    fs.mkdirSync(path.dirname(output),{recursive:true});
    fs.writeFileSync(output,JSON.stringify(report,null,2)+"\n");
  }
  console.log(JSON.stringify(report,null,2));
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
  main().catch(error=>{
    console.error("Practice phase scorecard failed:",error?.message||String(error));
    process.exitCode=1;
  });
}
