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

test('PulseGrid registers canonical assets and adds non-destructive audio takes only to audio tracks',()=>{
  let session=createPulseGridSession('Take Proof');
  session=applyPulseGridOperation(session,{type:'asset.register_audio',asset:asset()},'human').session;
  const id=pulseGridAudioAssetId('a'.repeat(64));

  const added=applyPulseGridOperation(session,{
    type:'audio_take.add',
    track_id:'audio',
    scene:0,
    asset_id:id,
    take_id:'take-a',
    label:'Take A',
    activate:true,
  },'human');
  session=added.session;
  const clip=session.tracks.find((track)=>track.id==='audio')!.clips[0];
  assert.equal(clip.audio_takes.length,1);
  assert.equal(clip.audio_takes[0].asset_id,id);
  assert.equal(clip.active_audio_take_id,'take-a');
  assert.deepEqual(added.receipt.targets,[`clip:${clip.id}.audio_takes`,`clip:${clip.id}.active_audio_take_id`]);
  assert.equal(validatePulseGridSession(session).ok,true);

  assert.throws(()=>applyPulseGridOperation(session,{
    type:'audio_take.add',
    track_id:'keys',
    scene:0,
    asset_id:id,
  }),/only be added to audio tracks/);
});

test('PulseGrid refuses missing and restricted assets as takes',()=>{
  const missing=createPulseGridSession();
  assert.throws(()=>applyPulseGridOperation(missing,{
    type:'audio_take.add',
    track_id:'audio',
    scene:0,
    asset_id:'audio-sha256:'+'f'.repeat(64),
  }),/Unknown PulseGrid audio asset/);

  let restricted=createPulseGridSession();
  restricted=applyPulseGridOperation(restricted,{
    type:'asset.register_audio',
    asset:asset('b','restricted'),
  }).session;
  assert.throws(()=>applyPulseGridOperation(restricted,{
    type:'audio_take.add',
    track_id:'audio',
    scene:0,
    asset_id:pulseGridAudioAssetId('b'.repeat(64)),
  }),/cannot become a take/);
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

test('PulseGrid asset registration + take creation commits and undoes as one atomic plan',()=>{
  const original=createPulseGridSession('Atomic Take');
  const input=asset('d','owned');
  const id=pulseGridAudioAssetId(input.digest);
  const result=applyPulseGridTransaction(original,{
    transaction_id:'take-tx',
    intent:'Import a verified recording as a new active take.',
    operations:[
      {type:'asset.register_audio',asset:input},
      {type:'audio_take.add',track_id:'audio',scene:0,asset_id:id,take_id:'take-d',activate:true},
    ],
  },'human');

  const clip=result.session.tracks.find((track)=>track.id==='audio')!.clips[0];
  assert.equal(result.session.assets.length,1);
  assert.equal(clip.audio_takes.length,1);
  assert.equal(clip.active_audio_take_id,'take-d');
  assert.equal(validatePulseGridSession(result.session).ok,true);

  const undone=undoPulseGridReceipt(result.session,result.receipt.id);
  assert.deepEqual(undone.session.assets,original.assets);
  assert.deepEqual(undone.session.tracks,original.tracks);
  assert.equal(validatePulseGridSession(undone.session).ok,true);
});

test('PulseGrid preserves prior takes while switching the active take reversibly',()=>{
  let session=createPulseGridSession();
  session=applyPulseGridOperation(session,{type:'asset.register_audio',asset:asset('e')}).session;
  session=applyPulseGridOperation(session,{type:'asset.register_audio',asset:asset('f')}).session;
  session=applyPulseGridOperation(session,{
    type:'audio_take.add',track_id:'audio',scene:0,asset_id:pulseGridAudioAssetId('e'.repeat(64)),take_id:'take-1',activate:true,
  }).session;
  session=applyPulseGridOperation(session,{
    type:'audio_take.add',track_id:'audio',scene:0,asset_id:pulseGridAudioAssetId('f'.repeat(64)),take_id:'take-2',activate:true,
  }).session;

  const selected=applyPulseGridOperation(session,{
    type:'audio_take.set_active',track_id:'audio',scene:0,take_id:'take-1',
  });
  const clip=selected.session.tracks.find((track)=>track.id==='audio')!.clips[0];
  assert.equal(clip.audio_takes.length,2);
  assert.equal(clip.active_audio_take_id,'take-1');

  const undone=undoPulseGridReceipt(selected.session,selected.receipt.id);
  assert.equal(undone.session.tracks.find((track)=>track.id==='audio')!.clips[0].active_audio_take_id,'take-2');
});

test('PulseGrid refuses to remove a registered asset while any take references it',()=>{
  let session=createPulseGridSession();
  const register=applyPulseGridOperation(session,{type:'asset.register_audio',asset:asset('7')});
  session=register.session;
  const id=pulseGridAudioAssetId('7'.repeat(64));
  session=applyPulseGridOperation(session,{
    type:'audio_take.add',track_id:'audio',scene:0,asset_id:id,take_id:'protected-take',
  }).session;

  assert.throws(()=>undoPulseGridReceipt(session,register.receipt.id),/cannot be undone while still attached/);
});

test('PulseGrid migrates legacy single audio attachments into a take only when the asset exists',()=>{
  const input=asset('8');
  const assetId=pulseGridAudioAssetId(input.digest);
  const withAsset=migratePulseGridSession({
    project_name:'Legacy Project',
    assets:[{...input,id:assetId,kind:'audio'}],
    tracks:[{
      id:'audio',name:'Audio Take',type:'audio',
      clips:[{id:'audio-scene-1',audio_asset_id:assetId}],
    }],
  });
  const migratedClip=withAsset.tracks[0].clips[0];
  assert.equal(migratedClip.audio_takes.length,1);
  assert.equal(migratedClip.audio_takes[0].asset_id,assetId);
  assert.equal(migratedClip.active_audio_take_id,migratedClip.audio_takes[0].id);
  assert.equal('audio_asset_id' in migratedClip,false);

  const missing=migratePulseGridSession({
    project_name:'Missing Legacy Asset',
    tracks:[{
      id:'audio',name:'Audio Take',type:'audio',
      clips:[{id:'audio-scene-1',audio_asset_id:'audio-sha256:'+'f'.repeat(64)}],
    }],
  });
  assert.deepEqual(missing.tracks[0].clips[0].audio_takes,[]);
  assert.equal(missing.tracks[0].clips[0].active_audio_take_id,null);
  assert.equal(validatePulseGridSession(missing).ok,true);
});

test('PulseGrid validation detects dangling take assets, invalid active IDs and restricted active media',()=>{
  let session=createPulseGridSession();
  session=applyPulseGridOperation(session,{type:'asset.register_audio',asset:asset('1')}).session;
  const clip=session.tracks.find((track)=>track.id==='audio')!.clips[0];
  clip.audio_takes.push({
    id:'dangling',
    asset_id:'audio-sha256:'+'2'.repeat(64),
    label:'Dangling',
    created_at:new Date().toISOString(),
    created_by:'human',
    provenance:{},
  });
  clip.active_audio_take_id='missing-take';
  let validation=validatePulseGridSession(session);
  assert.equal(validation.ok,false);
  assert.ok(validation.errors.some((error)=>error.includes('asset_missing')));
  assert.ok(validation.errors.some((error)=>error.includes('active_audio_take_id')));

  session=createPulseGridSession();
  session=applyPulseGridOperation(session,{type:'asset.register_audio',asset:asset('3','owned')}).session;
  const id=pulseGridAudioAssetId('3'.repeat(64));
  session=applyPulseGridOperation(session,{
    type:'audio_take.add',track_id:'audio',scene:0,asset_id:id,take_id:'restricted-later',
  }).session;
  session.assets[0].rights='restricted';
  validation=validatePulseGridSession(session);
  assert.equal(validation.ok,false);
  assert.ok(validation.errors.some((error)=>error.includes('asset_restricted')));
});
