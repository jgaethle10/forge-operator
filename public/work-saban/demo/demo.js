import {calculateExample,auditExample,formatCents,formatReportMarkdown} from './engine.mjs';
// Only fetch our published, non-private six-row fixture. No user uploads or POSTs.
const $=id=>document.getElementById(id);
async function digest(text){
  const bytes=new TextEncoder().encode(text);
  const hash=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(hash)].map(n=>n.toString(16).padStart(2,'0')).join('');
}
function addRow(month,value){
  const row=document.createElement('tr');
  const a=document.createElement('td'),b=document.createElement('td');
  a.textContent=month;b.textContent=formatCents(value);
  row.append(a,b);
  return row;
}
$('run').addEventListener('click',async()=>{
  $('run').disabled=true;
  $('run').textContent='Checking example…';
  $('output').hidden=true;$('fail').hidden=true;
  $('save-status').hidden=true;$('copy-fallback').hidden=true;
  try {
    const response=await fetch('../example-sales.csv',{method:'GET',credentials:'omit',cache:'no-store'});
    if(!response.ok||response.redirected)throw new Error('The public example dataset is unavailable.');
    const csv=await response.text();
    const result=calculateExample(csv);
    if(!auditExample(csv,result))throw new Error('The arithmetic cross-check did not pass.');
    const report=formatReportMarkdown(result);
    const sourceHash=await digest(csv);
    const reportHash=await digest(report);
    $('total').textContent=formatCents(result.grandTotal);
    $('movement').textContent=result.lastChange===null?'Single month sample':
      result.lastChange<0?'Latest month: down '+formatCents(-result.lastChange):
      result.lastChange>0?'Latest month: up '+formatCents(result.lastChange):'Latest month: unchanged';
    $('rows').replaceChildren(...result.months.map(row=>addRow(row.month,row.cents)));
    $('proof').textContent='Source: public synthetic CSV ('+result.rowCount+' rows)\n'
      +'SHA-256 source: '+sourceHash+'\n'
      +'SHA-256 output: '+reportHash+'\n'
      +'Arithmetic second pass: PASSED\n'
      +'Calculation location: this browser\n'
      +'AI/registered workers: NOT USED\n'
      +'Customer data uploaded: NONE';
    $('output').hidden=false;
    // In a phone browser, a result below the hero should never require hunting or extra scrolling.
    requestAnimationFrame(()=>{
      const reduced=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
      $('output').scrollIntoView({block:'start',behavior:reduced?'auto':'smooth'});
    });
    const status=message=>{
      $('save-status').textContent=message;
      $('save-status').hidden=false;
    };
    $('download').onclick=()=>{
      try{
        const blob=new Blob([report],{type:'text/markdown;charset=utf-8'});
        const url=URL.createObjectURL(blob);
        const a=document.createElement('a');a.href=url;a.download='work-saban-synthetic-example.md';
        document.body.append(a);a.click();a.remove();
        setTimeout(()=>URL.revokeObjectURL(url),1000);
        // An in-app browser may ignore downloads; never claim the file was saved.
        status('Download requested. If nothing happens on your phone, tap Copy report.');
      }catch{
        status('This browser did not start the download. Tap Copy report instead.');
      }
    };
    $('copy').onclick=async()=>{
      try{
        if(!navigator.clipboard?.writeText)throw new Error('clipboard_unavailable');
        await navigator.clipboard.writeText(report);
        $('copy-fallback').hidden=true;
        status('Report copied. Paste it wherever you like.');
      }catch{
        $('report-text').value=report;
        $('copy-fallback').hidden=false;
        $('report-text').focus();
        $('report-text').select();
        status('Clipboard access is unavailable here. The report text is selected below for manual copying.');
      }
    };
  } catch(err){
    $('fail').textContent=err?.message||'The example could not be checked.';
    $('fail').hidden=false;
  } finally {
    $('run').disabled=false;
    $('run').textContent='Run the example';
  }
});
