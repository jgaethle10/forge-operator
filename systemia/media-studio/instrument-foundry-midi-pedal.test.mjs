import test from 'node:test';
import assert from 'node:assert/strict';
import {
 decodeFoundryMidiSustain,mergeFoundryMidiPedalEvent,removeFoundryMidiPedalEvent
} from './instrument-foundry-midi-pedal.mjs';
import {applyPulseGridOperation,createPulseGridSession,undoPulseGridReceipt} from './pulsegrid-session.ts';
const e=(step,down)=>({step,down});
test('MIDI controller 64 threshold and all 16 channels are decoded without guessing',()=>{
 assert.deepEqual(decodeFoundryMidiSustain([0xb0,64,63]),{channel:0,value:63,down:false});
 assert.deepEqual(decodeFoundryMidiSustain(new Uint8Array([0xb0,64,64])),{channel:0,value:64,down:true});
 assert.deepEqual(decodeFoundryMidiSustain([0xbf,64,127]),{channel:15,value:127,down:true});
 assert.deepEqual(decodeFoundryMidiSustain([0xb3,64,0]),{channel:3,value:0,down:false});
});
test('note messages, other controllers, SysEx and truncated payloads never impersonate sustain',()=>{
 for(const bytes of [[],[0xb0,64],[0x90,64,127],[0x80,64,0],[0xa0,64,75],
  [0xe0,64,127],[0xb0,65,127],[0xb0,1,100],[0xf0,64,127],
  [0xb0,64,128],[0xb0,128,90],[-1,64,127],[0xb0,64,NaN]]){
  assert.equal(decodeFoundryMidiSustain(bytes),null,JSON.stringify(bytes));
 }
});
test('repeated CC64 messages are idempotent and do not create a receipt-worthy new score',()=>{
 const first=mergeFoundryMidiPedalEvent([],16,0,true);
 assert.deepEqual(first,[e(0,true)]);
 assert.deepEqual(mergeFoundryMidiPedalEvent(first,16,0,true),first);
 assert.deepEqual(mergeFoundryMidiPedalEvent(first,16,2,true),first);
});
test('first pedal-down then pedal-up inserts ordered alternating transitions',()=>{
 const down=mergeFoundryMidiPedalEvent([],16,0,true);
 const released=mergeFoundryMidiPedalEvent(down,16,6,false);
 assert.deepEqual(released,[e(0,true),e(6,false)]);
 assert.deepEqual(mergeFoundryMidiPedalEvent(released,16,8,true),
  [e(0,true),e(6,false),e(8,true)]);
});
test('same-step final controller value wins and avoids a zero-duration fake sustain',()=>{
 const down=mergeFoundryMidiPedalEvent([],16,4,true);
 assert.deepEqual(mergeFoundryMidiPedalEvent(down,16,4,false),[]);
 const a=[e(0,true),e(12,false)];
 assert.deepEqual(mergeFoundryMidiPedalEvent(a,16,6,false),[e(0,true),e(6,false)]);
});
test('merging before later events preserves meaningful downstream pedal changes',()=>{
 const existing=[e(0,true),e(4,false),e(10,true),e(14,false)];
 assert.deepEqual(mergeFoundryMidiPedalEvent(existing,16,7,true),
  [e(0,true),e(4,false),e(7,true),e(14,false)]);
 assert.deepEqual(existing,[e(0,true),e(4,false),e(10,true),e(14,false)]);
});
test('remove selected step keeps other events and validates remaining transitions',()=>{
 assert.deepEqual(removeFoundryMidiPedalEvent([e(0,true),e(4,false),e(8,true)],16,4),
  [e(0,true)]);
 assert.deepEqual(removeFoundryMidiPedalEvent([e(0,true),e(4,false)],16,0),[]);
 assert.deepEqual(removeFoundryMidiPedalEvent([],16,4),[]);
});
test('bad steps and preexisting corrupt events reject before modifying the graph',()=>{
 for(const step of [-1,16,1.2,NaN]){
  assert.throws(()=>mergeFoundryMidiPedalEvent([],16,step,true),/Invalid MIDI pedal/);
 }
 assert.throws(()=>mergeFoundryMidiPedalEvent([],16,0,1),/Invalid MIDI pedal/);
 assert.throws(()=>mergeFoundryMidiPedalEvent([e(4,false)],16,5,true),/alternate/);
 assert.throws(()=>removeFoundryMidiPedalEvent([e(4,false)],16,4),/alternate/);
});
test('decoded MIDI pedal is stored by canonical controller operation, with reversible receipt',()=>{
 const source=createPulseGridSession('CC64 capture pilot'),prior=structuredClone(source);
 const decoded=decodeFoundryMidiSustain(new Uint8Array([0xb1,64,127]));
 const pedal=mergeFoundryMidiPedalEvent([],source.tracks.find(t=>t.id==='keys').clips[0].steps.length,0,decoded.down);
 const {session,receipt}=applyPulseGridOperation(source,{
  type:'clip.set_foundry_piano_pedal',track_id:'keys',scene:0,events:pedal
 },'controller');
 assert.equal(receipt.actor,'controller');
 assert.deepEqual(session.tracks.find(t=>t.id==='keys').clips[0].provenance.foundry_piano_pedal,[e(0,true)]);
 assert.deepEqual(source,prior);
 const undone=undoPulseGridReceipt(session,receipt.id,'human').session;
 assert.equal(undone.tracks.find(t=>t.id==='keys').clips[0].provenance.foundry_piano_pedal,undefined);
});
