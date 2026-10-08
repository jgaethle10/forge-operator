import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import {
  PULSEGRID_ARRANGEMENT_BARS,
  PULSEGRID_ENGINE_VERSION,
  PULSEGRID_SESSION_SCHEMA,
  PULSEGRID_STEPS_PER_BAR,
  applyPulseGridOperation,
  applyPulseGridTransaction,
  createPulseGridSession,
  migratePulseGridSession,
  validatePulseGridSession,
  undoPulseGridReceipt,
} from './pulsegrid-session.js';

test('PulseGrid creates a valid canonical Fallen music session',()=>{
  const session=createPulseGridSession('Proof Song');
  assert.equal(session.schema,PULSEGRID_SESSION_SCHEMA);
  assert.equal(session.version,PULSEGRID_ENGINE_VERSION);
  assert.equal(session.project_name,'Proof Song');
  assert.equal(session.tracks.length,5);
  assert.equal(session.tracks[0].clips.length,4);
  assert.equal(session.tracks[0].clips[0].bars,1);
  assert.equal(session.tracks[0].clips[0].steps.length,PULSEGRID_STEPS_PER_BAR);
  assert.equal(validatePulseGridSession(session).ok,true);
});

test('PulseGrid migrates older sparse browser sessions into the canonical graph',()=>{
  const migrated=migratePulseGridSession({
    version:'0.3.0',
    projectName:'Old Session',
    bpm:128,
    tracks:[{
      id:'keys',
      name:'Keys',
      type:'synth',
      clips:[{id:'keys-scene-1',steps:[1,0,0,0]}]
    }]
  });
  assert.equal(migrated.version,PULSEGRID_ENGINE_VERSION);
  assert.equal(migrated.transport.bpm,128);
  assert.equal(migrated.tracks[0].clips[0].bars,1);
  assert.equal(migrated.tracks[0].clips[0].steps.length,16);
  assert.equal(migrated.tracks[0].clips[0].probabilities.length,16);
  assert.equal(validatePulseGridSession(migrated).ok,true);
});

test('PulseGrid infers multi-bar length from legacy clip data',()=>{
  const migrated=migratePulseGridSession({
    project_name:'Long Clip',
    tracks:[{
      id:'keys',name:'Keys',type:'synth',
      clips:[{
        id:'keys-scene-1',
        steps:Array.from({length:48},(_,i)=>i===32?1:0),
        notes:[{pitch:72,start:40,length:4}]
      }]
    }]
  });
  const clip=migrated.tracks[0].clips[0];
  assert.equal(clip.bars,3);
  assert.equal(clip.steps.length,48);
  assert.equal(clip.notes[0].start,40);
  assert.equal(validatePulseGridSession(migrated).ok,true);
});

test('PulseGrid legacy filter command remains a device-graph compatibility alias',()=>{
  const original=createPulseGridSession();
  const originalBass=original.tracks.find((track)=>track.id==='bass')!;
  const originalFilter=originalBass.devices.find((device)=>device.type==='filter');
  assert.equal(originalFilter?.type==='filter'?originalFilter.parameters.frequency:null,1200);

  const {session,receipt}=applyPulseGridOperation(original,{type:'track.set_filter',track_id:'bass',filter_hz:880},'agent');
  const bass=session.tracks.find((track)=>track.id==='bass')!;
  const filter=bass.devices.find((device)=>device.type==='filter');
  assert.equal(filter?.type==='filter'?filter.parameters.frequency:null,880);
  assert.equal(receipt.actor,'agent');
  assert.equal(receipt.reversible,true);
  assert.deepEqual(receipt.targets,['track:bass.device:bass-filter.parameters.frequency']);
});


test('PulseGrid expands and shrinks clips without corrupting graph state',()=>{
  let session=createPulseGridSession();
  ({session}=applyPulseGridOperation(session,{type:'clip.set_bars',track_id:'keys',scene:0,bars:4}));
  ({session}=applyPulseGridOperation(session,{type:'clip.set_step',track_id:'keys',scene:0,step:47,velocity:.91}));
  ({session}=applyPulseGridOperation(session,{
    type:'note.add',track_id:'keys',scene:0,
    note:{id:'late-note',pitch:74,start:50,length:6},
  }));
  let clip=session.tracks.find((track)=>track.id==='keys')!.clips[0];
  assert.equal(clip.bars,4);
  assert.equal(clip.steps.length,64);
  assert.equal(clip.steps[47],.91);
  assert.equal(clip.notes.length,1);

  ({session}=applyPulseGridOperation(session,{type:'clip.set_bars',track_id:'keys',scene:0,bars:2}));
  clip=session.tracks.find((track)=>track.id==='keys')!.clips[0];
  assert.equal(clip.bars,2);
  assert.equal(clip.steps.length,32);
  assert.equal(clip.notes.length,0);
  assert.equal(validatePulseGridSession(session).ok,true);
});

