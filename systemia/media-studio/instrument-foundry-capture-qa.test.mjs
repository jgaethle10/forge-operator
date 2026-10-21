import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeFoundryPianoWav,checkFoundryPianoRootPitch} from './instrument-foundry-capture-qa.mjs';

function wav({
  duration=.9,rate=48000,channels=1,bits=16,codec=1,
  amplitude=.28,frequency=261.625,mode='decay',dc=0,
}={}){
  const frames=Math.round(rate*duration),sampleBytes=bits/8,align=channels*sampleBytes;
  const b=Buffer.alloc(44+frames*align);
  b.write('RIFF',0);b.writeUInt32LE(b.length-8,4);b.write('WAVE',8);
  b.write('fmt ',12);b.writeUInt32LE(16,16);b.writeUInt16LE(codec,20);
  b.writeUInt16LE(channels,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*align,28);
  b.writeUInt16LE(align,32);b.writeUInt16LE(bits,34);
  b.write('data',36);b.writeUInt32LE(frames*align,40);
  for(let f=0;f<frames;f++){
    const t=f/rate, envelope=mode==='decay'?Math.exp(-t*10):(mode==='silent'?0:1);
    let v=amplitude*envelope*Math.sin(2*Math.PI*frequency*t)+dc;
    if(mode==='clipped')v=Math.min(1,Math.max(-1,v*6));
    v=Math.max(-1,Math.min(1,v));
    for(let c=0;c<channels;c++){
      const off=44+(f*channels+c)*sampleBytes;
      if(codec===3){b.writeFloatLE(v,off);continue;}
      if(bits===16)b.writeInt16LE(Math.round(v*32767),off);
      if(bits===24){let n=Math.round(v*8388607);if(n<0)n+=16777216;b.writeUIntLE(n,off,3)}
      if(bits===32)b.writeInt32LE(Math.round(v*2147483647),off);
    }
  }
  return b;
}
test('clean decaying PCM16 piano-like fixture passes technical capture gate (not artistic quality)',()=>{
 const result=analyzeFoundryPianoWav(wav());
 assert.equal(result.status,'technical_signal_pass');
 assert.deepEqual(result.blockers,[]);
 assert.equal(result.metrics.sample_rate,48000);
 assert.equal(result.metrics.channels,1);
 assert.equal(result.musical_quality_approved,false);
 assert.equal(result.performer_rights_verified,false);
 assert.equal(result.commercial_release_ready,false);
});
test('quiet real dynamic recording is not falsely rejected solely because peak is low',()=>{
 const r=analyzeFoundryPianoWav(wav({amplitude:.008}));
 assert.equal(r.status,'technical_signal_pass');
});
test('sustained clipping fails closed',()=>{
 const r=analyzeFoundryPianoWav(wav({amplitude:.4,mode:'clipped'}));
 assert.equal(r.status,'held');
 assert.ok(r.blockers.includes('sustained_sample_clipping'));
});
test('piano with conspicuously cut-off decay is held before instrument assignment',()=>{
 const r=analyzeFoundryPianoWav(wav({mode:'constant',amplitude:.24}));
 assert.equal(r.status,'held');
 assert.ok(r.blockers.includes('piano_decay_tail_cut_or_recording_untrimmed'));
});
test('near-silent recording rejected',()=>{
 const r=analyzeFoundryPianoWav(wav({mode:'silent'}));
 assert.equal(r.status,'held');
 assert.ok(r.blockers.includes('recording_near_silent'));
});
test('bias/dc offset rejected independently of sound peaks',()=>{
 const r=analyzeFoundryPianoWav(wav({dc:.14,amplitude:.13}));
 assert.equal(r.status,'held');
 assert.ok(r.blockers.includes('excessive_dc_offset'));
});
test('PCM24 stereo decoding yields realistic safe metrics',()=>{
 const r=analyzeFoundryPianoWav(wav({bits:24,channels:2,mode:'decay'}));
 assert.equal(r.status,'technical_signal_pass');
 assert.equal(r.metrics.bit_depth,24);
 assert.equal(r.metrics.channels,2);
});
test('float32 PCM recording is supported but out-of-range float is held',()=>{
 const good=wav({bits:32,codec:3});
 const passed=analyzeFoundryPianoWav(good);
 assert.equal(passed.status,'technical_signal_pass');
 good.writeFloatLE(Number.NaN,44+100);
 const bad=analyzeFoundryPianoWav(good);
 assert.ok(bad.blockers.includes('nonfinite_or_out_of_range_audio'));
});
test('invalid RIFF length rejects malicious/truncated files',()=>{
 const b=wav();b.writeUInt32LE(9999999,4);
 assert.throws(()=>analyzeFoundryPianoWav(b),/Invalid WAV container/);
});
test('invalid block align and unknown format fail rather than giving false QA pass',()=>{
 const b=wav();b.writeUInt16LE(6,32);
 assert.throws(()=>analyzeFoundryPianoWav(b),/block alignment/);
 const other=wav();other.writeUInt16LE(7,20);
 assert.throws(()=>analyzeFoundryPianoWav(other),/supports PCM/);
});
test('recordings shorter than 300 ms are rejected for expressive acoustic audition',()=>{
 assert.throws(()=>analyzeFoundryPianoWav(wav({duration:.1})),/0.3 to 15 seconds/);
});
test('byte slices with nonzero offset decode without reading unrelated memory',()=>{
 const original=wav(),wrapped=Buffer.concat([Buffer.alloc(9),original,Buffer.alloc(5)]);
 const sub=wrapped.subarray(9,wrapped.length-5);
 const r=analyzeFoundryPianoWav(sub);
 assert.equal(r.status,'technical_signal_pass');
});

