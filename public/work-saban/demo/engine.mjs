// Work Saban public example. Pure browser-friendly arithmetic, not a hosted agent runtime.
// Only known synthetic CSV is used by the published UI; no customer uploads or tracking.
const MONTH=/^20\d{2}-(?:0[1-9]|1[0-2])$/;
const AMOUNT=/^(?:0|[1-9]\d{0,7})\.\d{2}$/;
const centsFromAmount=s=>{
  if(!AMOUNT.test(s))throw new Error('Example contains an invalid USD amount');
  const [whole,decimal]=s.split('.');
  return Number(whole)*100+Number(decimal);
};
const formatCents=n=>{
  if(!Number.isSafeInteger(n))throw new Error('Invalid cents value');
  const sign=n<0?'-':'';
  const abs=Math.abs(n);
  return sign+'$'+Math.floor(abs/100).toLocaleString('en-US')+'.'+String(abs%100).padStart(2,'0');
};
export function calculateExample(csv){
  if(typeof csv!=='string'||csv.length>256*1024)throw new Error('Example CSV is unavailable or too large');
  const lines=csv.trim().split(/\r?\n/);
  if(lines[0]!=='month,revenue,category'||lines.length<2||lines.length>2001)
    throw new Error('Expected a monthly sales example CSV');
  const totals=new Map();
  for(const row of lines.slice(1)){
    const fields=row.split(',');
    if(fields.length!==3||!MONTH.test(fields[0])||!fields[2].trim())
      throw new Error('Malformed example CSV');
    const cents=centsFromAmount(fields[1]);
    const total=(totals.get(fields[0])||0)+cents;
    if(!Number.isSafeInteger(total))throw new Error('Example amount exceeds safe precision');
    totals.set(fields[0],total);
  }
  const months=[...totals.entries()].sort(([a],[b])=>a.localeCompare(b))
    .map(([month,cents])=>({month,cents}));
  const grandTotal=months.reduce((sum,item)=>sum+item.cents,0);
  if(!Number.isSafeInteger(grandTotal))throw new Error('Example total exceeds safe precision');
  const lastChange=months.length>1?months.at(-1).cents-months.at(-2).cents:null;
  return {rowCount:lines.length-1,months,grandTotal,lastChange};
}
// Separate exact-cent re-read of the source, not a second AI model or remote auditor.
export function auditExample(csv,report){
  const lines=String(csv).trim().split(/\r?\n/);
  if(!report||!Array.isArray(report.months)||lines[0]!=='month,revenue,category')return false;
  let total=0;
  const byMonth=Object.create(null);
  for(const row of lines.slice(1)){
    const cells=row.split(',');
    if(cells.length!==3||!MONTH.test(cells[0])||!AMOUNT.test(cells[1]))return false;
    const [dollars,decimals]=cells[1].split('.');
    const cents=Number(dollars)*100+Number(decimals);
    if(!Number.isSafeInteger(cents))return false;
    byMonth[cells[0]]=(byMonth[cells[0]]||0)+cents;
    total+=cents;
  }
  if(!Number.isSafeInteger(total)||total!==report.grandTotal||report.rowCount!==lines.length-1)return false;
  const sorted=Object.entries(byMonth).sort(([a],[b])=>a.localeCompare(b));
  if(report.months.length!==sorted.length)return false;
  if(!sorted.every(([month,cents],i)=>report.months[i].month===month&&report.months[i].cents===cents))return false;
  const delta=sorted.length>1?sorted.at(-1)[1]-sorted.at(-2)[1]:null;
  return delta===report.lastChange;
}
export function formatReportMarkdown(result){
  if(!result||!Array.isArray(result.months))throw new Error('No report to format');
  const rows=result.months.map(item=>'| '+item.month+' | '+formatCents(item.cents)+' |');
  const movement=result.lastChange===null?'Only one month in sample':
    result.lastChange<0?'Down '+formatCents(-result.lastChange):
    result.lastChange>0?'Up '+formatCents(result.lastChange):'No change';
  return ['# Work Saban / Sample monthly sales report','',
    'Synthetic example only. Computed in your browser, not by a remotely hosted agent team.','',
    'Total revenue: '+formatCents(result.grandTotal),
    'Most recent month change: '+movement,'',
    '| Month | Revenue |','| --- | ---: |',...rows,'',
    'Check: second-pass exact-cent arithmetic comparison passed.',
    'Scope: '+result.rowCount+' public synthetic rows. No customer file was received or transmitted.',''].join('\n');
}
export {formatCents};
