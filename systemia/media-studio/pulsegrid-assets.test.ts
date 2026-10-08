import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyPulseGridOperation,
  applyPulseGridTransaction,
  createPulseGridSession,
  migratePulseGridSession,
  pulseGridAudioAssetId,
  undoPulseGridReceipt,
  validatePulseGridSession,
  type PulseGridAudioAssetInput,
} from './pulsegrid-session.js';

function asset(digestChar='a',rights:PulseGridAudioAssetInput['rights']='owned'):PulseGridAudioAssetInput{
  return {
    digest:digestChar.repeat(64),
    mime_type:'audio/wav',
    byte_length:96000,
    duration_sec:1,
    sample_rate:48000,
    channels:2,
    source_name:'take.wav',
    source_refs:['local-file:take.wav'],
    source_state:'imported',
    rights,
    parent_asset_ids:[],
  };
}

test('PulseGrid derives stable content-addressed audio asset IDs',()=>{
  const digest='a'.repeat(64);
  assert.equal(pulseGridAudioAssetId(digest),'audio-sha256:'+digest);
  assert.equal(pulseGridAudioAssetId(digest.toUpperCase()),'audio-sha256:'+digest);
  assert.throws(()=>pulseGridAudioAssetId('abc'),/64-character SHA-256/);
});

test('PulseGrid registers and attaches canonical audio assets only to audio tracks',()=>{
  let session=createPulseGridSession('Asset Proof');
  const registered=applyPulseGridOperation(session,{type:'asset.register_audio',asset:asset()},'human');
  session=registered.session;
  const id=pulseGridAudioAssetId('a'.repeat(64));
  assert.equal(session.assets.length,1);
  assert.equal(session.assets[0].id,id);
  assert.equal(registered.receipt.targets[0],'asset:'+id);

  const attached=applyPulseGridOperation(session,{
    type:'clip.attach_audio_asset',track_id:'audio',scene:0,asset_id:id,
  },'human');
  session=attached.session;
  const audioTrack=session.tracks.find((track)=>track.id==='audio')!;
  assert.equal(audioTrack.clips[0].audio_asset_id,id);
  assert.equal(validatePulseGridSession(session).ok,true);

  assert.throws(()=>applyPulseGridOperation(session,{
    type:'clip.attach_audio_asset',track_id:'keys',scene:0,asset_id:id,
  }),/only attach to audio tracks/);
});

test('PulseGrid refuses missing and restricted audio assets at attachment time',()=>{
  let session=createPulseGridSession();
  assert.throws(()=>applyPulseGridOperation(session,{
    type:'clip.attach_audio_asset',track_id:'audio',scene:0,asset_id:'audio-sha256:'+'f'.repeat(64),
  }),/Unknown PulseGrid audio asset/);

  session=applyPulseGridOperation(session,{
    type:'asset.register_audio',asset:asset('b','restricted'),
  }).session;
  const id=pulseGridAudioAssetId('b'.repeat(64));
  assert.throws(()=>applyPulseGridOperation(session,{
    type:'clip.attach_audio_asset',track_id:'audio',scene:0,asset_id:id,
  }),/Restricted PulseGrid audio asset/);
});

test('PulseGrid deduplicates identical bytes and conservatively merges rights/source metadata',()=>{
  let session=createPulseGridSession();
  session=applyPulseGridOperation(session,{
    type:'asset.register_audio',
    asset:{...asset('c','unknown'),source_refs:['import:first']},
  }).session;
  session=applyPulseGridOperation(session,{
    type:'asset.register_audio',
    asset:{...asset('c','owned'),source_refs:['import:second']},
  }).session;

  assert.equal(session.assets.length,1);
  assert.equal(session.assets[0].rights,'unknown');
  assert.deepEqual(session.assets[0].source_refs.sort(),['import:first','import:second']);
});



test('PulseGrid rejects zero-byte canonical audio assets',()=>{
  const session=createPulseGridSession();
  assert.throws(()=>applyPulseGridOperation(session,{
    type:'asset.register_audio',
    asset:{...asset('9'),byte_length:0},
  }),/byte_length/);
});

test('PulseGrid asset registration + clip attachment can commit and undo as one atomic plan',()=>{
  const original=createPulseGridSession('Atomic Asset');
  const input=asset('d','owned');
  const id=pulseGridAudioAssetId(input.digest);
  const result=applyPulseGridTransaction(original,{
    transaction_id:'asset-tx',
    intent:'Import a local recording and attach it to Audio Take scene one.',
    operations:[
      {type:'asset.register_audio',asset:input},
      {type:'clip.attach_audio_asset',track_id:'audio',scene:0,asset_id:id},
    ],
  },'human');

  assert.equal(result.session.assets.length,1);
  assert.equal(result.session.tracks.find((track)=>track.id==='audio')!.clips[0].audio_asset_id,id);
  assert.equal(validatePulseGridSession(result.session).ok,true);

  const undone=undoPulseGridReceipt(result.session,result.receipt.id);
  assert.deepEqual(undone.session.assets,original.assets);
  assert.deepEqual(undone.session.tracks,original.tracks);
  assert.equal(validatePulseGridSession(undone.session).ok,true);
});

test('PulseGrid refuses to remove a registered asset while a clip still references it',()=>{
  let session=createPulseGridSession();
  const register=applyPulseGridOperation(session,{type:'asset.register_audio',asset:asset('e')});
  session=register.session;
  const id=pulseGridAudioAssetId('e'.repeat(64));
  session=applyPulseGridOperation(session,{
    type:'clip.attach_audio_asset',track_id:'audio',scene:0,asset_id:id,
  }).session;

  assert.throws(()=>undoPulseGridReceipt(session,register.receipt.id),/cannot be undone while still attached/);
});

test('PulseGrid migrates old sessions without inventing missing binary assets',()=>{
  const migrated=migratePulseGridSession({
    project_name:'Old Project',
    tracks:[{
      id:'audio',name:'Audio Take',type:'audio',
      clips:[{id:'audio-scene-1',audio_asset_id:'audio-sha256:'+'f'.repeat(64)}],
    }],
  });
  assert.deepEqual(migrated.assets,[]);
  assert.equal(migrated.tracks[0].clips[0].audio_asset_id,null);
  assert.equal(validatePulseGridSession(migrated).ok,true);
});

test('PulseGrid validation detects dangling asset lineage and restricted attached media',()=>{
  let session=createPulseGridSession();
  session=applyPulseGridOperation(session,{type:'asset.register_audio',asset:asset('1')}).session;
  session.assets[0].parent_asset_ids=['audio-sha256:'+'2'.repeat(64)];
  let validation=validatePulseGridSession(session);
  assert.equal(validation.ok,false);
  assert.ok(validation.errors.some((error)=>error.includes('parent_missing')));

  session=createPulseGridSession();
  session=applyPulseGridOperation(session,{type:'asset.register_audio',asset:asset('3','owned')}).session;
  const id=pulseGridAudioAssetId('3'.repeat(64));
  session=applyPulseGridOperation(session,{type:'clip.attach_audio_asset',track_id:'audio',scene:0,asset_id:id}).session;
  session.assets[0].rights='restricted';
  validation=validatePulseGridSession(session);
  assert.equal(validation.ok,false);
  assert.ok(validation.errors.some((error)=>error.includes('audio_asset_restricted')));
});
