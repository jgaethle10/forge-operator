import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEarthworksWorldReplay } from '../experience/earthworks-world-replay.js';
import { seekEixWorldReplay, inspectEixWorldEntity } from '../experience/world-frame-eix-adapter.mjs';

test('real EarthWorks controller state flows through native World Engine into EIX samples',()=>{
  const replay=buildEarthworksWorldReplay({ticks:100});
  assert.equal(replay.schema,'evercraft.experience.world-replay.v1');
  assert.equal(replay.frame_count,101);
  assert.equal(replay.representation_state,'modeled_world_replay');
  assert.equal(replay.release_authority,false);
  assert.equal(replay.payment_authority,false);
  assert.equal(replay.delivery_authority,false);

  const before=inspectEixWorldEntity(replay,0,'HT-01');
  const after=inspectEixWorldEntity(replay,20_000,'HT-01');
  assert.ok(before && after);
  assert.notDeepEqual(before.entity.world_position_m,after.entity.world_position_m);
  assert.equal(after.entity.source.motion_state,'modeled');
  assert.equal(after.entity.source.evidence_state,'modeled');
  assert.equal(after.entity.source.source_refs[0],'earthworks:fleet-controller:toy-yard-001');
  assert.equal(seekEixWorldReplay(replay,12_000).frame.tick,12);
  assert.equal(replay.frames.every((f:any)=>f.render_mode==='spatial_inspection_only'),true);
});

test('EarthWorks STOP ALL holds modeled machine positions, never claims a physical stop',()=>{
  const replay=buildEarthworksWorldReplay({ticks:40,emergencyStopTick:20});
  const before=inspectEixWorldEntity(replay,20_000,'HT-01');
  const after=inspectEixWorldEntity(replay,40_000,'HT-01');
  assert.ok(before && after);
  assert.deepEqual(before.entity.world_position_m,after.entity.world_position_m);
  assert.equal(after.entity.inspection?.controller_hold,true);
  assert.equal(after.entity.inspection?.commanded_speed_mps,0);
  assert.match(seekEixWorldReplay(replay,40_000).latest_cue.text,/Simulation-only emergency stop/);
});

test('EarthWorks adapter denies unbounded scene generation and invalid e-stop ticks',()=>{
  assert.throws(()=>buildEarthworksWorldReplay({ticks:601}),/tick_budget_invalid/);
  assert.throws(()=>buildEarthworksWorldReplay({ticks:5,emergencyStopTick:10}),/stop_tick_invalid/);
});
