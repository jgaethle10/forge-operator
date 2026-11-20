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
