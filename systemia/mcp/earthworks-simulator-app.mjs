import { createFleetController, makeDemoFleet } from '/earthworks/controller.mjs';

const canvas=document.getElementById('yard');
const ctx=canvas.getContext('2d');
const $=(id)=>document.getElementById(id);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;

const ui={
  mode:'manual',
  fleet:5,
  loaderRateTph:720,
  targetTph:2400,
  manualReleaseBudget:0,
  decisions:0,
  stopped:false,
  scenario:'balanced',
  config:{},
  history:[],
  productionSamples:[],
  loaderBusyTicks:0,
  totalTicks:0,
  lastEventCount:0,
  lastFrame:performance.now(),
  simAccumulator:0,
};

function candidateFrom(snapshot){
  return snapshot.fleet
    .filter((m)=>m.kind==='haul_truck'&&m.state==='queue'&&!m.hold)
    .sort((a,b)=>(b.queueAge??0)-(a.queueAge??0)||a.id.localeCompare(b.id))[0]?.id??null;
}

function planner(snapshot){
  const candidate=candidateFrom(snapshot);
  if(!candidate) return null;
  if(ui.mode==='autonomy') return candidate;
  if(ui.manualReleaseBudget>0){
    ui.manualReleaseBudget-=1;
    return candidate;
  }
  return null;
}

function fleetFor(count){
  const base=makeDemoFleet();
  const nonTrucks=base.filter((m)=>m.kind!=='haul_truck');
  const trucks=Array.from({length:count},(_,i)=>({
    id:'HT-'+String(i+1).padStart(2,'0'),
    kind:'haul_truck',
    zone:'queue',
    state:'queue',
    payloadTons:0,
    capacityTons:18,
    queueAge:count-i,
  }));
  return [nonTrucks[0],...trucks,nonTrucks[1]];
}

let controller;

function coreConfig(){
  return {
    loaderProcessRateTonsPerSecond:ui.loaderRateTph/3600,
    ...ui.config,
  };
}

function rebuildController(reason='scenario reset'){
  controller=createFleetController({
    fleet:fleetFor(ui.fleet),
    config:coreConfig(),
    plannerAdapter:planner,
  });
  ui.stopped=false;
  ui.productionSamples=[];
  ui.loaderBusyTicks=0;
  ui.totalTicks=0;
  ui.lastEventCount=0;
  ui.simAccumulator=0;
  addLog('EarthWorks controller reset: '+reason+'.','good');
}

function addLog(text,kind=''){
  ui.decisions+=1;
  ui.history.unshift({text,kind});
  ui.history=ui.history.slice(0,24);
  $('log').innerHTML=ui.history.map((x)=>'<div class="'+x.kind+'">'+escapeHtml(x.text)+'</div>').join('');
  $('score').textContent=ui.decisions+' decisions';
}

function escapeHtml(value){
  return String(value)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'","&#39;");
}

function syncControllerEvents(snapshot){
  const events=snapshot.eventLog||[];
  if(events.length<ui.lastEventCount) ui.lastEventCount=0;
  for(const event of events.slice(ui.lastEventCount)){
    const kind=event.type==='safety'||event.type==='e-stop'?'warn':
      ['dispatch','loaded','dump','queue','resume'].includes(event.type)?'good':'ai';
    addLog(event.message,kind);
  }
  ui.lastEventCount=events.length;
}

function setMode(mode){
  ui.mode=mode;
  document.querySelectorAll('.mode').forEach((b)=>b.classList.toggle('active',b.dataset.mode===mode));
  $('modeLabel').textContent=mode==='manual'?'Manual dispatch':mode==='shadow'?'Shadow dispatch':'Autonomy simulation';
  if(mode==='manual') addLog('Manual mode: only a human dispatch action can admit a queued truck.');
  if(mode==='shadow'){
    const recommendation=candidateFrom(controller.snapshot());
    addLog(recommendation
      ? 'Shadow recommendation: admit '+recommendation+' next. No dispatch authority exercised.'
      : 'Shadow planner sees no dispatchable queued truck.','ai');
  }
  if(mode==='autonomy') addLog('Autonomy simulation: the canonical planner may admit trucks inside the software safety boundary.','ai');
}

