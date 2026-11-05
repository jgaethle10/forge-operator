// Visual Desk / Work Saban: replay confirmed local operations only.
// Do not use this component to imply live remote agent execution.
let proofReplayTimeouts=[];
export function showProofReplay(model,{formatCents}){
  const $=id=>document.getElementById(id);
  if(typeof formatCents!=='function')throw new Error('Currency formatter missing');
  for(const timer of proofReplayTimeouts)clearTimeout(timer);
  proofReplayTimeouts=[];
  const scene=$('vr-scene');
  $('vr-total').textContent=formatCents(model.grandTotal);
  model.steps.forEach((step,i)=>{$('vr-step-'+i).textContent=step.detail;});
  const chart=$('vr-chart');
  const bars=model.bars.map(item=>{
    const group=document.createElement('div');group.className='vr-bar-group';
    const wrap=document.createElement('div');wrap.className='vr-bar-wrap';
    const bar=document.createElement('span');bar.className='vr-bar';
    bar.style.height=item.percent+'%';wrap.append(bar);
    const amount=document.createElement('strong');amount.textContent=formatCents(item.cents);
    const name=document.createElement('small');name.textContent=item.label.slice(5)+'/'+item.label.slice(2,4);
    group.append(wrap,amount,name);return group;
  });
  chart.replaceChildren(...bars);
  chart.setAttribute('aria-label','Checked synthetic monthly sales: '+model.bars.map(x=>x.label+' '+formatCents(x.cents)).join('; '));
  const phase=(n)=>{
    scene.dataset.phase=String(n);
    $('vr-status').textContent=['Replaying the already-read source data. No live worker is running.',
      'Replaying the completed exact-cent calculation.',
      'Replaying the completed second arithmetic check.',
      'Playback complete. All values were verified in this browser.'][n];
  };
  phase(3);$('visual-replay').hidden=false;
  $('vr-play').onclick=()=>{
    for(const timer of proofReplayTimeouts)clearTimeout(timer);
    proofReplayTimeouts=[];
    if(typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches){phase(3);return;}
    phase(0);
    [1,2,3].forEach((n,i)=>proofReplayTimeouts.push(setTimeout(()=>phase(n),(i+1)*750)));
  };
}
