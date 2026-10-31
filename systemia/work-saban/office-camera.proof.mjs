import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const source=fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)),'office-camera.js'),'utf8');
function frameHarness(){
  let id=0,now=0;
  const frames=new Map(),rendered=[];
  const window={
    requestAnimationFrame(fn){const key=++id;frames.set(key,fn);return key;},
    cancelAnimationFrame(key){frames.delete(key);}
  };
  const ctx={window};
  vm.runInNewContext(source,ctx,{filename:'office-camera.js'});
  function tick(dt=16.6667){
    now+=dt;
    const ready=[...frames.entries()];frames.clear();
    for(const [,fn] of ready)fn(now);
  }
  function flush(count=250,dt=16.6667){for(let i=0;i<count&&frames.size;i++)tick(dt);}
  const origin={yaw:-14,pitch:58,zoom:.72,panX:0,panY:0};
  const rig=ctx.window.EvercraftObserverCamera.create({
    initial:origin,onFrame:p=>rendered.push({...p})
  });
  return {rig,frames,rendered,tick,flush,window,origin};
}
function near(a,b,epsilon=.002){assert(Math.abs(a-b)<epsilon,'expected '+a+' to approach '+b);}
{
  const {rig,frames,rendered,flush,origin}=frameHarness();
  assert.equal(rendered.length,1,'initial paint must be immediate');
  rig.setTarget({zoom:1.14,yaw:65,pitch:51,panX:240,panY:-90});
  assert.equal(frames.size,1,'one frame per input burst');
  assert.equal(rig.getPose().zoom,origin.zoom,'no instantaneous jump');
  rig.setTarget({zoom:1.31,yaw:85});
  assert.equal(frames.size,1,'rapid inputs coalesce');
  flush();
  near(rig.getPose().zoom,1.31);
  near(rig.getPose().yaw,85,.04);
  near(rig.getPose().panX,240,.04);
  assert.equal(frames.size,0,'idle camera has no scheduled frames');
}
{
  const a=frameHarness(),b=frameHarness();
  a.rig.setTarget({panX:300});
  b.rig.setTarget({panX:300});
  a.flush(60,16.6667);
  b.flush(30,33.3334);
  near(a.rig.getPose().panX,b.rig.getPose().panX,.7);
  assert.equal(a.rig.isMoving(),false);
  assert.equal(b.rig.isMoving(),false);
}
{
  const {rig,frames,tick,flush}=frameHarness();
  rig.setTarget({zoom:999,pitch:-200,yaw:500,panX:-900,panY:900});
  assert.equal(rig.getTarget().zoom,1.42);
  assert.equal(rig.getTarget().pitch,32);
  assert.equal(rig.getTarget().yaw,170);
  assert.equal(rig.getTarget().panX,-480);
  assert.equal(rig.getTarget().panY,360);
  assert.throws(()=>rig.setTarget({zoom:NaN}),/Invalid observer camera zoom/);
  tick(1000000);
  assert(rig.getPose().zoom<1.42,'background gap must not teleport');
  rig.setSuspended(true);
  assert.equal(frames.size,0,'hidden view releases frames');
  const stopped=rig.getPose().zoom;
  tick(100);
  near(rig.getPose().zoom,stopped,.00001);
  rig.setSuspended(false);
  flush(250);
  near(rig.getPose().zoom,1.42,.001);
  rig.destroy();
  rig.setTarget({zoom:.5});
  assert.equal(frames.size,0);
}
{
  const {window,origin}=frameHarness();
  const frames=[],pending=new Map();
  let n=0;
  const rig=window.EvercraftObserverCamera.create({
    initial:origin,onFrame:p=>frames.push(p),
    reducedMotion:true,
    requestFrame:fn=>{pending.set(++n,fn);return n;}
  });
  rig.setTarget({yaw:80,panX:150});
  assert.equal(rig.getPose().yaw,80,'reduced motion snaps');
  assert.equal(rig.getPose().panX,150);
  assert.equal(pending.size,0);
}
console.log('Work Saban observer camera: PASS (damping, frame rate, coalescing, bounds, suspend, reduced motion).');