test('recorded middle C tone maps to user-selected MIDI root 60 without granting release rights',()=>{
 const r=checkFoundryPianoRootPitch(wav({frequency:261.625565}),60);
 assert.equal(r.status,'consistent');
 assert.ok(Math.abs(r.cents_error)<18,JSON.stringify(r));
 assert.equal(r.expected_midi,60);
 assert.equal(r.human_pitch_confirmed,false);
});
test('wrong semitone label is detected rather than silently transposing from a false root',()=>{
 const r=checkFoundryPianoRootPitch(wav({frequency:261.625565}),61);
 assert.equal(r.status,'mismatch',JSON.stringify(r));
 assert.ok(Math.abs(r.cents_error)>45);
});
test('accurate higher-register and lower-register note captures are resolved',()=>{
 const a=checkFoundryPianoRootPitch(wav({frequency:110}),45);
 const b=checkFoundryPianoRootPitch(wav({frequency:880}),81);
 assert.equal(a.status,'consistent',JSON.stringify(a));
 assert.equal(b.status,'consistent',JSON.stringify(b));
});
test('out-of-range MIDI values are rejected rather than guessed from audio',()=>{
 const b=wav();
 assert.throws(()=>checkFoundryPianoRootPitch(b,20),/integer MIDI/);
 assert.throws(()=>checkFoundryPianoRootPitch(b,109),/integer MIDI/);
 assert.throws(()=>checkFoundryPianoRootPitch(b,60.1),/integer MIDI/);
});
test('blank piano capture provides indeterminate root evidence, not a fabricated note',()=>{
 const r=checkFoundryPianoRootPitch(wav({mode:'silent'}),60);
 assert.equal(r.status,'indeterminate');
 assert.equal(r.estimated_hz,null);
});
test('opposite-phase stereo notes remain measurable without destructive channel summing',()=>{
 const recording=wav({channels:2,bits:16,frequency:261.625565});
 for(let o=46;o<recording.length;o+=4){
   const v=recording.readInt16LE(o-2);
   recording.writeInt16LE(-v,o);
 }
 const r=checkFoundryPianoRootPitch(recording,60);
 assert.equal(r.status,'consistent',JSON.stringify(r));
});
test('real PCM24 stereo recording can have pitch evidence without relabeling rights',()=>{
 const r=checkFoundryPianoRootPitch(wav({bits:24,channels:2,frequency:440}),69);
 assert.equal(r.status,'consistent',JSON.stringify(r));
 assert.equal(r.human_pitch_confirmed,false);
});
test('pitch parser works on sliced RIFF source with nonzero ArrayBuffer offset',()=>{
 const b=wav({frequency:261.625565});
 const whole=Buffer.concat([Buffer.alloc(13),b,Buffer.alloc(7)]);
 const r=checkFoundryPianoRootPitch(whole.subarray(13,whole.length-7),60);
 assert.equal(r.status,'consistent',JSON.stringify(r));
});

