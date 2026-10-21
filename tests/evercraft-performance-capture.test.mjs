import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const html=fs.readFileSync('public/evercraft-performance-capture/index.html','utf8');
test('capture prototype does not upload performance or invent approval',()=>{
 assert.match(html,/no_cloud_upload:true/);
 assert.match(html,/human_music_approved:false/);
 assert.doesNotMatch(html,/\bfetch\s*\(/);
 assert.doesNotMatch(html,/\bXMLHttpRequest\b/);
 assert.doesNotMatch(html,/\bWebSocket\s*\(/);
});
test('raw performance captures actual MIDI, pedal and local WAV data',()=>{
 for(const feature of ['requestMIDIAccess','note_on','note_off',"kind==='pedal'",'getUserMedia','wavFromChunks','midiBlob']) assert.ok(html.includes(feature),feature);
});
test('performance event timestamps are not quantized',()=>{
 assert.match(html,/performance\.now\(\)-state\.startMs/);
 assert.match(html,/TICKS_PER_SECOND=960/);
 assert.match(html,/MThd/);
});