test('PulseGrid note lifecycle is semantic, bounded and reversible',()=>{
  const original=createPulseGridSession();
  let result=applyPulseGridOperation(original,{type:'clip.set_bars',track_id:'keys',scene:0,bars:2},'human');
  let session=result.session;

  result=applyPulseGridOperation(session,{
    type:'note.add',track_id:'keys',scene:0,
    note:{id:'n-1',pitch:64,start:12,length:3,velocity:.8},
  },'agent');
  session=result.session;
  assert.equal(result.receipt.actor,'agent');
  assert.equal(result.receipt.before,null);

  result=applyPulseGridOperation(session,{
    type:'note.move',track_id:'keys',scene:0,note_id:'n-1',start:28,pitch:69,
  },'controller');
  session=result.session;
  let note=session.tracks.find((track)=>track.id==='keys')!.clips[0].notes[0];
  assert.equal(note.start,28);
  assert.equal(note.pitch,69);
  assert.equal(note.length,3);

  result=applyPulseGridOperation(session,{
    type:'note.resize',track_id:'keys',scene:0,note_id:'n-1',length:20,
  });
  session=result.session;
  note=session.tracks.find((track)=>track.id==='keys')!.clips[0].notes[0];
  assert.equal(note.length,4);

  result=applyPulseGridOperation(session,{
    type:'note.delete',track_id:'keys',scene:0,note_id:'n-1',
  });
  session=result.session;
  assert.equal(session.tracks.find((track)=>track.id==='keys')!.clips[0].notes.length,0);
  assert.equal(result.receipt.after,null);
  assert.equal(result.receipt.reversible,true);
  assert.equal(original.tracks.find((track)=>track.id==='keys')!.clips[0].notes.length,0);
  assert.equal(validatePulseGridSession(session).ok,true);
});


test('PulseGrid executable undo restores destructive clip shrink exactly',()=>{
  let session=createPulseGridSession('Undo Proof');
  ({session}=applyPulseGridOperation(session,{type:'clip.set_bars',track_id:'keys',scene:0,bars:4}));
  ({session}=applyPulseGridOperation(session,{
    type:'note.add',track_id:'keys',scene:0,
    note:{id:'survivor',pitch:67,start:12,length:4,velocity:.8},
  }));
  ({session}=applyPulseGridOperation(session,{
    type:'note.add',track_id:'keys',scene:0,
    note:{id:'late',pitch:76,start:50,length:8,velocity:.7},
  }));
  const beforeShrink=structuredClone(session.tracks.find((track)=>track.id==='keys')!.clips[0]);

  const shrink=applyPulseGridOperation(session,{type:'clip.set_bars',track_id:'keys',scene:0,bars:2},'agent');
  session=shrink.session;
  assert.equal(session.tracks.find((track)=>track.id==='keys')!.clips[0].notes.some((note)=>note.id==='late'),false);
  assert.equal(shrink.receipt.request?.type,'clip.set_bars');

  const undone=undoPulseGridReceipt(session,shrink.receipt.id,'human');
  const restored=undone.session.tracks.find((track)=>track.id==='keys')!.clips[0];
  assert.deepEqual(restored,beforeShrink);
  assert.equal(undone.receipt.operation,'operation.undo');
  assert.equal(undone.receipt.undo_of,shrink.receipt.id);
  assert.equal(undone.receipt.reversible,false);
  assert.equal(validatePulseGridSession(undone.session).ok,true);
});

