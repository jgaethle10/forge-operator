const $ = id => document.getElementById(id);
let last = null;
$('compose').addEventListener('click', async () => {
  $('error').textContent = '';
  $('result').hidden = true;
  try {
    const response = await fetch('/api/compose', {method:'POST',headers:{'content-type':'application/json','x-work-saban-client':'local-preview'},body:JSON.stringify({task:$('task').value})});
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || 'Unable to form a team');
    last = data.mission;
    $('state').textContent = 'PROPOSED · NOT RUNNING';
    $('roles').replaceChildren(...last.team.map(role => {
      const card=document.createElement('div');card.className='role';
      const phase=document.createElement('small');phase.textContent=role.phase;
      const title=document.createElement('b');title.textContent=role.role;
      const body=document.createElement('span');body.textContent=role.responsibility;
      card.append(phase,title,body);return card;
    }));
    $('waves').replaceChildren(...last.execution_waves.map((wave,i)=>{const item=document.createElement('div');item.className='wave';item.textContent=`${i+1}. ${wave.join(' + ')}`;return item;}));
    $('gates').replaceChildren(...last.permission_gates.map(gate=>{const li=document.createElement('li');li.textContent=gate.label;return li;}));
    $('next').textContent=last.next_action;
    $('result').hidden=false;
  } catch (error) { $('error').textContent=error.message; }
});
$('copy').addEventListener('click', async()=>{
  if (!last) return;
  try {await navigator.clipboard.writeText(JSON.stringify(last,null,2));$('copy').textContent='Copied proposal';}
  catch { $('error').textContent='Clipboard unavailable here. Use the CLI for a JSON proposal.'; }
});

$('demo').addEventListener('click', async () => {
  $('error').textContent = '';
  $('demo').disabled = true;
  $('demo').textContent = 'Executing local workers...';
  try {
    const response = await fetch('/api/run-demo', {method:'POST',headers:{'x-work-saban-client':'local-preview'}});
    const payload = await response.json();
    if (!response.ok || !payload.ok) throw new Error(payload.error || 'Example failed');
    const run = payload.execution;
    if (run.status !== 'verified_local' || run.specialist_receipts.length !== 5)
      throw new Error('Execution evidence incomplete');
    $('demo-steps').replaceChildren(...run.specialist_receipts.map(row=>{
      const card=document.createElement('div');card.className='role';
      const role=document.createElement('b');role.textContent=row.role;
      const state=document.createElement('span');state.textContent=row.status + ' | QA ' + row.quality_status;
      card.append(role,state);return card;
    }));
    $('demo-report').textContent = run.report_markdown;
    $('demo-proof').textContent='Actual registered-worker local proof · 5 stages · report SHA-256: ' + run.report_sha256 +
      ' · No LLM inference or external actions';
    $('demo-result').hidden=false;
  } catch (error) { $('error').textContent=error.message; }
  finally { $('demo').disabled=false; $('demo').textContent='Run example team (synthetic data)'; }
});
