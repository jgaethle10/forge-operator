const $ = id => document.getElementById(id);
let last = null;
let deliveredRun = null;
let lastMissionEvidence = null;
let missionBusy = false;
const office = window.WorkSabanOffice;

$('compose').addEventListener('click', async () => {
  $('error').textContent = '';
  $('result').hidden = true;
  try {
    const response = await fetch('/api/compose', {
      method:'POST',
      headers:{'content-type':'application/json','x-work-saban-client':'local-preview'},
      body:JSON.stringify({task:$('task').value})
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || 'Unable to form a team');
    last = data.mission;
    $('state').textContent='PROPOSED · NOT RUNNING';
    $('roles').replaceChildren(...last.team.map(role=>{
      const card=document.createElement('div');card.className='role';
      const phase=document.createElement('small');phase.textContent=role.phase;
      const title=document.createElement('b');title.textContent=role.role;
      const body=document.createElement('span');body.textContent=role.responsibility;
      card.append(phase,title,body);return card;
    }));
    $('waves').replaceChildren(...last.execution_waves.map((wave,i)=>{
      const item=document.createElement('div');item.className='wave';
      item.textContent=String(i+1)+'. '+wave.join(' + ');return item;
    }));
    $('gates').replaceChildren(...last.permission_gates.map(gate=>{
      const li=document.createElement('li');li.textContent=gate.label;return li;
    }));
    $('next').textContent=last.next_action;
    $('result').hidden=false;
    await office?.proposed(last);
  } catch(error) {$('error').textContent=error.message;}
});
$('copy').addEventListener('click',async()=>{
  if(!last)return;
  try{await navigator.clipboard.writeText(JSON.stringify(last,null,2));$('copy').textContent='Copied proposal';}
  catch{$('error').textContent='Clipboard unavailable here. Use the CLI for JSON output.';}
});

function displayRun(run, source) {
  if(run?.status!=='verified_local'||run.quality?.status!=='verified'
    ||run.specialist_receipts?.length!==5)throw new Error('Audit receipts incomplete');
  $('demo-steps').replaceChildren(...run.specialist_receipts.map(row=>{
    const card=document.createElement('div');card.className='role';
    const title=document.createElement('b');title.textContent=row.role;
    const state=document.createElement('span');
    state.textContent=row.status+' | QA '+row.quality_status;
    card.append(title,state);return card;
  }));
  $('demo-label').textContent=source==='synthetic'
    ?'Synthetic fixture, actual local registered-worker execution. No customer data.'
    :'Your explicitly selected CSV, processed by local registered workers. No external AI provider.';
  $('demo-report').textContent=run.report_markdown;
  $('demo-proof').textContent='Source: '+run.source_sha256+' · Report: '+run.report_sha256+
    ' · Five audited local worker stages, no LLM inference or external actions';
  $('demo-result').hidden=false;
  deliveredRun=source==='user'?run:null;
  $('save-report').hidden=source!=='user';
}

async function streamMission(url, payload) {
  await office?.ready;
  const headers={'x-work-saban-client':'local-preview'};
  let body;
  if(payload!==undefined){
    headers['content-type']='application/json';
    body=JSON.stringify(payload);
  }
  const response=await fetch(url,{method:'POST',headers,body});
  if(!response.ok){
    const detail=await response.json().catch(()=>({}));
    throw new Error(detail.error||'Mission was not admitted');
  }
  if(!response.body)throw new Error('Streaming not supported by this browser');
  const reader=response.body.getReader();
  const decoder=new TextDecoder();
  let pending='',completed=null,events=0;
  if(!window.WorkSabanTrace)throw new Error('browser_trace_verification_unavailable');
  const verifier=window.WorkSabanTrace.create();
  async function verify(event){
    events++;
    if(events>32)throw new Error('worker_event_limit_exceeded');
    const verified=await verifier.accept(event);
    await office.consume(event);
    office?.traceStatus(verified);
    if(event.type==='completed')completed=event.execution;
    if(event.type==='failed_closed')throw new Error('Worker execution failed closed');
  }
  while(true){
    const packet=await reader.read();
    pending+=decoder.decode(packet.value||new Uint8Array(),{stream:!packet.done});
    if(pending.length>1024*1024)throw new Error('stream_event_too_large');
    const lines=pending.split('\n');
    pending=lines.pop();
    for(const line of lines){
      if(!line.trim())continue;
      await verify(JSON.parse(line));
    }
    if(packet.done)break;
  }
  if(pending.trim())await verify(JSON.parse(pending));
  if(!completed || verifier.summary().status!=='completed')
    throw new Error('Stream ended without a cryptographically checked local delivery receipt');
  lastMissionEvidence=verifier.export();
  office?.traceStatus(verifier.summary());
  return completed;
}

async function launch(button,url,payload,source){
  if(missionBusy)return;
  missionBusy=true;
  $('demo').disabled=true;
  $('csv-run').disabled=true;
  $('compose').disabled=true;
  $('error').textContent='';
  $('demo-result').hidden=true;
  $('save-report').hidden=true;
  deliveredRun=null;
  lastMissionEvidence=null;
  $('office-export-trace').disabled=true;
  button.disabled=true;
  const label=button.textContent;
  button.textContent='Watching local workers…';
  try{
    const run=await streamMission(url,payload);
    displayRun(run,source);
    if(source==='user')$('csv-consent').checked=false;
  } catch(error){
    $('error').textContent=error.message;
    lastMissionEvidence=null;
    office?.traceStatus({status:'invalid'});
    await office?.consume({type:'failed_closed'}).catch(()=>{});
  } finally {
    button.textContent=label;
    missionBusy=false;
    $('demo').disabled=false;
    $('compose').disabled=false;
    updateCsvButton();
  }
}
$('demo').addEventListener('click',()=>launch($('demo'),'/api/run-demo-stream',undefined,'synthetic'));

function updateCsvButton(){
  $('csv-run').disabled=missionBusy||!$('csv-file').files?.length||!$('csv-consent').checked;
}
$('csv-file').addEventListener('change',updateCsvButton);
$('csv-consent').addEventListener('change',updateCsvButton);

$('csv-run').addEventListener('click',async()=>{
  const file=$('csv-file').files?.[0];
  if(!file||!$('csv-consent').checked){
    $('error').textContent='Select one CSV and explicitly authorize its local read.';
    return;
  }
  if(!file.name.toLowerCase().endsWith('.csv')||file.size>256*1024){
    $('error').textContent='Select a CSV of no more than 256 KB.';
    return;
  }
  const text=await file.text();
  await launch($('csv-run'),'/api/run-csv-stream',{
    filename:file.name,csv_text:text,local_file_read_approved:true
  },'user');
});

$('save-report').addEventListener('click',()=>{
  if(!deliveredRun||deliveredRun.status!=='verified_local')return;
  const blob=new Blob([deliveredRun.report_markdown],{type:'text/markdown;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const link=document.createElement('a');
  link.href=url;
  link.download='work-saban-audited-sales-report.md';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
});


// Evidence files are created only on an explicit local user action.
// The trace includes a full report and must be handled as private business data.
$('office-export-trace').addEventListener('click',()=>{
  if(!lastMissionEvidence||lastMissionEvidence.status!=='completed')return;
  const contents=JSON.stringify(lastMissionEvidence,null,2)+'\n';
  const blob=new Blob([contents],{type:'application/json;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const link=document.createElement('a');
  link.href=url;
  link.download='work-saban-verified-local-trace.json';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
});


// Explicit opt-in synthetic executor inspection; never implies AI agent provisioning.
$('executor-smoke').addEventListener('click',async()=>{
  const button=$('executor-smoke'),status=$('executor-status');
  button.disabled=true;
  status.textContent='Running six local verification tasks…';
  try{
    const response=await fetch('/api/executor-smoke',{method:'POST',headers:{'x-work-saban-client':'local-preview'}});
    const data=await response.json();
    if(!response.ok||data.ok!==true||data.source!=='synthetic_fixture'||data.live_agents!==false)
      throw new Error('Local executor verification unavailable');
    for(const event of data.events||[])window.WorkSaban3D?.consumeExecutorEvent(event);
    const capacity=data.execution?.capacity;
    if(!capacity||capacity.verified!==6||capacity.failed!==0)
      throw new Error('Execution verification incomplete');
    status.textContent='6 of 6 synthetic local tasks verified. No AI agents provisioned.';
  }catch(error){
    status.textContent='Executor test failed: '+error.message;
  }finally{button.disabled=false;}
});