function scenario(name){
  ui.scenario=name;
  ui.config={};
  ui.targetTph=2400;
  if(name==='queue'){
    ui.fleet=8;
    ui.config.excavatorLoadRateTonsPerSecond=1.15;
    addLog('Scenario: Truck Queue. Eight trucks now compete for a slower EX-01 loading slot.','warn');
  }else if(name==='starve'){
    ui.fleet=3;
    ui.config.haulDistanceMeters=620;
    ui.config.returnDistanceMeters=580;
    addLog('Scenario: Loader Starvation. Long cycles reduce truck arrival frequency at the dig face.','warn');
  }else if(name==='blocked'){
    ui.fleet=5;
    ui.config.haulDistanceMeters=780;
    addLog('Scenario: Blocked Route. A synthetic detour lengthens the bounded haul corridor.','warn');
  }else if(name==='surge'){
    ui.fleet=6;
    ui.targetTph=3600;
    addLog('Scenario: Production Surge. Target raised to 3,600 tph for the controller study.','warn');
  }else{
    ui.fleet=5;
    addLog('Balanced Fleet baseline loaded.','good');
  }
  $('fleet').value=ui.fleet;
  $('fleetLabel').textContent=ui.fleet;
  rebuildController(name);
}

function updateProduction(snapshot){
  ui.productionSamples.push({t:snapshot.simSeconds,tons:snapshot.tonsMoved});
  const cutoff=snapshot.simSeconds-120;
  while(ui.productionSamples.length>2&&ui.productionSamples[0].t<cutoff) ui.productionSamples.shift();
  const first=ui.productionSamples[0];
  const last=ui.productionSamples[ui.productionSamples.length-1];
  const dt=Math.max(1,last.t-first.t);
  return Math.max(0,Math.round((last.tons-first.tons)*3600/dt));
}

function stateMetrics(snapshot){
  const trucks=snapshot.fleet.filter((m)=>m.kind==='haul_truck');
  const queueAges=trucks.filter((m)=>m.state==='queue').map((m)=>m.queueAge??0);
  const queueSeconds=queueAges.length?queueAges.reduce((a,b)=>a+b,0)/queueAges.length:0;
  const config=coreConfig();
  const avgCapacity=trucks[0]?.capacityTons??18;
  const cycleSeconds=
    (config.approachDistanceMeters??45)/4+
    avgCapacity/(config.excavatorLoadRateTonsPerSecond??2.5)+
    (config.haulDistanceMeters??240)/7+
    (config.dumpSeconds??3)+
    (config.returnDistanceMeters??220)/7.5;
  const loader=snapshot.fleet.find((m)=>m.kind==='front_loader');
  ui.totalTicks+=1;
  if(loader?.state==='manage-stockpile') ui.loaderBusyTicks+=1;
  return {
    tph:updateProduction(snapshot),
    queueMinutes:queueSeconds/60,
    cycleMinutes:cycleSeconds/60,
    loaderUtil:ui.totalTicks?100*ui.loaderBusyTicks/ui.totalTicks:0,
  };
}

const loadPoint={x:205,y:290};
const queuePoint={x:305,y:390};
const dumpPoint={x:900,y:420};
const haulPath=[
  loadPoint,
  {x:360,y:255},
  {x:540,y:235},
  {x:720,y:270},
  {x:870,y:325},
  dumpPoint,
];
const returnPath=[
  dumpPoint,
  {x:810,y:490},
  {x:620,y:500},
  {x:445,y:470},
  queuePoint,
];

function pointOnPath(path,p){
  const t=clamp(Number(p)||0,0,1);
  const scaled=t*(path.length-1);
  const i=Math.min(path.length-2,Math.floor(scaled));
  const f=scaled-i;
  return {x:lerp(path[i].x,path[i+1].x,f),y:lerp(path[i].y,path[i+1].y,f)};
}

