import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {PulseGridAudioEngine} from './pulsegrid-audio.ts';
import {createPulseGridSession,applyPulseGridOperation,applyPulseGridTransaction,undoPulseGridReceipt} from './pulsegrid-session.ts';
import {createFoundryVerifiedResolver} from './instrument-foundry-resolver.mjs';

// An executable integration harness for the REAL PulseGridAudioEngine.
// AudioContext is simulated; this proves verified bytes -> decode request ->
// AudioBufferSourceNode scheduling, NOT sound quality or device playback.
class Param {
  constructor(){this.value=0;this.events=[];}
  setValueAtTime(v,t){this.events.push(['set',v,t]);this.value=v;return this}
  linearRampToValueAtTime(v,t){this.events.push(['ramp',v,t]);return this}
  exponentialRampToValueAtTime(v,t){this.events.push(['exponential',v,t]);return this}
  setTargetAtTime(v,t,c){this.events.push(['target',v,t,c]);return this}
}
class Node {
  constructor(){this.gain=new Param();this.Q=new Param();this.frequency=new Param();this.delayTime=new Param();this.playbackRate=new Param();}
  connect(){return this}
  disconnect(){}
  addEventListener(){}
}
class Source extends Node {
  constructor(ctx){super();this.ctx=ctx;this.starts=[];this.stops=[];this.buffer=null;this.loop=false}
  start(...args){this.starts.push(args);this.ctx.starts.push({type:'buffer',args,source:this})}
  stop(...args){this.stops.push(args)}
}
class SimOscillator extends Node {
  constructor(ctx){super();this.ctx=ctx;this.type='triangle';this.starts=[];this.stops=[]}
  start(t){this.starts.push(t);this.ctx.oscStarts.push({source:this,time:t})}
  stop(t){this.stops.push(t)}
}
class SimulatedAudioContext {
  static instances=[];
  constructor(){
    this.currentTime=0;
    this.sampleRate=48000;
    this.baseLatency=0.015;
    this.destination=new Node();
    this.state='running';
    this.starts=[];
    this.decodeCalls=0;
    this.createdOscillators=0;
    this.oscStarts=[];
    SimulatedAudioContext.instances.push(this);
  }
  createGain(){return new Node()}
  createBiquadFilter(){return new Node()}
  createDelay(){return new Node()}
  createBufferSource(){return new Source(this)}
  createOscillator(){this.createdOscillators++;return new SimOscillator(this)}
  createBuffer(channels=1,length=4800,rate=48000){return {duration:length/rate,numberOfChannels:channels,sampleRate:rate,getChannelData:()=>new Float32Array(length)}}
  async decodeAudioData(raw){
    this.decodeCalls++;
    const b=new Uint8Array(raw);
    // Mock AudioContext only: reject anything other than a correctly structured WAV.
    if(String.fromCharCode(...b.subarray(0,4))!=='RIFF')throw new Error('Non-WAV audio decode');
    return {duration:0.75,sampleRate:48000,numberOfChannels:1};
  }
  async close(){this.state='closed'}
  async resume(){this.state='running'}
}
function wav(){
  const b=Buffer.alloc(44+48000);
  b.write('RIFF',0);b.writeUInt32LE(b.length-8,4);b.write('WAVE',8);
  b.write('fmt ',12);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);
  b.writeUInt16LE(1,22);b.writeUInt32LE(48000,24);b.writeUInt32LE(96000,28);
  b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(48000,40);
  for(let i=44;i<b.length;i+=2)b.writeInt16LE(Math.round(1250*Math.sin((i-44)*.043)),i);
  return b;
}
function prepare(){
  const bytes=wav(),digest=createHash('sha256').update(bytes).digest('hex');
  const asset={id:'audio-sha256:'+digest,digest,kind:'audio',mime_type:'audio/wav',
    byte_length:bytes.length,duration_sec:.5,sample_rate:48000,channels:1,
    source_refs:['sha256:'+digest],source_state:'recording',rights:'unknown',
    source_name:'integrity-fixture-not-real-piano',parent_asset_ids:[]};
  const source=createPulseGridSession('Foundry whole-chain integration');
  const patch={kind:'recorded_piano_v1',max_transpose_semitones:2,
    samples:[{asset_id:asset.id,root_pitch:60,velocity_min:0,velocity_max:1,release_sec:.2}]};
  const committed=applyPulseGridTransaction(source,{intent:'test canonical recorded instrument chain',
    operations:[
      {type:'asset.register_audio',asset},
      {type:'note.add',track_id:'keys',scene:0,note:{pitch:60,start:0,velocity:.7,length:2}},
      {type:'clip.set_foundry_piano_patch',track_id:'keys',scene:0,patch},
    ]},'human');
  return {session:committed.session,bytes,asset};
}
function resolverOf(bytes,options={}){
  return createFoundryVerifiedResolver({
    scope:{tenant_id:'integrity-test',session_id:'playback-test',purpose:'audition'},
    authorizeRead:options.authorizeRead|| (async()=>true),
    readBytes:options.readBytes || (async()=>new Uint8Array(bytes)),
    onReceipt:options.onReceipt,
  });
}
async function withSimulatedAudio(run){
  const original=globalThis.AudioContext,originalWorklet=globalThis.AudioWorkletNode;
  globalThis.AudioContext=SimulatedAudioContext;
  globalThis.AudioWorkletNode=undefined;
  try{return await run()}finally{
    if(original===undefined)delete globalThis.AudioContext;else globalThis.AudioContext=original;
    if(originalWorklet===undefined)delete globalThis.AudioWorkletNode;else globalThis.AudioWorkletNode=originalWorklet;
  }
}
test('entire pipeline: authorized WAV bytes -> actual PulseGrid decoding -> MIDI sample source starts (simulated audio output)',{concurrency:false},async()=>{
  await withSimulatedAudio(async()=>{
    const {session,bytes,asset}=prepare();
    const receipts=[];
    const engine=new PulseGridAudioEngine();
    engine.setAudioAssetResolver(resolverOf(bytes,{onReceipt:r=>receipts.push(r)}));
    try{
      await engine.play(session,0);
      const context=SimulatedAudioContext.instances.at(-1);
      assert.equal(context.decodeCalls,1);
      assert.equal(context.createdOscillators,0,'actual sample must not degrade to synthetic oscillator');
      const voices=context.starts.filter(s=>s.type==='buffer');
      assert.equal(voices.length,1);
      assert.ok(voices[0].source.playbackRate.events.length>0,'MIDI pitch rendered through sampled playbackRate');
      assert.equal(voices[0].source.loop,false);
      assert.equal(receipts.length,1);
      assert.equal(receipts[0].digest,asset.digest);
      assert.equal(receipts[0].release_ready,false);
      assert.equal(engine.status.playing,true);
    }finally{await engine.close()}
  });
});
test('denied recording fails before decode/source scheduling (simulated output)',{concurrency:false},async()=>{
  await withSimulatedAudio(async()=>{
    const {session,bytes}=prepare();
    const engine=new PulseGridAudioEngine();
    engine.setAudioAssetResolver(resolverOf(bytes,{authorizeRead:async()=>false}));
    try{
      await assert.rejects(engine.play(session,0),/not authorized/);
      const context=SimulatedAudioContext.instances.at(-1);
      assert.equal(context.decodeCalls,0);
      assert.equal(context.starts.length,0);
      assert.equal(engine.status.playing,false);
    }finally{await engine.close()}
  });
});
test('altered stored bytes are rejected by the real resolver before simulated playback', {concurrency:false},async()=>{
  await withSimulatedAudio(async()=>{
    const {session,bytes}=prepare();const mutated=Buffer.from(bytes);mutated[120]^=1;
    const engine=new PulseGridAudioEngine();
    engine.setAudioAssetResolver(resolverOf(mutated));
    try{
      await assert.rejects(engine.play(session,0),/SHA-256 mismatch/);
      assert.equal(SimulatedAudioContext.instances.at(-1).starts.length,0);
    }finally{await engine.close()}
  });
});
test('missing resolver refuses to claim MIDI instrument playback',{concurrency:false},async()=>{
  await withSimulatedAudio(async()=>{
    const {session}=prepare();
    const engine=new PulseGridAudioEngine();
    try{
      await assert.rejects(engine.play(session,0),/verified audio resolver is required/);
      assert.equal(SimulatedAudioContext.instances.at(-1).starts.length,0);
    }finally{await engine.close()}
  });
});

