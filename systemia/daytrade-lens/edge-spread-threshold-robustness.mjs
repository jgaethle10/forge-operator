import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {
  selectIndependentPracticeWindows,
} from "./edge-practice-independence.mjs";

const HERE=path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_RECEIPT_DIR=path.join(HERE,"paper-receipts");
export const DEFAULT_THRESHOLDS_BPS=[0.5,1,2,3,4,5];

function finite(v){
  if(v===null||v===undefined||v==="") return null;
  const n=Number(v);
  return Number.isFinite(n)?n:null;
}
function sum(xs){return xs.reduce((a,b)=>a+b,0);}

export function buildSpreadThresholdRobustness({
  receiptDir=DEFAULT_RECEIPT_DIR,
  thresholds=DEFAULT_THRESHOLDS_BPS,
}={}){
  const files=fs.existsSync(receiptDir)
    ?fs.readdirSync(receiptDir).filter(x=>x.endsWith(".json")).sort()
    :[];
  const rawWindows=[];
  for(const file of files){
    const row=JSON.parse(fs.readFileSync(path.join(receiptDir,file),"utf8"));
    if(
      row?.schema!=="evercraft.daytrade.prospective-spread-rule-practice-summary.v1"
    ) continue;
    const decisions=(row.results||[]).map(result=>({
      symbol:result.symbol,
      entry_spread_bps:finite(result.entry_spread_bps),
      always_cross_pnl_usd:finite(result.always_cross_pnl_usd),
    })).filter(x=>
      x.symbol &&
      Number.isFinite(x.entry_spread_bps) &&
      Number.isFinite(x.always_cross_pnl_usd)
    );
    rawWindows.push({
      file,
      generated_at:row.generated_at||null,
      source_run_id:row.source_run_id||null,
      decisions,
    });
  }
  if(!rawWindows.length) throw new Error("spread_threshold_robustness_no_windows");
  const independence=selectIndependentPracticeWindows(rawWindows);
  const windows=independence.independent;

  const decisions=windows.flatMap((window,window_index)=>
    window.decisions.map(decision=>({...decision,window_index}))
  );
  const alwaysCrossTotal=sum(decisions.map(x=>x.always_cross_pnl_usd));

  const grid=[...thresholds].map(Number)
    .filter(Number.isFinite)
    .sort((a,b)=>a-b)
    .map(threshold=>{
      const traded=decisions.filter(x=>x.entry_spread_bps<=threshold);
      const pnl=sum(traded.map(x=>x.always_cross_pnl_usd));
      return {
        max_entry_spread_bps:threshold,
        traded_decisions:traded.length,
        abstained_decisions:decisions.length-traded.length,
        traded_fraction:decisions.length?traded.length/decisions.length:null,
        simulated_pnl_usd:pnl,
        always_cross_pnl_usd:alwaysCrossTotal,
        improvement_vs_always_cross_usd:pnl-alwaysCrossTotal,
        profitable_traded_decisions:traded.filter(x=>x.always_cross_pnl_usd>0).length,
        losing_traded_decisions:traded.filter(x=>x.always_cross_pnl_usd<0).length,
      };
    });

  const frozen=grid.find(x=>x.max_entry_spread_bps===3)||null;
  const lower=grid.find(x=>x.max_entry_spread_bps===2)||null;
  const upper=grid.find(x=>x.max_entry_spread_bps===4)||null;
  const broadPositive=
    [lower,frozen,upper].every(
      x=>x && x.improvement_vs_always_cross_usd>=0
    );

  return {
    schema:"evercraft.daytrade.spread-threshold-robustness.v1",
    generated_at:new Date().toISOString(),
    raw_windows:rawWindows.length,
    windows:windows.length,
    near_duplicate_windows_excluded:independence.excluded_count,
    minimum_independence_separation_ms:independence.minimum_separation_ms,
    instrument_decisions:decisions.length,
    thresholds_bps:grid.map(x=>x.max_entry_spread_bps),
    always_cross_total_pnl_usd:alwaysCrossTotal,
    frozen_rule_threshold_bps:3,
    frozen_rule_row:frozen,
    adjacent_2_3_4_bps_all_nonnegative_vs_always_cross:broadPositive,
    threshold_grid:grid,
    controls:{
      post_hoc_robustness_diagnostic_only:true,
      robustness_uses_independent_windows:true,
      do_not_choose_best_threshold_from_this_grid:true,
      original_3bps_rule_remains_frozen:true,
      same_day_selection_bias_remains:true,
      independent_market_validation:false,
      signal_validation:false,
      live_rule_authorized:false,
    },
    live_trade_authority:false,
  };
}

async function main(){
  const receiptDir=process.env.DAYTRADE_PRACTICE_RECEIPT_DIR||DEFAULT_RECEIPT_DIR;
  const output=process.env.DAYTRADE_THRESHOLD_ROBUSTNESS_OUTPUT||"";
  const report=buildSpreadThresholdRobustness({receiptDir});
  if(output){
    fs.mkdirSync(path.dirname(output),{recursive:true});
    fs.writeFileSync(output,JSON.stringify(report,null,2)+"\n");
  }
  console.log(JSON.stringify(report,null,2));
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
  main().catch(error=>{
    console.error("Spread threshold robustness failed:",error?.message||String(error));
    process.exitCode=1;
  });
}
