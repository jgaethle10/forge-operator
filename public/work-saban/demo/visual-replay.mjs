// Visual Desk / Work Saban: an honest replay of a *completed* local calculation.
// This is not an agent execution monitor or live status feed.
const SHA=/^[0-9a-f]{64}$/;
export function prepareVerifiedReplay(result,{sourceHash,reportHash,auditPassed}={}){
  if(auditPassed!==true)throw new Error('Replay requires a completed independent arithmetic check');
  if(!SHA.test(sourceHash||'')||!SHA.test(reportHash||''))throw new Error('Replay requires full source and report digests');
  if(!result||!Number.isSafeInteger(result.rowCount)||result.rowCount<1||
    !Number.isSafeInteger(result.grandTotal)||result.grandTotal<0||
    !Array.isArray(result.months)||result.months.length<1||result.months.length>36){
    throw new Error('Replay input is invalid');
  }
  const months=result.months.map(item=>{
    if(!/^20\d{2}-(?:0[1-9]|1[0-2])$/.test(item.month)||!Number.isSafeInteger(item.cents)||item.cents<0){
      throw new Error('Replay has invalid monthly values');
    }
    return {month:item.month,cents:item.cents};
  });
  if(new Set(months.map(item=>item.month)).size!==months.length ||
     months.some((item,i)=>i>0 && item.month<=months[i-1].month) ||
     months.reduce((sum,item)=>sum+item.cents,0)!==result.grandTotal){
    throw new Error('Replay and verified totals disagree');
  }
  const max=Math.max(1,...months.map(item=>item.cents));
  const bars=months.map(item=>({
    label:item.month,
    cents:item.cents,
    percent:item.cents===0?0:Math.max(2,Math.round(item.cents/max*100))
  }));
  return Object.freeze({
    rowCount:result.rowCount,
    grandTotal:result.grandTotal,
    bars,
    sourceHash,
    reportHash,
    steps:Object.freeze([
      {label:'Read source',detail:result.rowCount+' synthetic CSV records'},
      {label:'Calculate',detail:months.length+' monthly totals'},
      {label:'Cross-check',detail:'Second arithmetic pass verified'}
    ])
  });
}