test('switching scenes stops sampled playback until new scene is verified and explicitly started', {concurrency:false},async()=>{
  await withSimulatedAudio(async()=>{
    const {session,bytes}=prepare();
    const engine=new PulseGridAudioEngine();
    engine.setAudioAssetResolver(resolverOf(bytes));
    try{
      await engine.play(session,0);
      assert.equal(engine.status.playing,true);
      const prevSources=SimulatedAudioContext.instances.at(-1).starts;
      assert.equal(prevSources.length,1);
      engine.setScene(1);
      assert.equal(engine.status.playing,false);
      assert.equal(engine.status.scene,1);
      assert.ok(prevSources[0].source.stops.length>=1,'prior piano source is stopped on scene change');
      await engine.play(session,1);
      assert.equal(engine.status.playing,true);
      // No sampled instrument patch on empty scene 1.
      assert.equal(SimulatedAudioContext.instances.at(-1).starts.length,1);
    }finally{await engine.close()}
  });
});

test('arming a recorded piano detaches raw clip, leaves one playable voice, and undo restores audio take', {concurrency:false},async()=>{
  await withSimulatedAudio(async()=>{
    const {session,bytes,asset}=prepare();
    const raw=applyPulseGridTransaction(session,{
      intent:'attach raw take before arming',
      operations:[{type:'clip.attach_audio_asset',track_id:'audio',scene:0,asset_id:asset.id}]
    },'human').session;
    assert.equal(raw.tracks.find(x=>x.id==='audio').clips[0].audio_asset_id,asset.id);
    const pianoPatch=raw.tracks.find(x=>x.id==='keys').clips[0].provenance.foundry_piano_patch;
    const armed=applyPulseGridTransaction(raw,{
      intent:'move raw audition take to MIDI piano, no doubling',
      operations:[
        {type:'clip.attach_audio_asset',track_id:'audio',scene:0,asset_id:null},
        {type:'clip.set_foundry_piano_patch',track_id:'keys',scene:0,patch:pianoPatch},
      ],
    },'human');
    assert.equal(armed.session.tracks.find(x=>x.id==='audio').clips[0].audio_asset_id,null);
    assert.equal(armed.session.assets.length,1,'recording is not deleted');
    const engine=new PulseGridAudioEngine();
    engine.setAudioAssetResolver(resolverOf(bytes));
    try{
      await engine.play(armed.session,0);
      assert.equal(SimulatedAudioContext.instances.at(-1).starts.length,1,'single sampled MIDI note, not raw WAV plus MIDI note');
    }finally{await engine.close()}
    const reverted=undoPulseGridReceipt(armed.session,armed.receipt.id,'human');
    assert.equal(reverted.session.tracks.find(x=>x.id==='audio').clips[0].audio_asset_id,asset.id);
    assert.equal(reverted.session.assets[0].id,asset.id);
  });
});

