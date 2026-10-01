import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

function canonical(value){
  if(Array.isArray(value)) return value.map(canonical);
  if(value && typeof value==="object"){
    return Object.fromEntries(
      Object.keys(value).sort().map((key)=>[key,canonical(value[key])])
    );
  }
  return value;
}
function sha(value){
  return crypto.createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}
function ensurePrivateDir(dir){
  fs.mkdirSync(dir,{recursive:true,mode:0o700});
}
function appendDurable(file,value){
  ensurePrivateDir(path.dirname(file));
  const fd=fs.openSync(file,"a",0o600);
  try{
    fs.writeSync(fd,JSON.stringify(value)+"\n");
    fs.fsyncSync(fd);
  }finally{
    fs.closeSync(fd);
  }
}
function readJournal(file){
  if(!fs.existsSync(file)){
    return {records:[],head_hash:"GENESIS",tail_recovered:false};
  }
  const raw=fs.readFileSync(file,"utf8");
  const endsWithNewline=raw.endsWith("\n");
  const lines=raw.split("\n");
  if(endsWithNewline) lines.pop();

  let tailRecovered=false;
  if(!endsWithNewline && lines.length){
    try{JSON.parse(lines[lines.length-1]);}
    catch{
      lines.pop();
      tailRecovered=true;
    }
  }

  const records=[];
  let previous="GENESIS";
  let seq=1;
  for(const line of lines){
    if(!line.trim()) continue;
    let record;
    try{record=JSON.parse(line);}
    catch{throw new Error("edge_trial_cemetery_corrupt_json");}
    if(record.schema!=="evercraft.daytrade.research-trial-cemetery.record.v1"){
      throw new Error("edge_trial_cemetery_schema_mismatch");
    }
    if(record.seq!==seq) throw new Error("edge_trial_cemetery_sequence_gap");
    if(record.previous_hash!==previous) throw new Error("edge_trial_cemetery_chain_break");
    const body={...record};
    delete body.record_hash;
    if(record.record_hash!==sha(body)){
      throw new Error("edge_trial_cemetery_hash_mismatch");
    }
    records.push(record);
    previous=record.record_hash;
    seq+=1;
  }
  return {records,head_hash:previous,tail_recovered:tailRecovered};
}
function appendRecord(state,file,type,payload){
  const body={
    schema:"evercraft.daytrade.research-trial-cemetery.record.v1",
    seq:state.records.length+1,
    type,
    at:new Date().toISOString(),
    previous_hash:state.head_hash,
    ...payload,
  };
  const record={...body,record_hash:sha(body)};
  appendDurable(file,record);
  state.records.push(record);
  state.head_hash=record.record_hash;
  return record;
}
function finite(value){
  if(value===null||value===undefined||value==="") return null;
  const n=Number(value);
  return Number.isFinite(n)?n:null;
}
function evaluationSnapshot(row){
  return {
    signal_key:row?.signal_key||null,
    rockies_range:row?.rockies_range||null,
    observation_kind:row?.observation_kind||null,
    instrument:row?.instrument||null,
    benchmark:row?.benchmark||null,
    lag_key:row?.lag_key||null,
    status:row?.status||null,
    learned_direction:row?.learned_direction||null,
    observation_count:finite(row?.observation_count),
    distinct_source_families:finite(row?.distinct_source_families),
    development_q_bh:finite(row?.development_q_bh),
    development_p_approx:finite(row?.development_p_approx),
    holdout_mean_excess_return_net:
      finite(row?.base_evaluation?.holdout?.mean_excess_return_net),
    holdout_positive_rate:
      finite(row?.base_evaluation?.holdout?.positive_rate),
  };
}
function stableReportEvidence(report){
  return {
    hypothesis_count:finite(report?.hypothesis_count),
    measurement_count:finite(report?.measurement_count),
    family_count:finite(report?.family_count),
    evaluations:(report?.evaluations||[])
      .map(evaluationSnapshot)
      .sort((a,b)=>String(a.signal_key).localeCompare(String(b.signal_key))),
  };
}

