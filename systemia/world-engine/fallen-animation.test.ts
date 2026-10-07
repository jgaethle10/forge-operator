import test from 'node:test';
import assert from 'node:assert/strict';
import {
  animationFromFallenAsset,
  verifyFallenAnimationImportReceipt,
  type FallenAnimationAsset
} from './fallen-animation.js';
import {
  initializeAnimationRuntime,
  setAnimationParameter,
  stepAnimationRuntime
} from './animation.js';

function bind(x=0,y=0,z=0){
  return {
    translation:{x,y,z},
    rotationDeg:{x:0,y:0,z:0},
    scale:{x:1,y:1,z:1}
  };
}

function baseAsset():FallenAnimationAsset{
  return {
    schema:'evercraft.fallen.animation.v1',
    id:'animation:hero',
    coordinateSystem:'right_handed_y_up',
    units:'meters',
    rotationUnits:'degrees',
    rig:{
      id:'rig:hero',
      bones:[
        {id:'root',parentId:null,bind:bind()},
        {id:'hand',parentId:'root',bind:bind(.5,1,0)}
      ]
    },
    clips:[
      {
        id:'idle',
        durationSec:1,
        loop:true,
        tracks:[
          {
            boneId:'hand',
            rotationDeg:[
              {timeSec:0,value:{x:0,y:0,z:0}},
              {timeSec:1,value:{x:0,y:0,z:0}}
            ]
          }
        ]
      },
      {
        id:'wave',
        durationSec:1,
        loop:false,
        tracks:[
          {
            boneId:'hand',
            rotationDeg:[
              {timeSec:0,value:{x:0,y:0,z:0}},
              {timeSec:.5,value:{x:0,y:0,z:45}},
              {timeSec:1,value:{x:0,y:0,z:0}}
            ]
          }
        ],
        events:[
          {
            id:'wave-start',
            name:'wave_start',
            timeSec:.25,
            payload:{hand:'right'}
          }
        ]
      }
    ],
    states:[
      {id:'idle',clipId:'idle',loop:true},
      {id:'wave',clipId:'wave',loop:false}
    ],
    initialState:'idle',
    transitions:[
      {
        id:'idle-to-wave',
        from:'idle',
        to:'wave',
        blendSec:.2,
        conditions:[
          {parameter:'wave',operator:'truthy'}
        ]
      }
    ],
    parameters:{wave:false},
    provenance:{
      sourceRef:'fallen:character:hero',
      rightsState:'owned',
      license:'Evercraft-owned'
    }
  };
}

test('Fallen animation imports into a canonical World Engine component',()=>{
  const result=animationFromFallenAsset(baseAsset());

  assert.equal(result.component.schema,'evercraft.world-engine.animation.v1');
  assert.equal(result.component.rig.id,'rig:hero');
  assert.deepEqual(
    result.component.rig.bones.map(bone=>bone.id),
    ['hand','root']
  );
  assert.deepEqual(
    result.component.clips.map(clip=>clip.id),
    ['idle','wave']
  );
  assert.deepEqual(
    result.component.states.map(state=>state.id),
    ['idle','wave']
  );
  assert.equal(result.receipt.boneCount,2);
  assert.equal(result.receipt.clipCount,2);
  assert.equal(result.receipt.trackCount,2);
  assert.equal(result.receipt.eventCount,1);
  assert.equal(result.receipt.stateCount,2);
  assert.equal(result.receipt.transitionCount,1);
  assert.equal(result.receipt.coordinateSystem,'right_handed_y_up');
  assert.equal(result.receipt.units,'meters');
  assert.equal(result.receipt.rotationUnits,'degrees');
  assert.equal(result.receipt.retargeting,'none');
  assert.equal(verifyFallenAnimationImportReceipt(result.receipt),true);
});