test('each explicit playback reauthorizes even when audio digest and graph are unchanged',{concurrency:false},async()=>{
 await withSimulatedAudio(async()=>{
  const {session,bytes}=prepare();
  let grant=true,reads=0;
  const engine=new PulseGridAudioEngine();
  engine.setAudioAssetResolver(resolverOf(bytes,{
    authorizeRead:async()=>{reads++;return grant}
  }));
  try{
    await engine.play(session,0);
    assert.equal(reads,1);
    engine.stop();
    grant=false;
    await assert.rejects(engine.play(session,0),/not authorized/);
    assert.equal(reads,2,'cached prior authorization cannot bypass the new read');
    assert.equal(engine.status.playing,false);
    assert.equal(engine.status.cached_audio_assets,0);
  }finally{await engine.close()}
 });
});
test('changing recording rights mid-playback stops voices and evicts decoded samples',{concurrency:false},async()=>{
 await withSimulatedAudio(async()=>{
  const {session,bytes}=prepare();
  const engine=new PulseGridAudioEngine();
  engine.setAudioAssetResolver(resolverOf(bytes));
  try{
    await engine.play(session,0);
    assert.equal(engine.status.cached_audio_assets,1);
    const context=SimulatedAudioContext.instances.at(-1);
    const restricted=structuredClone(session);
    restricted.assets[0].rights='restricted';
    engine.updateSession(restricted);
    assert.equal(engine.status.playing,false);
    assert.equal(engine.status.cached_audio_assets,0);
    assert.ok(context.starts[0].source.stops.length>0);
    await assert.rejects(engine.play(restricted,0),/missing or restricted/);
    assert.equal(engine.status.playing,false);
  }finally{await engine.close()}
 });
});
test('late async sample read cannot refill another session cache',{concurrency:false},async()=>{
 await withSimulatedAudio(async()=>{
  const {session,bytes}=prepare();
  let release;
  const gate=new Promise(resolve=>{release=resolve});
  let entered;
  const firstRead=new Promise(resolve=>{entered=resolve});
  const engine=new PulseGridAudioEngine();
  engine.setAudioAssetResolver(resolverOf(bytes,{
    readBytes:async()=>{entered();await gate;return new Uint8Array(bytes)}
  }));
  try{
    const playing=engine.play(session,0);
    await firstRead;
    const different=structuredClone(session);
    different.session_id='new-authenticated-session';
    engine.updateSession(different);
    release();
    await assert.rejects(playing,/authorization changed|superseded/);
    assert.equal(engine.status.cached_audio_assets,0);
    assert.equal(engine.status.playing,false);
    assert.equal(SimulatedAudioContext.instances.at(-1).starts.length,0);
  }finally{release();await engine.close()}
 });
});
test('resolver swap stops old voices and forces fresh decoding only from replacement resolver',{concurrency:false},async()=>{
 await withSimulatedAudio(async()=>{
  const {session,bytes}=prepare();
  const engine=new PulseGridAudioEngine();
  engine.setAudioAssetResolver(resolverOf(bytes));
  try{
    await engine.play(session,0);
    const old=SimulatedAudioContext.instances.at(-1);
    assert.equal(old.decodeCalls,1);
    engine.setAudioAssetResolver(resolverOf(bytes,{authorizeRead:async()=>false}));
    assert.equal(engine.status.playing,false);
    assert.equal(engine.status.cached_audio_assets,0);
    await assert.rejects(engine.play(session,0),/not authorized/);
    assert.equal(old.decodeCalls,1);
  }finally{await engine.close()}
 });
});

test('resolver swap cancels a Play still waiting for AudioContext resume',{concurrency:false},async()=>{
 await withSimulatedAudio(async()=>{
  const {session,bytes}=prepare();
  let release,entered;
  const gate=new Promise(resolve=>{release=resolve});
  const resumed=new Promise(resolve=>{entered=resolve});
  class Suspended extends SimulatedAudioContext{
    constructor(){super();this.state='suspended'}
    async resume(){entered();await gate;this.state='running'}
  }
  globalThis.AudioContext=Suspended;
  let reads=0;
  const engine=new PulseGridAudioEngine();
  engine.setAudioAssetResolver(resolverOf(bytes,{
    authorizeRead:async()=>{reads++;return true}
  }));
  try{
    const opening=engine.play(session,0);
    await resumed;
    engine.setAudioAssetResolver(resolverOf(bytes,{authorizeRead:async()=>false}));
    release();
    await assert.rejects(opening,/superseded/);
    assert.equal(reads,0);
    assert.equal(engine.status.playing,false);
    assert.equal(engine.status.cached_audio_assets,0);
    assert.equal(SimulatedAudioContext.instances.at(-1).starts.length,0);
  }finally{release();await engine.close()}
 });
});