function truckPoint(truck,index){
  if(truck.state==='queue') return {x:queuePoint.x+(index%4)*34,y:queuePoint.y+Math.floor(index/4)*34};
  if(truck.state==='approach') return {x:lerp(queuePoint.x,loadPoint.x,truck.progress||0),y:lerp(queuePoint.y,loadPoint.y,truck.progress||0)};
  if(truck.state==='loading') return {...loadPoint};
  if(truck.state==='haul') return pointOnPath(haulPath,truck.progress);
  if(truck.state==='dump') return {...dumpPoint};
  if(truck.state==='return') return pointOnPath(returnPath,truck.progress);
  return {...queuePoint};
}

function drawGround(){
  const g=ctx.createLinearGradient(0,0,0,620);
  g.addColorStop(0,'#172027');
  g.addColorStop(1,'#0b1115');
  ctx.fillStyle=g;
  ctx.fillRect(0,0,1100,620);
  for(let i=0;i<34;i++){
    ctx.strokeStyle='rgba(151,128,91,'+(0.035+(i%4)*.01)+')';
    ctx.lineWidth=1;
    ctx.beginPath();
    const y=40+i*17;
    ctx.moveTo(0,y);
    ctx.bezierCurveTo(220,y-40,480,y+45,1100,y-10);
    ctx.stroke();
  }
  ctx.fillStyle='#202820';
  ctx.beginPath();
  ctx.ellipse(190,245,160,115,-.15,0,Math.PI*2);
  ctx.fill();
  ctx.fillStyle='#22231f';
  ctx.beginPath();
  ctx.ellipse(880,430,135,90,.2,0,Math.PI*2);
  ctx.fill();
}

function drawPolyline(path,color,width,dashed=false){
  ctx.save();
  ctx.strokeStyle=color;
  ctx.lineWidth=width;
  ctx.lineCap='round';
  ctx.lineJoin='round';
  if(dashed) ctx.setLineDash([10,10]);
  ctx.beginPath();
  path.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));
  ctx.stroke();
  ctx.restore();
}

function zone(x,y,w,h,label,color){
  ctx.fillStyle=color+'22';
  ctx.strokeStyle=color;
  ctx.lineWidth=2;
  ctx.setLineDash([8,7]);
  ctx.fillRect(x,y,w,h);
  ctx.strokeRect(x,y,w,h);
  ctx.setLineDash([]);
  ctx.fillStyle='#081014dd';
  ctx.fillRect(x+8,y+8,140,34);
  ctx.fillStyle=color;
  ctx.font='700 12px system-ui';
  ctx.textAlign='left';
  ctx.fillText(label,x+18,y+29);
}

function machine(x,y,type,label,color='#ffb020'){
  ctx.save();
  ctx.translate(x,y);
  ctx.fillStyle='#111820';
  ctx.strokeStyle=color;
  ctx.lineWidth=2;
  ctx.beginPath();
  ctx.roundRect(-28,-15,56,30,6);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle=color;
  ctx.font='800 11px system-ui';
  ctx.textAlign='center';
  ctx.fillText(type,0,4);
  ctx.restore();
  ctx.fillStyle='#071016d9';
  ctx.fillRect(x-58,y+24,116,25);
  ctx.fillStyle='#dfe7ec';
  ctx.font='700 10px system-ui';
  ctx.textAlign='center';
  ctx.fillText(label,x,y+40);
}

function drawTruck(truck,index){
  const p=truckPoint(truck,index);
  const held=truck.hold||ui.stopped;
  ctx.save();
  ctx.translate(p.x,p.y);
  ctx.fillStyle=held?'#ff6262':'#ffb020';
  ctx.strokeStyle='#111';
  ctx.lineWidth=2;
  ctx.beginPath();
  ctx.roundRect(-15,-9,30,18,4);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle='#111';
  ctx.fillRect(-11,-5,13,10);
  ctx.restore();
  ctx.fillStyle='#061017dd';
  ctx.fillRect(p.x-34,p.y-31,68,18);
  ctx.fillStyle='#d8e1e6';
  ctx.font='700 9px system-ui';
  ctx.textAlign='center';
  ctx.fillText(truck.id+' · '+truck.state,p.x,p.y-19);
}

