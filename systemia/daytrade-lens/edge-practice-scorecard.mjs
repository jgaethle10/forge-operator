import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const HERE=path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_RECEIPT_DIR=path.join(HERE,"paper-receipts");

function finite(v){
  if(v===null||v===undefined||v==="") return null;
  const n=Number(v);
  return Number.isFinite(n)?n:null;
}
function sum(xs){return xs.reduce((a,b)=>a+b,0);}
function mean(xs){return xs.length?sum(xs)/xs.length:null;}

export function buildPracticeScorecard({
  receiptDir=DEFAULT_RECEIPT_DIR,
}={}){
  const files=fs.existsSync(receiptDir)
    ?fs.readdirSync(receiptDir)
      .filter(name=>name.endsWith(".json"))
      .sort()
    :[];
  const receipts=[];
  for(const name of files){
    const full=path.join(receiptDir,name);
    try{
      const row=JSON.parse(fs.readFileSync(full,"utf8"));
      receipts.push({file:name,...row});
    }catch{
      receipts.push({
        file:name,
        schema:"INVALID_JSON",
        simulation_only:null,
        live_trade_authority:null,
      });
    }
  }

  const valid=receipts.filter(x=>x.schema!=="INVALID_JSON");
  const simulated=valid.filter(x=>x.simulation_only===true);
  const anyLiveAuthority=valid.some(x=>x.live_trade_authority===true);
  const capitalAtRisk=valid
    .map(x=>finite(x.capital_at_risk_usd))
    .filter(Number.isFinite);

  const prospective=valid.filter(
    x=>x.schema==="evercraft.daytrade.prospective-spread-rule-practice-summary.v1"
  );
  const prospectiveImprovements=prospective
    .map(x=>finite(x?.aggregate?.rule_improvement_vs_always_cross_usd))
    .filter(Number.isFinite);
  const governedPnl=prospective
    .map(x=>finite(x?.aggregate?.governed_total_pnl_usd))
    .filter(Number.isFinite);
  const alwaysCrossPnl=prospective
    .map(x=>finite(x?.aggregate?.always_cross_total_pnl_usd))
    .filter(Number.isFinite);

  const spreadPersistence=valid.filter(
    x=>x.schema==="evercraft.daytrade.spread-persistence-practice-summary.v1"
  );

  return {
    schema:"evercraft.daytrade.practice-scorecard.v1",
    generated_at:new Date().toISOString(),
    receipt_count:valid.length,
    invalid_receipt_count:receipts.length-valid.length,
    simulation_receipt_count:simulated.length,
    total_reported_capital_at_risk_usd:sum(capitalAtRisk),
    any_live_trade_authority:anyLiveAuthority,
    prospective_spread_rule:{
      rule_id:"spread-abstention-v1",
      windows:prospective.length,
      helped_windows:prospectiveImprovements.filter(x=>x>0).length,
      hurt_windows:prospectiveImprovements.filter(x=>x<0).length,
      neutral_windows:prospectiveImprovements.filter(x=>x===0).length,
      cumulative_rule_improvement_vs_always_cross_usd:
        sum(prospectiveImprovements),
      mean_rule_improvement_vs_always_cross_usd:
        mean(prospectiveImprovements),
      cumulative_governed_pnl_usd:sum(governedPnl),
      cumulative_always_cross_pnl_usd:sum(alwaysCrossPnl),
      evidence_state:
        prospective.length>=5
          ?"PRACTICE_SERIES_FORMING"
          :"PRACTICE_SAMPLE_TOO_SMALL",
      independent_market_validation:false,
      live_rule_authorized:false,
    },
    spread_persistence_receipts:spreadPersistence.length,
    controls:{
      failed_or_negative_practice_must_remain_in_ledger:true,
      same_day_selection_bias_disclosed:true,
      no_threshold_retuning_from_scorecard:true,
      practice_not_signal_validation:true,
      practice_not_live_fill_validation:true,
      live_trade_authority:false,
    },
    receipts:valid.map(x=>({
      file:x.file,
      schema:x.schema,
      generated_at:x.generated_at||null,
      source_run_id:x.source_run_id||null,
      simulation_only:x.simulation_only===true,
      live_trade_authority:x.live_trade_authority===true,
    })),
    live_trade_authority:false,
  };
}

async function main(){
  const receiptDir=process.env.DAYTRADE_PRACTICE_RECEIPT_DIR||DEFAULT_RECEIPT_DIR;
  const output=process.env.DAYTRADE_PRACTICE_SCORECARD_OUTPUT||"";
  const scorecard=buildPracticeScorecard({receiptDir});
  if(output){
    fs.mkdirSync(path.dirname(output),{recursive:true});
    fs.writeFileSync(output,JSON.stringify(scorecard,null,2)+"\n");
  }
  console.log(JSON.stringify(scorecard,null,2));
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
  main().catch(error=>{
    console.error("Practice scorecard failed:",error?.message||String(error));
    process.exitCode=1;
  });
}
