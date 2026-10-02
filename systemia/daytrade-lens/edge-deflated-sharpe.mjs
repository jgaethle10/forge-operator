const EULER_MASCHERONI=0.5772156649015329;

function mean(values){
  return values.length?values.reduce((a,b)=>a+b,0)/values.length:0;
}
function variance(values){
  if(values.length<2) return 0;
  const m=mean(values);
  return values.reduce((sum,x)=>sum+(x-m)**2,0)/(values.length-1);
}
function std(values){
  return Math.sqrt(Math.max(0,variance(values)));
}
function rawExcess(row){
  return Number(row.forward_return||0)-Number(row.benchmark_return||0);
}
function normalCdf(x){
  const sign=x<0?-1:1;
  const ax=Math.abs(x)/Math.SQRT2;
  const t=1/(1+0.3275911*ax);
  const erf=sign*(1-(
    (((((1.061405429*t-1.453152027)*t)+1.421413741)*t-0.284496736)*t+0.254829592)*
    Math.exp(-ax*ax)
  ));
  return 0.5*(1+erf);
}
export function inverseNormalCdf(p){
  if(!(p>0&&p<1)){
    if(p===0) return -Infinity;
    if(p===1) return Infinity;
    throw new Error("edge_dsr_probability_out_of_range");
  }
  const a=[
    -3.969683028665376e+01,2.209460984245205e+02,-2.759285104469687e+02,
    1.383577518672690e+02,-3.066479806614716e+01,2.506628277459239e+00
  ];
  const b=[
    -5.447609879822406e+01,1.615858368580409e+02,-1.556989798598866e+02,
    6.680131188771972e+01,-1.328068155288572e+01
  ];
  const c=[
    -7.784894002430293e-03,-3.223964580411365e-01,-2.400758277161838e+00,
    -2.549732539343734e+00,4.374664141464968e+00,2.938163982698783e+00
  ];
  const d=[
    7.784695709041462e-03,3.224671290700398e-01,2.445134137142996e+00,
    3.754408661907416e+00
  ];
  const plow=0.02425;
  const phigh=1-plow;
  if(p<plow){
    const q=Math.sqrt(-2*Math.log(p));
    return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5])/
      ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
  }
  if(p>phigh){
    const q=Math.sqrt(-2*Math.log(1-p));
    return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5])/
      ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
  }
  const q=p-0.5;
  const r=q*q;
  return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q/
    (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
}

export function distributionMoments(values){
  const n=values.length;
  if(!n) return {n:0,mean:0,std:0,skewness:null,kurtosis:null};
  const m=mean(values);
  const centered=values.map((x)=>x-m);
  const m2=mean(centered.map((x)=>x**2));
  const m3=mean(centered.map((x)=>x**3));
  const m4=mean(centered.map((x)=>x**4));
  const sigma=Math.sqrt(Math.max(0,m2));
  return {
    n,
    mean:m,
    std:std(values),
    skewness:sigma>0?m3/(sigma**3):0,
    kurtosis:sigma>0?m4/(sigma**4):3,
  };
}

function familyRows(report){
  const groups=new Map();
  for(const row of report?.measurements||[]){
    if(!row?.signal_key||!row?.observed_at) continue;
    if(!Number.isFinite(Number(row.forward_return))) continue;
    if(!Number.isFinite(Number(row.benchmark_return))) continue;
    if(!groups.has(row.signal_key)) groups.set(row.signal_key,[]);
    groups.get(row.signal_key).push(row);
  }
  return groups;
}

function holdoutStrategyReturns(rows,{
  development_fraction=0.70,
  transaction_cost_bps=5,
}={}){
  const sorted=[...(rows||[])].sort((a,b)=>new Date(a.observed_at)-new Date(b.observed_at));
  const splitAt=Math.max(1,Math.floor(sorted.length*development_fraction));
  const dev=sorted.slice(0,splitAt).map(rawExcess);
  const holdout=sorted.slice(splitAt).map(rawExcess);
  const devMean=mean(dev);
  const sign=devMean>0?1:devMean<0?-1:0;
  const cost=Number(transaction_cost_bps)/10000;
  const returns=sign===0?holdout.map(()=>0):holdout.map((x)=>sign*x-cost);
  return {sign,development_count:dev.length,holdout_count:holdout.length,returns};
}

function sharpeLike(values){
  const s=std(values);
  return s>0?mean(values)/s:0;
}

export function expectedMaximumSharpe({
  trial_count,
  cross_trial_sharpe_std,
}={}){
  const n=Number(trial_count||0);
  const sigma=Number(cross_trial_sharpe_std||0);
  if(n<=1||!(sigma>0)) return 0;
  const z1=inverseNormalCdf(1-1/n);
  const z2=inverseNormalCdf(1-1/(n*Math.E));
  return sigma*((1-EULER_MASCHERONI)*z1+EULER_MASCHERONI*z2);
}