function harmonicCapture({
  midi=60,duration=1.2,partials=[1,.44,.2,.12],inharmonicity=.00006,noise=.012
}={}){
 const rate=48000,frames=Math.round(rate*duration);
 const output=Buffer.alloc(44+frames*2);
 output.write('RIFF',0);output.writeUInt32LE(output.length-8,4);
 output.write('WAVE',8);output.write('fmt ',12);output.writeUInt32LE(16,16);
 output.writeUInt16LE(1,20);output.writeUInt16LE(1,22);
 output.writeUInt32LE(rate,24);output.writeUInt32LE(rate*2,28);
 output.writeUInt16LE(2,32);output.writeUInt16LE(16,34);
 output.write('data',36);output.writeUInt32LE(frames*2,40);
 const base=440*Math.pow(2,(midi-69)/12);
 for(let i=0;i<frames;i++){
  const t=i/rate,decay=Math.exp(-t*8);
  let y=0;
  for(let h=1;h<=partials.length;h++){
   const freq=base*h*Math.sqrt(1+inharmonicity*h*h);
   y+=partials[h-1]*Math.sin(2*Math.PI*freq*t);
  }
  // Deterministic noise transient, distinctly different from a pure oscillator.
  const x=(Math.sin((i+1)*119.33)*43758.5453)%1;
  y=(y*.15*decay+noise*(x-Math.trunc(x))*.5*Math.exp(-t*78));
  output.writeInt16LE(Math.round(Math.max(-1,Math.min(1,y))*32767),44+2*i);
 }
 return output;
}
test('rich, slightly inharmonic concert-piano-style C4 is judged consistent without claiming acoustic realism',()=>{
 const r=checkFoundryPianoRootPitch(harmonicCapture({midi:60}),60);
 assert.equal(r.status,'consistent',JSON.stringify(r));
 assert.equal(r.human_pitch_confirmed,false);
});
test('rich low A1 and high C8 synthetic harmonics exercise extreme register coverage',()=>{
 const a=checkFoundryPianoRootPitch(harmonicCapture({midi:33,duration:1.5}),33);
 const b=checkFoundryPianoRootPitch(harmonicCapture({midi:108,noise:.004}),108);
 assert.equal(a.status,'consistent',JSON.stringify(a));
 assert.equal(b.status,'consistent',JSON.stringify(b));
});
test('pure octave overtone cannot impersonate middle C and be admitted to the piano bank',()=>{
 const r=checkFoundryPianoRootPitch(wav({frequency:523.25113}),60);
 assert.notEqual(r.status,'consistent',JSON.stringify(r));
});
test('even-harmonic-only content must not masquerade as the octave below',()=>{
 const r=checkFoundryPianoRootPitch(harmonicCapture({midi:60,partials:[0,1,0,.5],inharmonicity:0,noise:0}),60);
 assert.notEqual(r.status,'consistent',JSON.stringify(r));
});
test('valid weak fundamental with strong second and third harmonics remains a candidate',()=>{
 const r=checkFoundryPianoRootPitch(harmonicCapture({midi:60,partials:[.08,1,.45,.08],inharmonicity:0,noise:0}),60);
 assert.equal(r.status,'consistent',JSON.stringify(r));
});
