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
const NY_EVENT_DATE = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function marketDateParts(row){
  const d=new Date(row.observed_at);
  if(!Number.isFinite(d.getTime())) return null;
  const parts=Object.fromEntries(
    NY_EVENT_DATE.formatToParts(d).map((part)=>[part.type,part.value])
  );
  return {
    year:Number(parts.year),
    month:Number(parts.month),
    day:Number(parts.day),
  };
}
function quarterKey(row){
  const p=marketDateParts(row);
  if(!p) return "invalid";
  return `${p.year}-Q${Math.floor((p.month-1)/3)+1}`;
}
function dayKey(row){
  const p=marketDateParts(row);
  if(!p) return "invalid";
  return `${String(p.year).padStart(4,"0")}-${String(p.month).padStart(2,"0")}-${String(p.day).padStart(2,"0")}`;
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

export function leaveOneIssuerOut(rows,{sign=1,cost_bps=5}={}){
  const issuers=uniq(rows.map(r=>r.origin_entity_ref||"unknown"));
  const folds=issuers.map(origin=>{
    const kept=rows.filter(r=>(r.origin_entity_ref||"unknown")!==origin);
    const value=mean(kept.map(r=>signedNet(r,sign,cost_bps)));
    return {omitted_origin:origin,observations:kept.length,mean_signed_net:value,positive:kept.length>0&&value>0};
  });
  return {
    origin_count:issuers.length,
    folds,
    minimum_fold_mean_signed_net:folds.length?Math.min(...folds.map(x=>x.mean_signed_net)):0,
    all_positive:folds.length>1&&folds.every(x=>x.positive),
  };
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
  return {observations:values.length,trimmed_observations:kept.length,trim_fraction,trimmed_mean_signed_net:mean(kept),pass:kept.length>0&&mean(kept)>0};
}

export function winsorizedStress(rows,{sign=1,cost_bps=5,tail_fraction=0.05}={}){
  const values=rows.map(r=>signedNet(r,sign,cost_bps));
  if(!values.length) return {observations:0,tail_fraction,winsorized_mean_signed_net:0,median_signed_net:0,pass:false};
  const low=percentile(values,tail_fraction);
  const high=percentile(values,1-tail_fraction);
  const winsorized=values.map(v=>Math.max(low,Math.min(high,v)));
  const med=percentile(values,.50);
  return {
    observations:values.length,
    tail_fraction,
    lower_cap:low,
    upper_cap:high,
    winsorized_mean_signed_net:mean(winsorized),
    median_signed_net:med,
    pass:mean(winsorized)>0,
    median_positive:med>0,
  };
}

export function downsideTailAnalysis(rows,{sign=1,cost_bps=5}={}){
  const values=rows.map(r=>signedNet(r,sign,cost_bps));
  if(!values.length) return {
    observations:0,p05:0,p10:0,median:0,minimum:0,worst_decile_mean:0,positive_rate:0
  };
  const sorted=[...values].sort((a,b)=>a-b);
  const tailCount=Math.max(1,Math.ceil(sorted.length*0.10));
  return {
    observations:values.length,
    p05:percentile(values,.05),
    p10:percentile(values,.10),
    median:percentile(values,.50),
    minimum:sorted[0],
    worst_decile_mean:mean(sorted.slice(0,tailCount)),
    positive_rate:values.filter(x=>x>0).length/values.length,
  };
}

export function signConsistency(rows,{sign=1,cost_bps=5}={}){
  const vals=rows.map(r=>signedNet(r,sign,cost_bps));
  const positive=vals.filter(x=>x>0).length;
  return {observations:vals.length,positive_count:positive,positive_rate:vals.length?positive/vals.length:0,pass:vals.length>0&&positive/vals.length>0.5};
}

function bootstrapGroups(groups,{sign=1,cost_bps=5,iterations=2000,seed="edge-breaker",cluster_unit="cluster"}={}){
  if(groups.length<2) return {cluster_unit,cluster_count:groups.length,iterations:0,p05:0,p50:0,p95:0,probability_positive:0,pass:false};
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
    cluster_unit,
    cluster_count:groups.length,
    iterations,
    p05,
    p50:percentile(draws,.50),
    p95:percentile(draws,.95),
    probability_positive:draws.filter(x=>x>0).length/draws.length,
    pass:p05>0,
  };
}