test('actual PulseGrid sampler defers release to pedal lift and clamps to decoded WAV length (simulated output)',{concurrency:false},async()=>{
 await withSimulatedAudio(async()=>{
  const {session,bytes}=prepare();
  const pedaled=applyPulseGridOperation(session,{
   type:'clip.set_foundry_piano_pedal',track_id:'keys',scene:0,
   events:[{step:0,down:true},{step:6,down:false}]
  },'human').session;
  const engine=new PulseGridAudioEngine();
  engine.setAudioAssetResolver(resolverOf(bytes));
  try{
   await engine.play(session,0);
   const ctx=SimulatedAudioContext.instances.at(-1);
   const first=ctx.starts.at(-1).source;
   const originalStop=first.stops[0][0];
   assert.equal(ctx.createdOscillators,0);
   assert.equal(engine.status.decoded_sample_tail_warnings,0,
    'decoded .75s buffer covers the dry .25s key + .2s release despite shorter asset metadata');
   engine.stop();
   await engine.play(pedaled,0);
   const second=ctx.starts.at(-1).source;
   const heldStop=second.stops[0][0];
   assert.equal(engine.status.decoded_sample_tail_warnings,1,
    'actual decoded .75s sample cannot supply .75s pedal hold PLUS .2s release');
   assert.equal(engine.status.decoded_key_hold_shortfalls,0,
    'the decoded WAV covers held keys even though its release is truncated');
   assert.ok(heldStop>originalStop+.15,'pedal must delay WAV note release');
   assert.ok(heldStop<=ctx.starts.at(-1).args[0]+.75+1e-8,
    'pedal must not synthesize sample bytes after decoded WAV ends');
   assert.equal(ctx.createdOscillators,0);
   assert.equal(pedaled.assets[0].rights,'unknown');
  }finally{await engine.close()}
 });
});
test('editing piano sustain mid-playback stops stale sampled voices before reauthorization',{concurrency:false},async()=>{
 await withSimulatedAudio(async()=>{
  const {session,bytes}=prepare();
  const engine=new PulseGridAudioEngine();
  engine.setAudioAssetResolver(resolverOf(bytes));
  try{
   await engine.play(session,0);
   const ctx=SimulatedAudioContext.instances.at(-1);
   const source=ctx.starts.at(-1).source;
   const edited=applyPulseGridOperation(session,{
    type:'clip.set_foundry_piano_pedal',track_id:'keys',scene:0,
    events:[{step:0,down:true}]
   },'human').session;
   engine.updateSession(edited);
   assert.equal(engine.status.playing,false);
   assert.equal(engine.status.cached_audio_assets,0);
   assert.ok(source.stops.length>1,'pedal authority edit must stop previously scheduled sample');
   assert.equal(ctx.createdOscillators,0);
  }finally{await engine.close()}
 });
});

test('the actual PulseGrid sampler uses a near-zero decoded WAV onset without oscillator substitution',{concurrency:false},async()=>{
 await withSimulatedAudio(async()=>{
  const pcm=new Float32Array(36000);
  pcm[43]=.4; // first 0.35 ms remains clean; a hammer onset follows later
  class PCMContext extends SimulatedAudioContext{
   async decodeAudioData(raw){
    const original=await super.decodeAudioData(raw);
    return {...original,getChannelData:()=>pcm};
   }
  }
  globalThis.AudioContext=PCMContext;
  const {session,bytes}=prepare();
  const engine=new PulseGridAudioEngine();
  engine.setAudioAssetResolver(resolverOf(bytes));
  try{
   await engine.play(session,0);
   const ctx=SimulatedAudioContext.instances.at(-1);
   assert.equal(ctx.createdOscillators,0);
   assert.equal(ctx.decodeCalls,1);
   assert.equal(engine.status.decoded_fast_attack_voices,1);
   assert.equal(engine.status.decoded_cut_in_guard_voices,0);
   assert.equal(engine.status.decoded_sample_tail_warnings,0);
   assert.equal(ctx.starts.length,1);
  }finally{await engine.close()}
 });
});
test('the actual PulseGrid sampler guards abrupt WAV onset instead of treating it as a zero-aligned take',{concurrency:false},async()=>{
 await withSimulatedAudio(async()=>{
  const pcm=new Float32Array(36000);
  pcm[0]=.7;pcm[1]=.6;
  class PCMContext extends SimulatedAudioContext{
   async decodeAudioData(raw){
    const original=await super.decodeAudioData(raw);
    return {...original,getChannelData:()=>pcm};
   }
  }
  globalThis.AudioContext=PCMContext;
  const {session,bytes}=prepare();
  const engine=new PulseGridAudioEngine();
  engine.setAudioAssetResolver(resolverOf(bytes));
  try{
   await engine.play(session,0);
   const ctx=SimulatedAudioContext.instances.at(-1);
   assert.equal(ctx.createdOscillators,0);
   assert.equal(engine.status.decoded_fast_attack_voices,0);
   assert.equal(engine.status.decoded_cut_in_guard_voices,1);
   assert.equal(ctx.starts.length,1);
  }finally{await engine.close()}
 });
});

