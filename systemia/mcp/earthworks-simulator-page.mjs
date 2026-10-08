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
          <div class="range"><label><span>Stockpile loader rate</span><strong><span id="loaderLabel">720</span> tph</strong></label><input id="loaderRate" type="range" min="480" max="900" step="20" value="720"></div>
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
<script type="module" src="/earthworks/app.mjs"></script>
</body>
</html>`;
}
