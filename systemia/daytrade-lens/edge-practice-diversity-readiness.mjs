import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const HERE=path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_RECEIPT_DIR=path.join(HERE,"paper-receipts");
const DEFAULT_PROTOCOL_PATH=path.join(
  HERE,"practice-rules","practice-diversity-protocol-v1.json"
);

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
    hour:Number(p.hour),
    minute:Number(p.minute),
  };
}
function phaseEt(timestamp){
  const p=partsEt(timestamp);
  if(!p) return "UNKNOWN";
  const minuteOfDay=p.hour*60+p.minute;
  if(minuteOfDay>=570&&minuteOfDay<630) return "OPENING";
  if(minuteOfDay>=630&&minuteOfDay<900) return "MIDDAY";
  if(minuteOfDay>=900&&minuteOfDay<960) return "CLOSING";
  return "OUTSIDE_CORE";
}

function selectIndependentWindows(windows,minSeparationMinutes){
  const minMs=Math.max(0,Number(minSeparationMinutes||0))*60*1000;
  if(minMs===0) return [...windows];
  const sorted=[...windows].sort(
    (a,b)=>new Date(a.generated_at).getTime()-new Date(b.generated_at).getTime()
  );
  const kept=[];
  const lastByBucket=new Map();
  for(const window of sorted){
    const ms=new Date(window.generated_at).getTime();
    if(!Number.isFinite(ms)) continue;
    const bucket=`${window.market_date_et}|${window.market_phase_et}`;
    const last=lastByBucket.get(bucket);
    if(last===undefined||ms-last>=minMs){
      kept.push(window);
      lastByBucket.set(bucket,ms);
    }
  }
  return kept;
}

export function buildPracticeDiversityReadiness({
  receiptDir=DEFAULT_RECEIPT_DIR,
  protocolPath=DEFAULT_PROTOCOL_PATH,
}={}){
  const protocol=JSON.parse(fs.readFileSync(protocolPath,"utf8"));
  if(protocol?.schema!=="evercraft.daytrade.practice-diversity-protocol.v1"){
    throw new Error("practice_diversity_protocol_schema_invalid");
  }

  const rawWindows=[];
  for(const file of fs.readdirSync(receiptDir).filter(x=>x.endsWith(".json")).sort()){
    const row=JSON.parse(fs.readFileSync(path.join(receiptDir,file),"utf8"));
    if(
      row?.schema!=="evercraft.daytrade.prospective-spread-rule-practice-summary.v1"
    ) continue;
    const p=partsEt(row.generated_at);
    rawWindows.push({
      file,
      generated_at:row.generated_at,
      market_date_et:p?.date||null,
      market_phase_et:phaseEt(row.generated_at),
      source_run_id:row.source_run_id||null,
    });
  }

  const minSeparationMinutes=Number(
    protocol.minimum_independent_window_separation_minutes||0
  );
  const windows=selectIndependentWindows(rawWindows,minSeparationMinutes);
  const dates=[...new Set(windows.map(x=>x.market_date_et).filter(Boolean))].sort();
  const phaseCounts={OPENING:0,MIDDAY:0,CLOSING:0,OUTSIDE_CORE:0,UNKNOWN:0};
  for(const w of windows){
    phaseCounts[w.market_phase_et]=(phaseCounts[w.market_phase_et]||0)+1;
  }

  const requiredPhases=protocol.required_market_phases||[];
  const phaseReady=requiredPhases.every(
    phase=>(phaseCounts[phase]||0)>=Number(protocol.minimum_windows_per_required_phase)
  );
  const windowReady=
    windows.length>=Number(protocol.minimum_prospective_windows);
  const dateReady=
    dates.length>=Number(protocol.minimum_distinct_market_dates);

  return {
    schema:"evercraft.daytrade.practice-diversity-readiness.v1",
    generated_at:new Date().toISOString(),
    protocol_id:protocol.protocol_id,
    frozen_execution_rule:protocol.frozen_execution_rule,
    observed:{
      raw_prospective_windows:rawWindows.length,
      prospective_windows:windows.length,
      independent_prospective_windows:windows.length,
      near_duplicate_windows_excluded:rawWindows.length-windows.length,
      distinct_market_dates_et:dates.length,
      market_dates_et:dates,
      phase_counts:phaseCounts,
    },
    requirements:{
      minimum_prospective_windows:protocol.minimum_prospective_windows,
      minimum_distinct_market_dates:protocol.minimum_distinct_market_dates,
      required_market_phases:requiredPhases,
      minimum_windows_per_required_phase:
        protocol.minimum_windows_per_required_phase,
      minimum_independent_window_separation_minutes:minSeparationMinutes,
    },
    gates:{
      window_count_ready:windowReady,
      date_diversity_ready:dateReady,
      phase_diversity_ready:phaseReady,
    },
    status:
      windowReady&&dateReady&&phaseReady
        ?"PRACTICE_DIVERSITY_READY"
        :"PRACTICE_DIVERSITY_NOT_READY",
    interpretation:{
      same_day_repetition_cannot_satisfy_date_diversity:true,
      single_phase_repetition_cannot_satisfy_phase_diversity:true,
      near_duplicate_windows_do_not_count_as_independent:true,
      passing_this_protocol_does_not_validate_signal:true,
      passing_this_protocol_does_not_validate_live_fill_quality:true,
      passing_this_protocol_does_not_authorize_live_trading:true,
    },
    windows,
    excluded_near_duplicate_windows:rawWindows.filter(
      raw=>!windows.some(kept=>kept.file===raw.file)
    ),
    live_trade_authority:false,
  };
}

async function main(){
  const receiptDir=process.env.DAYTRADE_PRACTICE_RECEIPT_DIR||DEFAULT_RECEIPT_DIR;
  const protocolPath=process.env.DAYTRADE_PRACTICE_PROTOCOL_PATH||DEFAULT_PROTOCOL_PATH;
  const output=process.env.DAYTRADE_DIVERSITY_OUTPUT||"";
  const report=buildPracticeDiversityReadiness({receiptDir,protocolPath});
  if(output){
    fs.mkdirSync(path.dirname(output),{recursive:true});
    fs.writeFileSync(output,JSON.stringify(report,null,2)+"\n");
  }
  console.log(JSON.stringify(report,null,2));
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
  main().catch(error=>{
    console.error("Practice diversity readiness failed:",error?.message||String(error));
    process.exitCode=1;
  });
}
