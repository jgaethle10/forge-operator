import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEixWorldReplay, seekEixWorldReplay, inspectEixWorldEntity } from './world-frame-eix-adapter.mjs';

function frame(tick, x, extra = {}) {
  return {
    schema: 'evercraft.world-engine.render-frame.v1',
    worldId: 'source-world', tick, timeSec: tick/10,
    cameraId: 'camera-a', visual: null, audio: null,
    entities: [{
      id: 'loader', transform: {position: {x, y: 1, z: 0}}, tags: ['machine'],
      properties: {evidence_state:'observed',source_refs:['record:official']},
      animation: {stateId:'digging',stateTimeSec:tick/10,pose:[]}, navigation:null, assetRefs:[],
      ...extra
    }]
  };
}

test('bridges genuine World Engine frame schema with deterministic seek and inspect', () => {
  const replay=buildEixWorldReplay({frames:[frame(0,0),frame(1,2),frame(2,4)],teaching_cues:[{tick:1,text:'Motion is a modeled demonstration.'}]});
  assert.equal(replay.schema,'evercraft.experience.world-replay.v1');
  assert.equal(replay.frame_count,3);
  assert.equal(replay.release_authority,false);
  assert.equal(seekEixWorldReplay(replay,150).frame.entities[0].world_position_m.x,2);
  assert.equal(seekEixWorldReplay(replay,150).sample_is_exact,false);
  assert.equal(seekEixWorldReplay(replay,200).sample_is_exact,true);
  assert.equal(seekEixWorldReplay(replay,-99).frame.tick,0);
  assert.equal(seekEixWorldReplay(replay,99999).frame.tick,2);
  assert.equal(inspectEixWorldEntity(replay,200,'loader').entity.animation_state,'digging');
  assert.equal(inspectEixWorldEntity(replay,200,'missing'),null);
});

test('sourced observation cannot promote modeled world motion to observed telemetry', () => {
  const replay=buildEixWorldReplay({frames:[frame(0,0)]});
  const source=replay.frames[0].entities[0].source;
  assert.equal(source.evidence_state,'observed');
  assert.equal(source.motion_state,'modeled');
  assert.deepEqual(source.source_refs,['record:official']);
  assert.equal(replay.representation_state,'modeled_world_replay');
});

test('unreferenced observed data is demoted and unsourced observed narration is rejected', () => {
  const bad=frame(0,0);bad.entities[0].properties.source_refs=[];
  assert.equal(buildEixWorldReplay({frames:[bad]}).frames[0].entities[0].source.evidence_state,'unknown');
  assert.throws(()=>buildEixWorldReplay({frames:[frame(0,0)],teaching_cues:[{tick:0,text:'Flood observed',evidence_state:'observed'}]}),/eix_cue_source_missing/);
});

test('rejects incomplete, mixed, duplicated, tampered and unordered frame samples', () => {
  assert.throws(()=>buildEixWorldReplay({frames:[]}),/frames_missing/);
  assert.throws(()=>buildEixWorldReplay({frames:[frame(2,2),frame(1,1)]}),/frames_not_monotonic/);
  assert.throws(()=>buildEixWorldReplay({frames:[frame(1,1),frame(1,2)]}),/frames_not_monotonic/);
  const mixed=frame(0,1);mixed.worldId='unrelated-world';
  assert.throws(()=>buildEixWorldReplay({world_id:'source-world',frames:[mixed]}),/world_id_mismatch/);
  const invalid=frame(0,1);invalid.entities[0].transform.position.x=NaN;
  assert.throws(()=>buildEixWorldReplay({frames:[invalid]}),/invalid_position/);
  const duplicate=frame(0,1);duplicate.entities.push(structuredClone(duplicate.entities[0]));
  assert.throws(()=>buildEixWorldReplay({frames:[duplicate]}),/duplicate_entity_id/);
  const tampered=frame(0,1);tampered.visual={schema:'evercraft.world-engine.visual-frame.v1',worldId:'source-world',tick:99,digest:'fake'};
  assert.throws(()=>buildEixWorldReplay({frames:[tampered]}),/visual_lineage_invalid/);
});

test('inspection returns copies and cannot mutate canonical replay', () => {
  const replay=buildEixWorldReplay({frames:[frame(0,1)]});
  const observed=inspectEixWorldEntity(replay,0,'loader');
  observed.entity.world_position_m.x=1000;
  assert.equal(replay.frames[0].entities[0].world_position_m.x,1);
});

test('cue and visual frame lineage are explicit, not renderer or payment proof', () => {
  const f=frame(0,1);
  f.visual={schema:'evercraft.world-engine.visual-frame.v1',worldId:'source-world',tick:0,digest:'verified-in-engine'};
  const replay=buildEixWorldReplay({frames:[f],teaching_cues:[{tick:0,text:'Example model',evidence_state:'modeled'}]});
  assert.equal(replay.frames[0].render_mode,'world_engine_visual_frame');
  assert.equal(replay.frames[0].visual_digest,'verified-in-engine');
  assert.equal(replay.payment_authority,false);
  assert.equal(replay.delivery_authority,false);
  assert.equal(seekEixWorldReplay(replay,0).latest_cue.text,'Example model');
});
