import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Pure waypoint contract, no browser, world writes or agent execution.
const source=fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)),'office-tour.js'),'utf8');
const context={window:{}};
vm.runInNewContext(source,context,{filename:'office-tour.js'});
const tour=context.window.EvercraftStudioTour;
assert(tour);
assert.equal(tour.length,8);
assert.equal(tour.labels.length,8);
assert.equal(tour.labels[0],'Studio entrance');
assert.equal(tour.labels.at(-1),'Delivery');
assert.equal(tour.step(0,1),1);
assert.equal(tour.step(0,-1),7,'reverse path wraps at entrance');
assert.equal(tour.step(7,1),0,'forward path wraps at delivery');
assert.throws(()=>tour.step(0,12),/adjacent/);
assert.throws(()=>tour.pose(0.3),/integer/);
const ids=[];
for(let n=0;n<tour.length;n++){
  const large=tour.pose(n,{compact:false});
  const phone=tour.pose(n,{compact:true});
  assert.equal(large.id,phone.id);
  assert(large.label.length>3);
  assert(large.camera.zoom>=.35&&large.camera.zoom<=1.42);
  assert(phone.camera.zoom>=.35&&phone.camera.zoom<=1.42);
  assert(phone.camera.zoom<large.camera.zoom,'phone tour must frame more of the studio');
  for(const camera of [large.camera,phone.camera]){
    assert(camera.pitch>=32&&camera.pitch<=74);
    assert(camera.yaw>=-170&&camera.yaw<=170);
    assert(Math.abs(camera.panX)<=480);
    assert(Math.abs(camera.panY)<=360);
    assert(Object.values(camera).every(Number.isFinite));
  }
  ids.push(large.id);
}
assert.equal(new Set(ids).size,8,'one unique visit per authored stop');
assert.equal(tour.pose(8).id,tour.pose(0).id,'tour can loop without inventing a new room');
assert.equal(tour.pose(-1).id,'delivery');
assert.equal(tour.pose(4).agent_id,null,'central meeting table is a visitor viewpoint, not an agent');
assert.equal(tour.pose(2).agent_id,'analyst');
console.log('Work Saban visitor tour: PASS (eight bounded viewpoints, mobile framing and no model or environment side effects).');