test('PulseGrid executable undo restores note add move resize and delete operations',()=>{
  let session=createPulseGridSession('Note Undo');
  const baseline=structuredClone(session.tracks.find((track)=>track.id==='keys')!.clips[0].notes);

  let result=applyPulseGridOperation(session,{
    type:'note.add',track_id:'keys',scene:0,
    note:{id:'n-undo',pitch:60,start:2,length:2,velocity:.6},
  },'agent');
  session=result.session;
  session=undoPulseGridReceipt(session,result.receipt.id).session;
  assert.deepEqual(session.tracks.find((track)=>track.id==='keys')!.clips[0].notes,baseline);

  result=applyPulseGridOperation(session,{
    type:'note.add',track_id:'keys',scene:0,
    note:{id:'n-undo',pitch:60,start:2,length:2,velocity:.6},
  });
  session=result.session;

  const beforeMove=structuredClone(session.tracks.find((track)=>track.id==='keys')!.clips[0].notes[0]);
  result=applyPulseGridOperation(session,{
    type:'note.move',track_id:'keys',scene:0,note_id:'n-undo',start:6,pitch:65,
  });
  session=undoPulseGridReceipt(result.session,result.receipt.id).session;
  assert.deepEqual(session.tracks.find((track)=>track.id==='keys')!.clips[0].notes[0],beforeMove);

  const beforeResize=structuredClone(session.tracks.find((track)=>track.id==='keys')!.clips[0].notes[0]);
  result=applyPulseGridOperation(session,{
    type:'note.resize',track_id:'keys',scene:0,note_id:'n-undo',length:5,
  });
  session=undoPulseGridReceipt(result.session,result.receipt.id).session;
  assert.deepEqual(session.tracks.find((track)=>track.id==='keys')!.clips[0].notes[0],beforeResize);

  const beforeDelete=structuredClone(session.tracks.find((track)=>track.id==='keys')!.clips[0].notes[0]);
  result=applyPulseGridOperation(session,{
    type:'note.delete',track_id:'keys',scene:0,note_id:'n-undo',
  });
  session=undoPulseGridReceipt(result.session,result.receipt.id).session;
  assert.deepEqual(session.tracks.find((track)=>track.id==='keys')!.clips[0].notes[0],beforeDelete);
  assert.equal(validatePulseGridSession(session).ok,true);
});


test('PulseGrid variation fork preserves source and records lineage',()=>{
  let session=createPulseGridSession('Variation Proof');
  ({session}=applyPulseGridOperation(session,{type:'clip.set_bars',track_id:'bass',scene:0,bars:2}));
  ({session}=applyPulseGridOperation(session,{
    type:'note.add',track_id:'bass',scene:0,
    note:{id:'root-note',pitch:40,start:4,length:3,velocity:.9},
  }));
  const sourceBefore=structuredClone(session.tracks.find((track)=>track.id==='bass')!.clips[0]);
  const destinationBefore=structuredClone(session.tracks.find((track)=>track.id==='bass')!.clips[1]);

  const forked=applyPulseGridOperation(session,{
    type:'clip.fork_variation',
    track_id:'bass',
    source_scene:0,
    destination_scene:1,
    name:'Bass Alt A',
  },'agent');
  session=forked.session;

  const track=session.tracks.find((candidate)=>candidate.id==='bass')!;
  const source=track.clips[0];
  const variation=track.clips[1];

  assert.deepEqual(source,sourceBefore);
  assert.notEqual(variation.id,source.id);
  assert.equal(variation.name,'Bass Alt A');
  assert.deepEqual(variation.notes,source.notes);
  assert.equal(variation.provenance.kind,'variation');
  assert.equal(variation.provenance.parent_clip_id,source.id);
  assert.equal(variation.provenance.parent_scene,0);
  assert.equal(variation.provenance.forked_by,'agent');
  assert.equal(forked.receipt.request?.type,'clip.fork_variation');

  const changed=applyPulseGridOperation(session,{
    type:'note.move',track_id:'bass',scene:1,note_id:'root-note',start:10,pitch:43,
  });
  const changedTrack=changed.session.tracks.find((candidate)=>candidate.id==='bass')!;
  assert.equal(changedTrack.clips[1].notes[0].start,10);
  assert.equal(changedTrack.clips[0].notes[0].start,4);

  const undone=undoPulseGridReceipt(session,forked.receipt.id);
  assert.deepEqual(undone.session.tracks.find((candidate)=>candidate.id==='bass')!.clips[1],destinationBefore);
  assert.equal(validatePulseGridSession(undone.session).ok,true);
});

