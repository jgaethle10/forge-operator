import test from 'node:test';
import assert from 'node:assert/strict';
import { EvercraftWorldRuntime, type WorldDefinition } from './engine.js';
import { compileRenderFrame, projectWorldstateIntoWorld } from './bridges.js';
import {
  buildEixWorldReplay,
  inspectEixWorldEntity,
  seekEixWorldReplay,
} from '../experience/world-frame-eix-adapter.mjs';

test('EIX bridges real deterministic World Engine frames and Worldstate provenance', () => {
  const base:WorldDefinition={
    schema:'evercraft.world-engine.world.v1',
    id:'eix-native-integration',
    version:1,
    tickRateHz:10,
    gravity:{x:0,y:0,z:0},
    entities:[{
      id:'excavator',
      name:'Excavator',
      transform:{position:{x:0,y:1,z:0}},
      rigidBody:{mass:1,velocity:{x:2,y:0,z:0},linearDamping:0},
      properties:{evidence_state:'modeled',display_name:'Excavator'},
      tags:['machine']
    }]
  };
  const projected=projectWorldstateIntoWorld(base,{
    schema:'evercraft.worldstate.snapshot.v1',
    id:'test-gauge-snapshot',
    observations:[{
      id:'gauge-1',
      label:'Gauge observation',
      evidence_state:'observed',
      source_refs:['official-gauge:fixture'],
      lat:46.6,
      lon:-120.5,
    }]
  },{lat:46.6,lon:-120.5});
  const runtime=new EvercraftWorldRuntime(projected);
  const frames=[compileRenderFrame(runtime.snapshot(),'camera-a',projected)];
  frames.push(compileRenderFrame(runtime.step(),'camera-a',projected));
  frames.push(compileRenderFrame(runtime.step(),'camera-a',projected));

  const replay=buildEixWorldReplay({
    world_id:'eix-native-integration',
    frames,
    title:'Native world proof'
  });
  assert.equal(replay.frame_count,3);
  assert.equal(replay.frames[1].time_ms,100);
  assert.equal(replay.frames[2].time_ms,200);
  const first=inspectEixWorldEntity(replay,0,'excavator');
  const last=inspectEixWorldEntity(replay,200,'excavator');
  assert.ok(first && last);
  assert.ok(last.entity.world_position_m.x > first.entity.world_position_m.x);
  assert.equal(seekEixWorldReplay(replay,149).frame.tick,1);

  const observation=inspectEixWorldEntity(replay,200,'worldstate:gauge-1');
  assert.ok(observation);
  assert.equal(observation.entity.source.evidence_state,'observed');
  assert.equal(observation.entity.source.motion_state,'modeled');
  assert.deepEqual(observation.entity.source.source_refs,['official-gauge:fixture']);
  assert.equal(observation.entity.source.source_snapshot_id,'test-gauge-snapshot');
  assert.equal(replay.release_authority,false);
  assert.equal(replay.delivery_authority,false);
});
