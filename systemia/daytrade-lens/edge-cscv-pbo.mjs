function mean(values){
  return values.length?values.reduce((a,b)=>a+b,0)/values.length:0;
}

function clusterKey(row){
  if(row?.rockies_range&&row?.observation_kind){
    return [
      row.rockies_range,
      row.observation_kind,
      row.benchmark||"SPY",
    ].join("|");
  }
  const parts=String(row?.signal_key||"").split("|");
  return [parts[0]||"",parts[1]||"","SPY"].join("|");
}

function rawExcess(row){
  return Number(row.forward_return||0)-Number(row.benchmark_return||0);
}

function combinations(values,k){
  const out=[];
  function visit(start,picked){
    if(picked.length===k){
      out.push([...picked]);
      return;
    }
    for(let i=start;i<=values.length-(k-picked.length);i++){
      picked.push(values[i]);
      visit(i+1,picked);
      picked.pop();
    }
  }
  visit(0,[]);
  return out;
}

function partitionEvents(events,slices){
  const out=Array.from({length:slices},()=>[]);
  for(let i=0;i<events.length;i++){
    const index=Math.min(slices-1,Math.floor(i*slices/events.length));
    out[index].push(events[i]);
  }
  return out;
}

function familyPanel(report,cluster){
  const evals=(report?.evaluations||[]).filter((row)=>clusterKey(row)===cluster);
  const signals=[...new Set(evals.map((row)=>row.signal_key).filter(Boolean))];
  const bySignal=new Map();
  for(const signal of signals) bySignal.set(signal,new Map());
  for(const row of report?.measurements||[]){
    if(!bySignal.has(row.signal_key)) continue;
    const event=String(row.source_observation_id||"");
    if(!event) continue;
    bySignal.get(row.signal_key).set(event,row);
  }
  if(!signals.length) return {signals:[],events:[],bySignal};
  let common=null;
  for(const signal of signals){
    const keys=new Set(bySignal.get(signal).keys());
    common=common===null
      ?keys
      :new Set([...common].filter((key)=>keys.has(key)));
  }
  const first=signals[0];
  const events=[...(common||new Set())]
    .map((event)=>{
      const row=bySignal.get(first).get(event);
      return {event,observed_at:row?.observed_at||null};
    })
    .filter((row)=>row.observed_at)
    .sort((a,b)=>new Date(a.observed_at)-new Date(b.observed_at))
    .map((row)=>row.event);
  return {signals,events,bySignal};
}

function scoreFamily(signal,eventIds,bySignal,cost,learnedSign=null){
  const rows=eventIds.map((event)=>bySignal.get(signal)?.get(event)).filter(Boolean);
  const raw=rows.map(rawExcess);
  const rawMean=mean(raw);
  const sign=learnedSign===1||learnedSign===-1
    ?learnedSign
    :rawMean>0?1:rawMean<0?-1:0;
  const strategy=sign===0?0:mean(raw.map((value)=>sign*value-cost));
  return {
    signal_key:signal,
    observations:rows.length,
    raw_mean:rawMean,
    learned_sign:sign,
    strategy_mean_net:strategy,
  };
}

function relativeRank(selectedSignal,testScores){
  const sorted=[...testScores].sort(
    (a,b)=>a.strategy_mean_net-b.strategy_mean_net ||
      a.signal_key.localeCompare(b.signal_key)
  );
  const index=sorted.findIndex((row)=>row.signal_key===selectedSignal);
  if(index<0) return null;
  return (index+1)/(sorted.length+1);
}