test('PulseGrid refuses to fork a variation onto its source scene',()=>{
  const session=createPulseGridSession();
  assert.throws(()=>applyPulseGridOperation(session,{
    type:'clip.fork_variation',
    track_id:'keys',
    source_scene:0,
    destination_scene:0,
  }),/different destination scene/);
});


test('PulseGrid atomic edit plan commits as one reversible intent boundary',()=>{
  const original=createPulseGridSession('Atomic Chorus');
  const originalKeys=original.tracks.find((track)=>track.id==='keys')!;
  const filter=originalKeys.devices.find((device)=>device.type==='filter')!;
  const delay=originalKeys.devices.find((device)=>device.type==='delay')!;
  const result=applyPulseGridTransaction(original,{
    transaction_id:'tx-chorus-1',
    intent:'Make the chorus hit harder without overwriting the source.',
    operations:[
      {type:'clip.fork_variation',track_id:'keys',source_scene:0,destination_scene:1,name:'Chorus Lift'},
      {type:'clip.set_bars',track_id:'keys',scene:1,bars:2},
      {type:'note.add',track_id:'keys',scene:1,note:{id:'lift-note',pitch:72,start:20,length:4,velocity:.94}},
      {type:'device.set_parameter',track_id:'keys',device_id:filter.id,parameter:'frequency',value:9800},
      {type:'device.set_parameter',track_id:'keys',device_id:delay.id,parameter:'mix',value:.18},
    ],
  },'agent');

  assert.equal(original.tracks.find((track)=>track.id==='keys')!.clips[1].notes.length,0);
  assert.equal(result.receipt.operation,'transaction.apply');
  assert.equal(result.receipt.transaction_id,'tx-chorus-1');
  assert.equal(result.receipt.intent,'Make the chorus hit harder without overwriting the source.');
  assert.equal(result.receipt.child_receipt_ids?.length,5);
  assert.equal(result.child_receipts.length,5);
  assert.ok(result.child_receipts.every((receipt)=>receipt.transaction_id==='tx-chorus-1'));
  assert.ok(result.child_receipts.every((receipt)=>receipt.intent===result.receipt.intent));

  const keys=result.session.tracks.find((track)=>track.id==='keys')!;
  assert.equal(keys.clips[1].name,'Chorus Lift');
  assert.equal(keys.clips[1].bars,2);
  assert.equal(keys.clips[1].notes.some((note)=>note.id==='lift-note'),true);
  const editedFilter=keys.devices.find((device)=>device.type==='filter');
  const editedDelay=keys.devices.find((device)=>device.type==='delay');
  assert.equal(editedFilter?.type==='filter'?editedFilter.parameters.frequency:null,9800);
  assert.equal(editedDelay?.type==='delay'?editedDelay.parameters.mix:null,.18);
  assert.equal(validatePulseGridSession(result.session).ok,true);

  const undone=undoPulseGridReceipt(result.session,result.receipt.id,'human');
  assert.equal(undone.receipt.operation,'operation.undo');
  assert.equal(undone.receipt.transaction_id,'tx-chorus-1');
  assert.equal(undone.receipt.undo_of,result.receipt.id);

  const restored=undone.session;
  assert.deepEqual(restored.tracks,original.tracks);
  assert.deepEqual(restored.transport,original.transport);
  assert.deepEqual(restored.arrangement,original.arrangement);
  assert.equal(restored.active_scene,original.active_scene);
  assert.equal(validatePulseGridSession(restored).ok,true);
});

test('PulseGrid atomic edit plan rolls back completely when any child operation fails',()=>{
  const original=createPulseGridSession('Rollback Proof');
  const snapshot=structuredClone(original);

  assert.throws(()=>applyPulseGridTransaction(original,{
    transaction_id:'tx-fail-1',
    intent:'This plan must fail atomically.',
    operations:[
      {type:'transport.set_tempo',bpm:146},
      {type:'track.set_filter',track_id:'bass',filter_hz:720},
      {type:'note.move',track_id:'keys',scene:0,note_id:'does-not-exist',start:4,pitch:64},
      {type:'transport.set_swing',swing:18},
    ],
  },'agent'),/Unknown PulseGrid note/);

  assert.deepEqual(original,snapshot);
  assert.equal(original.transport.bpm,120);
  const rollbackFilter=original.tracks.find((track)=>track.id==='bass')!.devices.find((device)=>device.type==='filter');
  assert.equal(rollbackFilter?.type==='filter'?rollbackFilter.parameters.frequency:null,1200);
  assert.equal(original.receipts.length,0);
});

