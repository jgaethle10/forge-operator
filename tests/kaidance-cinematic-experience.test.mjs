import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
const html=read('../public/kaidance/index.html');
const app=read('../public/kaidance/app.mjs');
const theater=read('../public/kaidance/visual.mjs');
const styles=read('../public/kaidance/experience.css');
test('the first screen shows an actual source-linked activity window, not a buried feed',()=>{
 const hero=html.indexOf('WATCH THE'),scene=html.indexOf('id="visualField"');
 const featured=html.indexOf('id="heroEventTitle"'),later=html.indexOf('class="record"');
 const liveBtn=html.indexOf('id="portraitBtn"'),main=html.indexOf('<main id="main">');
 assert.ok(hero>0&&scene>hero&&featured>scene&&later>featured);
 assert.ok(liveBtn>0&&liveBtn<main,'9:16 entry must be visible in the first header');
 assert.match(html,/id="heroEventLink" hidden/);
 assert.match(html,/NOW IN THE PUBLIC BUILD LOG/);
 assert.match(app,/\$\('heroEventTitle'\)\.textContent=e\.title/);
 assert.match(app,/\$\('heroEventLink'\)\.href=e\.url/);
 assert.match(app,/normalizePublicActivity/);
});
test('film mode is one tap, self-contained and linkable without altering source state',()=>{
 assert.match(html,/id="portraitBtn"/);
 assert.match(app,/function setBroadcastView\(active\)/);
 assert.match(app,/new URLSearchParams\(window\.location\.search\)\.get\('view'\)==='live'/);
 assert.match(styles,/body\.portrait .*\.portrait-proof/);
 assert.match(styles,/100dvh/);
 assert.match(styles,/env\(safe-area-inset-top/);
 assert.match(app,/function refreshPulse/);
});
test('cinematic motion is explicitly decorative, while heartbeat requires a fresh verified increment',()=>{
 assert.match(html,/ANIMATED NETWORK ART · NOT AGENT TELEMETRY/);
 assert.match(html,/HEARTBEAT NOT CONNECTED/);
 assert.match(html,/NO SOURCE TIMESTAMP/);
 assert.match(theater,/Ambient art only/);
 assert.doesNotMatch(theater,/fetch\(|XMLHttpRequest|localStorage|WebSocket|EventSource/);
 assert.match(app,/assessed\.cycle_number>state\.cycleSeen&&assessed\.verified\)triggerBeat/);
 assert.match(app,/sourceFresh/);
 assert.doesNotMatch(app,/innerHTML\s*=/);
 assert.equal(fs.existsSync(new URL('../public/kaidance/pulse.json',import.meta.url)),false);
});
test('owned Leiland host and Caddy static route explicitly serve newly-required artwork files',()=>{
 const leiland=read('../systemia/leiland/owned-observatory-host.mjs');
 const caddy=read('../infra/evercraft-edge/kaidance/Caddyfile.route.example');
 for(const file of ['experience.css','visual.mjs']){
  assert.match(html,new RegExp(file.replace('.','\\.')));
  assert.ok(leiland.includes("'/kaidance/"+file+"'"),file);
  assert.ok(caddy.includes('/kaidance/'+file),file);
 }
});
