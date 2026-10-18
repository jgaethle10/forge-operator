import test from 'node:test';
import assert from 'node:assert/strict';
import {validateFoundryPatch,selectFoundrySample,scheduleFoundryPianoNote,appendFoundryPianoSample} from './instrument-foundry-piano.mjs';
import {applyPulseGridTransaction,createPulseGridSession,undoPulseGridReceipt,validatePulseGridSession} from './pulsegrid-session.ts';

const D='a'.repeat(64),id='audio-sha256:'+D;
const audio=()=>({id,digest:D,kind:'audio',mime_type:'audio/wav',byte_length:96044,
 duration_sec:1,sample_rate:48000,channels:1,source_name:'controlled_piano_fixture',
 source_refs:['sha256:'+D],source_state:'recording',rights:'unknown',
 parent_asset_ids:[],created_at:'2026-10-17T00:00:00Z'});
const patch=()=>({kind:'recorded_piano_v1',max_transpose_semitones:2,samples:[
 {asset_id:id,root_pitch:60,velocity_min:0,velocity_max:1,release_sec:0.18}
]});
test('registered actual recording is eligible only for declared piano pitches within two semitones',()=>{
 assert.equal(validateFoundryPatch(patch(),[audio()]),true);
 assert.equal(selectFoundrySample(patch(),62,.7).asset_id,id);
 assert.ok(Math.abs(selectFoundrySample(patch(),62,.7).playback_rate-Math.pow(2,2/12))<1e-10);
 assert.throws(()=>selectFoundrySample(patch(),65,.7),/No actual Foundry recording/);
});
test('unrecorded softer velocity range fails instead of inventing softer sound',()=>{
 const p=patch();p.samples[0].velocity_min=.5;
 assert.throws(()=>selectFoundrySample(p,60,.25),/No actual Foundry recording/);
});
test('no canonical source asset or restricted rights means no instrument attachment',()=>{
 assert.throws(()=>validateFoundryPatch(patch(),[]),/missing or restricted/);
 const a=audio();a.rights='restricted';
 assert.throws(()=>validateFoundryPatch(patch(),[a]),/missing or restricted/);
});
test('unbounded transposition and invalid layers fail closed',()=>{
 const p=patch();p.max_transpose_semitones=12;
 assert.throws(()=>validateFoundryPatch(p,[audio()]),/unsupported/);
 const q=patch();q.samples[0].velocity_max=1.2;
 assert.throws(()=>validateFoundryPatch(q,[audio()]),/Malformed/);
});
test('duplicate sample layers rejected',()=>{
 const p=patch();p.samples.push({...p.samples[0]});
 assert.throws(()=>validateFoundryPatch(p,[audio()]),/Duplicate/);
});
test('attaching recorded piano uses one canonical transaction and leaves rights unknown',()=>{
 const src=createPulseGridSession('Grand Piano owned-capture pilot');
 const keys=src.tracks.find(t=>t.id==='keys');
 const result=applyPulseGridTransaction(src,{
   intent:'register source and use it as piano note, strictly audition only',
   operations:[
     {type:'asset.register_audio',asset:audio()},
     {type:'note.add',track_id:keys.id,scene:0,note:{pitch:60,start:0,velocity:.7,length:3}},
     {type:'clip.set_foundry_piano_patch',track_id:keys.id,scene:0,patch:patch()}
   ]
 },'human');
 assert.equal(result.session.tracks.find(t=>t.id==='keys').clips[0].provenance.foundry_piano_patch.kind,'recorded_piano_v1');
 assert.equal(result.session.assets[0].rights,'unknown');
 assert.equal(validatePulseGridSession(result.session).ok,true);
 assert.equal(src.assets.length,0);
 const undo=undoPulseGridReceipt(result.session,result.receipt.id,'human');
 assert.equal(undo.session.assets.length,0);
 assert.equal(undo.session.tracks.find(t=>t.id==='keys').clips[0].provenance.foundry_piano_patch,undefined);
});
test('piano patch rejects existing uncovered note, without mutating source',()=>{
 const src=createPulseGridSession('reject_missing');
 const withNote=applyPulseGridTransaction(src,{intent:'note',operations:[
 {type:'note.add',track_id:'keys',scene:0,note:{pitch:75,start:0,velocity:.5}}
 ]},'human').session;
 const withAudio=applyPulseGridTransaction(withNote,{intent:'asset',operations:[
 {type:'asset.register_audio',asset:audio()}
 ]},'human').session;
 assert.throws(()=>applyPulseGridTransaction(withAudio,{intent:'patch',operations:[
 {type:'clip.set_foundry_piano_patch',track_id:'keys',scene:0,patch:patch()}
 ]},'human'),/No actual Foundry recording/);
 assert.equal(withAudio.tracks.find(t=>t.id==='keys').clips[0].provenance.foundry_piano_patch,undefined);
});
test('recorded piano patch cannot be applied to drum or audio tracks',()=>{
 const src=createPulseGridSession('cross_track');
 const registered=applyPulseGridTransaction(src,{intent:'asset',operations:[
 {type:'asset.register_audio',asset:audio()}
 ]},'human').session;
 for(const t of ['drums','audio']){
  assert.throws(()=>applyPulseGridTransaction(registered,{intent:'cross_track',operations:[
   {type:'clip.set_foundry_piano_patch',track_id:t,scene:0,patch:patch()}
  ]},'human'),/synth instrument track/);
 }
});
test('patch removal does not destroy original audio sample',()=>{
 const src=createPulseGridSession('undo');
 const reg=applyPulseGridTransaction(src,{intent:'initial',operations:[
 {type:'asset.register_audio',asset:audio()},{type:'clip.set_foundry_piano_patch',track_id:'keys',scene:0,patch:patch()}
 ]},'human').session;
 const unset=applyPulseGridTransaction(reg,{intent:'detach',operations:[
 {type:'clip.set_foundry_piano_patch',track_id:'keys',scene:0,patch:null}
 ]},'human');
 assert.equal(unset.session.assets.length,1);
 assert.equal(unset.session.tracks.find(t=>t.id==='keys').clips[0].provenance.foundry_piano_patch,undefined);
 const undo=undoPulseGridReceipt(unset.session,unset.receipt.id,'human');
 assert.equal(undo.session.tracks.find(t=>t.id==='keys').clips[0].provenance.foundry_piano_patch.kind,'recorded_piano_v1');
});
function mockAudio(){
 const calls=[];
 const param=(name)=>({
 setValueAtTime(...args){calls.push([name,'set',...args])},
 linearRampToValueAtTime(...args){calls.push([name,'ramp',...args])},
 });
 return {calls,context:{createGain(){return {gain:param('gain'),connect(x){calls.push(['gain_connect'])}}}},
 createSource(){return {buffer:null,playbackRate:param('rate'),connect(){calls.push(['source_connect'])},
 start(...a){calls.push(['start',...a])},stop(...a){calls.push(['stop',...a])}}}};
}
test('sampled note plays actual buffer, changes pitch, and releases after key-off',()=>{
 const m=mockAudio(),selection=selectFoundrySample(patch(),62,.7);
 const rec=scheduleFoundryPianoNote({context:m.context,destination:{},
 buffer:{duration:1.25},pitch:62,velocity:.7,time:.2,duration:.5,
 selection,createSource:m.createSource});
 assert.equal(rec.asset_id,id);
 assert.ok(rec.stop_time>.7);
 assert.ok(rec.stop_time<=.88+1e-8);
 assert.ok(m.calls.some(x=>x[0]==='rate'&&x[1]==='set'));
 assert.ok(m.calls.some(x=>x[0]==='gain'&&x[1]==='ramp'));
 assert.equal(m.calls.filter(x=>x[0]==='start').length,1);
 assert.equal(m.calls.filter(x=>x[0]==='stop').length,1);
 assert.equal(rec.commercial_rights_verified,false);
});
test('bad scheduling data never spawns a fake audio voice',()=>{
 const m=mockAudio();
 assert.throws(()=>scheduleFoundryPianoNote({context:m.context,destination:{},
 buffer:{duration:0},pitch:60,velocity:.7,time:0,duration:1,
 selection:selectFoundrySample(patch(),60,.7),createSource:m.createSource}),/Invalid/);
 assert.equal(m.calls.length,0);
});

