import {analyzeSalesCsv,checkSalesReport,formatUsd,salesMarkdown,MAX_CSV_BYTES} from './engine.mjs';
// First-party browser-only processing: only File.text(), Web Crypto and local Blob URLs.
// There is no customer-data fetch, POST, storage or background worker.
const $=id=>document.getElementById(id);
let reportText=null,busy=false;
const fileField=$('csv-file'),consent=$('consent'),run=$('run');
function reset(){
  reportText=null;
  $('result').hidden=true;$('failure').hidden=true;$('status').hidden=true;$('fallback').hidden=true;
}
function refresh(){run.disabled=busy||!fileField.files?.length||!consent.checked;}
fileField.addEventListener('change',()=>{reset();consent.checked=false;refresh();});
consent.addEventListener('change',refresh);
async function sha256(text){
  const bytes=new TextEncoder().encode(text);
  const hash=await crypto.subtle.digest('SHA-256',bytes);
  return 'sha256:'+Array.from(new Uint8Array(hash),n=>n.toString(16).padStart(2,'0')).join('');
}
function revenueRow(month,cents){
  const row=document.createElement('tr'),left=document.createElement('td'),right=document.createElement('td');
  left.textContent=month;right.textContent=formatUsd(cents);row.append(left,right);
  return row;
}
function notice(message){$('status').textContent=message;$('status').hidden=false;}
function showReport(summary,sourceDigest,reportDigest){
  $('total').textContent=formatUsd(summary.totalCents);
  const delta=BigInt(summary.lastChangeCents);
  $('change').textContent=delta<0n?'Latest month down '+formatUsd(-delta):
    delta>0n?'Latest month up '+formatUsd(delta):'Latest month unchanged';
  $('monthly').replaceChildren(...summary.months.map(m=>revenueRow(m.month,m.cents)));
  $('proof').textContent='Source digest: '+sourceDigest+'\nReport digest: '+reportDigest+
    '\nSource rows: '+summary.rowCount+
    '\nMonthly and grand totals: second pass PASSED'+
    '\nWhere calculated: your browser'+
    '\nAI agents or external auditors: NOT USED'+
    '\nCustomer file transmitted: NO';
  $('result').hidden=false;
  requestAnimationFrame(()=>{
    const reduce=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
    $('result').scrollIntoView({block:'start',behavior:reduce?'auto':'smooth'});
  });
}
run.addEventListener('click',async()=>{
  if(busy||!consent.checked||!fileField.files?.length)return;
  const file=fileField.files[0];
  reset();
  if(!file.name.toLowerCase().endsWith('.csv')||file.size>MAX_CSV_BYTES){
    $('failure').textContent='Choose a .csv file of at most 256 KB.';
    $('failure').hidden=false;return;
  }
  busy=true;refresh();run.textContent='Checking your report…';
  try{
    const text=await file.text();
    if(!consent.checked||fileField.files?.[0]!==file)
      throw new Error('The selected file or permission changed. Please choose it again.');
    const result=analyzeSalesCsv(text);
    if(!checkSalesReport(text,result))throw new Error('The second arithmetic check failed. No report was produced.');
    const sourceDigest=await sha256(text);
    const markdown=salesMarkdown(result,sourceDigest);
    const outputDigest=await sha256(markdown);
    reportText=markdown;
    showReport(result,sourceDigest,outputDigest);
    // Release the file picker after reading. The deliverable stays only in page memory.
    fileField.value='';
    consent.checked=false;
  }catch(err){
    $('failure').textContent=err?.message||'This CSV could not be checked.';
    $('failure').hidden=false;
    reportText=null;
  }finally{busy=false;run.textContent='Make my report';refresh();}
});
$('download').addEventListener('click',()=>{
  if(reportText===null)return;
  try{
    const blob=new Blob([reportText],{type:'text/markdown;charset=utf-8'});
    const href=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=href;a.download='work-saban-monthly-sales-report.md';
    document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(href),1000);
    notice('Download requested. If your phone did not save it, tap Copy report.');
  }catch{notice('Your browser could not start a download. Tap Copy report.');}
});
$('copy').addEventListener('click',async()=>{
  if(reportText===null)return;
  try{
    if(!navigator.clipboard?.writeText)throw new Error('clipboard_not_available');
    await navigator.clipboard.writeText(reportText);
    $('fallback').hidden=true;
    notice('Report copied. Paste it where you need it.');
  }catch{
    $('copy-text').value=reportText;
    $('fallback').hidden=false;
    $('copy-text').focus();$('copy-text').select();
    notice('Clipboard access blocked. Copy the selected report text manually.');
  }
});

const toolShareUrl='https://jgaethle10.github.io/forge-operator/work-saban/report/?utm_source=work_saban_tool&utm_medium=organic_share&utm_campaign=work_saban';
$('share-tool').addEventListener('click',async()=>{
  const feedback=$('share-feedback');
  feedback.textContent='';
  // Share only this fixed public tool URL. Never share a selected CSV, report or its digest.
  if(typeof navigator.share==='function'){
    try{
      await navigator.share({
        title:'Work Saban | Free monthly sales reporter',
        text:'Make a checked monthly sales report from your CSV, privately in your browser. Free and no signup.',
        url:toolShareUrl
      });
      feedback.textContent='Share sheet closed. No report or CSV data was shared by Work Saban.';
      return;
    }catch(error){
      if(error?.name==='AbortError'){feedback.textContent='Sharing canceled.';return;}
    }
  }
  try{
    if(!navigator.clipboard?.writeText)throw new Error('clipboard_unavailable');
    await navigator.clipboard.writeText(toolShareUrl);
    feedback.textContent='Free tool link copied. Share it anywhere.';
  }catch{
    const link=document.createElement('a');
    link.href=toolShareUrl;
    link.textContent='Open or copy the free Work Saban link';
    feedback.replaceChildren(document.createTextNode('Copy this link: '),link);
  }
});
