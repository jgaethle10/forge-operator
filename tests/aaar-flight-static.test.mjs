import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';

const page=fs.readFileSync('public/worlds/flight/index.html','utf8');
const home=fs.readFileSync('public/worlds/index.html','utf8');

test('Worlds has direct AAAR cockpit route',()=>{
  assert.match(home,/href="\.\/flight\/"/);
  assert.match(page,/<title>[^<]*Anniston/i);
  assert.match(page,/id="beginFlight"/);
  assert.match(page,/id="designFromStart"/);
  assert.match(page,/id="skipToControls"/);
});
test('cockpit is self-contained: no iframe, CDN, remote script or asset dependency',()=>{
  assert.doesNotMatch(page,/<iframe\b/i);
  assert.doesNotMatch(page,/<script\b[^>]*\bsrc=/i);
  assert.doesNotMatch(page,/<link\b[^>]*\bhref=/i);
  assert.doesNotMatch(page,/\bfetch\s*\(\s*['"]https?:/);
});
test('all inline scripts are syntactically valid and page has blocked-JS sentinel',()=>{
  const scripts=[...page.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
  assert.ok(scripts.length>=4);
  scripts.forEach((source,i)=>assert.doesNotThrow(()=>new vm.Script(source,{filename:'inline-'+i+'.js'})));
  assert.match(page,/id="scriptBlocked"/);
  assert.match(page,/getElementById\('scriptBlocked'\)\?\.remove\(\)/);
});
test('touch controls, flight controls and evidence safety labels remain wired',()=>{
  for(const id of ['pauseToggle','openFoundry','fLaunch','fSave','saveFlight','flightCanvas','throttleOut']){
    assert.match(page,new RegExp('id="'+id+'"'));
  }
  for(const key of ['pitchUp','pitchDown','left','right','throttleUp','throttleDown']){
    assert.match(page,new RegExp('data-touch="'+key+'"'));
  }
  assert.match(page,/UNVALIDATED_GAMEPLAY/);
  assert.match(page,/NOT CFD/);
  assert.match(page,/NOT FLIGHT TRAINING/);
});

test('AAAR mobile v0.8 interaction: analog inputs and safe cockpit gestures',()=>{
  for(const id of ['flightStick','flightStickKnob','flightThrottleRange','flightThrottleValue','mobileHudToggle','mobileMoreToggle']){
    assert.match(page,new RegExp('id="'+id+'"'));
  }
  assert.match(page,/function setupThumbCockpit\(/);
  assert.match(page,/stickInput\.bank/);
  assert.match(page,/stickInput\.pitch/);
  assert.match(page,/state\.throttle=Math\.max\(0,Math\.min\(1,Number\(slider\.value\)\/100\)\)/);
  assert.match(page,/pointercancel/);
  assert.match(page,/lostpointercapture/);
  assert.match(page,/-webkit-touch-callout:none/);
  assert.match(page,/\.foundry-overlay input/);
  assert.match(page,/data-hud="full"/);
  assert.match(page,/orientation:landscape/);
});

test('Cedar Basin v0.9 shares deterministic world-space scenery between renderers',()=>{
  assert.match(page,/function cedarHash\(i,j\)/);
  assert.match(page,/function cedarForest\(\)/);
  assert.match(page,/const forest=cedarForest\(\)/);
  assert.match(page,/for\(const tree of forest\)/);
  assert.match(page,/function drawCedarPines\(/);
  assert.match(page,/function drawCedarClouds\(/);
  assert.match(page,/function drawCedarLake\(/);
  assert.match(page,/scenePerf\.renderCostMs/);
  assert.match(page,/window\.AAARSceneMetrics/);
  assert.match(page,/renderCostMs\*2\.2/);
  assert.doesNotMatch(page,/cdn\.jsdelivr|unpkg\.com|threejs\.org/);
});

test('Seattle city tour has grounded 2023 footprints, georeferenced landmarks and honest estimates',()=>{
 const geo=JSON.parse(fs.readFileSync('public/worlds/flight/data/seattle-buildings-2023.json','utf8'));
 assert.equal(geo.schema,'evercraft.worlds.seattle.city-outlines-2023.v1');
 assert.equal(geo.heights,'UNVERIFIED_SYNTHETIC');
 assert.equal(geo.retained,1200);
 assert.equal(geo.rects.length,1200);
 assert.equal(geo.origin.lat,47.61);
 assert.equal(geo.origin.lon,-122.34);
 assert.match(page,/id="aaar-seattle-geography"/);
 assert.match(page,/2023 city footprint locations/);
 assert.match(page,/location.hash.toLowerCase\(\)==='#seattle'/);
 assert.match(page,/Fly over Seattle/);
 assert.match(home,/href="\.\/flight\/#seattle"/);
 assert.match(page,/function addSeattleShapes/);
 assert.match(page,/function addSeattleWebGL/);
 assert.match(page,/BUILDING_CONTACT/);
 assert.match(page,/acceleratedStallMps/);
 assert.match(page,/LOW_ORDER_GAMEPLAY/);
});

test('Seattle v1.0 laptop renderer uses lit glass, water and grounded city geometry',()=>{
  assert.match(page,/AAARGraphicsMetrics/);
  assert.match(page,/aSurface/);
  assert.match(page,/uTime/);
  assert.match(page,/dFdx\(vWorld\)/);
  assert.match(page,/dFdy\(vWorld\)/);
  assert.match(page,/windowsNoise/);
  assert.match(page,/vSurface>0\.5&&vSurface<1\.5/);
  assert.match(page,/vSurface>1\.5&&vSurface<2\.5/);
  assert.match(page,/function addSeattleWebGL/);
  assert.match(page,/const needle=seattle\.landmarks\.find\(l=>l\.type==='needle'\)/);
  assert.match(page,/Schematic Seattle street pattern/);
  assert.match(page,/Approximate waterfront piers/);
  assert.match(page,/html\.seattle-mode \.flight-shell/);
  assert.doesNotMatch(page,/https?:\/\/(?:unpkg|cdn\.jsdelivr)/);
});

test('Seattle flight collision checks use indexed cells and preserve rooftop contact',()=>{
 assert.match(page,/const collisionCellSize=160,collisionCells=new Map/);
 assert.match(page,/function collisionCandidates\(x,z\)/);
 assert.match(page,/function collisionAt\(x,y,z\)/);
 assert.match(page,/collisionTargetsCount:collisionTargets.length/);
 assert.match(page,/const hit=seattle\.collisionAt\(state\.x,state\.y,state\.z\)/);
 assert.match(page,/BUILDING_CONTACT/);
 assert.doesNotMatch(page,/const list=seattle\.buildings\.concat\(seattle\.landmarks/);
});
