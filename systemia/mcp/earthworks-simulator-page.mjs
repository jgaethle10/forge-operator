export function renderEarthWorksSimulator(){
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#070a0e">
<title>EarthWorks Live Yard · Evercraft</title>
<meta name="description" content="A hands-on browser simulation of Evercraft EarthWorks site autonomy orchestration for haul, loading, queueing and shadow dispatch.">
<style>
:root{color-scheme:dark;--bg:#070a0e;--panel:#0d1319;--line:#24303a;--ink:#edf3f7;--muted:#8fa0ac;--amber:#ffb020;--green:#62db9a;--blue:#5cb8ff;--red:#ff6262}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 80% 0,#17242d 0,#070a0e 42%);color:var(--ink);font:14px/1.45 Inter,ui-sans-serif,system-ui,-apple-system,sans-serif;overflow-x:hidden}
button,input{font:inherit}.shell{max-width:1500px;margin:auto;padding:16px}.top{display:flex;gap:14px;align-items:center;justify-content:space-between;margin-bottom:12px}.brand{display:flex;gap:10px;align-items:center}.mark{width:34px;height:34px;border:1px solid #465866;border-radius:9px;display:grid;place-items:center;background:#111923;font-weight:900;color:var(--amber)}h1{margin:0;font-size:18px}.kicker{color:var(--amber);text-transform:uppercase;letter-spacing:.15em;font-size:10px;font-weight:900}.truth{color:var(--muted);font-size:11px;max-width:600px;text-align:right}
.layout{display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:12px}.card{border:1px solid var(--line);background:linear-gradient(180deg,#10171e,#0b1015);border-radius:14px;overflow:hidden}.stageHead,.panelHead{padding:11px 13px;border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between}.stageHead strong,.panelHead strong{font-size:11px;letter-spacing:.12em;text-transform:uppercase}.live{display:flex;align-items:center;gap:7px;color:var(--green);font-size:11px}.dot{width:8px;height:8px;background:var(--green);border-radius:50%;box-shadow:0 0 14px rgba(98,219,154,.75)}
canvas{display:block;width:100%;height:auto;aspect-ratio:16/9;background:#0a0f13;touch-action:none}.hud{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:10px;border-top:1px solid var(--line)}.metric{background:#0a1015;border:1px solid #202b34;border-radius:10px;padding:9px}.metric small{display:block;color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:.08em}.metric b{display:block;font-size:22px;margin-top:2px}.metric em{font-style:normal;color:var(--green);font-size:10px}
.side{display:grid;gap:12px;align-content:start}.controls{padding:13px}.modeRow{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-bottom:12px}.mode{border:1px solid #35434f;background:#121a21;color:#bec9d1;border-radius:9px;padding:9px 6px;cursor:pointer}.mode.active{border-color:var(--amber);background:#2a1d08;color:#ffd17a}.mode[data-mode="autonomy"].active{border-color:#367b5c;background:#0d2519;color:#8ce6b4}
.controlGrid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.action{border:1px solid #33414c;background:#101820;color:var(--ink);border-radius:9px;padding:10px;cursor:pointer;text-align:left}.action:hover{border-color:#5a7181}.action strong{display:block}.action small{color:var(--muted)}.danger{border-color:#643737}.danger strong{color:#ff9b9b}
.range{margin-top:12px;border-top:1px solid #202b34;padding-top:11px}.range label{display:flex;justify-content:space-between;color:var(--muted);font-size:11px}.range input{width:100%;accent-color:var(--amber)}.scenarioTitle{margin-top:13px;padding-top:11px;border-top:1px solid #202b34;color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:.1em}.scenarioGrid{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:8px}.scenario{border:1px solid #31404a;background:#0d151b;color:#c9d4db;border-radius:8px;padding:8px;cursor:pointer;text-align:left}.scenario:hover{border-color:#607684}.scenario b{display:block;font-size:11px}.scenario span{font-size:9px;color:var(--muted)}.stop{margin-top:10px;width:100%;border:1px solid #7c3e3e;background:#271010;color:#ffb2b2;border-radius:9px;padding:10px;cursor:pointer;font-weight:900;letter-spacing:.04em}
.flow{padding:12px}.flowline{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}.node{border:1px solid #27343e;background:#0a1015;border-radius:9px;padding:9px}.node b{display:block;font-size:11px}.node span{font-size:10px;color:var(--muted)}.node.hot{border-color:#6c531d;background:#1d1709}.node.good{border-color:#2e674e;background:#0b1e15}
.log{max-height:220px;overflow:auto;padding:10px 12px;font:11px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace}.log div{padding:4px 0;border-bottom:1px solid #182128;color:#aab6be}.log .ai{color:#7fd7ff}.log .warn{color:#ffc76c}.log .good{color:#80dda9}
.legend{display:flex;gap:12px;flex-wrap:wrap;color:var(--muted);font-size:10px;padding:0 12px 11px}.legend i{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:4px}.footer{margin-top:10px;color:#657681;font-size:11px;display:flex;justify-content:space-between;gap:20px}.footer a{color:#a9cfff}
@media(max-width:980px){.layout{grid-template-columns:1fr}.side{grid-template-columns:1fr 1fr}.logCard{grid-column:1/-1}.truth{display:none}}@media(max-width:680px){.shell{padding:9px}.side{grid-template-columns:1fr}.hud{grid-template-columns:1fr 1fr}.top{align-items:flex-start}.flowline{grid-template-columns:1fr 1fr}}
</style>
</head>
<body>
<div class="shell">
  <div class="top">
    <div class="brand"><div class="mark">EW</div><div><div class="kicker">Evercraft EarthWorks</div><h1>Live Yard 001</h1></div></div>
    <div class="truth">Interactive software demonstration. Simulation only. No physical machine control, customer production result, or certified autonomy claim.</div>
  </div>
  <div class="layout">
    <section class="card">
      <div class="stageHead"><strong>Quarry digital twin</strong><span class="live"><span class="dot"></span><span id="modeLabel">Manual dispatch</span></span></div>
      <canvas id="yard" width="1100" height="620" aria-label="Interactive EarthWorks quarry simulation"></canvas>
      <div class="legend"><span><i style="background:#62db9a"></i>active haul route</span><span><i style="background:#5cb8ff"></i>return route</span><span><i style="background:#ffb020"></i>work zone</span><span><i style="background:#ff6262"></i>delay / queue pressure</span></div>
      <div class="hud">
        <div class="metric"><small>Production</small><b><span id="tph">0</span> tph</b><em id="tphDelta">baseline</em></div>
        <div class="metric"><small>Queue time</small><b><span id="queue">0.0</span> min</b><em id="queueDelta">live</em></div>
        <div class="metric"><small>Cycle time</small><b><span id="cycle">0.0</span> min</b><em id="cycleDelta">live</em></div>
        <div class="metric"><small>Loader utilization</small><b><span id="util">0</span>%</b><em id="utilDelta">live</em></div>
      </div>
    </section>

    <aside class="side">
      <section class="card">
        <div class="panelHead"><strong>Dispatch controls</strong><span id="simClock">06:00</span></div>
        <div class="controls">
          <div class="modeRow">
            <button class="mode active" data-mode="manual">Manual</button>
            <button class="mode" data-mode="shadow">Shadow</button>
            <button class="mode" data-mode="autonomy">Autonomy</button>
          </div>
          <div class="controlGrid">
            <button class="action" id="dispatch"><strong>Dispatch truck</strong><small>Release the next queued truck</small></button>
            <button class="action" id="optimize"><strong>Optimize loop</strong><small>Re-time releases from current state</small></button>
            <button class="action danger" id="delay"><strong>Inject road delay</strong><small>Add a temporary haul slowdown</small></button>
            <button class="action" id="reset"><strong>Reset yard</strong><small>Return to baseline</small></button>
          </div>
          <div class="range"><label><span>Haul fleet</span><strong><span id="fleetLabel">5</span> trucks</strong></label><input id="fleet" type="range" min="3" max="8" value="5"></div>
          <div class="range"><label><span>Loader rate</span><strong><span id="loaderLabel">720</span> tph</strong></label><input id="loaderRate" type="range" min="480" max="900" step="20" value="720"></div>
          <div class="scenarioTitle">Break the yard</div>
          <div class="scenarioGrid">
            <button class="scenario" data-scenario="queue"><b>Truck Queue</b><span>Too many trucks for the loader</span></button>
            <button class="scenario" data-scenario="starve"><b>Loader Starvation</b><span>Too few trucks feeding the loader</span></button>
            <button class="scenario" data-scenario="blocked"><b>Blocked Route</b><span>Haul corridor slowdown</span></button>
            <button class="scenario" data-scenario="surge"><b>Production Surge</b><span>Raise loading target hard</span></button>
          </div>
          <button class="stop" id="stopAll">STOP ALL · safety hold</button>
        </div>
      </section>

      <section class="card">
        <div class="panelHead"><strong>Production flow</strong><span>synthetic</span></div>
        <div class="flow"><div class="flowline">
          <div class="node" id="nLoad"><b>Load</b><span id="loadState">stable</span></div>
          <div class="node" id="nHaul"><b>Haul</b><span id="haulState">5 active</span></div>
          <div class="node" id="nDump"><b>Dump</b><span id="dumpState">clear</span></div>
          <div class="node" id="nReturn"><b>Return</b><span id="returnState">flowing</span></div>
        </div></div>
      </section>

      <section class="card logCard">
        <div class="panelHead"><strong>EarthWorks decision log</strong><span id="score">0 decisions</span></div>
        <div class="log" id="log"></div>
      </section>
    </aside>
  </div>
  <div class="footer"><span>Think of this as the toy yard for the real system: job graph + digital twin + dispatch + safety constraints + evidence.</span><a href="/capabilities/earthworks-site-autonomy-study-v1">EarthWorks Site Autonomy Study →</a></div>
</div>
<script>
(()=>{
  const canvas=document.getElementById('yard'),ctx=canvas.getContext('2d');
  const $=id=>document.getElementById(id);
  const route=[
    {x:235,y:330},{x:360,y:265},{x:500,y:245},{x:650,y:270},{x:805,y:235},{x:920,y:300},{x:850,y:415},{x:680,y:455},{x:500,y:445},{x:340,y:410}
  ];
  const state={mode:'manual',fleet:5,loaderRate:720,delay:0,time:360,decisions:0,manualRelease:0,optimized:0,stopped:false,trucks:[],history:[],last:performance.now()};
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const lerp=(a,b,t)=>a+(b-a)*t;
  function addLog(text,kind=''){state.history.unshift({text,kind});state.history=state.history.slice(0,18);$('log').innerHTML=state.history.map(x=>'<div class="'+x.kind+'">'+x.text+'</div>').join('');}
  function truckColor(i){return ['#ffb020','#f6c85f','#ffcc80','#e9a23b','#ffc35c','#f7b32b','#ffd27f','#e8a13a'][i%8]}
  function resetTrucks(){
    state.trucks=Array.from({length:state.fleet},(_,i)=>({id:'HT-'+String(i+1).padStart(2,'0'),p:(i/state.fleet),speed:.022+((i%3)*.0015),load:0,held:false}));
  }
  function routePoint(p){
    const n=route.length,scaled=(p%1)*n,i=Math.floor(scaled),t=scaled-i,a=route[i%n],b=route[(i+1)%n];
    return {x:lerp(a.x,b.x,t),y:lerp(a.y,b.y,t),seg:i};
  }
  function metrics(){
    const queueBase=Math.max(0,(state.fleet-4)*.7 + (state.delay>0?1.4:0));
    const modeGain=state.mode==='manual'?0:state.mode==='shadow'?.65:1.15;
    const optimizeGain=state.optimized?0.45:0;
    const queue=clamp(queueBase-modeGain-optimizeGain,0.2,6.8);
    const cycle=clamp(13.2+queue*.72+(state.delay>0?1.8:0)-modeGain*.8,9.5,22);
    const loaderUtil=clamp(70+state.fleet*3.2-queue*2.8+modeGain*5,48,96);
    const theoretical=Math.min(state.loaderRate, state.fleet*118);
    const tph=Math.round(theoretical*(.66+loaderUtil/300)*(1-queue/28)*(state.delay>0?.88:1));
    return {queue,cycle,loaderUtil,tph};
  }
  function drawGround(){
    const g=ctx.createLinearGradient(0,0,0,620);g.addColorStop(0,'#172027');g.addColorStop(1,'#0b1115');ctx.fillStyle=g;ctx.fillRect(0,0,1100,620);
    for(let i=0;i<34;i++){ctx.strokeStyle='rgba(151,128,91,'+(0.035+(i%4)*.01)+')';ctx.lineWidth=1;ctx.beginPath();const y=40+i*17;ctx.moveTo(0,y);ctx.bezierCurveTo(220,y-40,480,y+45,1100,y-10);ctx.stroke()}
    ctx.fillStyle='#202820';ctx.beginPath();ctx.ellipse(190,245,160,115,-.15,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#22231f';ctx.beginPath();ctx.ellipse(880,430,135,90,.2,0,Math.PI*2);ctx.fill();
  }
  function drawRoute(){
    ctx.lineCap='round';ctx.lineJoin='round';
    ctx.beginPath();route.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.strokeStyle='#263842';ctx.lineWidth=34;ctx.stroke();
    ctx.beginPath();route.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.strokeStyle=state.delay>0?'#ff6262':'#62db9a';ctx.lineWidth=4;ctx.stroke();
    ctx.setLineDash([10,10]);ctx.beginPath();for(let i=5;i<10;i++){const p=route[i];if(i===5)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y)}ctx.strokeStyle='#5cb8ff';ctx.lineWidth=2;ctx.stroke();ctx.setLineDash([]);
  }
  function zone(x,y,w,h,label,color){
    ctx.fillStyle=color+'22';ctx.strokeStyle=color;ctx.lineWidth=2;ctx.setLineDash([8,7]);ctx.fillRect(x,y,w,h);ctx.strokeRect(x,y,w,h);ctx.setLineDash([]);ctx.fillStyle='#081014dd';ctx.fillRect(x+8,y+8,130,34);ctx.fillStyle=color;ctx.font='700 12px system-ui';ctx.fillText(label,x+18,y+29);
  }
  function machine(x,y,type,label,color='#ffb020'){
    ctx.save();ctx.translate(x,y);ctx.fillStyle='#111820';ctx.strokeStyle=color;ctx.lineWidth=2;ctx.beginPath();ctx.roundRect(-28,-15,56,30,6);ctx.fill();ctx.stroke();ctx.fillStyle=color;ctx.font='800 11px system-ui';ctx.textAlign='center';ctx.fillText(type,0,4);ctx.restore();
    ctx.fillStyle='#071016d9';ctx.fillRect(x-45,y+24,90,25);ctx.fillStyle='#dfe7ec';ctx.font='700 10px system-ui';ctx.textAlign='center';ctx.fillText(label,x,y+40);
  }
  function truck(t,i){
    const p=routePoint(t.p);ctx.save();ctx.translate(p.x,p.y);const next=routePoint(t.p+.003);ctx.rotate(Math.atan2(next.y-p.y,next.x-p.x));ctx.fillStyle=truckColor(i);ctx.strokeStyle='#111';ctx.lineWidth=2;ctx.beginPath();ctx.roundRect(-15,-9,30,18,4);ctx.fill();ctx.stroke();ctx.fillStyle='#111';ctx.fillRect(-11,-5,13,10);ctx.restore();
    ctx.fillStyle='#061017dd';ctx.fillRect(p.x-22,p.y-28,44,16);ctx.fillStyle='#d8e1e6';ctx.font='700 9px system-ui';ctx.textAlign='center';ctx.fillText(t.id,p.x,p.y-17);
  }
  function draw(){
    drawGround();drawRoute();
    zone(90,165,230,170,'LOAD ZONE A','#ffb020');zone(820,365,185,130,'DUMP / CRUSH','#62db9a');
    machine(190,270,'EX','EX-01 loading');machine(900,430,'CR','Crusher');
    state.trucks.forEach(truck);
    if(state.delay>0){ctx.fillStyle='#ff6262';ctx.beginPath();ctx.arc(655,270,16,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff';ctx.font='900 14px system-ui';ctx.textAlign='center';ctx.fillText('!',655,275)}
    if(state.stopped){ctx.fillStyle='rgba(120,0,0,.42)';ctx.fillRect(0,0,1100,620);ctx.fillStyle='#ffb2b2';ctx.font='900 34px system-ui';ctx.textAlign='center';ctx.fillText('SAFETY HOLD · STOP ALL',550,315);}
    const m=metrics();ctx.fillStyle='#071016d9';ctx.fillRect(365,70,365,78);ctx.strokeStyle='#263843';ctx.strokeRect(365,70,365,78);ctx.fillStyle='#ffb020';ctx.font='800 13px system-ui';ctx.textAlign='left';ctx.fillText('EARTHWORKS SITE BRAIN',382,94);ctx.fillStyle='#d8e3e9';ctx.font='700 12px system-ui';ctx.fillText(state.mode.toUpperCase()+' · '+m.tph+' tph · '+m.queue.toFixed(1)+' min queue',382,118);ctx.fillStyle='#81949f';ctx.font='11px system-ui';ctx.fillText(state.mode==='manual'?'Human releases trucks manually.':state.mode==='shadow'?'AI recommends timing; humans remain authoritative.':'Simulation planner dispatches within software safety rules.',382,138);
  }
  function step(now){
    const dt=Math.min(.05,(now-state.last)/1000);state.last=now;state.time+=dt*5;
    const m=metrics();
    state.trucks.forEach((t,i)=>{
      let mult=state.stopped?0:1;
      const p=routePoint(t.p);
      if(state.delay>0&&p.seg>=3&&p.seg<=4)mult=.28;
      if(state.mode==='manual'&&p.seg===9&&i>2&&state.manualRelease<=0)mult=.08;
      if(state.mode==='shadow'&&p.seg===9&&i>3)mult=.58;
      t.p=(t.p+t.speed*dt*mult*(state.mode==='autonomy'?1.16:state.mode==='shadow'?1.08:1))%1;
    });
    if(state.manualRelease>0)state.manualRelease-=dt;
    if(state.delay>0)state.delay=Math.max(0,state.delay-dt);
    updateUI(m);draw();requestAnimationFrame(step);
  }
  function updateUI(m){
    $('tph').textContent=m.tph;$('queue').textContent=m.queue.toFixed(1);$('cycle').textContent=m.cycle.toFixed(1);$('util').textContent=Math.round(m.loaderUtil);
    $('tphDelta').textContent=state.mode==='manual'?'manual baseline':state.mode==='shadow'?'AI recommendation layer':'simulated autonomous dispatch';
    $('queueDelta').textContent=m.queue<1.2?'low pressure':m.queue<2.5?'balanced':'queue pressure';
    $('cycleDelta').textContent=state.delay>0?'road delay active':'current loop';
    $('utilDelta').textContent=m.loaderUtil>85?'high utilization':m.loaderUtil>70?'healthy':'loader starving';
    const mins=Math.floor(state.time)%1440;$('simClock').textContent=String(Math.floor(mins/60)).padStart(2,'0')+':'+String(mins%60).padStart(2,'0');
    $('score').textContent=state.decisions+' decisions';
    $('haulState').textContent=state.fleet+' trucks';
    $('loadState').textContent=m.queue>2.4?'backed up':m.loaderUtil<68?'starving':'stable';
    $('dumpState').textContent=state.delay>0?'delayed':'clear';$('returnState').textContent=state.mode==='autonomy'?'AI paced':'flowing';
    $('nLoad').className='node '+(m.queue>2.4?'hot':'good');$('nHaul').className='node '+(state.delay>0?'hot':'good');$('nDump').className='node '+(state.delay>0?'hot':'good');$('nReturn').className='node good';
  }
  function setMode(mode){
    state.mode=mode;document.querySelectorAll('.mode').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));
    $('modeLabel').textContent=mode==='manual'?'Manual dispatch':mode==='shadow'?'Shadow dispatch':'Autonomy simulation';
    state.decisions++;addLog(mode==='manual'?'Human dispatch authority restored.':mode==='shadow'?'AI shadow planner active. Recommendations only.':'Autonomy simulation active inside software-only safety boundary.',mode==='manual'?'': 'ai');
  }
  document.querySelectorAll('.mode').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));
  $('dispatch').onclick=()=>{state.manualRelease=3;state.decisions++;addLog('Human released next truck from loading queue.','good')};
  $('optimize').onclick=()=>{state.optimized=1;state.decisions++;addLog('EarthWorks recomputed truck spacing from queue + loader state.','ai');setTimeout(()=>state.optimized=0,8000)};
  $('delay').onclick=()=>{state.delay=9;state.decisions++;addLog('Road slowdown injected. Dispatch plan must absorb delay.','warn')};
  $('reset').onclick=()=>{state.delay=0;state.optimized=0;state.stopped=false;state.time=360;state.fleet=5;state.loaderRate=720;$('fleet').value=5;$('fleetLabel').textContent=5;$('loaderRate').value=720;$('loaderLabel').textContent=720;resetTrucks();state.decisions++;addLog('Yard returned to baseline scenario.','good')};
  document.querySelectorAll('.scenario').forEach(b=>b.onclick=()=>{
    state.stopped=false;
    const s=b.dataset.scenario;
    if(s==='queue'){state.fleet=8;state.loaderRate=560;state.delay=0;addLog('Scenario loaded: truck queue pressure. Eight trucks are now competing for a slow loader.','warn');}
    if(s==='starve'){state.fleet=3;state.loaderRate=880;state.delay=0;addLog('Scenario loaded: loader starvation. Loader capacity now outruns haul supply.','warn');}
    if(s==='blocked'){state.fleet=5;state.loaderRate=720;state.delay=30;addLog('Scenario loaded: haul route blocked. EarthWorks must absorb a sustained corridor delay.','warn');}
    if(s==='surge'){state.fleet=6;state.loaderRate=900;state.delay=0;addLog('Scenario loaded: production surge. Loading target raised to 900 tph.','warn');}
    $('fleet').value=state.fleet;$('fleetLabel').textContent=state.fleet;$('loaderRate').value=state.loaderRate;$('loaderLabel').textContent=state.loaderRate;resetTrucks();state.decisions++;
  });
  $('stopAll').onclick=()=>{state.stopped=!state.stopped;state.decisions++;addLog(state.stopped?'STOP ALL asserted. Every simulated machine is held.':'Safety hold released. Simulation movement may resume.',state.stopped?'warn':'good');$('stopAll').textContent=state.stopped?'RELEASE SAFETY HOLD':'STOP ALL · safety hold';};
  $('fleet').oninput=e=>{state.fleet=+e.target.value;$('fleetLabel').textContent=state.fleet;resetTrucks();addLog('Fleet resized to '+state.fleet+' haul trucks.','warn')};
  $('loaderRate').oninput=e=>{state.loaderRate=+e.target.value;$('loaderLabel').textContent=state.loaderRate;addLog('Loader target changed to '+state.loaderRate+' tph.')};
  resetTrucks();addLog('Toy Yard 001 initialized. Start by creating queue pressure, then compare dispatch modes.','good');requestAnimationFrame(step);
})();
</script>
</body>
</html>`;
}
