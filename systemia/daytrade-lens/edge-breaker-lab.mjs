import crypto from "node:crypto";

function mean(xs){ return xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:0; }
function uniq(xs){ return [...new Set((xs||[]).filter(Boolean))]; }
function expectedSign(candidate){ return candidate.learned_direction==="NEGATIVE_EXCESS_RETURN"?-1:1; }
function signedNet(row, sign, costBps=5){
  const raw=Number(row.forward_return||0)-Number(row.benchmark_return||0);
  return sign*raw-(costBps/10000);
}
function shaInt(seed){ return crypto.createHash("sha256").update(String(seed)).digest().readUInt32BE(0); }
function rng(seed){
  let x=shaInt(seed)||1;
  return()=>{x^=x<<13;x>>>=0;x^=x>>>17;x>>>=0;x^=x<<5;x>>>=0;return(x>>>0)/4294967296;};
}
function percentile(values,p){
  if(!values.length)return 0;
  const s=[...values].sort((a,b)=>a-b);
  const i=Math.max(0,Math.min(s.length-1,Math.floor((s.length-1)*p)));
  return s[i];
}
function quarterKey(row){
  const d=new Date(row.observed_at);
  if(!Number.isFinite(d.getTime())) return "invalid";
  return `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth()/3)+1}`;
}
function dayKey(row){
  const d=new Date(row.observed_at);
  return Number.isFinite(d.getTime())?d.toISOString().slice(0,10):"invalid";
}