export class ResearchTrialCemetery {
  constructor({root}={}){
    if(!root) throw new Error("edge_trial_cemetery_root_required");
    this.root=path.resolve(root);
    ensurePrivateDir(this.root);
    this.file=path.join(this.root,"research-trial-cemetery.jsonl");
    this.state=readJournal(this.file);
    this.observations=new Map();
    this.completedRuns=new Set();

    for(const record of this.state.records){
      if(record.type==="trial.observed"){
        const key=record.run_digest+"|"+record.trial_fingerprint;
        if(this.observations.has(key)){
          throw new Error("edge_trial_cemetery_duplicate_observation_record");
        }
        this.observations.set(key,record);
      }
      if(record.type==="run.completed"){
        this.completedRuns.add(record.run_digest);
      }
    }
  }

  ingestReport(report,{
    research_config={},
    source_digest=null,
  }={}){
    const evaluations=Array.isArray(report?.evaluations)?report.evaluations:[];
    const evidence=stableReportEvidence(report);
    const config=canonical(research_config);
    const runDigest=sha({
      source_digest:source_digest||null,
      research_config:config,
      report_evidence:evidence,
    });

    let appended=0;
    let duplicates=0;
    for(const evaluation of evaluations){
      const snapshot=evaluationSnapshot(evaluation);
      const trialFingerprint=sha({
        signal_key:snapshot.signal_key,
        rockies_range:snapshot.rockies_range,
        observation_kind:snapshot.observation_kind,
        instrument:snapshot.instrument,
        benchmark:snapshot.benchmark,
        lag_key:snapshot.lag_key,
        research_config:config,
      });
      const observationKey=runDigest+"|"+trialFingerprint;
      if(this.observations.has(observationKey)){
        duplicates+=1;
        continue;
      }
      const record=appendRecord(
        this.state,
        this.file,
        "trial.observed",
        {
          run_digest:runDigest,
          trial_fingerprint:trialFingerprint,
          source_digest:source_digest||null,
          research_config:config,
          evaluation:snapshot,
          research_only:true,
          live_trade_authority:false,
        }
      );
      this.observations.set(observationKey,record);
      appended+=1;
    }

    let completionRecord=null;
    if(!this.completedRuns.has(runDigest)){
      completionRecord=appendRecord(
        this.state,
        this.file,
        "run.completed",
        {
          run_digest:runDigest,
          source_digest:source_digest||null,
          research_config:config,
          family_count:evaluations.length,
          candidate_count:evaluations.filter(
            (row)=>row?.status==="RESEARCH_CANDIDATE"
          ).length,
          research_only:true,
          live_trade_authority:false,
        }
      );
      this.completedRuns.add(runDigest);
    }

    return {
      schema:"evercraft.daytrade.research-trial-cemetery-ingest.v1",
      run_digest:runDigest,
      family_rows_seen:evaluations.length,
      appended,
      duplicates,
      run_completion_appended:Boolean(completionRecord),
      all_statuses_retained:true,
      winner_only_storage_forbidden:true,
      live_trade_authority:false,
    };
  }

  summary(){
    const trialRecords=[...this.observations.values()];
    const statusCounts={};
    const trialConfigs=new Set();
    const signalKeys=new Set();
    for(const record of trialRecords){
      const status=record.evaluation?.status||"unknown";
      statusCounts[status]=Number(statusCounts[status]||0)+1;
      trialConfigs.add(record.trial_fingerprint);
      if(record.evaluation?.signal_key) signalKeys.add(record.evaluation.signal_key);
    }
    return {
      schema:"evercraft.daytrade.research-trial-cemetery-summary.v1",
      run_count:this.completedRuns.size,
      trial_observation_count:trialRecords.length,
      unique_trial_configuration_count:trialConfigs.size,
      unique_signal_key_count:signalKeys.size,
      status_counts:statusCounts,
      journal_records:this.state.records.length,
      head_hash:this.state.head_hash,
      tail_recovered:this.state.tail_recovered,
      all_statuses_retained:true,
      rejected_and_failed_trials_are_first_class_history:true,
      winner_only_storage_forbidden:true,
      live_trade_authority:false,
    };
  }
}
