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
