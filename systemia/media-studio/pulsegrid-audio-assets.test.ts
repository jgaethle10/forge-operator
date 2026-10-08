import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyPulseGridOperation,
  applyPulseGridTransaction,
  createPulseGridSession,
  migratePulseGridSession,
  undoPulseGridReceipt,
} from './pulsegrid-session.js';
import {
  PulseGridMemoryAudioAssetStore,
  preparePulseGridAudioAsset,
  verifyPulseGridAudioAssetBytes,
} from './pulsegrid-audio-assets.js';

const ABC_SHA256='ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';

test('PulseGrid prepares content-addressed audio records with provenance and rights',async()=>{
  const bytes=new TextEncoder().encode('abc');
  const prepared=await preparePulseGridAudioAsset(bytes,{
    source_filename:'take-01.wav',
    mime_type:'audio/wav',
    duration_seconds:1.25,
    sample_rate:48000,
    channel_count:2,
    provenance:{source:'microphone',device:'test-interface'},
    rights:{owner:'Evercraft test fixture',license:'owned'},
    parent_asset_ids:[],
    created_at:'2026-10-07T17:20:00.000Z',
  },'human');

  assert.equal(prepared.record.content_hash,ABC_SHA256);
  assert.equal(prepared.record.id,'audio:sha256:'+ABC_SHA256);
  assert.equal(prepared.record.byte_length,3);
  assert.equal(prepared.record.source_filename,'take-01.wav');
  assert.equal(prepared.record.sample_rate,48000);
  assert.equal(prepared.record.channel_count,2);
  assert.equal(prepared.record.provenance.source,'microphone');
  assert.equal(prepared.record.rights.license,'owned');
  assert.equal(prepared.registration.type,'asset.register_audio');
  assert.deepEqual(prepared.registration.asset,prepared.record);
});

test('PulseGrid memory asset store verifies bytes and returns defensive copies',async()=>{
  const bytes=new TextEncoder().encode('abc');
  const prepared=await preparePulseGridAudioAsset(bytes,{mime_type:'audio/wav',created_at:'2026-10-07T17:20:00.000Z'});
  const store=new PulseGridMemoryAudioAssetStore();

  await store.put(prepared.record,bytes);
  assert.equal(await store.has(prepared.record.id),true);

  const first=await store.get(prepared.record.id);
  assert.ok(first);
  new Uint8Array(first!)[0]=0;
  const second=await store.get(prepared.record.id);
  assert.equal(new TextDecoder().decode(second!),'abc');

  await assert.rejects(
    ()=>verifyPulseGridAudioAssetBytes(prepared.record,new TextEncoder().encode('abd')),
    /do not match the canonical SHA-256 identity|byte length/,
  );

  await store.delete(prepared.record.id);
  assert.equal(await store.has(prepared.record.id),false);
});

test('PulseGrid graph registers and binds audio assets with executable undo',async()=>{
  const original=createPulseGridSession('Asset Graph');
  const prepared=await preparePulseGridAudioAsset(new TextEncoder().encode('abc'),{
    source_filename:'field-take.wav',
    mime_type:'audio/wav',
    provenance:{source:'import'},
    rights:{status:'declared'},
    created_at:'2026-10-07T17:20:00.000Z',
  });

  const registered=applyPulseGridOperation(original,prepared.registration,'human');
  assert.equal(registered.session.assets.audio.length,1);
  assert.equal(registered.receipt.operation,'asset.register_audio');
  assert.deepEqual(registered.receipt.targets,['asset:'+prepared.record.id]);

  const bound=applyPulseGridOperation(registered.session,{
    type:'clip.set_audio_asset',
    track_id:'audio',
    scene:0,
    asset_id:prepared.record.id,
  },'human');
  assert.equal(bound.session.tracks.find((track)=>track.id==='audio')!.clips[0].audio_asset_id,prepared.record.id);
  assert.equal(original.assets.audio.length,0);
  assert.equal(original.tracks.find((track)=>track.id==='audio')!.clips[0].audio_asset_id,null);

  const unbound=undoPulseGridReceipt(bound.session,bound.receipt.id,'human');
  assert.equal(unbound.session.tracks.find((track)=>track.id==='audio')!.clips[0].audio_asset_id,null);

  const removed=undoPulseGridReceipt(unbound.session,registered.receipt.id,'human');
  assert.equal(removed.session.assets.audio.length,0);
});

test('PulseGrid transactions can atomically register then bind an audio asset',async()=>{
  const original=createPulseGridSession('Atomic Asset Import');
  const prepared=await preparePulseGridAudioAsset(new TextEncoder().encode('asset-two'),{
    source_filename:'asset-two.wav',
    mime_type:'audio/wav',
    created_at:'2026-10-07T17:20:00.000Z',
  });

  const result=applyPulseGridTransaction(original,{
    transaction_id:'tx-asset-import-1',
    intent:'Import one audio take into scene one without hidden browser state.',
    operations:[
      prepared.registration,
      {type:'clip.set_audio_asset',track_id:'audio',scene:0,asset_id:prepared.record.id},
    ],
  },'human');

  assert.equal(result.session.assets.audio.length,1);
  assert.equal(result.session.tracks.find((track)=>track.id==='audio')!.clips[0].audio_asset_id,prepared.record.id);
  assert.equal(result.child_receipts.length,2);

  const undone=undoPulseGridReceipt(result.session,result.receipt.id,'human');
  assert.deepEqual(undone.session.assets,original.assets);
  assert.deepEqual(undone.session.tracks,original.tracks);
});

test('PulseGrid rejects audio bindings outside canonical audio tracks or missing assets',async()=>{
  const session=createPulseGridSession('Asset Guards');
  const prepared=await preparePulseGridAudioAsset(new TextEncoder().encode('abc'),{created_at:'2026-10-07T17:20:00.000Z'});
  const registered=applyPulseGridOperation(session,prepared.registration,'human').session;

  assert.throws(()=>applyPulseGridOperation(registered,{
    type:'clip.set_audio_asset',track_id:'keys',scene:0,asset_id:prepared.record.id,
  },'human'),/only be bound to audio tracks/);

  assert.throws(()=>applyPulseGridOperation(registered,{
    type:'clip.set_audio_asset',track_id:'audio',scene:0,asset_id:'audio:sha256:'+'0'.repeat(64),
  },'human'),/Unknown PulseGrid audio asset/);
});

test('PulseGrid migration defaults old sessions to an empty canonical asset graph',()=>{
  const migrated=migratePulseGridSession({
    project_name:'Legacy',
    version:'0.3.0',
    tracks:[{id:'audio',name:'Audio Take',type:'audio',clips:[{id:'legacy',audio_asset_id:'browser-only-buffer'}]}],
  });

  assert.deepEqual(migrated.assets,{audio:[]});
  assert.equal(migrated.tracks[0].clips[0].audio_asset_id,null);
});

test('PulseGrid audio asset implementation remains browser-native and delegates identity to the canonical helper',async()=>{
  const fs=await import('node:fs');
  const source=fs.readFileSync('systemia/media-studio/pulsegrid-audio-assets.ts','utf8');
  const sessionSource=fs.readFileSync('systemia/media-studio/pulsegrid-session.ts','utf8');
  assert.doesNotMatch(source,/from ['"]node:/);
  assert.match(source,/globalThis\.crypto\?\.subtle/);
  assert.match(source,/globalThis\.indexedDB/);
  assert.match(source,/pulseGridAudioAssetId\(/);
  assert.match(sessionSource,/return 'audio:sha256:' \+ normalized/);
});
