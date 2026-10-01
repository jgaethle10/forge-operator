import crypto from "node:crypto";

function mean(values) {
  return values.length ? values.reduce((a,b)=>a+b,0)/values.length : 0;
}

function expectedSign(candidate) {
  return candidate?.learned_direction === "NEGATIVE_EXCESS_RETURN" ? -1 : 1;
}

function signedNet(row, sign, costBps) {
  const raw=Number(row.forward_return||0)-Number(row.benchmark_return||0);
  return sign*raw-Number(costBps||0)/10000;
}

function dayDistance(left,right) {
  return Math.abs(new Date(left).getTime()-new Date(right).getTime())/86400000;
}

function shaInt(seed) {
  return crypto.createHash("sha256").update(String(seed)).digest().readUInt32BE(0);
}

function rng(seed) {
  let x=shaInt(seed)||1;
  return ()=>{
    x^=x<<13; x>>>=0;
    x^=x>>>17; x>>>=0;
    x^=x<<5; x>>>=0;
    return (x>>>0)/4294967296;
  };
}

export function matchNarrativeBlindControls(candidate, measurements, {
  control_ranges=["semiconductors_compute"],
  maximum_distance_days=30,
} = {}) {
  const actual=(measurements||[])
    .filter((row)=>
      row.signal_key===candidate.signal_key &&
      row.rockies_range===candidate.rockies_range
    )
    .sort((a,b)=>new Date(a.observed_at)-new Date(b.observed_at));

  const controls=(measurements||[])
    .filter((row)=>
      control_ranges.includes(row.rockies_range) &&
      row.observation_kind===candidate.observation_kind &&
      row.instrument===candidate.instrument &&
      row.lag_key===candidate.lag_key &&
      (row.benchmark||"SPY")===(candidate.benchmark||"SPY")
    )
    .sort((a,b)=>new Date(a.observed_at)-new Date(b.observed_at));

  const used=new Set();
  const pairs=[];
  for(const row of actual){
    const ranked=controls
      .filter((control)=>!used.has(control.measurement_id))
      .map((control)=>({
        control,
        distance:dayDistance(row.observed_at,control.observed_at),
      }))
      .filter((entry)=>entry.distance<=maximum_distance_days)
      .sort((a,b)=>
        a.distance-b.distance ||
        String(a.control.measurement_id).localeCompare(String(b.control.measurement_id))
      );
    if(!ranked.length) continue;
    const chosen=ranked[0];
    used.add(chosen.control.measurement_id);
    pairs.push({
      actual:row,
      control:chosen.control,
      distance_days:chosen.distance,
    });
  }
  return pairs;
}

export function evaluateNarrativeBlindControl(candidate, measurements, {
  control_ranges=["semiconductors_compute"],
  maximum_distance_days=30,
  transaction_cost_bps=5,
  minimum_pairs=20,
  minimum_actual_origins=5,
  minimum_control_origins=5,
  iterations=5000,
  seed=null,
} = {}) {
  const sign=expectedSign(candidate);
  const pairs=matchNarrativeBlindControls(candidate,measurements,{
    control_ranges,
    maximum_distance_days,
  });

  const actualOrigins=new Set();
  const controlOrigins=new Set();
  const deltas=pairs.map(({actual,control})=>{
    if(actual.origin_entity_ref) actualOrigins.add(actual.origin_entity_ref);
    if(control.origin_entity_ref) controlOrigins.add(control.origin_entity_ref);
    return signedNet(actual,sign,transaction_cost_bps)-
      signedNet(control,sign,transaction_cost_bps);
  });

  const observed=mean(deltas);
  const random=rng(seed||candidate.signal_key+":narrative-blind");
  let asExtreme=0;
  for(let i=0;i<iterations;i++){
    const permuted=deltas.map((delta)=>random()<0.5?-delta:delta);
    if(mean(permuted)>=observed) asExtreme++;
  }
  const p=deltas.length?(asExtreme+1)/(iterations+1):1;

  const checks={
    matched_pairs_at_least_minimum:pairs.length>=minimum_pairs,
    actual_origins_at_least_minimum:actualOrigins.size>=minimum_actual_origins,
    control_origins_at_least_minimum:controlOrigins.size>=minimum_control_origins,
    actual_outperforms_matched_control:observed>0,
    paired_label_permutation_p_below_05:p<0.05,
  };
  const sampleReady=
    checks.matched_pairs_at_least_minimum &&
    checks.actual_origins_at_least_minimum &&
    checks.control_origins_at_least_minimum;

  return {
    schema:"evercraft.daytrade.edge-narrative-blind-control-candidate.v1",
    signal_key:candidate.signal_key,
    cluster_key:[
      candidate.rockies_range,
      candidate.observation_kind,
      candidate.benchmark||"SPY",
    ].join("|"),
    narrative_range:candidate.rockies_range,
    control_ranges:[...control_ranges],
    instrument:candidate.instrument,
    lag_key:candidate.lag_key,
    learned_direction:candidate.learned_direction,
    maximum_distance_days,
    transaction_cost_bps,
    matched_pairs:pairs.length,
    actual_distinct_origins:actualOrigins.size,
    control_distinct_origins:controlOrigins.size,
    mean_actual_minus_control_signed_net:observed,
    paired_label_permutation_p_value:p,
    mean_pair_distance_days:mean(pairs.map((pair)=>pair.distance_days)),
    checks,
    narrative_control_status:!sampleReady
      ?"NARRATIVE_CONTROL_INSUFFICIENT"
      :Object.values(checks).every(Boolean)
        ?"NARRATIVE_INCREMENTAL_DIAGNOSTIC"
        :"NARRATIVE_NOT_INCREMENTAL_DIAGNOSTIC",
    matched_pair_receipts:pairs.map(({actual,control,distance_days})=>({
      actual_measurement_id:actual.measurement_id,
      actual_source_ticker:actual.source_ticker||null,
      actual_origin_entity_ref:actual.origin_entity_ref||null,
      control_measurement_id:control.measurement_id,
      control_source_ticker:control.source_ticker||null,
      control_origin_entity_ref:control.origin_entity_ref||null,
      distance_days,
    })),
    historical_diagnostic_only:true,
    historical_exploratory_only:true,
    eligibility_mutated:false,
    live_trade_authority:false
  };
}

export function runNarrativeBlindControlLab(report, options = {}) {
  const candidates=(report?.evaluations||[]).filter(
    (row)=>row.status==="RESEARCH_CANDIDATE" && row.rockies_range==="ai_models"
  );
  const measurements=report?.measurements||[];
  if(candidates.length&&!measurements.length){
    throw new Error("edge_narrative_control_measurement_evidence_missing");
  }

  const reviews=candidates.map((candidate)=>
    evaluateNarrativeBlindControl(candidate,measurements,options)
  );
  const counts={};
  for(const review of reviews){
    counts[review.narrative_control_status]=
      Number(counts[review.narrative_control_status]||0)+1;
  }
  return {
    schema:"evercraft.daytrade.edge-narrative-blind-control-lab.v1",
    generated_at:new Date().toISOString(),
    candidate_count:reviews.length,
    status_counts:counts,
    control_design:"nearest-date non-AI SEC filing with identical instrument, horizon and benchmark; no control reuse",
    reviews,
    historical_diagnostic_only:true,
    historical_exploratory_only:true,
    eligibility_mutated:false,
    live_trade_authority:false
  };
}
