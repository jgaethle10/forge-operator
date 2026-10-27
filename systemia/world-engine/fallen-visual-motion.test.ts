import test from 'node:test';
import assert from 'node:assert/strict';
import {importFallenVisualCase} from './fallen-visual-case.mjs';
import {sceneFromFallenVisualHandoff} from './fallen-visual-scene.mjs';
import {authoredRoutePoint,buildFallenVisualMotionLedger,verifyFallenVisualMotionLedger} from './fallen-visual-motion.mjs';
import {EvercraftWorldRuntime,replayWorld, type WorldDefinition,type WorldInput} from './engine.js';
import {compileVisualFrame,verifyVisualFrameContract} from './visual.js';

const sports=()=>({
  schema:'fallen.visual-case.v1',sector:'sports',title:'Fictional Play',
  source:{reference:'authored synthetic play',timestamp:'',evidence:'synthetic'},
  players:[
    {id:'X',side:'offense',color:'#ffeeaa',route:[[100,200],[400,200],[800,300]]},
    {id:'QB',side:'offense',color:'#ffbb99',route:[[200,300],[220,320]]}
  ],
  defense:[{id:'CB1',x:400,y:195}]
});
const response=()=>({
  schema:'fallen.visual-case.v1',sector:'response',title:'Fictional River District',
  source:{reference:'authored synthetic incident',timestamp:'',evidence:'synthetic'},
  assets:[{id:'H1',name:'Hospital',kind:'care',priority:'high',x:200,y:200,source:'original tabletop'}]
});
function setup(example){
  const handoff=importFallenVisualCase(example);
  const projection=sceneFromFallenVisualHandoff(handoff);
  return {handoff,projection,world:projection.world as WorldDefinition};
}
function frame(runtime:EvercraftWorldRuntime,world:WorldDefinition){
  const snap=runtime.snapshot();
  return compileVisualFrame(snap.worldId,snap.tick,snap.timeSec,world.visualScene!,snap.entities,snap.cameraRuntime!,snap.activeEntityIds);
}
test('authored sports route plays through World Engine tick-bound teleports with repeatable snapshots',()=>{
  const {handoff,projection,world}=setup(sports());
  const ledger=buildFallenVisualMotionLedger(handoff,projection,{ticks:36});
  assert.equal(verifyFallenVisualMotionLedger(ledger,projection),true);
  assert.equal(ledger.events.length,72);
  assert.equal(ledger.frameRateHz,60);
  const runtime=new EvercraftWorldRuntime(world);
  const start=runtime.entity('rc13:player:X')!.transform.position;
  runtime.run(18,ledger.events as WorldInput[]);
  const midpoint=runtime.entity('rc13:player:X')!.transform.position;
  assert.ok(midpoint.x>start.x);
  const a=frame(runtime,world);
  assert.equal(verifyVisualFrameContract(a),true);
  runtime.run(18,ledger.events as WorldInput[]);
  const finish=runtime.entity('rc13:player:X')!.transform.position;
  assert.ok(finish.x>midpoint.x);
  const b=frame(runtime,world);
  assert.equal(verifyVisualFrameContract(b),true);
  assert.notEqual(a.digest,b.digest);
  assert.ok(Math.abs(finish.x-(2*(800-35)/830-1))<1e-9);
  assert.equal(replayWorld(world,36,ledger.events as WorldInput[]).deterministic,true);
});
test('synthetic response incident phase visibly changes native frame, never hydraulic authority',()=>{
  const {handoff,projection,world}=setup(response());
  const ledger=buildFallenVisualMotionLedger(handoff,projection,{ticks:12});
  assert.equal(ledger.events.length,12);
  const runtime=new EvercraftWorldRuntime(world);
  const original=frame(runtime,world);
  runtime.run(12,ledger.events as WorldInput[]);
  const changed=frame(runtime,world);
  assert.equal(verifyVisualFrameContract(changed),true);
  assert.notEqual(original.digest,changed.digest);
  assert.ok(Math.abs(runtime.entity('rc13:scenario-front')!.transform.position.y+.94)<1e-9);
  assert.equal(world.metadata?.publication_authority,false);
  assert.equal(world.metadata?.physically_validated,false);
});
test('arc-length animation does not fake constant durations per unequal segment',()=>{
  const route=[{u:0,v:.5},{u:.2,v:.5},{u:1,v:.5}];
  assert.equal(authoredRoutePoint(route,.5).x,0);
  assert.equal(authoredRoutePoint(route,1).x,1);
});
test('motion ledger receipts detect tampering and refuse wrong projection',()=>{
  const a=setup(sports()),b=setup(response());
  const ledger=buildFallenVisualMotionLedger(a.handoff,a.projection,{ticks:10});
  assert.equal(verifyFallenVisualMotionLedger(ledger,a.projection),true);
  assert.equal(verifyFallenVisualMotionLedger(ledger,b.projection),false);
  const corrupt=structuredClone(ledger);
  corrupt.events[0].value.x=.12345;
  assert.equal(verifyFallenVisualMotionLedger(corrupt,a.projection),false);
  const spoof=structuredClone(ledger);
  spoof.publication_authority=true;
  assert.equal(verifyFallenVisualMotionLedger(spoof,a.projection),false);
  assert.throws(()=>buildFallenVisualMotionLedger(a.handoff,b.projection),/projection_unverified/);
});
test('fails closed on excessive frame budgets and invalid authored route geometry',()=>{
  const {handoff,projection}=setup(sports());
  assert.throws(()=>buildFallenVisualMotionLedger(handoff,projection,{ticks:241}),/ticks_invalid/);
  assert.throws(()=>buildFallenVisualMotionLedger(handoff,projection,{ticks:-1}),/ticks_invalid/);
  assert.throws(()=>authoredRoutePoint([{u:0,v:0},{u:0,v:0}],.5),/segment_degenerate/);
  assert.throws(()=>authoredRoutePoint([{u:0,v:0},{u:1,v:1}],-1),/route_invalid/);
});
