function mean(values){
  return values.length?values.reduce((a,b)=>a+b,0)/values.length:0;
}

function expectedSign(candidate){
  return candidate?.learned_direction==="NEGATIVE_EXCESS_RETURN"?-1:1;
}

function signedNet(row,sign,costBps){
  const raw=Number(row.forward_return||0)-Number(row.benchmark_return||0);
  return sign*raw-Number(costBps||0)/10000;
}

function phaseSummary(rows,sign,costBps,minimumPhaseEvents){
  const groups=new Map();
  for(const row of rows){
    const phase=String(row.observation_market_phase||"missing");
    if(!groups.has(phase)) groups.set(phase,[]);
    groups.get(phase).push(row);
  }
  return [...groups.entries()]
    .map(([phase,group])=>{
      const values=group.map((row)=>signedNet(row,sign,costBps));
      return {
        phase,
        observations:group.length,
        share:rows.length?group.length/rows.length:0,
        mean_signed_net:mean(values),
        positive_rate:values.length?values.filter((v)=>v>0).length/values.length:0,
        sample_ready:group.length>=minimumPhaseEvents,
      };
    })
    .sort((a,b)=>b.observations-a.observations||a.phase.localeCompare(b.phase));
}

export function evaluateClockStructure(candidate,rows,{
  transaction_cost_bps=5,
  minimum_events=20,
  minimum_phase_events=8,
  concentration_share=0.80,
}={}){
  const sign=expectedSign(candidate);
  const phases=phaseSummary(rows,sign,transaction_cost_bps,minimum_phase_events);
  const ready=phases.filter((row)=>row.sample_ready);
  const dominant=phases[0]||null;

  const leaveOnePhaseOut=phases.map((phaseRow)=>{
    const kept=rows.filter(
      (row)=>String(row.observation_market_phase||"missing")!==phaseRow.phase
    );
    const values=kept.map((row)=>signedNet(row,sign,transaction_cost_bps));
    return {
      omitted_phase:phaseRow.phase,
      kept_observations:kept.length,
      mean_signed_net_after_omission:mean(values),
      positive:kept.length>=minimum_events&&mean(values)>0,
    };
  });

  const auctionSensitive=new Set([
    "opening_imbalance_window",
    "immediate_post_open",
    "closing_imbalance_window",
  ]);
  const withoutAuctionNear=rows.filter(
    (row)=>!auctionSensitive.has(String(row.observation_market_phase||"missing"))
  );
  const withoutAfterHours=rows.filter(
    (row)=>String(row.observation_market_phase||"missing")!=="after_hours"
  );
  const auctionValues=withoutAuctionNear.map((row)=>signedNet(row,sign,transaction_cost_bps));
  const nonAfterHoursValues=withoutAfterHours.map((row)=>signedNet(row,sign,transaction_cost_bps));

  const checks={
    total_sample_at_least_minimum:rows.length>=minimum_events,
    at_least_two_ready_phases:ready.length>=2,
    all_ready_phases_positive:ready.length>=2&&ready.every((row)=>row.mean_signed_net>0),
    leave_one_phase_out_all_positive:
      leaveOnePhaseOut.length>0&&leaveOnePhaseOut.every((row)=>row.positive),
  };

  let clockStatus="CLOCK_INSUFFICIENT_DIAGNOSTIC";
  if(rows.length>=minimum_events){
    if((dominant?.share||0)>=concentration_share){
      clockStatus="CLOCK_CONCENTRATED_DIAGNOSTIC";
    } else if(
      checks.at_least_two_ready_phases &&
      checks.all_ready_phases_positive &&
      checks.leave_one_phase_out_all_positive
    ){
      clockStatus="CLOCK_ROBUST_DIAGNOSTIC";
    } else {
      clockStatus="CLOCK_FRAGILE_DIAGNOSTIC";
    }
  }

  return {
    schema:"evercraft.daytrade.edge-clock-structure-candidate.v1",
    signal_key:candidate.signal_key,
    cluster_key:[
      candidate.rockies_range,
      candidate.observation_kind,
      candidate.benchmark||"SPY",
    ].join("|"),
    learned_direction:candidate.learned_direction,
    transaction_cost_bps,
    observation_phase_distribution:phases,
    dominant_phase:dominant,
    leave_one_phase_out:{
      scenarios:leaveOnePhaseOut,
      all_positive:leaveOnePhaseOut.length>0&&leaveOnePhaseOut.every((row)=>row.positive),
    },
    auction_near_exclusion:{
      observations_before:rows.length,
      observations_after:withoutAuctionNear.length,
      mean_signed_net_after_exclusion:mean(auctionValues),
    },
    after_hours_exclusion:{
      observations_before:rows.length,
      observations_after:withoutAfterHours.length,
      mean_signed_net_after_exclusion:mean(nonAfterHoursValues),
    },
    checks,
    clock_status:clockStatus,
    historical_diagnostic_only:true,
    historical_exploratory_only:true,
    eligibility_mutated:false,
    live_trade_authority:false
  };
}

export function runClockStructureLab(report,options={}){
  const candidates=(report?.evaluations||[]).filter((row)=>row.status==="RESEARCH_CANDIDATE");
  const measurements=report?.measurements||[];
  if(candidates.length&&!measurements.length) throw new Error("edge_clock_measurement_evidence_missing");
  const reviews=candidates.map((candidate)=>
    evaluateClockStructure(
      candidate,
      measurements.filter((row)=>row.signal_key===candidate.signal_key),
      options
    )
  );
  const statusCounts={};
  for(const review of reviews){
    statusCounts[review.clock_status]=Number(statusCounts[review.clock_status]||0)+1;
  }
  return {
    schema:"evercraft.daytrade.edge-clock-structure-lab.v1",
    generated_at:new Date().toISOString(),
    candidate_count:reviews.length,
    status_counts:statusCounts,
    reviews,
    historical_diagnostic_only:true,
    historical_exploratory_only:true,
    eligibility_mutated:false,
    live_trade_authority:false
  };
}
