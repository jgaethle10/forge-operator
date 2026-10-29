/* Work Saban spatial office. CSS 3D transforms, not simulated model activity.
   No remote dependencies, trackers, WebGL requirement or automatic tool dispatch. */
(() => {
  const $=id=>document.getElementById(id);
  const roster=[
    {id:'director',name:'Mission Director',room:'MISSION CONTROL',x:142,y:144,mark:'M'},
    {id:'analyst',name:'Data Analyst',room:'DATA LAB',x:488,y:144,mark:'A'},
    {id:'writer',name:'Communications',room:'COMMS',x:834,y:144,mark:'C'},
    {id:'designer',name:'Presentation Designer',room:'DESIGN STUDIO',x:142,y:478,mark:'D'},
    {id:'auditor',name:'Quality Auditor',room:'VERIFICATION',x:488,y:478,mark:'Q'},
    {id:'coordinator',name:'Delivery Coordinator',room:'DELIVERY',x:834,y:478,mark:'R'},
  ];
  const known=new Set(roster.map(r=>r.id));
  const state=Object.fromEntries(roster.map(r=>[r.id,'idle']));
  const receipts={};
  const scene=$('office-scene');
  let enabled=false,selected='director',position={yaw:-14,pitch:58,zoom:typeof window.innerWidth==='number'&&window.innerWidth<720?0.46:0.72,panX:0,panY:0};
  let world=null,drag=null;
  const rooms=[
    {name:'MISSION CONTROL',x:16,y:16},
    {name:'DATA LAB',x:358,y:16},
    {name:'COMMUNICATIONS',x:700,y:16},
    {name:'DESIGN STUDIO',x:16,y:345},
    {name:'VERIFICATION',x:358,y:345},
    {name:'DELIVERY',x:700,y:345},
  ];
  const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
  const make=(tag,cls,text='')=>{
    const e=document.createElement(tag);
    if(cls)e.className=cls;
    e.textContent=text;
    return e;
  };
  function place(element,x,y) {element.style.left=x+'px';element.style.top=y+'px';}
  const roomElements=[];
  const agents=new Map();
  const links=[];
  function build(){
    if(world)return;
    const viewport=make('div','spatial-viewport');
    viewport.id='spatial-viewport';
    viewport.tabIndex=0;
    viewport.setAttribute('aria-label','3D office. Drag to orbit, Shift drag to pan, wheel to zoom. Arrow keys pan. Q and E rotate. N visits the next coworker, P the previous. Select an agent desk.');
    const stage=make('div','spatial-stage');
    world=make('div','spatial-world');
    stage.append(world);
    viewport.append(stage);
    const floor=make('div','spatial-floor');
    world.append(floor);
    rooms.forEach((room,i)=>{
      const block=make('div','spatial-room');
      place(block,room.x,room.y);
      const rug=make('div','spatial-rug');
      const title=make('div','spatial-room-name',room.name);
      const wall=make('div','spatial-room-wall');
      const windowPane=make('div','spatial-room-window');
      block.append(rug,title,wall,windowPane);
      world.append(block);roomElements.push(block);
    });
    // Cozy office decor is purely visual and never represents agent activity.
    for(const [x,y] of [[42,255],[375,255],[725,255],[45,590],[390,590],[730,590]]){
      const plant=make('div','spatial-plant');
      plant.setAttribute('aria-hidden','true');
      plant.append(make('span','spatial-pot'),make('span','spatial-leaf leaf-a'),make('span','spatial-leaf leaf-b'),make('span','spatial-leaf leaf-c'));
      place(plant,x,y);world.append(plant);
    }
    const tank=make('div','spatial-fishtank');
    tank.setAttribute('role','img');
    tank.setAttribute('aria-label','Decorative office aquarium with two little fish and bubbles');
    tank.append(make('span','spatial-tank-water'),make('span','spatial-fish fish-one'),make('span','spatial-fish fish-two'),make('span','spatial-bubbles'),make('span','spatial-tank-base'));
    place(tank,575,282);world.append(tank);
    for(const [i,role] of roster.entries()){
      const desk=make('button','spatial-agent');
      desk.type='button';
      desk.dataset.agent=role.id;
      desk.setAttribute('aria-label',role.name+' at '+role.room+', idle');
      place(desk,role.x,role.y);
      const glow=make('span','spatial-agent-glow');
      const top=make('span','spatial-desk-top');
      const front=make('span','spatial-desk-front');
      const computer=make('span','spatial-computer');
      const screen=make('span','spatial-screen');
      computer.append(screen);
      const figure=make('span','spatial-person');
      figure.append(make('span','spatial-person-body'));
      const head=make('span','spatial-person-head');
      head.append(make('span','spatial-person-hair'));
      const face=make('span','spatial-person-face');
      face.append(make('span','spatial-eye spatial-eye-left'),make('span','spatial-eye spatial-eye-right'),make('span','spatial-smile'));
      head.append(face);
      figure.append(head);
      const badge=make('span','spatial-desk-label');
      badge.append(make('strong','',role.name),make('small','','IDLE'));
      const diode=make('span','spatial-agent-diode');
      desk.append(glow,top,front,computer,figure,badge,diode);
      desk.addEventListener('click',e=>{e.stopPropagation();select(role.id);focusAgent(role.id);window.WorkSabanOffice?.select(role.id);});
      world.append(desk);agents.set(role.id,desk);
    }
    const path=make('div','spatial-corridor');
    path.innerHTML='<span>AUTHORIZED WORK ONLY</span>';
    world.append(path);
    const overlay=make('div','spatial-overlay');
    const orbit=make('div','spatial-orbit-label','DRAG TO ORBIT  ·  SHIFT-DRAG TO PAN  ·  WASD TO PAN  ·  N/P TO VISIT COWORKERS  ·  SCROLL TO ZOOM');
    const controls=make('div','spatial-controls');
    const buttons=[
      ['−','Zoom out',()=>zoom(-0.1)],
      ['+','Zoom in',()=>zoom(0.1)],
      ['⟲','Orbit left',()=>orbitCamera(-15,0)],
      ['⟳','Orbit right',()=>orbitCamera(15,0)],
      ['⌖','Reset view',()=>resetCamera()],
      ['◎','Focus selected coworker',()=>focusAgent(selected)],
      ['→','Visit next coworker',()=>tourNext()]
    ];
    buttons.forEach(([label,title,fn])=>{
      const b=make('button','spatial-control',label);
      b.type='button';b.title=title;b.setAttribute('aria-label',title);
      b.addEventListener('click',e=>{e.stopPropagation();fn();});
      controls.append(b);
    });
    overlay.append(orbit,controls);
    viewport.append(overlay);
    scene.append(viewport);
    const fallback=$('office-scene')?.querySelector('.workfloor-art');
    if(fallback)fallback.classList.add('office-floor-hidden');
    viewport.addEventListener('pointerdown',e=>{
      if(e.button!==0||e.target.closest('button'))return;
      drag={x:e.clientX,y:e.clientY,pan:e.shiftKey,id:e.pointerId};
      viewport.setPointerCapture(e.pointerId);
      viewport.classList.add('is-dragging');
    });
    viewport.addEventListener('pointermove',e=>{
      if(!drag||e.pointerId!==drag.id)return;
      const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
      drag.x=e.clientX;drag.y=e.clientY;
      if(drag.pan){position.panX=clamp(position.panX+dx,-480,480);position.panY=clamp(position.panY+dy,-360,360);}
      else orbitCamera(dx*0.3,dy*0.17);
      applyCamera();
    });
    const end=e=>{
      if(drag?.id===e.pointerId){drag=null;viewport.classList.remove('is-dragging');}
    };
    viewport.addEventListener('pointerup',end);
    viewport.addEventListener('pointercancel',end);
    viewport.addEventListener('lostpointercapture',()=>{drag=null;viewport.classList.remove('is-dragging');});
    viewport.addEventListener('wheel',e=>{e.preventDefault();zoom(e.deltaY<0?0.06:-0.06);},{passive:false});
    viewport.addEventListener('keydown',e=>{
      const key=e.key.toLowerCase(),step=e.shiftKey?42:22;
      const panKeys={arrowleft:[step,0],arrowright:[-step,0],arrowup:[0,step],arrowdown:[0,-step],w:[0,step],a:[step,0],s:[0,-step],d:[-step,0]};
      if(key in panKeys){
        e.preventDefault();position.panX=clamp(position.panX+panKeys[key][0],-480,480);
        position.panY=clamp(position.panY+panKeys[key][1],-360,360);
        applyCamera();
      }else if(key==='n'||key==='p'){
        e.preventDefault();
        tourIndex=(tourIndex+(key==='n'?0:roster.length-2))%roster.length;
        tourNext();
      }else if(key==='q'||key==='e'){
        e.preventDefault();orbitCamera(key==='q'?-12:12,0);
      }else if(key==='+'||key==='='){e.preventDefault();zoom(0.08);}
      else if(key==='-'){e.preventDefault();zoom(-0.08);}
    });
    applyCamera();paint();
  }
  function applyCamera(){
    if(!world)return;
    const p=position;
    world.style.transform='translate3d('+p.panX+'px,'+p.panY+'px,0) rotateX('+p.pitch+'deg) rotateZ('+p.yaw+'deg) scale('+p.zoom+')';
    const pitchScale=clamp(p.pitch/60,0.35,1);
    scene.style.setProperty('--office-depth',String(pitchScale));
  }
  function orbitCamera(dx,dy){
    position.yaw=clamp(position.yaw+dx,-170,170);
    position.pitch=clamp(position.pitch+dy,32,74);
    applyCamera();
  }
  function zoom(delta){position.zoom=clamp(Math.round((position.zoom+delta)*100)/100,0.35,1.42);applyCamera();}
  function resetCamera(){position={yaw:-14,pitch:58,zoom:typeof window.innerWidth==='number'&&window.innerWidth<720?0.46:0.72,panX:0,panY:0};applyCamera();}
  function focusAgent(id){
    const role=roster.find(r=>r.id===id);
    if(!role)return;
    position.panX=clamp(Math.round((530-(role.x+100))*position.zoom),-480,480);
    position.panY=clamp(Math.round((340-(role.y+85))*position.zoom),-360,360);
    position.zoom=Math.max(position.zoom,0.98);
    position.pitch=52;
    applyCamera();
  }
  let tourIndex=0;
  function tourNext(){
    const coworker=roster[tourIndex%roster.length];
    tourIndex+=1;
    select(coworker.id);
    focusAgent(coworker.id);
    window.WorkSabanOffice?.select(coworker.id);
  }
  function select(id){
    if(!agents.has(id))return;
    selected=id;
    for(const [key,node] of agents)node.classList.toggle('is-selected',key===id);
  }
  function paint(){
    for(const role of roster){
      const node=agents.get(role.id);
      if(!node)continue;
      node.dataset.state=state[role.id];
      node.querySelector('small').textContent=state[role.id].replaceAll('_',' ').toUpperCase();
      node.setAttribute('aria-label',role.name+' at '+role.room+', '+state[role.id]);
      node.title=role.name+' · '+(receipts[role.id]||state[role.id]);
    }
    select(selected);
    for(const role of roster){
      const node=agents.get(role.id);
      if(node)node.dataset.activity=state[role.id]==='running'?'working':state[role.id]==='verified'?'celebrating':'waiting';
    }
  }
  const preceding={analyst:'director',writer:'analyst',designer:'writer',auditor:'designer',coordinator:'auditor'};
  function observedHandoff(toId){
    if(!enabled||!world)return;
    const fromId=preceding[toId],from=roster.find(x=>x.id===fromId),to=roster.find(x=>x.id===toId);
    if(!from||!to||!['verified','admitted'].includes(state[fromId]))return;
    const packet=make('span','spatial-evidence-packet');
    packet.setAttribute('aria-hidden','true');
    packet.title='Observed assignment handoff, not physical worker movement';
    place(packet,from.x+78,from.y+84);
    world.append(packet);
    if(typeof packet.animate!=='function'
       ||typeof window.matchMedia==='function'&&window.matchMedia('(prefers-reduced-motion: reduce)').matches){
      packet.remove();return;
    }
    const animation=packet.animate([
      {transform:'translate3d(0,0,90px) scale(.6)',opacity:0},
      {transform:'translate3d('+((to.x-from.x)*0.5)+'px,'+((to.y-from.y)*0.5)+'px,140px) scale(1.3)',opacity:1,offset:0.5},
      {transform:'translate3d('+(to.x-from.x)+'px,'+(to.y-from.y)+'px,90px) scale(.6)',opacity:0}
    ],{duration:750,easing:'ease-in-out'});
    animation.onfinish=()=>packet.remove();
    animation.oncancel=()=>packet.remove();
  }
  function consume(e){
    if(!e)return;
    if(e.type==='accepted'){
      for(const role of roster)state[role.id]='idle';
      state.director='admitted';Object.keys(receipts).forEach(id=>delete receipts[id]);
    }else if(e.type==='stage_started'){
      if(!known.has(e.role))return;
      observedHandoff(e.role);
      state[e.role]='running';select(e.role);
    }else if(e.type==='stage_verified'){
      if(!known.has(e.role)||e.receipt?.quality_status!=='pass')return;
      state[e.role]='verified';receipts[e.role]='Verified receipt '+String(e.receipt.result_sha256||'').slice(0,20);select(e.role);
    }else if(e.type==='completed'){
      state.director='verified';select('coordinator');
    }else if(e.type==='failed_closed'){
      for(const role of roster)if(state[role.id]==='running')state[role.id]='failed';
    }
    paint();
  }
  function proposed(mission){
    for(const role of roster)state[role.id]='idle';
    for(const member of mission?.team||[])if(known.has(member.id))state[member.id]='proposed';
    Object.keys(receipts).forEach(id=>delete receipts[id]);
    paint();
  }
  function reset(){
    for(const role of roster)state[role.id]='idle';
    Object.keys(receipts).forEach(id=>delete receipts[id]);
    paint();
  }
  function setEnabled(next){
    enabled=Boolean(next);
    if(enabled)build();
    const view=$('spatial-viewport');
    if(view)view.hidden=!enabled;
    const floor=scene?.querySelector('.workfloor-art');
    if(floor)floor.classList.toggle('office-floor-hidden',enabled);
    $('office-3d-toggle').textContent=enabled?'2D floorplan':'Explore 3D office';
    $('office-3d-toggle').setAttribute('aria-pressed',String(enabled));
    if(enabled)requestAnimationFrame(()=>applyCamera());
  }
  window.WorkSaban3D={setEnabled,consume,proposed,reset,select,focusAgent,tourNext,getState:()=>({...state}),getCamera:()=>({...position})};
})();