export function clusteredBootstrap(rows,{sign=1,cost_bps=5,iterations=2000,seed="edge-breaker"}={}){
  const clusters=new Map();
  for(const row of rows){
    const key=`${row.origin_entity_ref||"unknown"}|${quarterKey(row)}`;
    if(!clusters.has(key)) clusters.set(key,[]);
    clusters.get(key).push(row);
  }
  return bootstrapGroups([...clusters.values()],{sign,cost_bps,iterations,seed,cluster_unit:"issuer_quarter"});
}

export function issuerClusteredBootstrap(rows,{sign=1,cost_bps=5,iterations=2000,seed="edge-issuer-cluster"}={}){
  const clusters=new Map();
  for(const row of rows){
    const key=row.origin_entity_ref||"unknown";
    if(!clusters.has(key)) clusters.set(key,[]);
    clusters.get(key).push(row);
  }
  return bootstrapGroups([...clusters.values()],{sign,cost_bps,iterations,seed,cluster_unit:"issuer"});
}

export function eventDayClusteredBootstrap(rows,{sign=1,cost_bps=5,iterations=2000,seed="edge-day-cluster"}={}){
  const clusters=new Map();
  for(const row of rows){
    const key=dayKey(row);
    if(!clusters.has(key)) clusters.set(key,[]);
    clusters.get(key).push(row);
  }
  return bootstrapGroups([...clusters.values()],{sign,cost_bps,iterations,seed,cluster_unit:"event_day"});
}

