import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { Script } from 'node:vm';

const html=await readFile(new URL('../public/live/index.html',import.meta.url),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1]||'';
const publicPaths=[
  'public/demos/earthworks-autonomy/index.html',
  'systemia/visual-desk/stories/washington-active-volcanoes.json',
  'public/apps/eps-estimator/index.html',
  'public/demos/hvac-lead-recovery/index.html',
  'public/apps/earthworks-autonomy/index.html'
];
test('real work replaces synthetic visual-only screens',()=>{
  assert.match(html,/<title>Evercraft LIVE \| Real Work<\/title>/);
  assert.equal((html.match(/class="door" data-exhibit=/g)||[]).length,5);
  for(const name of ['EarthWorks Live Yard','Washington Volcanoes','EPS Precise Estimator','HVAC Lead Recovery','EarthWorks Toy Yard'])assert.ok(html.includes(name),name);
  assert.doesNotMatch(html,/function earth\(t\)|function network\(t\)|function weather\(t\)/);
});
test('every source exists in versioned first-party repository',async()=>{
  for(const path of publicPaths){const s=await stat(new URL('../'+path,import.meta.url));assert.ok(s.size>1500,path);}
  for(const route of ['../demos/earthworks-autonomy/','../visuals/washington-active-volcanoes/motion.html','../apps/eps-estimator/','../demos/hvac-lead-recovery/','../apps/earthworks-autonomy/'])assert.ok(html.includes(route),route);
});
test('public-only frames and truth boundaries',()=>{
  assert.match(html,/sandbox="allow-scripts"/);
  assert.match(html,/PUBLIC ENGINEERING SHOWCASE · NOT LIVE TELEMETRY/);
  assert.match(html,/WORKING CODE · SIMULATED JOBSITE/);
  assert.match(html,/SOURCE-BACKED VISUAL STORY · NOT LIVE VOLCANO MONITORING/);
  assert.match(html,/WORKING COST CALCULATOR · EXAMPLE INPUTS/);
  assert.match(html,/SAMPLE LEADS · NO LIVE CUSTOMER DATA/);
  assert.doesNotMatch(html,/<iframe[^>]*allow-same-origin/);
  assert.doesNotMatch(html,/https?:\/\/(?:drive\.google\.com|docs\.google\.com|[^"'\s]*base44\.app)/i);
  assert.doesNotMatch(script,/\bfetch\s*\(|XMLHttpRequest|WebSocket|navigator\.sendBeacon/i);
});
test('director and filming controls are operable from phone or desktop',()=>{
  for(const str of ['id="film"','id="filmExit"','id="portrait"','id="pause"','id="next"','visibilitychange','Escape','aria-pressed'])assert.ok(html.includes(str),str);
  assert.match(html,/document\.hidden/);
  assert.doesNotThrow(()=>new Script(script));
});
