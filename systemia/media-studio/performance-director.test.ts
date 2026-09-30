import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyPerformanceDirection,
  compilePerformancePlan,
  type PerformancePlanInput,
} from './performance-director.js';
import type { CinematicSequenceInput } from './cinematic-sequence.js';
import type { VisualReference } from './model-fabric.js';

function ref(id:string,role:'identity'|'environment'):VisualReference{
  return {id,kind:'image',role,sourceRefs:['fixture:'+id],locator:{kind:'url',value:'https://example.com/'+id+'.jpg'}};
}

function sequence():CinematicSequenceInput{
  return {
    schema:'evercraft.fallen.cinematic-sequence-input.v1',
    id:'dreamweaver-rescue',
    aspectRatio:'16:9',
    continuityDigest:'c'.repeat(64),
    identityReferences:{eli:[ref('eli','identity')],fox:[ref('fox','identity')]},
    environmentReferences:{bridge:[ref('bridge','environment')]},
    shots:[
      {
        id:'reach',needId:'need-reach',locationId:'bridge',durationSec:4,
        prompt:'Eli dives after the fox.',sourceRefs:['book:chapter-8'],
        actionContinuityId:'rescue',screenDirection:'left_to_right',
        characters:[
          {entityId:'eli',startZone:'left',endZone:'left',startFacing:'right',endFacing:'right',action:'dives'},
          {entityId:'fox',startZone:'right',endZone:'right',startFacing:'left',endFacing:'left',action:'falls'}
        ]
      },
      {
        id:'hold',needId:'need-hold',locationId:'bridge',durationSec:4,
        prompt:'Eli hangs onto the fox in the storm.',sourceRefs:['book:chapter-8'],
        actionContinuityId:'rescue',screenDirection:'left_to_right',
        dialogue:{speakerId:'eli',targetId:'fox'},
        characters:[
          {entityId:'eli',startZone:'left',endZone:'left',startFacing:'right',endFacing:'right',action:'strains to hold fox'},
          {entityId:'fox',startZone:'right',endZone:'right',startFacing:'left',endFacing:'left',action:'hangs in mist'}
        ]
      },
      {
        id:'flare',needId:'need-flare',locationId:'bridge',durationSec:5,
        prompt:'The ember enters the mask and the bridge is reborn.',sourceRefs:['book:chapter-8'],
        actionContinuityId:'rescue',screenDirection:'left_to_right',
        characters:[
          {entityId:'eli',startZone:'left',endZone:'center',startFacing:'right',endFacing:'camera',action:'pulls fox upward'},
          {entityId:'fox',startZone:'right',endZone:'center',startFacing:'left',endFacing:'camera',action:'returns to bridge'}
        ]
      }
    ]
  };
}

function performance():PerformancePlanInput{
  return {
    schema:'evercraft.fallen.performance-plan-input.v1',
    sequenceId:'dreamweaver-rescue',
    beats:[
      {
        shotId:'reach',entityId:'eli',objective:'Save the fox before it disappears into the mist',
        obstacle:'The bridge is collapsing under him',tactic:'Commit his entire body forward before fear can stop him',
        start:{valence:-.7,arousal:.9,control:.25},end:{valence:-.6,arousal:1,control:.35},
        continuity:'carry',gazeTarget:'fox',breath:'held',bodyEnergy:.95,gestureScale:.8,
        microActions:['jaw locks','eyes track the falling fox','fingers reach before the torso follows']
      },
      {
        shotId:'reach',entityId:'fox',objective:'Find Eli above the fog',tactic:'Reach upward and keep eye contact',
        start:{valence:-.5,arousal:.8,control:.2},end:{valence:-.6,arousal:.9,control:.15},
        continuity:'carry',gazeTarget:'eli',breath:'ragged',bodyEnergy:.8,gestureScale:.5,
        microActions:['claws search for purchase','ears pin back','tail flame gutters']
      },
      {
        shotId:'hold',entityId:'eli',objective:'Convince the fox and himself that he will not let go',
        obstacle:'Pain and the voices telling him to release it',tactic:'Turn panic into a deliberate promise',
        start:{valence:-.6,arousal:1,control:.35},end:{valence:-.25,arousal:.9,control:.65},
        continuity:'carry',gazeTarget:'fox',breath:'ragged',bodyEnergy:1,gestureScale:.55,
        microActions:['shoulder trembles under load','grip readjusts once','eyes stop darting and settle on the fox'],
        dialogueDelivery:{pace:'urgent',volume:'shout',subtext:'I am choosing you even if this costs me',pauseBeforeMs:120,pauseAfterMs:180}
      },
      {
        shotId:'hold',entityId:'fox',objective:'Trust Eli enough to stop fighting the grip',tactic:'Hold his gaze',
        start:{valence:-.6,arousal:.9,control:.15},end:{valence:-.25,arousal:.65,control:.4},
        continuity:'carry',gazeTarget:'eli',breath:'shallow',bodyEnergy:.55,gestureScale:.2,
        microActions:['struggling slows','eyes fix on Eli','one ember gathers at the mouth']
      },
      {
        shotId:'flare',entityId:'eli',objective:'Use the new light to pull them both to safety',
        obstacle:'The bridge is fading faster than he can climb',tactic:'Accept the ember and move with it',
        start:{valence:-.25,arousal:.9,control:.65},end:{valence:.55,arousal:.75,control:.8},
        continuity:'turn',trigger:'The fox ember enters the center of the mask',gazeTarget:'fox',
        breath:'recovering',bodyEnergy:.85,gestureScale:.45,
        microActions:['shock flashes once','breath catches at the flare','arms pull with renewed coordination']
      },
      {
        shotId:'flare',entityId:'fox',objective:'Complete the act of trust',tactic:'Yield the ember and let Eli carry the weight',
        start:{valence:-.25,arousal:.65,control:.4},end:{valence:.45,arousal:.5,control:.7},
        continuity:'turn',trigger:'The ember leaves the fox and enters the mask',gazeTarget:'eli',
        breath:'recovering',bodyEnergy:.45,gestureScale:.15,
        microActions:['body goes still during the ember transfer','tail dims then reignites','forehead leans toward Eli']
      }
    ]
  };
}

