import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PULSEGRID_ENGINE_VERSION,
  PULSEGRID_SESSION_SCHEMA,
  PULSEGRID_STEPS_PER_BAR,
  applyPulseGridOperation,
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
  assert.equal(migrated.version,'0.8.0');
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

test('PulseGrid semantic edits return reversible receipts',()=>{
  const original=createPulseGridSession();
  const {session,receipt}=applyPulseGridOperation(original,{type:'track.set_filter',track_id:'bass',filter_hz:880},'agent');
  assert.equal(original.tracks.find((track)=>track.id==='bass')?.filterHz,1200);
  assert.equal(session.tracks.find((track)=>track.id==='bass')?.filterHz,880);
  assert.equal(receipt.actor,'agent');
  assert.equal(receipt.reversible,true);
  assert.deepEqual(receipt.targets,['track:bass.filterHz']);
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
