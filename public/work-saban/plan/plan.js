import {planTask} from './engine.mjs';
const $=id=>document.getElementById(id);
let current=null;
const PHASE={scope:'01 · Understand',specialist:'02 · Specialists',verify:'03 · Check',delivery:'04 · Handoff'};
function node(tag,txt,className=''){
  const e=document.createElement(tag);
  if(className)e.className=className;
  e.textContent=txt;
  return e;
}
function planPlainText(plan){
  return ['Work Saban task plan',
    'State: PROPOSED ONLY, NOT RUNNING',
    'Task: '+plan.task,'',
    'Suggested team:',
    ...plan.team.map((role,i)=>(i+1)+'. '+role.role+' - '+role.responsibility),
    '','Proposed sequence:',
    ...plan.waves.map((wave,i)=>(i+1)+'. '+wave.map(id=>plan.team.find(x=>x.id===id)?.role||id).join(' + ')),
    '','Requires separate approval:',
    ...plan.permission_gates.map(gate=>'- '+gate),
    '','Browser-only plan. No actual work, AI models, connected accounts or payments.'].join('\n');
}
function render(plan){
  const cards=plan.team.map(role=>{
    const card=node('div','','agent');
    card.append(
      node('span',PHASE[role.phase]||'Proposed'),
      node('strong',role.role),
      node('p',role.responsibility)
    );
    return card;
  });
  $('team').replaceChildren(...cards);
  $('sequence').replaceChildren(...plan.waves.map(wave=>node('li',wave.map(id=>plan.team.find(x=>x.id===id)?.role||id).join(' + '))));
  $('approvals').replaceChildren(...plan.permission_gates.map(gate=>node('li',gate)));
  $('proposal').hidden=false;
  $('copy-status').hidden=true;
  $('plan-copy-fallback').hidden=true;
  requestAnimationFrame(()=>{
    const reduce=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
    $('proposal').scrollIntoView({block:'start',behavior:reduce?'auto':'smooth'});
  });
}
$('plan').addEventListener('click',()=>{
  $('error').hidden=true;
  $('proposal').hidden=true;
  current=null;
  try{
    current=planTask($('task').value);
    render(current);
  }catch(err){
    $('error').textContent=err?.message||'Please check the task and try again.';
    $('error').hidden=false;
    $('task').focus();
  }
});
$('reset').addEventListener('click',()=>{
  current=null;
  $('task').value='';
  $('proposal').hidden=true;
  $('error').hidden=true;
  $('copy-status').hidden=true;
  $('plan-copy-fallback').hidden=true;
  $('task').focus();
  window.scrollTo({top:0,behavior:'auto'});
});
$('copy').addEventListener('click',async()=>{
  if(!current)return;
  const text=planPlainText(current);
  try{
    if(!navigator.clipboard?.writeText)throw new Error('clipboard_unavailable');
    await navigator.clipboard.writeText(text);
    $('plan-copy-fallback').hidden=true;
    $('copy-status').textContent='Plan copied. Paste it where you like.';
  }catch{
    $('plan-text').value=text;
    $('plan-copy-fallback').hidden=false;
    $('plan-text').focus();
    $('plan-text').select();
    $('copy-status').textContent='Clipboard access is blocked. Copy the selected text manually.';
  }
  $('copy-status').hidden=false;
});