test('compiles a complete performance arc and injects it into cinematic prompts',()=>{
  const seq=sequence();
  const plan=compilePerformancePlan({sequence:seq,performance:performance()});
  assert.equal(plan.status,'accepted');
  assert.equal(plan.directions.length,6);
  const directed=applyPerformanceDirection({sequence:seq,plan});
  assert.match(directed.shots[1].prompt,/FALLEN PERFORMANCE DIRECTOR/);
  assert.match(directed.shots[1].prompt,/Objective: Convince the fox and himself/);
  assert.match(directed.shots[1].prompt,/subtext=I am choosing you even if this costs me/);
  assert.match(directed.shots[1].prompt,/Avoid repetitive blinking, lip flutter/);
});

test('visible character without a directed performance fails closed',()=>{
  const seq=sequence();
  const perf=performance();
  perf.beats=perf.beats.filter(beat=>!(beat.shotId==='reach'&&beat.entityId==='fox'));
  const plan=compilePerformancePlan({sequence:seq,performance:perf});
  assert.equal(plan.status,'rejected');
  assert.ok(plan.errors.includes('visible_character_performance_missing:reach:fox'));
});

test('dialogue requires delivery direction rather than an emotion label alone',()=>{
  const seq=sequence();
  const perf=performance();
  const beat=perf.beats.find(item=>item.shotId==='hold'&&item.entityId==='eli');
  if(beat) beat.dialogueDelivery=undefined;
  const plan=compilePerformancePlan({sequence:seq,performance:perf});
  assert.equal(plan.status,'rejected');
  assert.ok(plan.errors.includes('dialogue_performance_missing:hold:eli'));
});

test('carry continuity rejects an unexplained emotional teleport',()=>{
  const seq=sequence();
  const perf=performance();
  const beat=perf.beats.find(item=>item.shotId==='hold'&&item.entityId==='fox');
  if(beat) beat.start={valence:1,arousal:.05,control:1};
  const plan=compilePerformancePlan({sequence:seq,performance:perf});
  assert.equal(plan.status,'rejected');
  assert.ok(plan.errors.some(error=>error.startsWith('performance_emotional_teleport:reach->hold:fox')));
});

test('a dramatic turn must name the story trigger that earns it',()=>{
  const seq=sequence();
  const perf=performance();
  const beat=perf.beats.find(item=>item.shotId==='flare'&&item.entityId==='eli');
  if(beat) beat.trigger='';
  const plan=compilePerformancePlan({sequence:seq,performance:perf});
  assert.equal(plan.status,'rejected');
  assert.ok(plan.errors.includes('performance_transition_trigger_missing:flare|eli'));
});

test('dialogue eyeline target must agree with the scripted target',()=>{
  const seq=sequence();
  const perf=performance();
  const beat=perf.beats.find(item=>item.shotId==='hold'&&item.entityId==='eli');
  if(beat) beat.gazeTarget='storm';
  const plan=compilePerformancePlan({sequence:seq,performance:perf});
  assert.equal(plan.status,'rejected');
  assert.ok(plan.errors.includes('dialogue_gaze_target_mismatch:hold:eli'));
});