test('PulseGrid atomic edit plan enforces explicit intent and bounded plan size',()=>{
  const session=createPulseGridSession();
  assert.throws(()=>applyPulseGridTransaction(session,{
    intent:'   ',
    operations:[{type:'transport.set_tempo',bpm:130}],
  }),/intent is required/);

  assert.throws(()=>applyPulseGridTransaction(session,{
    intent:'Too many edits',
    operations:Array.from({length:129},()=>({type:'transport.set_tempo',bpm:130} as const)),
  }),/128-operation safety limit/);
});


test('PulseGrid canonical core bundles for the browser without Node built-ins',async()=>{
  const result=await build({
    entryPoints:['systemia/media-studio/pulsegrid-browser.ts'],
    bundle:true,
    platform:'browser',
    format:'esm',
    target:'es2022',
    write:false,
    logLevel:'silent',
  });
  assert.equal(result.errors.length,0);
  assert.equal(result.outputFiles.length,1);
  const output=result.outputFiles[0].text;
  assert.match(output,/PULSEGRID_ENGINE_VERSION/);
  assert.doesNotMatch(output,/node:crypto/);
});


test('PulseGrid note expression edits are bounded, receipt-backed and reversible',()=>{
  let session=createPulseGridSession('Expression Proof');
  let result=applyPulseGridOperation(session,{
    type:'note.add',track_id:'keys',scene:0,
    note:{id:'expr-note',pitch:67,start:4,length:2,velocity:.5,probability:.8,microtiming:10},
  },'controller');
  session=result.session;
  const before=structuredClone(session.tracks.find((track)=>track.id==='keys')!.clips[0].notes[0]);

  result=applyPulseGridOperation(session,{
    type:'note.set_expression',
    track_id:'keys',
    scene:0,
    note_id:'expr-note',
    velocity:1.8,
    probability:-1,
    microtiming:1600,
  },'human');
  session=result.session;
  const edited=session.tracks.find((track)=>track.id==='keys')!.clips[0].notes[0];
  assert.equal(edited.velocity,1);
  assert.equal(edited.probability,0);
  assert.equal(edited.microtiming,1000);
  assert.equal(result.receipt.operation,'note.set_expression');
  assert.deepEqual(result.receipt.targets,[`clip:${session.tracks.find((track)=>track.id==='keys')!.clips[0].id}.note:expr-note.expression`]);

  const undone=undoPulseGridReceipt(session,result.receipt.id,'human');
  assert.deepEqual(
    undone.session.tracks.find((track)=>track.id==='keys')!.clips[0].notes[0],
    before,
  );
  assert.equal(validatePulseGridSession(undone.session).ok,true);
});

test('PulseGrid rejects empty note expression operations',()=>{
  let session=createPulseGridSession();
  session=applyPulseGridOperation(session,{
    type:'note.add',track_id:'keys',scene:0,
    note:{id:'expr-empty',pitch:60,start:0},
  }).session;
  assert.throws(()=>applyPulseGridOperation(session,{
    type:'note.set_expression',
    track_id:'keys',
    scene:0,
    note_id:'expr-empty',
  }),/requires at least one value/);
});


test('PulseGrid automation point edits are bounded, targeted and reversible',()=>{
  let session=createPulseGridSession('Automation Proof');
  const clip=session.tracks.find((track)=>track.id==='keys')!.clips[0];
  const before=clip.automation.filter[3];

  const result=applyPulseGridOperation(session,{
    type:'clip.set_automation_point',
    track_id:'keys',
    scene:0,
    parameter:'filter',
    step:3,
    value:2.5,
  },'human');
  session=result.session;
  const edited=session.tracks.find((track)=>track.id==='keys')!.clips[0];
  assert.equal(edited.automation.filter[3],1);
  assert.equal(result.receipt.before,before);
  assert.equal(result.receipt.after,1);
  assert.deepEqual(result.receipt.targets,[`clip:${edited.id}.automation.filter[3]`]);

  const undone=undoPulseGridReceipt(session,result.receipt.id,'human');
  assert.equal(
    undone.session.tracks.find((track)=>track.id==='keys')!.clips[0].automation.filter[3],
    before,
  );
  assert.equal(validatePulseGridSession(undone.session).ok,true);
});