export function dedupeOriginDay(rows){
  const seen=new Set();
  const out=[];
  for(const row of [...rows].sort((a,b)=>new Date(a.observed_at)-new Date(b.observed_at))){
    const key=`${row.origin_entity_ref||"unknown"}|${dayKey(row)}`;
    if(seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

export function leaveOneQuarterOut(rows,{sign=1,cost_bps=5}={}){
  const quarters=uniq(rows.map(quarterKey)).filter(x=>x!=="invalid");
  const folds=quarters.map(q=>{
    const kept=rows.filter(r=>quarterKey(r)!==q);
    const value=mean(kept.map(r=>signedNet(r,sign,cost_bps)));
    return {omitted_quarter:q,observations:kept.length,mean_signed_net:value,positive:value>0};
  });
  return {quarter_count:quarters.length,folds,all_positive:folds.length>0&&folds.every(x=>x.positive)};
}

export function issuerContributionStress(rows,{sign=1,cost_bps=5,max_share=0.40}={}){
  const by=new Map();
  for(const row of rows){
    const k=row.origin_entity_ref||"unknown";
    if(!by.has(k)) by.set(k,[]);
    by.get(k).push(signedNet(row,sign,cost_bps));
  }
  const contributions=[...by.entries()].map(([origin,vals])=>({
    origin,
    observations:vals.length,
    mean_signed_net:mean(vals),
    positive_contribution:Math.max(0,vals.reduce((a,b)=>a+b,0)),
  }));
  const total=contributions.reduce((a,b)=>a+b.positive_contribution,0);
  for(const x of contributions) x.positive_share=total>0?x.positive_contribution/total:0;
  const max=Math.max(0,...contributions.map(x=>x.positive_share));
  return {origin_count:contributions.length,max_positive_share:max,max_share_threshold:max_share,pass:max<=max_share,contributions};
}

export function trimmedStress(rows,{sign=1,cost_bps=5,trim_fraction=0.10}={}){
  const values=rows.map(r=>signedNet(r,sign,cost_bps)).sort((a,b)=>a-b);
  const trim=Math.floor(values.length*trim_fraction);
  const kept=values.slice(trim,Math.max(trim,values.length-trim));
  return {observations:values.length,trimmed_observations:kept.length,trim_fraction,trimmed_mean_signed_net:mean(kept),pass:mean(kept)>0};
}

export function signConsistency(rows,{sign=1,cost_bps=5}={}){
  const vals=rows.map(r=>signedNet(r,sign,cost_bps));
  const positive=vals.filter(x=>x>0).length;
  return {observations:vals.length,positive_count:positive,positive_rate:vals.length?positive/vals.length:0,pass:vals.length>0&&positive/vals.length>0.5};
}

export function clusteredBootstrap(rows,{sign=1,cost_bps=5,iterations=2000,seed="edge-breaker"}={}){
  const clusters=new Map();
  for(const row of rows){
    const key=`${row.origin_entity_ref||"unknown"}|${quarterKey(row)}`;
    if(!clusters.has(key)) clusters.set(key,[]);
    clusters.get(key).push(row);
  }
  const groups=[...clusters.values()];
  if(groups.length<2) return {cluster_count:groups.length,iterations:0,p05:0,probability_positive:0};
  const random=rng(seed);
  const draws=[];
  for(let i=0;i<iterations;i++){
    const sample=[];
    for(let j=0;j<groups.length;j++){
      sample.push(...groups[Math.floor(random()*groups.length)]);
    }
    draws.push(mean(sample.map(r=>signedNet(r,sign,cost_bps))));
  }
  return {
    cluster_count:groups.length,
    iterations,
    p05:percentile(draws,.05),
    p50:percentile(draws,.50),
    p95:percentile(draws,.95),
    probability_positive:draws.filter(x=>x>0).length/draws.length,
    pass:percentile(draws,.05)>0,
  };
}


export function eventDayClusteredBootstrap(rows,{sign=1,cost_bps=5,iterations=2000,seed="edge-day-cluster"}={}){
  const clusters=new Map();
  for(const row of rows){
    const key=dayKey(row);
    if(!clusters.has(key)) clusters.set(key,[]);
    clusters.get(key).push(row);
  }
  const groups=[...clusters.values()];
  if(groups.length<2) return {cluster_count:groups.length,iterations:0,p05:0,probability_positive:0,pass:false};
  const random=rng(seed);
  const draws=[];
  for(let i=0;i<iterations;i++){
    const sample=[];
    for(let j=0;j<groups.length;j++){
      sample.push(...groups[Math.floor(random()*groups.length)]);
    }
    draws.push(mean(sample.map(r=>signedNet(r,sign,cost_bps))));
  }
  const p05=percentile(draws,.05);
  return {
    cluster_unit:"event_day",
    cluster_count:groups.length,
    iterations,
    p05,
    p50:percentile(draws,.50),
    p95:percentile(draws,.95),
    probability_positive:draws.filter(x=>x>0).length/draws.length,
    pass:p05>0,
  };
}

export function topWinnerRemovalStress(rows,{sign=1,cost_bps=5,remove_fraction=0.05}={}){
  const values=rows.map(r=>signedNet(r,sign,cost_bps)).sort((a,b)=>b-a);
  if(!values.length) return {
    observations:0,
    removed:0,
    remove_fraction,
    mean_after_removal:0,
    pass:false,
  };
  const removeCount=Math.max(1,Math.floor(values.length*remove_fraction));
  const kept=values.slice(removeCount);
  const value=mean(kept);
  return {
    observations:values.length,
    removed:removeCount,
    remove_fraction,
    removed_winner_floor:values[Math.max(0,removeCount-1)]||0,
    mean_after_removal:value,
    pass:kept.length>0&&value>0,
  };
}

export function breakCandidate(candidate,rows){
  const sign=expectedSign(candidate);
  const deduped=dedupeOriginDay(rows);
  const looQ=leaveOneQuarterOut(deduped,{sign});
  const issuer=issuerContributionStress(deduped,{sign});
  const trimmed=trimmedStress(deduped,{sign});
  const signs=signConsistency(deduped,{sign});
  const clustered=clusteredBootstrap(deduped,{sign,seed:candidate.signal_key+":cluster"});
  const dayClustered=eventDayClusteredBootstrap(deduped,{sign,seed:candidate.signal_key+":day-cluster"});
  const topWinnerRemoval=topWinnerRemovalStress(deduped,{sign});
  const checks={
    deduped_sample_at_least_40:deduped.length>=40,
    leave_one_quarter_out_all_positive:looQ.all_positive,
    issuer_positive_contribution_not_dominated:issuer.pass,
    trimmed_mean_positive:trimmed.pass,
    event_sign_consistency:signs.pass,
    clustered_bootstrap_p05_positive:clustered.pass,
    event_day_clustered_bootstrap_p05_positive:dayClustered.pass,
    survives_top_5pct_winner_removal:topWinnerRemoval.pass,
  };
  return {
    schema:"evercraft.daytrade.edge-breaker-candidate.v1",
    signal_key:candidate.signal_key,
    original_observations:rows.length,
    deduped_observations:deduped.length,
    leave_one_quarter_out:looQ,
    issuer_contribution_stress:issuer,
    trimmed_stress:trimmed,
    sign_consistency:signs,
    clustered_bootstrap:clustered,
    event_day_clustered_bootstrap:dayClustered,
    top_winner_removal_stress:topWinnerRemoval,
    checks,
    breaker_status:Object.values(checks).every(Boolean)?"BREAKER_SURVIVOR":"BREAKER_CRACKED",
    live_trade_authority:false,
  };
}

export function runEdgeBreakerLab(report){
  const evaluations=report?.evaluations||[];
  const measurements=report?.measurements||[];
  const candidates=evaluations.filter(x=>x.status==="RESEARCH_CANDIDATE");
  if(candidates.length&&!measurements.length) throw new Error("edge_breaker_measurement_evidence_missing");
  const reviews=candidates.map(c=>breakCandidate(c,measurements.filter(r=>r.signal_key===c.signal_key)));
  return {
    schema:"evercraft.daytrade.edge-breaker-lab.v1",
    generated_at:new Date().toISOString(),
    candidate_count:reviews.length,
    breaker_survivor_count:reviews.filter(x=>x.breaker_status==="BREAKER_SURVIVOR").length,
    reviews,
    live_trade_authority:false,
  };
}
