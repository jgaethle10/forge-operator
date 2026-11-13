import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeFoundryAuditionWav as wav} from './instrument-foundry-audition-wav.mjs';
const buffer=(left,right,rate=48000)=>({
 sampleRate:rate,numberOfChannels:2,length:left.length,
 getChannelData:c=>c===0?left:right,
});
test('signed stereo 48kHz private audition WAV has a valid PCM RIFF header and interleaved channels',()=>{
 const output=wav(buffer(new Float32Array([0,1,-1]),new Float32Array([-.5,.5,0])));
 const dv=new DataView(output.buffer);
 assert.equal(Buffer.from(output.slice(0,4)).toString('ascii'),'RIFF');
 assert.equal(Buffer.from(output.slice(8,12)).toString('ascii'),'WAVE');
 assert.equal(Buffer.from(output.slice(36,40)).toString('ascii'),'data');
 assert.equal(dv.getUint16(20,true),1);assert.equal(dv.getUint16(22,true),2);
 assert.equal(dv.getUint32(24,true),48000);
 assert.equal(dv.getUint16(34,true),16);
 assert.equal(dv.getInt16(44,true),0);
 assert.equal(dv.getInt16(46,true),-16384);
 assert.equal(dv.getInt16(48,true),32767);
 assert.equal(dv.getInt16(50,true),16384);
 assert.equal(dv.getInt16(52,true),-32768);
 assert.equal(dv.getUint32(40,true),12);
 assert.equal(output.length,56);
});
test('float sample above full scale is clamped in audition bytes, not mutated at source',()=>{
 const l=new Float32Array([1.4,-1.3]),r=new Float32Array([0,0]);
 const out=wav(buffer(l,r));const view=new DataView(out.buffer);
 assert.equal(view.getInt16(44,true),32767);
 assert.equal(view.getInt16(48,true),-32768);
 assert.deepEqual(Array.from(l),Array.from(new Float32Array([1.4,-1.3])));
});
test('missing stereo, nonfinite audio, unsupported rate or oversized payload never creates a valid WAV',()=>{
 for(const invalid of [
  buffer(new Float32Array([NaN]),new Float32Array([.1])),
  buffer(new Float32Array([Infinity]),new Float32Array([.1])),
  buffer(new Float32Array([40]),new Float32Array([.1])),
  buffer(new Float32Array([0]),new Float32Array([0]),44100),
  {numberOfChannels:1,length:1,sampleRate:48000,getChannelData:()=>new Float32Array([0])},
  buffer(new Float32Array(384001),new Float32Array(384001))
 ]) assert.throws(()=>wav(invalid),/Invalid|Nonfinite|Incomplete/);
 assert.throws(()=>wav(buffer(new Float32Array([0]),new Float32Array([0])),{maxSeconds:100}),/Invalid/);
});