test('PulseGrid automation rejects out-of-range steps and clamps lane values',()=>{
  const session=createPulseGridSession();
  assert.throws(()=>applyPulseGridOperation(session,{
    type:'clip.set_automation_point',
    track_id:'keys',
    scene:0,
    parameter:'volume',
    step:999,
    value:.5,
  }),/automation step is out of range/);

  const result=applyPulseGridOperation(session,{
    type:'clip.set_automation_point',
    track_id:'keys',
    scene:0,
    parameter:'volume',
    step:0,
    value:-4,
  });
  assert.equal(result.session.tracks.find((track)=>track.id==='keys')!.clips[0].automation.volume[0],0);
});


test('PulseGrid step expression edits are bounded, atomic and reversible',()=>{
  let session=createPulseGridSession('Step Expression Proof');
  session=applyPulseGridOperation(session,{
    type:'clip.set_step',
    track_id:'drums',
    scene:0,
    step:2,
    velocity:.6,
  }).session;
  const beforeClip=session.tracks.find((track)=>track.id==='drums')!.clips[0];
  const before={
    velocity:beforeClip.steps[2],
    probability:beforeClip.probabilities[2],
    microtiming:beforeClip.microtiming[2],
  };

  const result=applyPulseGridOperation(session,{
    type:'clip.set_step_expression',
    track_id:'drums',
    scene:0,
    step:2,
    velocity:1.8,
    probability:-.5,
    microtiming:1400,
  },'human');
  session=result.session;
  const edited=session.tracks.find((track)=>track.id==='drums')!.clips[0];
  assert.equal(edited.steps[2],1);
  assert.equal(edited.probabilities[2],0);
  assert.equal(edited.microtiming[2],1000);
  assert.deepEqual(result.receipt.before,before);
  assert.deepEqual(result.receipt.targets,[`clip:${edited.id}.step_expression[2]`]);

  const undone=undoPulseGridReceipt(session,result.receipt.id,'human');
  const restored=undone.session.tracks.find((track)=>track.id==='drums')!.clips[0];
  assert.equal(restored.steps[2],before.velocity);
  assert.equal(restored.probabilities[2],before.probability);
  assert.equal(restored.microtiming[2],before.microtiming);
  assert.equal(validatePulseGridSession(undone.session).ok,true);
});

test('PulseGrid step expression rejects empty edits and invalid indexes',()=>{
  const session=createPulseGridSession();
  assert.throws(()=>applyPulseGridOperation(session,{
    type:'clip.set_step_expression',
    track_id:'drums',
    scene:0,
    step:0,
  }),/requires at least one value/);
  assert.throws(()=>applyPulseGridOperation(session,{
    type:'clip.set_step_expression',
    track_id:'drums',
    scene:0,
    step:999,
    velocity:.5,
  }),/step expression index is out of range/);
});


test('PulseGrid arrangement slots are canonical, targeted and reversible',()=>{
  let session=createPulseGridSession('Arrangement Proof');
  assert.equal(session.arrangement.length,session.tracks.length);
  assert.equal(session.arrangement[0].length,PULSEGRID_ARRANGEMENT_BARS);

  const result=applyPulseGridOperation(session,{
    type:'arrangement.set_slot',
    track_id:'keys',
    bar:3,
    scene:2,
  },'human');
  session=result.session;
  const trackIndex=session.tracks.findIndex((track)=>track.id==='keys');
  assert.equal(session.arrangement[trackIndex][3],2);
  assert.equal(result.receipt.before,null);
  assert.equal(result.receipt.after,2);
  assert.deepEqual(result.receipt.targets,['arrangement:keys.bar:3']);

  const undone=undoPulseGridReceipt(session,result.receipt.id,'human');
  assert.equal(undone.session.arrangement[trackIndex][3],null);
  assert.equal(validatePulseGridSession(undone.session).ok,true);
});

test('PulseGrid arrangement slots reject invalid bars and scenes',()=>{
  const session=createPulseGridSession();
  assert.throws(()=>applyPulseGridOperation(session,{
    type:'arrangement.set_slot',
    track_id:'keys',
    bar:PULSEGRID_ARRANGEMENT_BARS,
    scene:0,
  }),/arrangement bar is out of range/);
  assert.throws(()=>applyPulseGridOperation(session,{
    type:'arrangement.set_slot',
    track_id:'keys',
    bar:0,
    scene:999,
  }),/arrangement scene is out of range/);
});