export function evaluateClusterCscvPbo(report,cluster,{
  slices=8,
  transaction_cost_bps=5,
  minimum_families=4,
  minimum_common_events=32,
}={}){
  if(slices<4||slices%2!==0) throw new Error("edge_cscv_slices_must_be_even_and_at_least_4");
  const panel=familyPanel(report,cluster);
  const {signals,events,bySignal}=panel;
  if(signals.length<minimum_families||events.length<minimum_common_events){
    return {
      schema:"evercraft.daytrade.edge-cscv-pbo-cluster.v1",
      cluster_key:cluster,
      family_count:signals.length,
      common_event_count:events.length,
      status:"CSCV_PBO_INSUFFICIENT_COMMON_PANEL",
      pbo:null,
      historical_exploratory_only:true,
      eligibility_mutated:false,
      live_trade_authority:false,
    };
  }

  const eventSlices=partitionEvents(events,slices);
  if(eventSlices.some((slice)=>slice.length===0)){
    throw new Error("edge_cscv_empty_slice");
  }
  const indexes=Array.from({length:slices},(_,i)=>i);
  const trainCombos=combinations(indexes,slices/2);
  const cost=Number(transaction_cost_bps)/10000;
  const paths=[];

  for(const trainIndexes of trainCombos){
    const trainSet=new Set(trainIndexes);
    const testIndexes=indexes.filter((index)=>!trainSet.has(index));
    const trainEvents=trainIndexes.flatMap((index)=>eventSlices[index]);
    const testEvents=testIndexes.flatMap((index)=>eventSlices[index]);

    const trainScores=signals.map((signal)=>
      scoreFamily(signal,trainEvents,bySignal,cost)
    ).sort((a,b)=>
      b.strategy_mean_net-a.strategy_mean_net ||
      a.signal_key.localeCompare(b.signal_key)
    );
    const selected=trainScores[0];
    const testScores=signals.map((signal)=>
      scoreFamily(signal,testEvents,bySignal,cost,
        trainScores.find((row)=>row.signal_key===signal)?.learned_sign
      )
    );
    const selectedTest=testScores.find((row)=>row.signal_key===selected.signal_key);
    const omega=relativeRank(selected.signal_key,testScores);
    const lambda=omega>0&&omega<1?Math.log(omega/(1-omega)):null;

    paths.push({
      train_slices:trainIndexes,
      test_slices:testIndexes,
      train_event_count:trainEvents.length,
      test_event_count:testEvents.length,
      selected_signal_key:selected.signal_key,
      selected_train_strategy_mean_net:selected.strategy_mean_net,
      selected_test_strategy_mean_net:selectedTest?.strategy_mean_net??null,
      test_relative_rank_omega:omega,
      logit_rank_lambda:lambda,
      overfit_path:Number.isFinite(lambda)?lambda<=0:null,
    });
  }

  const valid=paths.filter((row)=>typeof row.overfit_path==="boolean");
  const pbo=valid.length
    ?valid.filter((row)=>row.overfit_path).length/valid.length
    :null;
  const selections={};
  for(const row of paths){
    selections[row.selected_signal_key]=Number(selections[row.selected_signal_key]||0)+1;
  }
  const outOfSample=paths
    .map((row)=>row.selected_test_strategy_mean_net)
    .filter(Number.isFinite);
  const status=pbo===null
    ?"CSCV_PBO_INSUFFICIENT_COMMON_PANEL"
    :pbo>=0.50
      ?"CSCV_PBO_HIGH_OVERFIT_DIAGNOSTIC"
      :pbo<=0.25
        ?"CSCV_PBO_LOWER_OVERFIT_DIAGNOSTIC"
        :"CSCV_PBO_AMBIGUOUS_DIAGNOSTIC";

  return {
    schema:"evercraft.daytrade.edge-cscv-pbo-cluster.v1",
    cluster_key:cluster,
    family_count:signals.length,
    common_event_count:events.length,
    slices,
    path_count:paths.length,
    transaction_cost_bps,
    pbo,
    mean_selected_out_of_sample_strategy_net:mean(outOfSample),
    selected_family_counts:selections,
    paths,
    status,
    interpretation:{
      pbo:"Fraction of CSCV paths where the in-sample-selected family ranks at or below the median out of sample.",
      common_panel_required:true,
      incomparable_event_panels_are_not_forced_into_cscv:true,
      thresholds_are_exploratory_diagnostics_not_frozen_promotion_rules:true,
    },
    historical_diagnostic_only:true,
    historical_exploratory_only:true,
    eligibility_mutated:false,
    live_trade_authority:false,
  };
}

export function runCscvPboLab(report,options={}){
  const candidateClusters=[...new Set(
    (report?.evaluations||[])
      .filter((row)=>row.status==="RESEARCH_CANDIDATE")
      .map(clusterKey)
  )];
  const reviews=candidateClusters.map((cluster)=>
    evaluateClusterCscvPbo(report,cluster,options)
  );
  const counts={};
  for(const review of reviews){
    counts[review.status]=Number(counts[review.status]||0)+1;
  }
  return {
    schema:"evercraft.daytrade.edge-cscv-pbo-lab.v1",
    generated_at:new Date().toISOString(),
    candidate_cluster_count:candidateClusters.length,
    status_counts:counts,
    reviews,
    historical_diagnostic_only:true,
    historical_exploratory_only:true,
    eligibility_mutated:false,
    live_trade_authority:false,
  };
}
