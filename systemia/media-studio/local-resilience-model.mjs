// Illustrative scenario engine. No observed regional economic coefficients are implied.
export function simulate({households,monthlyDollars,shiftBps,chainBps,localBps,respendingBps,rounds=5}){
  for(const [n,v,max] of [['households',households,100000],['monthlyDollars',monthlyDollars,10000],['shiftBps',shiftBps,10000],['chainBps',chainBps,10000],['localBps',localBps,10000],['respendingBps',respendingBps,10000],['rounds',rounds,12]]){
    if(!Number.isSafeInteger(v)||v<0||v>max)throw Error('invalid_'+n);
  }
  if(rounds<1)throw Error('invalid_rounds');
  const initial=households*monthlyDollars*100*12;
  const portion=(c,b)=>Math.floor(c*b/10000);
  function run(shift){
    const redirected=portion(initial,shift);
    let circulating=portion(initial-redirected,chainBps)+portion(redirected,localBps);
    const firstRetained=circulating;
    let escaped=initial-circulating,gross=0;
    const steps=[];
    for(let i=0;i<rounds;i++){
      gross+=circulating;
      const next=portion(circulating,respendingBps);
      escaped+=circulating-next;
      steps.push({round:i+1,localReceiptCents:circulating,leakageCents:circulating-next,remainingCents:next});
      circulating=next;
    }
    return {redirectedCents:redirected,firstRetainedCents:firstRetained,cumulativeLocalReceiptsCents:gross,escapedCents:escaped,remainingCents:circulating,steps};
  }
  const baseline=run(0),scenario=run(shiftBps);
  return {schema:'evercraft.local-resilience.scenario.v1',evidenceState:'modeled',initialCents:initial,baseline,scenario,deltaLocalReceiptsCents:scenario.cumulativeLocalReceiptsCents-baseline.cumulativeLocalReceiptsCents,notGdp:true,notJobsForecast:true,notObservedTransactions:true};
}