test('PulseGrid validation rejects malformed arrangement rows and scene references',()=>{
  const malformed=createPulseGridSession();
  malformed.arrangement[0]=[0];
  let validation=validatePulseGridSession(malformed);
  assert.equal(validation.ok,false);
  assert.ok(validation.errors.some((error)=>error.includes('arrangement.0.length')));

  const invalidScene=createPulseGridSession();
  invalidScene.arrangement[0][0]=999;
  validation=validatePulseGridSession(invalidScene);
  assert.equal(validation.ok,false);
  assert.ok(validation.errors.includes('arrangement.0.0'));
});


test('PulseGrid canonical tracks store DSP only in typed device chains',()=>{
  const session=createPulseGridSession('Device Graph Proof');
  for(const track of session.tracks){
    assert.equal('filterHz' in track,false);
    assert.equal('delayMix' in track,false);
    assert.equal('delayTime' in track,false);
    assert.equal('delayFeedback' in track,false);
    assert.equal(track.devices.length,2);
    assert.equal(track.devices.filter((device)=>device.type==='filter').length,1);
    assert.equal(track.devices.filter((device)=>device.type==='delay').length,1);
  }
  assert.equal(validatePulseGridSession(session).ok,true);
});

test('PulseGrid migrates legacy DSP fields into canonical devices once',()=>{
  const migrated=migratePulseGridSession({
    project_name:'Legacy DSP',
    tracks:[{
      id:'keys',
      name:'Keys',
      type:'synth',
      filterHz:4321,
      delayMix:.31,
      delayTime:.42,
      delayFeedback:.37,
      clips:[],
    }],
  });
  const keys=migrated.tracks[0];
  const filter=keys.devices.find((device)=>device.type==='filter');
  const delay=keys.devices.find((device)=>device.type==='delay');
  assert.equal(filter?.type==='filter'?filter.parameters.frequency:null,4321);
  assert.equal(delay?.type==='delay'?delay.parameters.mix:null,.31);
  assert.equal(delay?.type==='delay'?delay.parameters.time:null,.42);
  assert.equal(delay?.type==='delay'?delay.parameters.feedback:null,.37);
  assert.equal('filterHz' in keys,false);
  assert.equal(validatePulseGridSession(migrated).ok,true);
});

test('PulseGrid generic device parameter edits are bounded, targeted and reversible',()=>{
  let session=createPulseGridSession('Device Edit');
  const keys=session.tracks.find((track)=>track.id==='keys')!;
  const filter=keys.devices.find((device)=>device.type==='filter')!;
  const result=applyPulseGridOperation(session,{
    type:'device.set_parameter',
    track_id:'keys',
    device_id:filter.id,
    parameter:'frequency',
    value:99999,
  },'human');
  session=result.session;
  const edited=session.tracks.find((track)=>track.id==='keys')!.devices.find((device)=>device.id===filter.id);
  assert.equal(edited?.type==='filter'?edited.parameters.frequency:null,19000);
  assert.deepEqual(result.receipt.targets,[`track:keys.device:${filter.id}.parameters.frequency`]);

  const undone=undoPulseGridReceipt(session,result.receipt.id,'human');
  const restored=undone.session.tracks.find((track)=>track.id==='keys')!.devices.find((device)=>device.id===filter.id);
  assert.equal(restored?.type==='filter'?restored.parameters.frequency:null,7000);
});

test('PulseGrid device enable state is canonical and reversible',()=>{
  let session=createPulseGridSession();
  const delay=session.tracks.find((track)=>track.id==='bell')!.devices.find((device)=>device.type==='delay')!;
  const result=applyPulseGridOperation(session,{
    type:'device.set_enabled',
    track_id:'bell',
    device_id:delay.id,
    enabled:false,
  });
  session=result.session;
  assert.equal(session.tracks.find((track)=>track.id==='bell')!.devices.find((device)=>device.id===delay.id)?.enabled,false);
  const undone=undoPulseGridReceipt(session,result.receipt.id);
  assert.equal(undone.session.tracks.find((track)=>track.id==='bell')!.devices.find((device)=>device.id===delay.id)?.enabled,true);
});