function draw(snapshot,metrics){
  drawGround();
  drawPolyline(haulPath,'#263842',34);
  drawPolyline(returnPath,'#263842',34);
  drawPolyline(haulPath,ui.scenario==='blocked'?'#ff6262':'#62db9a',4);
  drawPolyline(returnPath,'#5cb8ff',2,true);
  zone(82,155,250,185,'EXCLUSIVE LOAD ZONE','#ffb020');
  zone(808,350,205,150,'DUMP / STOCKPILE','#62db9a');
  const ex=snapshot.fleet.find((m)=>m.kind==='excavator');
  const fl=snapshot.fleet.find((m)=>m.kind==='front_loader');
  machine(190,260,'EX',ex?.state||'EX-01');
  machine(910,448,'FL',fl?.state||'FL-01','#62db9a');
  snapshot.fleet.filter((m)=>m.kind==='haul_truck').forEach(drawTruck);

  if(ui.scenario==='blocked'){
    ctx.fillStyle='#ff6262';
    ctx.beginPath();
    ctx.arc(675,265,16,0,Math.PI*2);
    ctx.fill();
    ctx.fillStyle='#fff';
    ctx.font='900 14px system-ui';
    ctx.textAlign='center';
    ctx.fillText('!',675,270);
  }

  if(ui.stopped){
    ctx.fillStyle='rgba(120,0,0,.42)';
    ctx.fillRect(0,0,1100,620);
    ctx.fillStyle='#ffb2b2';
    ctx.font='900 34px system-ui';
    ctx.textAlign='center';
    ctx.fillText('SAFETY HOLD · STOP ALL',550,315);
  }

  ctx.fillStyle='#071016e8';
  ctx.fillRect(350,68,400,96);
  ctx.strokeStyle='#263843';
  ctx.strokeRect(350,68,400,96);
  ctx.fillStyle='#ffb020';
  ctx.font='800 13px system-ui';
  ctx.textAlign='left';
  ctx.fillText('EARTHWORKS CONTROLLER · '+snapshot.version,368,94);
  ctx.fillStyle='#d8e3e9';
  ctx.font='700 12px system-ui';
  ctx.fillText(ui.mode.toUpperCase()+' · '+metrics.tph+' tph observed · '+snapshot.cyclesCompleted+' cycles',368,119);
  ctx.fillStyle='#81949f';
  ctx.font='11px system-ui';
  const line=ui.mode==='manual'
    ? 'Human release required. Controller still enforces safety + exclusive loading.'
    : ui.mode==='shadow'
      ? 'Planner recommendation visible. Human authority remains required.'
      : 'Canonical planner dispatches in software simulation inside the safety kernel.';
  ctx.fillText(line,368,143);
}

function updateUI(snapshot,metrics){
  $('tph').textContent=metrics.tph;
  $('queue').textContent=metrics.queueMinutes.toFixed(1);
  $('cycle').textContent=metrics.cycleMinutes.toFixed(1);
  $('util').textContent=Math.round(metrics.loaderUtil);
  $('tphDelta').textContent=metrics.tph>=ui.targetTph?'target met':'target '+ui.targetTph+' tph';
  $('queueDelta').textContent=metrics.queueMinutes<.2?'low pressure':metrics.queueMinutes<.8?'balanced':'queue pressure';
  $('cycleDelta').textContent=ui.scenario==='blocked'?'detour active':'controller estimate';
  $('utilDelta').textContent=metrics.loaderUtil>85?'high utilization':metrics.loaderUtil>40?'working':'starving';
  const minutes=360+Math.floor(snapshot.simSeconds/60);
  $('simClock').textContent=String(Math.floor(minutes/60)%24).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0');
  $('haulState').textContent=snapshot.fleet.filter((m)=>m.kind==='haul_truck'&&['approach','loading','haul','dump','return'].includes(m.state)).length+' active';
  $('loadState').textContent=snapshot.currentLoadTruckId?snapshot.currentLoadTruckId+' owns slot':'slot clear';
  $('dumpState').textContent=snapshot.stockpileTons.toFixed(1)+' t stockpile';
  $('returnState').textContent=snapshot.cyclesCompleted+' cycles';
  $('nLoad').className='node '+(snapshot.currentLoadTruckId?'good':'');
  $('nHaul').className='node '+(ui.scenario==='blocked'?'hot':'good');
  $('nDump').className='node '+(snapshot.stockpileTons>36?'hot':'good');
  $('nReturn').className='node good';
}