test('canonical component digest is stable across non-semantic source array order',()=>{
  const first=baseAsset();
  const second=structuredClone(first);
  second.rig.bones.reverse();
  second.clips.reverse();
  second.states.reverse();

  const a=animationFromFallenAsset(first);
  const b=animationFromFallenAsset(second);

  assert.equal(a.receipt.componentDigest,b.receipt.componentDigest);
  assert.notEqual(a.receipt.sourceDigest,b.receipt.sourceDigest);
});

test('imported animation runs through deterministic state transitions and events',()=>{
  const {component}=animationFromFallenAsset(baseAsset());
  let runtime=initializeAnimationRuntime(component);

  assert.equal(runtime.stateId,'idle');
  assert.equal(runtime.events.length,0);

  setAnimationParameter(runtime,'wave',true);
  runtime=stepAnimationRuntime(component,runtime,.5);

  assert.equal(runtime.stateId,'wave');
  assert.equal(runtime.transition,null);
  assert.ok(Math.abs(runtime.stateTimeSec-.5)<1e-12);
  assert.equal(runtime.events.length,1);
  assert.equal(runtime.events[0].markerId,'wave-start');
  assert.equal(runtime.events[0].name,'wave_start');
  assert.deepEqual(runtime.events[0].payload,{hand:'right'});

  const hand=runtime.pose.find(pose=>pose.boneId==='hand');
  assert.ok(hand);
  assert.ok(Math.abs(hand!.rotationDeg.z-45)<1e-12);
});

test('animation import refuses implicit coordinate unit or rotation conversion',()=>{
  const coordinate={...baseAsset(),coordinateSystem:'left_handed_y_up' as any};
  assert.throws(
    ()=>animationFromFallenAsset(coordinate),
    /fallen_animation_coordinate_system_unsupported/
  );

  const units={...baseAsset(),units:'centimeters' as any};
  assert.throws(
    ()=>animationFromFallenAsset(units),
    /fallen_animation_units_unsupported/
  );

  const rotations={...baseAsset(),rotationUnits:'radians' as any};
  assert.throws(
    ()=>animationFromFallenAsset(rotations),
    /fallen_animation_rotation_units_unsupported/
  );
});

test('animation import preserves explicit provenance and refuses missing licensing state',()=>{
  const licensed=baseAsset();
  licensed.provenance={
    sourceRef:'library:licensed-animation:7',
    rightsState:'licensed',
    license:'Commercial Animation License 2026',
    attribution:'Motion House'
  };
  const result=animationFromFallenAsset(licensed);

  assert.equal(result.receipt.sourceRef,'library:licensed-animation:7');
  assert.equal(result.receipt.rightsState,'licensed');
  assert.equal(result.receipt.license,'Commercial Animation License 2026');
  assert.match(result.receipt.provenanceDigest,/^[a-f0-9]{64}$/);

  const missing=baseAsset();
  missing.provenance.license='';
  assert.throws(
    ()=>animationFromFallenAsset(missing),
    /fallen_animation_provenance_license_missing/
  );
});

test('invalid rig topology fails through the canonical animation validator',()=>{
  const source=baseAsset();
  source.rig.bones.find(bone=>bone.id==='hand')!.parentId='missing';

  assert.throws(
    ()=>animationFromFallenAsset(source),
    /animation_rig_parent_missing:hand:missing/
  );
});

test('unsorted authored keyframes fail closed instead of being silently reordered',()=>{
  const source=baseAsset();
  const wave=source.clips.find(clip=>clip.id==='wave')!;
  wave.tracks[0].rotationDeg=[
    {timeSec:.5,value:{x:0,y:0,z:45}},
    {timeSec:0,value:{x:0,y:0,z:0}}
  ];

  assert.throws(
    ()=>animationFromFallenAsset(source),
    /animation_unsorted_keyframes:wave:hand:rotation/
  );
});

test('import receipt detects provenance or component-lineage tampering',()=>{
  const receipt=animationFromFallenAsset(baseAsset()).receipt;
  assert.equal(verifyFallenAnimationImportReceipt(receipt),true);

  const tampered=structuredClone(receipt);
  tampered.rigId='rig:other';
  assert.equal(verifyFallenAnimationImportReceipt(tampered),false);
});
