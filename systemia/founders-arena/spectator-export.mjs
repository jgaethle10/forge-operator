/** Offline public replay export: never expose an arena's private state/receipt. */
import {readFileSync,writeFileSync} from 'node:fs';
import {standings,verifyMatch} from './league.mjs';

const PUBLIC_SCHEMA='evercraft.founders-arena.public-replay.v1';
const VALID_SOURCES=new Set(['synthetic-fixture','local-model-unverified']);

export function publicReplay(match,{source='synthetic-fixture'}={}){
  if(!VALID_SOURCES.has(source))throw Error('Invalid replay source label');
  verifyMatch(match);
  return {
    schema:PUBLIC_SCHEMA,
    source,
    replay_verified:true,
    simulation_only:true,
    digest:match.digest,
    seed:match.seed,
    roster:[...match.roster],
    turns:match.turns.map(t=>({
      turn:t.turn,
      weather:t.snapshot.weather,
      standings:standings(t.snapshot).map(({id,score,territory})=>({id,score,territory})),
      decisions:t.decisions.map(({agent_id,action,target_id})=>({agent_id,action,target_id})),
    })),
    notice:'Public replay is an after-match projection. No private resource inventory, original prompts, provider secrets or authenticated model identity is included.',
  };
}

export function spectatorHtml(replay){
  if(!replay||replay.schema!==PUBLIC_SCHEMA||!VALID_SOURCES.has(replay.source) ||
     !replay.replay_verified||!Array.isArray(replay.turns))throw Error('Invalid public replay');
  // Prevent script or HTML breaking out of the embedded JSON, even with hostile input.
  const json=JSON.stringify(replay).replace(/</g,'\\u003c').replace(/>/g,'\\u003e')
    .replace(/&/g,'\\u0026').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Founders Arena | Replay</title>
<style>
:root{color-scheme:dark;font-family:system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;background:#070b10;color:#edf4f7}
*{box-sizing:border-box}body{margin:0}main{max-width:1040px;margin:0 auto;padding:24px 16px 60px}
.hero{padding:28px 24px;border:1px solid #29404f;background:radial-gradient(ellipse at 70% 0,#163248,#0a131c 65%);border-radius:22px}
.kicker{color:#9edfb4;text-transform:uppercase;letter-spacing:.13em;font-size:11px;font-weight:750}
h1{font-size:clamp(32px,6vw,60px);letter-spacing:-.065em;margin:9px 0 4px}p{color:#b5c7d0;line-height:1.55}
.tag{display:inline-block;border:1px solid #4e6d64;border-radius:99px;font-size:12px;padding:7px 10px;color:#b5f0c4;margin:8px 8px 0 0}
.panel{border:1px solid #263645;background:#101b25;border-radius:18px;padding:18px;margin-top:16px}
.head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
h2{font-size:18px;margin:0}.controls{display:flex;align-items:center;gap:14px;margin:18px 0 4px}
button{border-radius:12px;border:1px solid #416072;padding:12px 16px;color:white;background:#1b3544;font-weight:750;cursor:pointer}
button:disabled{opacity:.45;cursor:default}input{flex:1;min-width:70px;accent-color:#91e6ac}
table{width:100%;border-collapse:collapse}th,td{padding:12px 9px;border-bottom:1px solid #263645;text-align:left;font-size:14px}
th{font-size:11px;color:#a4bcc5;text-transform:uppercase;letter-spacing:.05em}tr:first-child td{color:#a7f3ba;font-weight:800}
.grid{display:grid;grid-template-columns:1.2fr 1fr;gap:14px}.move{padding:10px;border-bottom:1px solid #283b45;color:#d7e4e7;font-size:14px}
small,.meta{color:#96aebb;font-size:12px}#notice{word-break:break-word}code{overflow-wrap:anywhere;color:#8fb6c4}
@media(max-width:720px){.grid{grid-template-columns:1fr}.hero{padding:23px 18px}main{padding:12px 10px 50px}th,td{padding:10px 5px}}
</style></head>
<body><main><section class="hero"><div class="kicker">Evercraft / Agent civilization league</div>
<h1>Founders Arena<span style="color:#a6f4bb">.</span></h1>
<p>Every decision changes the world. Explore an authenticated-by-replay simulation transcript, not a live feed.</p>
<span class="tag" id="source">Source</span><span class="tag">Deterministic replay verified</span><span class="tag">No external actions</span>
</section><section class="panel"><div class="head"><h2 id="turnTitle">Replay</h2><span id="weather" class="meta"></span></div>
<div class="controls"><button id="back" aria-label="Previous turn">←</button><input type="range" id="seek" aria-label="Replay turn" min="0" value="0"><button id="next" aria-label="Next turn">→</button></div>
<div class="meta" id="summary"></div></section>
<div class="grid"><section class="panel"><h2>Standings</h2><table><thead><tr><th>Rank</th><th>Agent</th><th>Score</th><th>Territory</th></tr></thead><tbody id="standings"></tbody></table></section>
<section class="panel"><h2>Decisions this turn</h2><div id="moves"></div></section></div>
<section class="panel"><div class="kicker">Evidence boundary</div><p id="notice"></p><small>Simulation digest: <code id="digest"></code></small></section>
</main><script type="application/json" id="payload">${json}</script><script>
(()=>{'use strict';const data=JSON.parse(document.getElementById('payload').textContent);
const el=id=>document.getElementById(id),seek=el('seek');let i=0;seek.max=Math.max(0,data.turns.length-1);
function cell(tr,text){const td=document.createElement('td');td.textContent=String(text);tr.append(td)}
function render(){const turn=data.turns[i];el('source').textContent=data.source==='synthetic-fixture'?'SYNTHETIC FIXTURE':'LOCAL MODEL RESPONSES · UNVERIFIED';
el('digest').textContent=data.digest;el('notice').textContent=data.notice;
seek.value=i;el('back').disabled=i===0;el('next').disabled=i>=data.turns.length-1;
el('turnTitle').textContent=turn?'Turn '+turn.turn+' / '+data.turns.length:'No turns recorded';
el('weather').textContent=turn?'Weather: '+turn.weather:'';
el('summary').textContent='Spectator-only after-match projection. Hidden resources and private observations are not released.';
const standings=el('standings'),moves=el('moves');standings.replaceChildren();moves.replaceChildren();
if(!turn)return;for(const [rank,p] of turn.standings.entries()){const tr=document.createElement('tr');cell(tr,rank+1);cell(tr,p.id);cell(tr,p.score);cell(tr,p.territory);standings.append(tr)}
for(const d of turn.decisions){const v=document.createElement('div');v.className='move';v.textContent=d.agent_id+' · '+d.action+(d.target_id?' → '+d.target_id:'');moves.append(v)} }
el('back').onclick=()=>{i=Math.max(0,i-1);render()};el('next').onclick=()=>{i=Math.min(data.turns.length-1,i+1);render()};seek.oninput=()=>{i=Number(seek.value);render()};render();})();
</script></body></html>`;
}

if(process.argv[1]?.endsWith('/spectator-export.mjs')){
  try{
    const [input,output,source='synthetic-fixture']=process.argv.slice(2);
    if(!input||!output)throw Error('Usage: node spectator-export.mjs match.json replay.html [synthetic-fixture|local-model-unverified]');
    const loaded=JSON.parse(readFileSync(input,'utf8'));
    const match=loaded?.match??loaded;
    const html=spectatorHtml(publicReplay(match,{source}));
    writeFileSync(output,html,{flag:'wx'});
    console.log(JSON.stringify({created:output,source,turns:match.turns.length,verified:true}));
  }catch(err){console.error(err.message);process.exitCode=1;}
}
