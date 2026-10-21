import crypto from "node:crypto";

function shaInt(seed) {
  const h = crypto.createHash("sha256").update(String(seed)).digest();
  return h.readUInt32BE(0);
}

function rng(seed) {
  let x = shaInt(seed) || 1;
  return () => {
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17; x >>>= 0;
    x ^= x << 5; x >>>= 0;
    return (x >>> 0) / 4294967296;
  };
}

function mean(xs) {
  return xs.length ? xs.reduce((a,b)=>a+b,0) / xs.length : 0;
}

function uniq(xs) {
  return [...new Set((xs || []).filter(Boolean))];
}

function signedNet(row, expectedSign, costBps) {
  const raw = Number(row.forward_return || 0) - Number(row.benchmark_return || 0);
  return Number(expectedSign || 0) * raw - (Number(costBps) / 10000);
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted=[...values].sort((a,b)=>a-b);
  const i=Math.max(0,Math.min(sorted.length-1,Math.floor((sorted.length-1)*p)));
  return sorted[i];
}

export function bootstrapEdge(rows, {
  expected_sign = 1,
  transaction_cost_bps = 5,
  iterations = 2000,
  seed = "evercraft-edge-bootstrap-v1",
} = {}) {
  const values = rows.map(row => signedNet(row, expected_sign, transaction_cost_bps));
  if (values.length < 2) return {
    observations: values.length,
    iterations: 0,
    mean_signed_net: mean(values),
    probability_positive: 0,
    p05: 0,
    p50: 0,
    p95: 0,
  };

  const random=rng(seed);
  const draws=[];
  for(let i=0;i<iterations;i++){
    let total=0;
    for(let j=0;j<values.length;j++){
      total += values[Math.floor(random()*values.length)];
    }
    draws.push(total/values.length);
  }

  return {
    observations: values.length,
    iterations,
    mean_signed_net: mean(values),
    probability_positive: draws.filter(x=>x>0).length/draws.length,
    p05: percentile(draws,0.05),
    p50: percentile(draws,0.50),
    p95: percentile(draws,0.95),
  };
}

export function originBalancedBootstrap(rows, options = {}) {
  const origins=uniq(rows.map(r=>r.origin_entity_ref));
  const perOrigin=origins.map(origin=>{
    const group=rows.filter(r=>r.origin_entity_ref===origin);
    return {
      origin,
      value: mean(group.map(r=>signedNet(r, options.expected_sign ?? 1, options.transaction_cost_bps ?? 5))),
    };
  });
  const synthetic=perOrigin.map((x,i)=>({
    forward_return:x.value,
    benchmark_return:0,
    origin_entity_ref:"origin:"+i,
  }));
  return {
    origin_count: origins.length,
    ...bootstrapEdge(synthetic,{
      expected_sign:1,
      transaction_cost_bps:0,
      iterations:options.iterations ?? 2000,
      seed:(options.seed || "evercraft-origin-bootstrap-v1"),
    }),
  };
}

export function costStress(rows, {
  expected_sign = 1,
  costs_bps = [5,10,20,40,75],
} = {}) {
  return costs_bps.map(cost=>({
    transaction_cost_bps:cost,
    mean_signed_net:mean(rows.map(r=>signedNet(r,expected_sign,cost))),
  }));
}

export function rollingWindowStress(rows, {
  expected_sign = 1,
  transaction_cost_bps = 5,
  minimum_window = 15,
} = {}) {
  const sorted=[...rows].sort((a,b)=>new Date(a.observed_at)-new Date(b.observed_at));
  const window=Math.max(minimum_window,Math.floor(sorted.length/3));
  const slices=[];
  if(sorted.length<window) return {window_size:window,slices:[],positive_rate:0};

  for(let start=0;start+window<=sorted.length;start+=Math.max(1,Math.floor(window/2))){
    const group=sorted.slice(start,start+window);
    const value=mean(group.map(r=>signedNet(r,expected_sign,transaction_cost_bps)));
    slices.push({
      start_at:group[0].observed_at,
      end_at:group[group.length-1].observed_at,
      observations:group.length,
      mean_signed_net:value,
      positive:value>0,
    });
  }
  return {
    window_size:window,
    slices,
    positive_rate:slices.length?slices.filter(x=>x.positive).length/slices.length:0,
  };
}