export function deflatedSharpeProbability({
  sharpe,
  benchmark_sharpe,
  observations,
  skewness,
  kurtosis,
}={}){
  const sr=Number(sharpe);
  const sr0=Number(benchmark_sharpe);
  const n=Number(observations);
  const skew=Number(skewness);
  const kurt=Number(kurtosis);
  if(!(n>1)||![sr,sr0,skew,kurt].every(Number.isFinite)) return null;
  const varianceTerm=
    1-skew*sr+((kurt-1)/4)*(sr**2);
  if(!(varianceTerm>0)) return null;
  const z=((sr-sr0)*Math.sqrt(n-1))/Math.sqrt(varianceTerm);
  return normalCdf(z);
}

export function runDeflatedSharpeLab(report,{
  transaction_cost_bps=5,
  development_fraction=0.70,
  minimum_total_samples=40,
  minimum_holdout_samples=10,
}={}){
  const groups=familyRows(report);
  const familyStats=[];
  for(const [signal,rows] of groups.entries()){
    if(rows.length<minimum_total_samples) continue;
    const split=holdoutStrategyReturns(rows,{
      development_fraction,
      transaction_cost_bps,
    });
    if(split.holdout_count<minimum_holdout_samples) continue;
    familyStats.push({
      signal_key:signal,
      learned_sign:split.sign,
      development_count:split.development_count,
      holdout_count:split.holdout_count,
      holdout_returns:split.returns,
      holdout_sharpe_like:sharpeLike(split.returns),
    });
  }

  const crossTrialSharpes=familyStats.map((row)=>row.holdout_sharpe_like);
  const crossTrialStd=std(crossTrialSharpes);
  const trialCount=familyStats.length;
  const sr0=expectedMaximumSharpe({
    trial_count:trialCount,
    cross_trial_sharpe_std:crossTrialStd,
  });
  const bySignal=new Map(familyStats.map((row)=>[row.signal_key,row]));
  const candidates=(report?.evaluations||[]).filter(
    (row)=>row.status==="RESEARCH_CANDIDATE"
  );

  const reviews=candidates.map((candidate)=>{
    const family=bySignal.get(candidate.signal_key);
    if(!family){
      return {
        schema:"evercraft.daytrade.edge-deflated-sharpe-candidate.v1",
        signal_key:candidate.signal_key,
        status:"DSR_INSUFFICIENT_DIAGNOSTIC",
        live_trade_authority:false,
      };
    }
    const moments=distributionMoments(family.holdout_returns);
    const dsr=deflatedSharpeProbability({
      sharpe:family.holdout_sharpe_like,
      benchmark_sharpe:sr0,
      observations:moments.n,
      skewness:moments.skewness,
      kurtosis:moments.kurtosis,
    });
    return {
      schema:"evercraft.daytrade.edge-deflated-sharpe-candidate.v1",
      signal_key:candidate.signal_key,
      holdout_observations:moments.n,
      holdout_mean_strategy_return_net:moments.mean,
      holdout_std_strategy_return_net:moments.std,
      holdout_sharpe_like_per_event:family.holdout_sharpe_like,
      holdout_skewness:moments.skewness,
      holdout_kurtosis_non_excess:moments.kurtosis,
      search_trial_count_used:trialCount,
      cross_trial_holdout_sharpe_std:crossTrialStd,
      expected_maximum_null_sharpe:sr0,
      deflated_sharpe_probability:dsr,
      status:dsr===null
        ?"DSR_INSUFFICIENT_DIAGNOSTIC"
        :dsr>=0.95
          ?"DSR_SEPARATED_DIAGNOSTIC"
          :"DSR_NOT_SEPARATED_DIAGNOSTIC",
      interpretation:{
        sharpe_is_per_event_not_annualized:true,
        development_learns_direction_holdout_scores_returns:true,
        skew_and_non_excess_kurtosis_adjust_uncertainty:true,
        trial_count_is_raw_eligible_family_count:true,
        independent_trials_assumption_not_verified:true,
        empirical_correlation_aware_companion:"edge-family-max-null.mjs",
        exploratory_threshold_095_not_a_frozen_promotion_rule:true,
      },
      historical_diagnostic_only:true,
      historical_exploratory_only:true,
      eligibility_mutated:false,
      live_trade_authority:false,
    };
  });

  const counts={};
  for(const review of reviews){
    counts[review.status]=Number(counts[review.status]||0)+1;
  }
  return {
    schema:"evercraft.daytrade.edge-deflated-sharpe-lab.v1",
    generated_at:new Date().toISOString(),
    eligible_trial_count:trialCount,
    cross_trial_holdout_sharpe_std:crossTrialStd,
    expected_maximum_null_sharpe:sr0,
    status_counts:counts,
    reviews,
    formula_source:{
      title:"The Deflated Sharpe Ratio: Correcting for Selection Bias, Backtest Overfitting and Non-Normality",
      authors:"David H. Bailey; Marcos Lopez de Prado",
      url:"https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2460551",
    },
    historical_diagnostic_only:true,
    historical_exploratory_only:true,
    eligibility_mutated:false,
    live_trade_authority:false,
  };
}
