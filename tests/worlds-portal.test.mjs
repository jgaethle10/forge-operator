import test from 'node:test';
import assert from 'node:assert/strict';
import {PORTAL,portalEffect} from '../public/worlds/portal-visual.mjs';
test('Portal has human-scale proportions',()=>{
 assert.ok(PORTAL.frameWidth<2.5);
 assert.ok(PORTAL.frameHeight<=3.6);
 assert.ok(Math.abs(PORTAL.y-PORTAL.frameHeight/2-.28)<.0001);
 assert.ok(PORTAL.outerX<2.5&&PORTAL.outerY<3.5);
});
test('Close-up portal glow fades and remains bounded',()=>{
 assert.equal(portalEffect(.2,1).opacity,0);
 assert.ok(portalEffect(1,0).opacity<.12);
 assert.ok(portalEffect(2.8,1).opacity>.9);
 for(const distance of [0,.5,1,2,5,20]){
  const v=portalEffect(distance,4);
  assert.ok(v.opacity>=0&&v.opacity<=1);
  assert.ok(v.pulse>=.98&&v.pulse<=1.02);
 }
 assert.equal(portalEffect(NaN,0).opacity,0);
});