export function permutationNullTest(rows, {
  expected_sign = 1,
  transaction_cost_bps = 5,
  iterations = 2000,
  seed = "evercraft-edge-null-v1",
} = {}) {
  const observed=mean(rows.map(r=>signedNet(r,expected_sign,transaction_cost_bps)));
  if(rows.length<2) return {observed_mean:observed,iterations:0,null_p_value:1};

  const random=rng(seed);
  let asExtreme=0;
  for(let i=0;i<iterations;i++){
    const permuted=rows.map(row=>{
      const flip=random()<0.5?-1:1;
      const raw=(Number(row.forward_return||0)-Number(row.benchmark_return||0))*flip;
      return expected_sign * raw - (transaction_cost_bps/10000);
    });
    const m=mean(permuted);
    if(m>=observed) asExtreme++;
  }
  return {
    observed_mean:observed,
    iterations,
    null_p_value:(asExtreme+1)/(iterations+1),
  };
}

export function stressCandidate(candidate, rows, {
  bootstrap_iterations = 2000,
  null_iterations = 2000,
} = {}) {
  const expectedSign=candidate.learned_direction==="NEGATIVE_EXCESS_RETURN"?-1:1;
  const bootstrap=bootstrapEdge(rows,{expected_sign:expectedSign,iterations:bootstrap_iterations,seed:candidate.signal_key+":boot"});
  const originBootstrap=originBalancedBootstrap(rows,{expected_sign:expectedSign,iterations:bootstrap_iterations,seed:candidate.signal_key+":origin"});
  const cost=costStress(rows,{expected_sign:expectedSign});
  const rolling=rollingWindowStress(rows,{expected_sign:expectedSign});
  const nullTest=permutationNullTest(rows,{expected_sign:expectedSign,iterations:null_iterations,seed:candidate.signal_key+":null"});

  const checks={
    bootstrap_p05_positive: bootstrap.p05>0,
    origin_balanced_p05_positive: originBootstrap.p05>0,
    survives_20bps_cost: (cost.find(x=>x.transaction_cost_bps===20)?.mean_signed_net || 0)>0,
    rolling_positive_rate_at_least_75pct: rolling.positive_rate>=0.75,
    permutation_null_p_below_05: nullTest.null_p_value<0.05,
  };

  return {
    schema:"evercraft.daytrade.edge-stress-candidate.v1",
    signal_key:candidate.signal_key,
    bootstrap,
    origin_balanced_bootstrap:originBootstrap,
    cost_stress:cost,
    rolling_window_stress:rolling,
    permutation_null:nullTest,
    checks,
    stress_status:Object.values(checks).every(Boolean)?"STRESS_SURVIVOR":"STRESS_RESEARCH_MORE",
    live_trade_authority:false,
  };
}

export function runEdgeStressLab(report){
  const evaluations=report?.evaluations || [];
  const measurements=report?.measurements || [];
  const candidates=evaluations.filter(x=>x.status==="RESEARCH_CANDIDATE");
  if(candidates.length && !measurements.length) throw new Error("edge_stress_measurement_evidence_missing");

  const reviews=candidates.map(candidate=>
    stressCandidate(candidate,measurements.filter(row=>row.signal_key===candidate.signal_key))
  );

  return {
    schema:"evercraft.daytrade.edge-stress-lab.v1",
    generated_at:new Date().toISOString(),
    candidate_count:reviews.length,
    stress_survivor_count:reviews.filter(x=>x.stress_status==="STRESS_SURVIVOR").length,
    reviews,
    live_trade_authority:false,
  };
}