test('the same instrument can accumulate distinct recorded pitches without replacing original takes',()=>{
 const original=patch(),b={...audio(),id:'audio-sha256:'+'b'.repeat(64),digest:'b'.repeat(64)};
 const bank=appendFoundryPianoSample(original,{
   asset_id:b.id,root_pitch:67,velocity_min:0,velocity_max:1,release_sec:.23
 },[audio(),b]);
 assert.equal(bank.samples.length,2);
 assert.equal(original.samples.length,1);
 assert.equal(selectFoundrySample(bank,60,.6).asset_id,id);
 assert.equal(selectFoundrySample(bank,67,.6).asset_id,b.id);
 assert.throws(()=>selectFoundrySample(bank,73,.6),/No actual Foundry recording/);
});
test('one MIDI root can use properly bounded quiet and loud layers',()=>{
 const a=audio(),b={...audio(),id:'audio-sha256:'+'b'.repeat(64),digest:'b'.repeat(64)};
 const base={kind:'recorded_piano_v1',max_transpose_semitones:2,samples:[
   {asset_id:a.id,root_pitch:60,velocity_min:0,velocity_max:.4,release_sec:.2},
 ]};
 const bank=appendFoundryPianoSample(base,{asset_id:b.id,root_pitch:60,
   velocity_min:.4,velocity_max:1,release_sec:.2},[a,b]);
 assert.equal(selectFoundrySample(bank,60,.4).asset_id,a.id);
 assert.equal(selectFoundrySample(bank,60,.8).asset_id,b.id);
 assert.equal(bank.samples.length,2);
});
test('ambiguous overlapping dynamic layers refuse silent arbitrary sample choices',()=>{
 const a=audio(),b={...audio(),id:'audio-sha256:'+'b'.repeat(64),digest:'b'.repeat(64)};
 assert.throws(()=>appendFoundryPianoSample(patch(),{asset_id:b.id,root_pitch:60,
   velocity_min:.2,velocity_max:1,release_sec:.2},[a,b]),/Overlapping piano velocity layers/);
});
test('two neighboring root pitch recordings resolve toward closest real sample, no transposition beyond limit',()=>{
 const a=audio(),b={...audio(),id:'audio-sha256:'+'b'.repeat(64),digest:'b'.repeat(64)};
 const bank=appendFoundryPianoSample(patch(),{asset_id:b.id,root_pitch:63,
   velocity_min:0,velocity_max:1,release_sec:.2},[a,b]);
 assert.equal(selectFoundrySample(bank,61,.6).asset_id,a.id);
 assert.equal(selectFoundrySample(bank,62,.6).asset_id,b.id);
 assert.throws(()=>selectFoundrySample(bank,66,.6),/No actual Foundry recording/);
});
test('append never allows unregistered or restricted recordings to slip into multi-layer instrument',()=>{
 const a=audio(),b={...audio(),id:'audio-sha256:'+'b'.repeat(64),digest:'b'.repeat(64),rights:'restricted'};
 assert.throws(()=>appendFoundryPianoSample(patch(),{asset_id:b.id,root_pitch:67,
  velocity_min:0,velocity_max:1,release_sec:.2},[a,b]),/missing or restricted/);
});
test('multi-note bank commits with canonical history and undo preserves registered WAVs',()=>{
 const a=audio(),b={...audio(),digest:'b'.repeat(64),id:'audio-sha256:'+'b'.repeat(64)};
 const bank=appendFoundryPianoSample(patch(),{asset_id:b.id,root_pitch:67,
   velocity_min:0,velocity_max:1,release_sec:.2},[a,b]);
 const source=createPulseGridSession('Foundry multi note');
 const result=applyPulseGridTransaction(source,{intent:'verified piano library two sample layers',
  operations:[
    {type:'asset.register_audio',asset:a},
    {type:'asset.register_audio',asset:b},
    {type:'clip.set_foundry_piano_patch',track_id:'keys',scene:0,patch:bank},
  ]},'human');
 assert.equal(result.session.assets.length,2);
 assert.equal(result.session.tracks.find(x=>x.id==='keys').clips[0].provenance.foundry_piano_patch.samples.length,2);
 const reverted=undoPulseGridReceipt(result.session,result.receipt.id,'human');
 assert.equal(reverted.session.assets.length,0);
 assert.equal(source.assets.length,0);
});
