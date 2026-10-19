import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { Script } from 'node:vm';

const portal=await readFile(new URL('../public/live/index.html',import.meta.url),'utf8');
const yard=await readFile(new URL('../public/demos/earthworks-autonomy/index.html',import.meta.url),'utf8');
const script=portal.match(/<script>([\s\S]*?)<\/script>/)?.[1]||'';
const yardScript=yard.match(/<script>([\s\S]*?)<\/script>/)?.[1]||'';
const publicPaths=[
  'public/demos/earthworks-autonomy/index.html',
  'systemia/visual-desk/stories/washington-active-volcanoes.json',
  'public/apps/eps-estimator/index.html',
  'public/demos/hvac-lead-recovery/index.html',
  'public/apps/earthworks-autonomy/index.html'
];

test('cinematic first frame opens actual EarthWorks source with no marketing wall',()=>{
  assert.match(portal,/<title>Evercraft LIVE \| Watch the Work<\/title>/);
  assert.match(portal,/url:'\.\.\/demos\/earthworks-autonomy\/\?studio=1'/);
  assert.match(portal,/display\(0\);requestAnimationFrame\(loop\)/);
  assert.match(portal,/\.stage\{position:relative;flex:1/);
  assert.doesNotMatch(portal,/Watch real Evercraft work\.|Actual dispatch software, running in the browser\./);
  assert.doesNotMatch(portal,/function earth\(t\)|function network\(t\)|function weather\(t\)/);
});

test('studio camera derives its video and statistics from actual fleet controller',()=>{
  assert.match(yard,/new URLSearchParams\(window.location.search\).get\('studio'\)==='1'/);
  assert.match(yard,/setMode\('autonomy'\)/);
  assert.match(yard,/g\.drawImage\(canvas,/);
  assert.match(yard,/const snap=controller.snapshot\(\),metric=stateMetrics\(snap\)/);
  assert.match(yard,/snap\.cyclesCompleted/);
  assert.match(yard,/metric\.queueMinutes/);
  assert.match(yard,/NO PHYSICAL MACHINE CONNECTION/);
  assert.doesNotThrow(()=>new Script(yardScript));
});

test('five doorways are first-party public artifacts, slow forms excluded from automatic rotation',async()=>{
  assert.equal((portal.match(/class="exhibit" data-exhibit=/g)||[]).length,5);
  for(const path of publicPaths){const s=await stat(new URL('../'+path,import.meta.url));assert.ok(s.size>1500,path);}
  for(const route of ['../visuals/washington-active-volcanoes/motion.html','../apps/eps-estimator/','../demos/hvac-lead-recovery/','../apps/earthworks-autonomy/'])assert.ok(portal.includes(route),route);
  assert.equal((portal.match(/autoplay:true/g)||[]).length,2);
  assert.equal((portal.match(/autoplay:false/g)||[]).length,3);
});

test('viewer remains sandboxed, safe, and clearly a simulation',()=>{
  assert.match(portal,/sandbox="allow-scripts"/);
  assert.doesNotMatch(portal,/<iframe[^>]*allow-same-origin/);
  assert.match(portal,/ACTUAL PUBLIC BUILDS · NOT LIVE TELEMETRY/);
  assert.match(portal,/SIMULATED EQUIPMENT · NO PHYSICAL CONTROL/);
  assert.match(portal,/USGS-SOURCED VISUALIZATION · NOT A LIVE ERUPTION/);
  assert.match(portal,/SAMPLE LEADS ONLY/);
  assert.doesNotMatch(portal,/https?:\/\/(?:drive\.google\.com|docs\.google\.com|[^"'\s]*base44\.app)/i);
  assert.doesNotMatch(script,/\bfetch\s*\(|XMLHttpRequest|WebSocket|navigator\.sendBeacon/i);
});

test('phone and desktop recording have slim controls, safe exit, pausing, and portrait setting',()=>{
  for(const str of ['id="film"','id="filmExit"','id="portrait"','id="hold"','id="next"','id="browse"','id="drawer"','visibilitychange','Escape','aria-pressed'])assert.ok(portal.includes(str),str);
  assert.match(portal,/\.film \.strap,#app\.film \.dock/);
  assert.match(portal,/document\.hidden/);
  assert.doesNotThrow(()=>new Script(script));
});