test('real PulseGrid sample scheduling skips only verified capture pre-roll, not source pitch or rights',{concurrency:false},async()=>{
 await withSimulatedAudio(async()=>{
  const pcm=new Float32Array(36000),rate=48000,delay=Math.round(rate*.022);
  for(let i=delay;i<pcm.length;i++)pcm[i]=.18*Math.sin(2*Math.PI*261.626*(i-delay)/rate);
  class LateAttackContext extends SimulatedAudioContext{
   async decodeAudioData(raw){
    const original=await super.decodeAudioData(raw);
    return {...original,getChannelData:()=>pcm};
   }
  }
  globalThis.AudioContext=LateAttackContext;
  const {session,bytes}=prepare();
  const engine=new PulseGridAudioEngine();
  engine.setAudioAssetResolver(resolverOf(bytes));
  try{
   await engine.play(session,0);
   const ctx=SimulatedAudioContext.instances.at(-1);
   const started=ctx.starts.at(-1);
   assert.equal(started.args.length,2,'Web Audio source.start must carry authorized sample offset');
   assert.ok(started.args[1]>=.016&&started.args[1]<=.021,'only operator silence is aligned');
   assert.equal(engine.status.decoded_preroll_aligned_voices,1);
   assert.equal(engine.status.decoded_sample_tail_warnings,0);
   assert.equal(ctx.createdOscillators,0,'no oscillator or other synthesized replacement');
   assert.equal(session.assets[0].rights,'unknown','recording rights must not be promoted');
   const buffer=started.source.buffer;
   assert.equal(buffer.getChannelData(0),pcm,'original decoded PCM remains unchanged');
  }finally{await engine.close()}
 });
});
test('a soft piano onset stays at source zero, with no speculative trimming',{concurrency:false},async()=>{
 await withSimulatedAudio(async()=>{
  const pcm=new Float32Array(36000),rate=48000;
  for(let i=0;i<pcm.length;i++)pcm[i]=.005*Math.sin(2*Math.PI*261.626*i/rate);
  class SoftAttackContext extends SimulatedAudioContext{
   async decodeAudioData(raw){
    const original=await super.decodeAudioData(raw);
    return {...original,getChannelData:()=>pcm};
   }
  }
  globalThis.AudioContext=SoftAttackContext;
  const {session,bytes}=prepare();
  const engine=new PulseGridAudioEngine();
  engine.setAudioAssetResolver(resolverOf(bytes));
  try{
   await engine.play(session,0);
   const source=SimulatedAudioContext.instances.at(-1).starts.at(-1);
   assert.equal(source.args[1],0);
   assert.equal(engine.status.decoded_preroll_aligned_voices,0);
  }finally{await engine.close()}
 });
});

test('real decoded piano chord overlap is reported without compressing or replacing a sample',{concurrency:false},async()=>{
 await withSimulatedAudio(async()=>{
  const {session,bytes}=prepare();
  const chord=applyPulseGridOperation(session,{
   type:'note.add',track_id:'keys',scene:0,
   note:{pitch:62,start:0,length:2,velocity:1,probability:1,microtiming:0},
  },'human').session;
  const engine=new PulseGridAudioEngine();
  engine.setAudioAssetResolver(resolverOf(bytes));
  try{
   await engine.play(chord,0);
   const ctx=SimulatedAudioContext.instances.at(-1);
   assert.equal(ctx.createdOscillators,0);
   assert.equal(ctx.starts.length,2);
   assert.equal(engine.status.sampled_piano_scheduled_voices,2);
   assert.equal(engine.status.sampled_piano_max_overlap,2);
   assert.equal(engine.status.sampled_piano_overlap_review,true);
   assert.equal(engine.status.sampled_piano_observations_complete,true);
   assert.ok(engine.status.sampled_piano_gain_sum_proxy>1);
   assert.equal(ctx.starts[0].source.buffer,ctx.starts[1].source.buffer,
    'piano notes reuse the same verified recording under permitted semitone transposition');
   assert.ok(Math.abs(ctx.starts[0].source.playbackRate.value-
                     ctx.starts[1].source.playbackRate.value)>0.01,
    'each note preserves its authored pitch instead of mutating source');
  }finally{await engine.close()}
 });
});
test('a new explicit Play resets previous chord pressure rather than reporting stale events',{concurrency:false},async()=>{
 await withSimulatedAudio(async()=>{
  const {session,bytes}=prepare();
  const chord=applyPulseGridOperation(session,{
   type:'note.add',track_id:'keys',scene:0,
   note:{pitch:62,start:0,length:2,velocity:.8},
  },'human').session;
  const engine=new PulseGridAudioEngine();
  engine.setAudioAssetResolver(resolverOf(bytes));
  try{
   await engine.play(chord,0);
   assert.equal(engine.status.sampled_piano_max_overlap,2);
   engine.stop();
   await engine.play(session,0);
   assert.equal(engine.status.sampled_piano_scheduled_voices,1);
   assert.equal(engine.status.sampled_piano_max_overlap,1);
   assert.equal(engine.status.sampled_piano_overlap_review,false);
  }finally{await engine.close()}
 });
});

test('stopped real PulseGrid engine can inspect a verified two-note PCM chord, without changing playback DSP',{concurrency:false},async()=>{
 await withSimulatedAudio(async()=>{
  const pcm=new Float32Array(36000).fill(1);
  class PCMContext extends SimulatedAudioContext{
   async decodeAudioData(raw){return {...await super.decodeAudioData(raw),getChannelData:()=>pcm}}
  }
  globalThis.AudioContext=PCMContext;
  const {session,bytes}=prepare();
  const chord=applyPulseGridOperation(session,{
   type:'note.add',track_id:'keys',scene:0,
   note:{pitch:62,start:0,length:2,velocity:1,probability:1,microtiming:0}
  },'human').session;
  const engine=new PulseGridAudioEngine();
  engine.setAudioAssetResolver(resolverOf(bytes));
  try{
   await engine.play(chord,0);
   const early=engine.auditRecordedPianoDryPeak();
   assert.equal(early.status,'unavailable','realtime render must not be interrupted by PCM CPU work');
   engine.stop();
   const result=engine.auditRecordedPianoDryPeak();
   assert.equal(result.status,'measured_offline_dry_approximation');
   assert.ok(result.sample_peak>1,'decoded same-phase sample voices exceed dry 0 dBFS');
   assert.ok(result.over_full_scale_frames>0);
   assert.equal(result.complete,true);
   assert.equal(result.analyzed_voices,2);
   assert.equal(SimulatedAudioContext.instances.at(-1).createdOscillators,0);
   assert.equal(chord.assets[0].rights,'unknown');
  }finally{await engine.close()}
 });
});
test('resolver or session authority change revokes decoded PCM audit access',{concurrency:false},async()=>{
 await withSimulatedAudio(async()=>{
  const pcm=new Float32Array(36000).fill(.5);
  class PCMContext extends SimulatedAudioContext{
   async decodeAudioData(raw){return {...await super.decodeAudioData(raw),getChannelData:()=>pcm}}
  }
  globalThis.AudioContext=PCMContext;
  const {session,bytes}=prepare();
  const engine=new PulseGridAudioEngine();
  engine.setAudioAssetResolver(resolverOf(bytes));
  try{
   await engine.play(session,0);
   engine.stop();
   assert.equal(engine.auditRecordedPianoDryPeak().status,'measured_offline_dry_approximation');
   const changed=structuredClone(session);changed.session_id='new-authenticated-project';
   engine.updateSession(changed);
   assert.equal(engine.auditRecordedPianoDryPeak().status,'unavailable');
   engine.setAudioAssetResolver(resolverOf(bytes,{authorizeRead:async()=>false}));
   assert.equal(engine.auditRecordedPianoDryPeak().status,'unavailable');
  }finally{await engine.close()}
 });
});

