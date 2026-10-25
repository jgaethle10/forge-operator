/* Visual Office v0.3. Desks are symbolic; every running/verified state is driven by observed Saban events. */
(() => {
  const $ = id => document.getElementById(id);
  const ns = 'http://www.w3.org/2000/svg';
  const roles = [
    {id:'director',name:'Mission Director',short:'DIRECTOR',desc:'Proposes a team and records mission scope. This is not a model-backed worker.',x:244,y:162},
    {id:'analyst',name:'Data Analyst',short:'ANALYST',desc:'Checks CSV structure and calculates exact-cent revenue totals.',x:490,y:162},
    {id:'writer',name:'Communications Specialist',short:'WRITER',desc:'Builds fact-only language grounded in the completed analysis.',x:740,y:162},
    {id:'designer',name:'Presentation Designer',short:'DESIGNER',desc:'Packages figures, summary and provenance into a report.',x:244,y:349},
    {id:'auditor',name:'Quality Auditor',short:'AUDITOR',desc:'Independently recomputes totals and verifies report integrity.',x:490,y:349},
    {id:'coordinator',name:'Delivery Coordinator',short:'DELIVERY',desc:'Prepares local delivery after the auditor passes.',x:740,y:349}
  ];
  const byId=Object.fromEntries(roles.map(r=>[r.id,r]));
  const specialists=new Set(['analyst','writer','designer','auditor','coordinator']);
  const state=Object.fromEntries(roles.map(r=>[r.id,'idle']));
  const proofs={};
  let chosen='director',events=[],replayIndex=-1,replayTimer=null,running=false,svg=null;
  function makeSvg(tag, attrs={}) {
    const el=document.createElementNS(ns,tag);
    Object.entries(attrs).forEach(([key,value])=>el.setAttribute(key,String(value)));
    return el;
  }
  function getDesk(id) {return svg?.querySelector('[data-agent="'+id+'"]');}
  function select(id) {
    chosen=byId[id]?id:'director';
    const role=byId[chosen];
    $('office-agent-name').textContent=role.name;
    $('office-agent-desc').textContent=role.desc;
    $('office-agent-state').textContent=state[chosen].replaceAll('_',' ').toUpperCase();
    $('office-agent-proof').textContent=proofs[chosen]||(state[chosen]==='proposed'?'Proposal only, not executing':'No execution yet');
    svg?.querySelectorAll('[data-agent]').forEach(g=>g.classList.toggle('is-selected',g.getAttribute('data-agent')===chosen));
  }
  const handoffPairs={
    analyst:'director-analyst',
    writer:'analyst-writer',
    designer:'writer-designer',
    auditor:'designer-auditor',
    coordinator:'auditor-coordinator',
  };
  function showObservedHandoff(role) {
    const route=handoffPairs[role];
    if(!route||!svg)return;
    svg.querySelectorAll('#floor-connections path').forEach(p=>p.classList.remove('is-handoff'));
    const path=svg.querySelector('#handoff-'+route);
    if(path)path.classList.add('is-handoff');
  }
  function paint() {
    let verified=0;
    for(const role of roles) {
      const desk=getDesk(role.id);
      if(!desk)continue;
      const s=state[role.id];
      desk.setAttribute('data-state',s);
      desk.setAttribute('aria-label',role.name+', '+s.replaceAll('_',' '));
      const light=desk.querySelector('.status-light');
      light.setAttribute('fill',s==='verified'?'#63e0af':s==='running'?'#78bdff':s==='failed'?'#f38f8f':'#899cb8');
      desk.querySelector('.desk-state').textContent=s.replaceAll('_',' ').toUpperCase();
      if(s==='verified'&&specialists.has(role.id))verified++;
    }
    $('office-progress').textContent=verified+' / 5 verified';
    $('office-mode').textContent=running?'LOCAL WORKERS ACTIVE':verified===5?'VERIFIED LOCAL RUN':'AWAITING A MISSION';
    select(chosen);
  }
  function stopReplay() {
    if(replayTimer!==null){clearInterval(replayTimer);replayTimer=null;}
    $('office-replay').textContent='Replay trace';
  }
  function reset(kind='idle') {
    stopReplay();events=[];replayIndex=-1;running=false;
    roles.forEach(r=>{state[r.id]=kind;delete proofs[r.id];});
    svg?.querySelectorAll('#floor-connections path').forEach(p=>p.classList.remove('is-handoff'));
    $('office-events').replaceChildren();
    $('office-event-count').textContent='0 events';
    $('office-replay-caption').textContent='Only observed events. No simulated progress.';
    $('office-back').disabled=true;
    $('office-next').disabled=true;
    $('office-replay').disabled=true;
    $('office-current').textContent='No active assignment';
    paint();
  }
  function append(type,id,message,receipt=null) {
    const event={type,id,message,receipt,receivedAt:new Date()};
    events.push(event);
    const li=document.createElement('li');
    const time=document.createElement('time');
    time.textContent=event.receivedAt.toLocaleTimeString();
    const label=document.createElement('span');
    label.textContent=(byId[id]?.short||'SYSTEM')+' · '+message;
    li.append(time,label);
    if(type==='stage_verified')li.classList.add('is-verified');
    $('office-events').append(li);
    $('office-event-count').textContent=events.length+' observed events';
    if(events.length>1){
      $('office-back').disabled=false;$('office-next').disabled=false;$('office-replay').disabled=false;
    }
  }
  function consume(event) {
    if(!event||typeof event.type!=='string')throw new Error('invalid_work_event');
    if(event.type==='accepted') {
      reset('idle');
      running=true;
      state.director='admitted';
      proofs.director='Authorized local mission admitted';
      $('office-current').textContent='Mission admitted; awaiting specialist';
      append('accepted','director','Local mission admitted');
    } else if(event.type==='stage_started') {
      if(!specialists.has(event.role))throw new Error('unregistered_visual_specialist');
      running=true;
      showObservedHandoff(event.role);
      state[event.role]='running';
      $('office-current').textContent='Executing '+byId[event.role].name;
      append('stage_started',event.role,'Worker assignment started');
      select(event.role);
    } else if(event.type==='stage_verified') {
      if(!specialists.has(event.role)||event.receipt?.role!==event.role||
          event.receipt?.quality_status!=='pass'||event.receipt?.status!=='completed') {
        throw new Error('stage_without_verified_receipt');
      }
      state[event.role]='verified';
      proofs[event.role]=String(event.receipt.result_sha256||'Missing receipt hash').slice(0,30)+'…';
      $('office-current').textContent='Verified '+byId[event.role].name;
      append('stage_verified',event.role,'Completed · quality gate passed',event.receipt);
      select(event.role);
    } else if(event.type==='completed') {
      if(event.execution?.status!=='verified_local'||event.execution?.quality?.status!=='verified'
         ||event.execution?.specialist_receipts?.length!==5)throw new Error('unverified_delivery');
      running=false;
      $('office-current').textContent='Audited report prepared';
      append('completed','coordinator','Audited output prepared');
      select('coordinator');
    } else if(event.type==='failed_closed') {
      running=false;
      const active=roles.find(r=>state[r.id]==='running');
      if(active){state[active.id]='failed';proofs[active.id]='Execution held, no delivery';}
      $('office-current').textContent='Execution held';
      append('failed_closed',active?.id||'director','Failed closed, no approved output');
    } else {
      throw new Error('unknown_visual_work_event');
    }
    paint();
  }
  function replayAt(index) {
    if(index<0||index>=events.length)return;
    const event=events[index];
    svg?.querySelectorAll('[data-agent]').forEach(d=>d.classList.remove('is-replay-focus'));
    getDesk(event.id)?.classList.add('is-replay-focus');
    select(event.id);
    replayIndex=index;
    $('office-replay-caption').textContent='Observed event '+(index+1)+' / '+events.length+': '+event.message+'. Timestamps are browser receipt times.';
  }
  function proposed(mission) {
    reset('idle');
    for(const role of mission?.team||[]) if(byId[role.id])state[role.id]='proposed';
    append('proposed','director','Team proposed, no workers dispatched');
    $('office-current').textContent='Proposed formation only';
    paint();
    $('office-mode').textContent='PROPOSED · NOT RUNNING';
  }
  function mount(svgText) {
    const scene=$('office-scene');
    scene.innerHTML=svgText;
    svg=scene.querySelector('svg');
    if(!svg)throw new Error('office_floor_unavailable');
    const root=svg.querySelector('#floor-desks');
    for(const role of roles){
      const group=makeSvg('g',{
        'data-agent':role.id,
        transform:'translate('+role.x+' '+role.y+')',
        role:'button',tabindex:'0','aria-label':role.name+', idle'
      });
      const use=makeSvg('use',{'href':'#desk-template'});
      const name=makeSvg('text',{class:'desk-name',x:0,y:98,'text-anchor':'middle',fill:'#e7f1ff','font-family':'system-ui,sans-serif','font-weight':700,'font-size':13});
      name.textContent=role.short;
      const small=makeSvg('text',{class:'desk-state',x:0,y:111,'text-anchor':'middle',fill:'#9bb0cb','font-family':'system-ui,sans-serif','letter-spacing':'.9','font-size':10});
      small.textContent='IDLE';
      const dot=makeSvg('circle',{class:'status-light',cx:76,cy:-36,r:6,fill:'#899cb8'});
      group.append(use,name,small,dot);
      group.addEventListener('click',()=>select(role.id));
      group.addEventListener('keydown',e=>{
        if(e.key==='Enter'||e.key===' '){e.preventDefault();select(role.id);}
      });
      root.append(group);
    }
    $('office-back').addEventListener('click',()=>{
      stopReplay();
      replayAt(Math.max(0,replayIndex<0?events.length-2:replayIndex-1));
    });
    $('office-next').addEventListener('click',()=>{
      stopReplay();
      replayAt(Math.min(events.length-1,replayIndex+1));
    });
    $('office-replay').addEventListener('click',()=>{
      if(!events.length)return;
      if(replayTimer!==null){stopReplay();return;}
      replayAt(0);
      $('office-replay').textContent='Stop replay';
      replayTimer=setInterval(()=>{
        if(replayIndex>=events.length-1){
          stopReplay();
          $('office-replay-caption').textContent='Replay complete. No live work was simulated.';
        } else replayAt(replayIndex+1);
      },800);
    });
    reset();select('director');
  }
  const ready=fetch('/office-floor.svg').then(async r=>{
    if(!r.ok)throw new Error('office_floor_asset_missing');
    mount(await r.text());
  }).catch(e=>{
    $('office-scene').textContent='Visual office unavailable: '+e.message;
    throw e;
  });
  window.WorkSabanOffice={
    ready,
    consume:event=>ready.then(()=>consume(event)),
    proposed:mission=>ready.then(()=>proposed(mission)),
    reset:()=>ready.then(()=>reset()),
  };
})();
