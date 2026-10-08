import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const canonical=fs.readFileSync('systemia/earthworks-autonomy/fleet-controller.mjs','utf8');
const publicController=fs.readFileSync('public/demos/earthworks-autonomy/controller.mjs','utf8');
const page=fs.readFileSync('public/demos/earthworks-autonomy/index.html','utf8');
const app=fs.readFileSync('public/demos/earthworks-autonomy/app.mjs','utf8');

test('public EarthWorks playground ships the canonical fleet controller byte-for-byte',()=>{
  assert.equal(publicController,canonical);
  assert.match(publicController,/export function createFleetController/);
  assert.match(publicController,/currentLoadTruckId/);
  assert.match(publicController,/STOP ALL/);
});

test('public EarthWorks playground binds its UI to the canonical controller module',()=>{
  assert.match(page,/Live Yard 001/);
  assert.match(page,/data-mode="manual"/);
  assert.match(page,/data-mode="shadow"/);
  assert.match(page,/data-mode="autonomy"/);
  assert.match(page,/Truck Queue/);
  assert.match(page,/Loader Starvation/);
  assert.match(page,/Blocked Route/);
  assert.match(page,/Production Surge/);
  assert.match(page,/STOP ALL/);
  assert.ok(page.includes('<script type="module" src="./app.mjs"></script>'));
  assert.doesNotMatch(page,/base44\.app/i);

  assert.match(app,/from '\.\/controller\.mjs'/);
  assert.match(app,/createFleetController/);
  assert.match(app,/controller\.stopAll/);
  assert.match(app,/controller\.resume/);
  for(const state of ['queue','approach','loading','haul','dump','return']){
    assert.ok(app.includes("truck.state==='"+state+"'"),'missing rendered controller state '+state);
  }
  assert.doesNotMatch(app,/base44\.app/i);
});