test('real engine offline sample-piano bus review uses note-on effects and authorized PCM without modifying the song',{concurrency:false},async()=>{
 await withSimulatedAudio(async()=>{
  const origOffline=globalThis.OfflineAudioContext;
  class OfflineSim extends SimulatedAudioContext{
   constructor(channels,length,sampleRate){
    super();this.targetChannels=channels;this.targetLength=length;this.sampleRate=sampleRate;
   }
   async startRendering(){
    const n=this.targetLength,a=new Float32Array(n).fill(.35),b=new Float32Array(n).fill(-.35);
    return {numberOfChannels:2,length:n,getChannelData:i=>i?b:a};
   }
  }
  globalThis.OfflineAudioContext=OfflineSim;
  const pcm=new Float32Array(36000).fill(.5);
  class PCMContext extends SimulatedAudioContext{
   async decodeAudioData(raw){return {...await super.decodeAudioData(raw),getChannelData:()=>pcm}}
  }
  globalThis.AudioContext=PCMContext;
  const {session,bytes}=prepare(),before=structuredClone(session);
  const engine=new PulseGridAudioEngine();
  engine.setAudioAssetResolver(resolverOf(bytes));
  try{
   await engine.play(session,0);
   assert.equal((await engine.auditRecordedPianoOfflineBus()).status,'unavailable',
    'offline CPU and DSP must never run against live rendering');
   engine.stop();
   const report=await engine.auditRecordedPianoOfflineBus();
   assert.equal(report.status,'offline_track_bus_pcm_measurement',JSON.stringify(report));
   assert.equal(report.sample_peak,.35);
   assert.equal(report.over_full_scale_frames,0);
   assert.equal(report.analyzed_voices,1);
   assert.equal(report.complete,false,'default piano feedback delay extends beyond finite offline window');
   assert.equal(report.effects_tail_complete,false);
   assert.equal(report.source_kind,'decoded_pcm_only');
   assert.deepEqual(session,before,'offline render cannot change canonical score or rights');
   assert.equal(session.assets[0].rights,'unknown');
   const offline=SimulatedAudioContext.instances.at(-1);
   assert.equal(offline.createdOscillators,0,'all offline voices must remain recorded samples');
   assert.equal(offline.starts.length,1);
  }finally{
   await engine.close();
   if(origOffline===undefined)delete globalThis.OfflineAudioContext;
   else globalThis.OfflineAudioContext=origOffline;
  }
 });
});
test('offline piano bus must fail closed if browser offline rendering missing or sample authorization changes',{concurrency:false},async()=>{
 await withSimulatedAudio(async()=>{
  const prior=globalThis.OfflineAudioContext;
  delete globalThis.OfflineAudioContext;
  const {session,bytes}=prepare();
  const engine=new PulseGridAudioEngine();
  engine.setAudioAssetResolver(resolverOf(bytes));
  try{
   await engine.play(session,0);engine.stop();
   const absent=await engine.auditRecordedPianoOfflineBus();
   assert.equal(absent.status,'unavailable');
   assert.match(absent.reason,/OfflineAudioContext/);
   const changed=structuredClone(session);changed.session_id='different-authority';
   engine.updateSession(changed);
   const revoked=await engine.auditRecordedPianoOfflineBus();
   assert.equal(revoked.status,'unavailable');
   assert.equal(revoked.sample_peak,null);
  }finally{
   await engine.close();
   if(prior===undefined)delete globalThis.OfflineAudioContext;
   else globalThis.OfflineAudioContext=prior;
  }
 });
});

test('in-flight offline piano mix becomes unavailable when playback authority changes before render finishes',{concurrency:false},async()=>{
 await withSimulatedAudio(async()=>{
  const originalOffline=globalThis.OfflineAudioContext;
  let resolveRender,notifyEntered;
  const gate=new Promise(resolve=>{resolveRender=resolve});
  const entered=new Promise(resolve=>{notifyEntered=resolve});
  class SuspendedOffline extends SimulatedAudioContext{
   constructor(ch,frames,rate){super();this.frames=frames;this.sampleRate=rate}
   async startRendering(){
    notifyEntered();
    await gate;
    const p=new Float32Array(this.frames).fill(.3);
    return {numberOfChannels:2,length:this.frames,getChannelData:()=>p};
   }
  }
  globalThis.OfflineAudioContext=SuspendedOffline;
  const pcm=new Float32Array(36000).fill(.3);
  class PCMContext extends SimulatedAudioContext{
   async decodeAudioData(raw){return {...await super.decodeAudioData(raw),getChannelData:()=>pcm}}
  }
  globalThis.AudioContext=PCMContext;
  const {session,bytes}=prepare();
  const engine=new PulseGridAudioEngine();
  engine.setAudioAssetResolver(resolverOf(bytes));
  try{
   await engine.play(session,0);engine.stop();
   const inspection=engine.auditRecordedPianoOfflineBus();
   await entered;
   const changed=structuredClone(session);changed.session_id='new-project-revokes-PCM';
   engine.updateSession(changed);
   resolveRender();
   const result=await inspection;
   assert.equal(result.status,'unavailable');
   assert.match(result.reason,/authorization or playback state changed/);
   assert.equal(result.sample_peak,null);
  }finally{
   resolveRender();
   await engine.close();
   if(originalOffline===undefined)delete globalThis.OfflineAudioContext;
   else globalThis.OfflineAudioContext=originalOffline;
  }
 });
});