function tick(now){
  const realDt=Math.min(.1,(now-ui.lastFrame)/1000);
  ui.lastFrame=now;
  ui.simAccumulator+=realDt*18;
  while(ui.simAccumulator>=1){
    const snapshot=controller.step(1);
    syncControllerEvents(snapshot);
    if(ui.mode==='shadow'&&Math.floor(snapshot.simSeconds)%12===0){
      const next=candidateFrom(snapshot);
      if(next&&ui.history[0]?.text!=='Shadow recommendation: '+next+' next.'){
        ui.history.unshift({text:'Shadow recommendation: '+next+' next.',kind:'ai'});
        ui.history=ui.history.slice(0,24);
        $('log').innerHTML=ui.history.map((x)=>'<div class="'+x.kind+'">'+escapeHtml(x.text)+'</div>').join('');
      }
    }
    ui.simAccumulator-=1;
  }
  const snapshot=controller.snapshot();
  const metrics=stateMetrics(snapshot);
  updateUI(snapshot,metrics);
  draw(snapshot,metrics);
  requestAnimationFrame(tick);
}

document.querySelectorAll('.mode').forEach((b)=>b.addEventListener('click',()=>setMode(b.dataset.mode)));

$('dispatch').addEventListener('click',()=>{
  ui.manualReleaseBudget+=1;
  addLog('Human dispatch authorization queued for the next eligible truck.','good');
});

$('optimize').addEventListener('click',()=>{
  const next=candidateFrom(controller.snapshot());
  if(next) addLog('Planner ranks '+next+' next from queue age + availability. Switch to Autonomy to let software admit it automatically.','ai');
  else addLog('Planner sees no eligible queued truck right now.','ai');
});

$('delay').addEventListener('click',()=>scenario('blocked'));

$('reset').addEventListener('click',()=>{
  ui.config={};
  ui.fleet=5;
  ui.targetTph=2400;
  $('fleet').value=5;
  $('fleetLabel').textContent=5;
  rebuildController('balanced baseline');
});

document.querySelectorAll('.scenario').forEach((b)=>b.addEventListener('click',()=>scenario(b.dataset.scenario)));

$('stopAll').addEventListener('click',()=>{
  if(!ui.stopped){
    controller.stopAll('browser operator safety hold');
    ui.stopped=true;
    addLog('STOP ALL asserted through the canonical EarthWorks controller.','warn');
    $('stopAll').textContent='RELEASE SAFETY HOLD';
  }else{
    controller.resume();
    ui.stopped=false;
    addLog('Safety hold released. Canonical controller resumed.','good');
    $('stopAll').textContent='STOP ALL · safety hold';
  }
});

$('fleet').addEventListener('input',(event)=>{
  ui.fleet=Number(event.target.value);
  $('fleetLabel').textContent=ui.fleet;
  rebuildController('fleet resized to '+ui.fleet+' haul trucks');
});

$('loaderRate').addEventListener('input',(event)=>{
  ui.loaderRateTph=Number(event.target.value);
  $('loaderLabel').textContent=ui.loaderRateTph;
  rebuildController('stockpile loader capacity changed to '+ui.loaderRateTph+' tph');
});

rebuildController('Live Yard 001 boot');
setMode('manual');
requestAnimationFrame(tick);