export function temporalBlockBootstrap(rows,{
  sign=1,
  cost_bps=5,
  iterations=2000,
  seed="edge-temporal-block",
  block_size_days=5,
}={}){
  const dayMap=new Map();
  for(const row of rows){
    const key=dayKey(row);
    if(key==="invalid") continue;
    if(!dayMap.has(key)) dayMap.set(key,[]);
    dayMap.get(key).push(row);
  }
  const days=[...dayMap.keys()].sort();
  const groups=days.map(day=>dayMap.get(day));
  if(groups.length<2) return {
    cluster_unit:"moving_event_day_block",
    day_count:groups.length,
    block_size_days,
    iterations:0,
    p05:0,p50:0,p95:0,probability_positive:0,pass:false,
  };
  const block=Math.max(1,Math.min(Number(block_size_days)||1,groups.length));
  const random=rng(seed);
  const draws=[];
  const maxStart=Math.max(0,groups.length-block);
  for(let i=0;i<iterations;i++){
    const sample=[];
    let sampledDays=0;
    while(sampledDays<groups.length){
      const start=Math.floor(random()*(maxStart+1));
      for(let j=0;j<block&&sampledDays<groups.length;j++){
        sample.push(...groups[start+j]);
        sampledDays++;
      }
    }
    draws.push(mean(sample.map(r=>signedNet(r,sign,cost_bps))));
  }
  const p05=percentile(draws,.05);
  return {
    cluster_unit:"moving_event_day_block",
    day_count:groups.length,
    block_size_days:block,
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

export function topKWinnerRemovalStress(rows,{sign=1,cost_bps=5,remove_counts=[1,3,5]}={}){
  const values=rows.map(r=>signedNet(r,sign,cost_bps)).sort((a,b)=>b-a);
  const scenarios=remove_counts.map(rawK=>{
    const k=Math.max(0,Math.min(values.length,Number(rawK)||0));
    const kept=values.slice(k);
    const value=mean(kept);
    return {
      removed:k,
      observations_after_removal:kept.length,
      mean_after_removal:value,
      pass:kept.length>0&&value>0,
    };
  });
  return {
    observations:values.length,
    scenarios,
    all_positive:scenarios.length>0&&scenarios.every(x=>x.pass),
  };
}

export function quarterRemovalProfile(rows,{sign=1,cost_bps=5}={}){
  const quarters=uniq(rows.map(quarterKey)).filter(x=>x!=="invalid");
  const quarterMeans=quarters.map(quarter=>{
    const values=rows.filter(r=>quarterKey(r)===quarter).map(r=>signedNet(r,sign,cost_bps));
    return {quarter,observations:values.length,mean_signed_net:mean(values)};
  }).sort((a,b)=>a.mean_signed_net-b.mean_signed_net);
  if(!quarterMeans.length) return {
    quarter_count:0,quarter_means:[],worst_quarter:null,best_quarter:null,
    mean_after_worst_quarter_removal:0,mean_after_best_quarter_removal:0,
    survives_best_quarter_removal:false,
  };
  const worst=quarterMeans[0];
  const best=quarterMeans[quarterMeans.length-1];
  const withoutWorst=rows.filter(r=>quarterKey(r)!==worst.quarter);
  const withoutBest=rows.filter(r=>quarterKey(r)!==best.quarter);
  const afterWorst=mean(withoutWorst.map(r=>signedNet(r,sign,cost_bps)));
  const afterBest=mean(withoutBest.map(r=>signedNet(r,sign,cost_bps)));
  return {
    quarter_count:quarterMeans.length,
    quarter_means:quarterMeans,
    worst_quarter:worst.quarter,
    best_quarter:best.quarter,
    mean_after_worst_quarter_removal:afterWorst,
    mean_after_best_quarter_removal:afterBest,
    survives_best_quarter_removal:withoutBest.length>0&&afterBest>0,
  };
}

export function breakCandidate(candidate,rows){
  const sign=expectedSign(candidate);
  const deduped=dedupeOriginDay(rows);
  const looQ=leaveOneQuarterOut(deduped,{sign});
  const looIssuer=leaveOneIssuerOut(deduped,{sign});
  const issuer=issuerContributionStress(deduped,{sign});
  const trimmed=trimmedStress(deduped,{sign});
  const winsorized=winsorizedStress(deduped,{sign});
  const downside=downsideTailAnalysis(deduped,{sign});
  const signs=signConsistency(deduped,{sign});
  const clustered=clusteredBootstrap(deduped,{sign,seed:candidate.signal_key+":cluster"});
  const issuerClustered=issuerClusteredBootstrap(deduped,{sign,seed:candidate.signal_key+":issuer-cluster"});
  const dayClustered=eventDayClusteredBootstrap(deduped,{sign,seed:candidate.signal_key+":day-cluster"});
  const temporalBlock=temporalBlockBootstrap(deduped,{sign,seed:candidate.signal_key+":temporal-block"});
  const topWinnerRemoval=topWinnerRemovalStress(deduped,{sign});
  const topKWinnerRemoval=topKWinnerRemovalStress(deduped,{sign});
  const quarterRemoval=quarterRemovalProfile(deduped,{sign});

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

  const exploratoryChecks={
    leave_one_issuer_out_all_positive:looIssuer.all_positive,
    issuer_clustered_bootstrap_p05_positive:issuerClustered.pass,
    temporal_block_bootstrap_p05_positive:temporalBlock.pass,
    survives_top_1_top_3_top_5_winner_removal:topKWinnerRemoval.all_positive,
    winsorized_mean_positive:winsorized.pass,
    median_signed_net_positive:winsorized.median_positive,
    survives_best_quarter_removal:quarterRemoval.survives_best_quarter_removal,
  };

  return {
    schema:"evercraft.daytrade.edge-breaker-candidate.v2",
    signal_key:candidate.signal_key,
    original_observations:rows.length,
    deduped_observations:deduped.length,
    leave_one_quarter_out:looQ,
    leave_one_issuer_out:looIssuer,
    issuer_contribution_stress:issuer,
    trimmed_stress:trimmed,
    winsorized_stress:winsorized,
    downside_tail_analysis:downside,
    sign_consistency:signs,
    clustered_bootstrap:clustered,
    issuer_clustered_bootstrap:issuerClustered,
    event_day_clustered_bootstrap:dayClustered,
    temporal_block_bootstrap:temporalBlock,
    top_winner_removal_stress:topWinnerRemoval,
    top_k_winner_removal_stress:topKWinnerRemoval,
    quarter_removal_profile:quarterRemoval,
    checks,
    exploratory_checks:exploratoryChecks,
    breaker_status:Object.values(checks).every(Boolean)?"BREAKER_SURVIVOR":"BREAKER_CRACKED",
    extended_breaker_status:
      Object.values(checks).every(Boolean)&&Object.values(exploratoryChecks).every(Boolean)
        ?"EXTENDED_BREAKER_SURVIVOR"
        :"EXTENDED_BREAKER_CRACKED",
    historical_exploratory_only:true,
    eligibility_mutated:false,
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
    schema:"evercraft.daytrade.edge-breaker-lab.v2",
    generated_at:new Date().toISOString(),
    candidate_count:reviews.length,
    breaker_survivor_count:reviews.filter(x=>x.breaker_status==="BREAKER_SURVIVOR").length,
    extended_breaker_survivor_count:reviews.filter(x=>x.extended_breaker_status==="EXTENDED_BREAKER_SURVIVOR").length,
    reviews,
    historical_exploratory_only:true,
    eligibility_mutated:false,
    live_trade_authority:false,
  };
}
