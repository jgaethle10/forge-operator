import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCinematicVisualRequest,
  compileCinematicSequence,
  type CinematicSequenceInput,
} from './cinematic-sequence.js';
import type { VisualReference } from './model-fabric.js';

function imageRef(id:string,role:'identity'|'environment'|'start_frame'):VisualReference{
  return {
    id,
    kind:'image',
    role,
    digest:'a'.repeat(64),
    sourceRefs:['fixture:'+id],
    locator:{kind:'url',value:'https://example.com/'+id+'.png'},
  };
}

function baseInput():CinematicSequenceInput{
  return {
    schema:'evercraft.fallen.cinematic-sequence-input.v1',
    id:'bridge-rescue',
    aspectRatio:'16:9',
    continuityDigest:'c'.repeat(64),
    identityReferences:{
      eli:[imageRef('eli','identity')],
      fox:[imageRef('fox','identity')],
    },
    environmentReferences:{
      bridge:[imageRef('bridge','environment')],
    },
    shots:[
      {
        id:'shot-1',
        needId:'need-1',
        locationId:'bridge',
        durationSec:4,
        prompt:'Eli reaches for the falling fox as the bridge fractures.',
        sourceRefs:['book:chapter-8'],
        shotScale:'wide',
        lensMm:32,
        cameraMovement:'follow',
        screenDirection:'left_to_right',
        actionContinuityId:'rescue-grab',
        characters:[
          {entityId:'eli',startZone:'left',endZone:'left',startFacing:'right',endFacing:'right',eyeline:'offscreen_right',action:'lunges toward fox'},
          {entityId:'fox',startZone:'right',endZone:'right',startFacing:'left',endFacing:'left',action:'falls below bridge'},
        ],
      },
      {
        id:'shot-2',
        needId:'need-2',
        locationId:'bridge',
        durationSec:3,
        prompt:'Close coverage of Eli catching the fox at the last instant.',
        sourceRefs:['book:chapter-8'],
        shotScale:'close',
        lensMm:85,
        cameraMovement:'handheld',
        screenDirection:'left_to_right',
        actionContinuityId:'rescue-grab',
        characters:[
          {entityId:'eli',startZone:'left',endZone:'left',startFacing:'right',endFacing:'right',eyeline:'offscreen_right',action:'catches fox'},
          {entityId:'fox',startZone:'right',endZone:'right',startFacing:'left',endFacing:'left',action:'dangles below bridge'},
        ],
      },
      {
        id:'shot-3',
        needId:'need-3',
        locationId:'bridge',
        durationSec:4,
        prompt:'The mask flares and amber bridge ribs rise out of the storm.',
        sourceRefs:['book:chapter-8'],
        shotScale:'medium_wide',
        lensMm:40,
        cameraMovement:'dolly_out',
        screenDirection:'left_to_right',
        actionContinuityId:'rescue-grab',
        characters:[
          {entityId:'eli',startZone:'left',endZone:'center',startFacing:'right',endFacing:'camera',action:'pulls fox to safety'},
          {entityId:'fox',startZone:'right',endZone:'center',startFacing:'left',endFacing:'camera',action:'lands beside Eli'},
        ],
      },
    ],
  };
}

test('compiles continuity-bound cinematic shots with carry-in frame requirements',()=>{
  const plan=compileCinematicSequence(baseInput());
  assert.equal(plan.status,'accepted');
  assert.equal(plan.shots.length,3);
  assert.equal(plan.shots[0].mustProvideStartFrame,false);
  assert.equal(plan.shots[1].carryInFromShotId,'shot-1');
  assert.equal(plan.shots[1].mustProvideStartFrame,true);
  assert.match(plan.shots[1].prompt,/begin from the verified end frame of shot-1/);
  assert.equal(plan.shots[1].lensMm,85);
  assert.equal(plan.boundaries.axisCrossingFailsClosed,true);
});

test('rejects an axis flip inside the same continuous action',()=>{
  const input=baseInput();
  input.shots[1].screenDirection='right_to_left';
  const plan=compileCinematicSequence(input);
  assert.equal(plan.status,'rejected');
  assert.ok(plan.errors.includes('axis_cross_without_reset:shot-1->shot-2'));
});

test('rejects body-position discontinuity across an action-matched cut',()=>{
  const input=baseInput();
  input.shots[1].characters[0].startZone='right';
  const plan=compileCinematicSequence(input);
  assert.equal(plan.status,'rejected');
  assert.ok(plan.errors.includes('action_position_discontinuity:shot-1->shot-2:eli'));
});

test('axis reset permits a deliberate geography reset',()=>{
  const input=baseInput();
  input.shots[1].screenDirection='right_to_left';
  input.shots[1].axisReset=true;
  input.shots[1].actionContinuityId=undefined;
  input.shots[2].screenDirection='right_to_left';
  const plan=compileCinematicSequence(input);
  assert.equal(plan.status,'accepted');
  assert.equal(plan.shots[1].mustProvideStartFrame,false);
});

test('continuous shot request fails closed without the prior selected end frame',()=>{
  const plan=compileCinematicSequence(baseInput());
  assert.throws(
    ()=>buildCinematicVisualRequest(plan.shots[1]),
    /cinematic_start_frame_required:shot-2:shot-1/
  );
});

test('binds the previous selected end frame into the next model request',()=>{
  const plan=compileCinematicSequence(baseInput());
  const request=buildCinematicVisualRequest(plan.shots[1],{
    startFrame:imageRef('shot-1-end','start_frame'),
    targetResolution:'1920x1080',
  });
  assert.equal(request.task,'video');
  assert.equal(request.targetResolution,'1920x1080');
  assert.ok(request.requiredInputModes?.includes('start_frame'));
  assert.ok(request.references.some(ref=>ref.role==='start_frame'));
  assert.ok(request.references.some(ref=>ref.role==='identity'&&ref.id==='eli'));
  assert.ok(request.references.some(ref=>ref.role==='environment'&&ref.id==='bridge'));
  assert.ok(request.requires.includes('reference_identity'));
  assert.ok(request.requires.includes('reference_environment'));
  assert.equal(request.candidateCount,4);
  assert.equal(request.modelDiversity,2);
});

test('requires identity and environment references rather than silently generating around them',()=>{
  const input=baseInput();
  input.identityReferences.eli=[];
  input.environmentReferences.bridge=[];
  const plan=compileCinematicSequence(input);
  assert.equal(plan.status,'rejected');
  assert.ok(plan.errors.includes('identity_reference_missing:shot-1:eli'));
  assert.ok(plan.errors.includes('environment_reference_missing:shot-1:bridge'));
});