test('actual PulseGrid records an authorized audio track beside piano and offline-renders both sources',{concurrency:false},async()=>{
 await withSimulatedAudio(async()=>{
  const prev=globalThis.OfflineAudioContext;
  class CombinedOffline extends SimulatedAudioContext{
   constructor(ch,frames,rate){super();this.frames=frames;this.sampleRate=rate;}
   async startRendering(){
    const one=new Float32Array(this.frames).fill(.21);
    return {numberOfChannels:2,length:this.frames,getChannelData:()=>one};
   }
  }
  globalThis.OfflineAudioContext=CombinedOffline;
  const pcm=new Float32Array(36000).fill(.4);
  class PCMContext extends SimulatedAudioContext{
   async decodeAudioData(raw){return {...await super.decodeAudioData(raw),getChannelData:()=>pcm}}
  }
  globalThis.AudioContext=PCMContext;
  const {session,bytes}=prepare();
  const audioTrack=session.tracks.find(t=>t.type==='audio');
  assert.ok(audioTrack,'canonical PulseGrid audio track must exist');
  const withAudio=applyPulseGridOperation(session,{
   type:'clip.attach_audio_asset',track_id:audioTrack.id,scene:0,
   asset_id:session.assets[0].id,
  },'human').session;
  const before=structuredClone(withAudio);
  const engine=new PulseGridAudioEngine();
  engine.setAudioAssetResolver(resolverOf(bytes));
  try{
   await engine.play(withAudio,0);
   const live=SimulatedAudioContext.instances.at(-1);
   assert.equal(live.createdOscillators,0);
   assert.equal(live.starts.length,2,'recorded piano and attached audio bed both play in canonical engine');
   engine.stop();
   const report=await engine.auditRecordedPianoOfflineBus();
   assert.equal(report.status,'offline_track_bus_pcm_measurement',JSON.stringify(report));
   assert.equal(report.analyzed_voices,1);
   assert.equal(report.analyzed_audio_beds,1);
   assert.equal(report.audio_beds_within_window,false,
    'two-second canonical audio loop cannot be certified by the .8s offline excerpt');
   const offline=SimulatedAudioContext.instances.at(-1);
   assert.equal(offline.createdOscillators,0);
   assert.equal(offline.starts.length,2,
    'offline mix must schedule BOTH already-authorized decoded audio tracks');
   assert.deepEqual(withAudio,before,'offline review must not mutate user sessions or elevate recording rights');
   assert.equal(withAudio.assets[0].rights,'unknown');
  }finally{
   await engine.close();
   if(prev===undefined)delete globalThis.OfflineAudioContext;
   else globalThis.OfflineAudioContext=prev;
  }
 });
});

test('actual engine preserves live bass oscillator in stopped sampled-piano-plus-bass offline mix',{concurrency:false},async()=>{
 await withSimulatedAudio(async()=>{
  const priorOffline=globalThis.OfflineAudioContext;
  class OfflineSynth extends SimulatedAudioContext{
   constructor(ch,frames,rate){super();this.frames=frames;this.sampleRate=rate;}
   async startRendering(){
    const p=new Float32Array(this.frames).fill(.15);
    return {numberOfChannels:2,length:this.frames,getChannelData:()=>p};
   }
  }
  globalThis.OfflineAudioContext=OfflineSynth;
  const pcm=new Float32Array(36000).fill(.2);
  class PCMContext extends SimulatedAudioContext{
   async decodeAudioData(raw){return {...await super.decodeAudioData(raw),getChannelData:()=>pcm}}
  }
  globalThis.AudioContext=PCMContext;
  const {session,bytes}=prepare();
  const bass=session.tracks.find(t=>t.id==='bass');
  assert.ok(bass,'original PulseGrid bass track must exist');
  const withBass=applyPulseGridOperation(session,{
   type:'note.add',track_id:'bass',scene:0,
   note:{pitch:36,start:0,length:2,velocity:.7,probability:1,microtiming:0}
  },'human').session;
  const before=structuredClone(withBass),engine=new PulseGridAudioEngine();
  engine.setAudioAssetResolver(resolverOf(bytes));
  try{
   await engine.play(withBass,0);
   const live=SimulatedAudioContext.instances.at(-1);
   assert.equal(live.createdOscillators,1,
    'bass must use the unchanged real-time oscillator alongside recorded piano');
   assert.equal(live.starts.length,1,'only the piano is decoded WAV');
   engine.stop();
   const result=await engine.auditRecordedPianoOfflineBus();
   assert.equal(result.status,'offline_track_bus_pcm_measurement',JSON.stringify(result));
   assert.equal(result.analyzed_voices,1);
   assert.equal(result.analyzed_synth_voices,1);
   assert.equal(result.source_kind,'decoded_pcm_plus_synth');
   assert.ok(result.included_track_ids.includes('bass'));
   assert.ok(result.included_track_ids.includes('keys'));
   assert.ok(!result.omitted_track_ids.includes('bass'));
   const offline=SimulatedAudioContext.instances.at(-1);
   assert.equal(offline.createdOscillators,1,'offline bass parity uses the actual Web Audio synth node');
   assert.equal(offline.starts.length,1,'offline piano retains original verified decoded sample');
   assert.deepEqual(withBass,before,'render does not rewrite song arrangement or sample rights');
  }finally{
   await engine.close();
   if(priorOffline===undefined)delete globalThis.OfflineAudioContext;
   else globalThis.OfflineAudioContext=priorOffline;
  }
 });
});

