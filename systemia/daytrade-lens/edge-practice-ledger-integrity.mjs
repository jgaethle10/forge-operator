import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const HERE=path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_RECEIPT_DIR=path.join(HERE,"paper-receipts");
const DEFAULT_HOLD_MS=60000;

function ms(v){
  const n=Date.parse(String(v??""));
  return Number.isFinite(n)?n:null;
}
function finite(v){
  if(v===null||v===undefined||v==="") return null;
  const n=Number(v);
  return Number.isFinite(n)?n:null;
}
function phaseEt(timestamp){
  const d=new Date(timestamp);
  if(!Number.isFinite(d.getTime())) return "UNKNOWN";
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

export function buildPracticeLedgerIntegrity({
  receiptDir=DEFAULT_RECEIPT_DIR,
  defaultHoldMs=DEFAULT_HOLD_MS,
}={}){
  const rows=[];
  for(const file of fs.readdirSync(receiptDir).filter(x=>x.endsWith(".json")).sort()){
    let r;
    try{
      r=JSON.parse(fs.readFileSync(path.join(receiptDir,file),"utf8"));
    }catch{
      rows.push({file,invalid_json:true});
      continue;
    }
    if(r?.schema!=="evercraft.daytrade.prospective-spread-rule-practice-summary.v1") continue;
    const endMs=ms(r.window_end_at??r.generated_at);
    const holdMs=finite(r.hold_ms)??defaultHoldMs;
    const startMs=ms(r.window_start_at)??(
      endMs===null?null:endMs-holdMs
    );
    rows.push({
      file,
      source_run_id:r.source_run_id??null,
      source_artifact_id:r.source_artifact_id??null,
      source_artifact_digest:r.source_artifact_digest??null,
      generated_at:r.generated_at??null,
      start_ms:startMs,
      end_ms:endMs,
      phase:r.market_phase_et??phaseEt(r.generated_at),
      rule_id:r.rule_id??null,
      frozen_threshold_bps:finite(r.frozen_threshold_bps),
      simulation_only:r.simulation_only===true,
      live_trade_authority:r.live_trade_authority===true,
    });
  }

  const duplicateRunIds=[];
  const duplicateArtifactIds=[];
  const duplicateDigests=[];
  for(const [field,target] of [
    ["source_run_id",duplicateRunIds],
    ["source_artifact_id",duplicateArtifactIds],
    ["source_artifact_digest",duplicateDigests],
  ]){
    const seen=new Map();
    for(const row of rows){
      const value=row[field];
      if(value===null||value===undefined||value==="") continue;
      if(seen.has(value)){
        target.push({
          value,
          files:[seen.get(value),row.file]
        });
      }else{
        seen.set(value,row.file);
      }
    }
  }

  const overlaps=[];
  const timed=rows.filter(x=>Number.isFinite(x.start_ms)&&Number.isFinite(x.end_ms))
    .sort((a,b)=>a.start_ms-b.start_ms);
  for(let i=0;i<timed.length;i++){
    for(let j=i+1;j<timed.length;j++){
      if(timed[j].start_ms>=timed[i].end_ms) break;
      const overlapMs=Math.min(timed[i].end_ms,timed[j].end_ms)-
        Math.max(timed[i].start_ms,timed[j].start_ms);
      if(overlapMs>0){
        overlaps.push({
          files:[timed[i].file,timed[j].file],
          overlap_ms:overlapMs,
          phases:[timed[i].phase,timed[j].phase],
        });
      }
    }
  }

  const authorityViolations=rows.filter(x=>
    x.simulation_only!==true||x.live_trade_authority!==false
  ).map(x=>x.file);
  const ruleDrift=rows.filter(x=>
    x.rule_id!=="spread-abstention-v1"||
    x.frozen_threshold_bps!==3
  ).map(x=>x.file);

  const invalidJson=rows.filter(x=>x.invalid_json).map(x=>x.file);
  const ok=
    !invalidJson.length &&
    !duplicateRunIds.length &&
    !duplicateArtifactIds.length &&
    !duplicateDigests.length &&
    !authorityViolations.length &&
    !ruleDrift.length;

  return {
    schema:"evercraft.daytrade.practice-ledger-integrity.v1",
    generated_at:new Date().toISOString(),
    prospective_receipts:rows.filter(x=>!x.invalid_json).length,
    ok,
    violations:{
      invalid_json:invalidJson,
      duplicate_source_run_ids:duplicateRunIds,
      duplicate_source_artifact_ids:duplicateArtifactIds,
      duplicate_source_artifact_digests:duplicateDigests,
      authority_violations:authorityViolations,
      frozen_rule_drift:ruleDrift,
    },
    independence_exclusions:{
      physically_overlapping_windows:overlaps,
    },
    controls:{
      duplicate_runs_cannot_count_twice:true,
      duplicate_artifacts_cannot_count_twice:true,
      overlapping_windows_are_preserved_but_not_independent_practice:true,
      frozen_rule_drift_blocks_integrity:true,
      any_live_authority_blocks_integrity:true,
    },
    live_trade_authority:false,
  };
}

async function main(){
  const receiptDir=process.env.DAYTRADE_PRACTICE_RECEIPT_DIR||DEFAULT_RECEIPT_DIR;
  const output=process.env.DAYTRADE_LEDGER_INTEGRITY_OUTPUT||"";
  const report=buildPracticeLedgerIntegrity({receiptDir});
  if(output){
    fs.mkdirSync(path.dirname(output),{recursive:true});
    fs.writeFileSync(output,JSON.stringify(report,null,2)+"\n");
  }
  console.log(JSON.stringify(report,null,2));
  if(!report.ok) process.exitCode=2;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
  main().catch(error=>{
    console.error("Practice ledger integrity failed:",error?.message||String(error));
    process.exitCode=1;
  });
}