test('real PulseGrid performed kick and original hat noise are replayed in the authorized stopped offline mix',{concurrency:false},async()=>{
 await withSimulatedAudio(async()=>{
  const prior=globalThis.OfflineAudioContext;
  class OfflineDrums extends SimulatedAudioContext{
   constructor(ch,frames,rate){super();this.frames=frames;this.sampleRate=rate}
   async startRendering(){
    const p=new Float32Array(this.frames).fill(.17);
    return {numberOfChannels:2,length:this.frames,getChannelData:()=>p};
   }
  }
  globalThis.OfflineAudioContext=OfflineDrums;
  const pcm=new Float32Array(36000).fill(.4);
  class PCMContext extends SimulatedAudioContext{
   async decodeAudioData(raw){return {...await super.decodeAudioData(raw),getChannelData:()=>pcm}}
  }
  globalThis.AudioContext=PCMContext;
  const {session,bytes}=prepare();
  const withBeat=applyPulseGridOperation(session,{
   type:'clip.set_step',track_id:'drums',scene:0,step:0,velocity:1,
  },'human').session;
  const before=structuredClone(withBeat);
  const engine=new PulseGridAudioEngine();
  engine.setAudioAssetResolver(resolverOf(bytes));
  try{
   await engine.play(withBeat,0);
   const live=SimulatedAudioContext.instances.at(-1);
   assert.equal(live.createdOscillators,1,'original kick oscillator is played');
   assert.equal(live.starts.length,2,'actual verified piano and stochastic hi-hat sample play');
   const performedNoise=live.starts.find(x=>x.source.buffer?.duration===.09)?.source.buffer;
   assert.ok(performedNoise?.duration>0);
   engine.stop();
   const review=await engine.auditRecordedPianoOfflineBus();
   assert.equal(review.status,'offline_track_bus_pcm_measurement',JSON.stringify(review));
   assert.equal(review.analyzed_drum_hits,2);
   assert.equal(review.analyzed_voices,1);
   assert.ok(review.included_track_ids.includes('drums'));
   const offline=SimulatedAudioContext.instances.at(-1);
   assert.equal(offline.createdOscillators,1,'offline kick uses same shared sine/glide scheduler');
   assert.equal(offline.starts.length,2,'offline piano and hi-hat WAV sources both schedule');
   assert.equal(offline.starts.find(x=>x.source.buffer?.duration===.09)?.source.buffer,performedNoise,
    'offline reuses exact random hat sample from performed live hit');
   assert.deepEqual(withBeat,before,'canonical authored MIDI/percussion remains unchanged');
   assert.equal(withBeat.assets[0].rights,'unknown');
  }finally{
   await engine.close();
   if(prior===undefined)delete globalThis.OfflineAudioContext;
   else globalThis.OfflineAudioContext=prior;
  }
 });
});


test('real PulseGrid extended offline review produces eight-second private WAV without changing licensed source authority',{concurrency:false},async()=>{
 await withSimulatedAudio(async()=>{
  const prior=globalThis.OfflineAudioContext;
  class ExtendedOffline extends SimulatedAudioContext{
   constructor(ch,frames,rate){super();this.frames=frames;this.sampleRate=rate;}
   async startRendering(){
    const l=new Float32Array(this.frames).fill(.25);
    const r=new Float32Array(this.frames).fill(-.25);
    return {numberOfChannels:2,length:this.frames,getChannelData:c=>c?r:l};
   }
  }
  globalThis.OfflineAudioContext=ExtendedOffline;
  const pcm=new Float32Array(36000).fill(.3);
  class PCMContext extends SimulatedAudioContext{
   async decodeAudioData(raw){return {...await super.decodeAudioData(raw),getChannelData:()=>pcm}}
  }
  globalThis.AudioContext=PCMContext;
  const {session,bytes}=prepare();
  const before=structuredClone(session);
  const engine=new PulseGridAudioEngine();
  engine.setAudioAssetResolver(resolverOf(bytes));
  try{
   await engine.play(session,0);
   const during=await engine.auditRecordedPianoOfflineBus({window_sec:8,includeAuditionWav:true});
   assert.equal(during.status,'unavailable','offline auditioner cannot inspect while live engine is playing');
   engine.stop();
   const review=await engine.auditRecordedPianoOfflineBus({window_sec:8,includeAuditionWav:true});
   assert.equal(review.status,'offline_track_bus_pcm_measurement',JSON.stringify({...review,audition_wav_bytes:null}));
   assert.equal(review.window_sec,8);
   assert.equal(review.rendered_frames,384000);
   assert.equal(review.sample_peak,.25);
   assert.equal(review.audition_sample_clamped,false);
   assert.ok(review.audition_wav_bytes instanceof Uint8Array);
   assert.equal(review.audition_wav_bytes.length,44+384000*4);
   assert.deepEqual(session,before,'no source rights, score or master parameters edited');
   assert.equal(session.assets[0].rights,'unknown');
  }finally{
   await engine.close();
   if(prior===undefined)delete globalThis.OfflineAudioContext;
   else globalThis.OfflineAudioContext=prior;
  }
 });
});
