import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const html=fs.readFileSync('public/evercraft-performance-capture/index.html','utf8');

test('local recording holds publication and privacy protections',()=>{
  assert.match(html,/no_cloud_upload:true/);
  assert.match(html,/human_music_approved:false/);
  assert.match(html,/capture_integrity:'local_unverified_export_not_signed'/);
  assert.doesNotMatch(html,/\bfetch\s*\(/);
  assert.doesNotMatch(html,/\bXMLHttpRequest\b/);
  assert.doesNotMatch(html,/\bWebSocket\s*\(/);
  assert.doesNotMatch(html,/__evercraftInjectTestMidi/);
});
test('record raw live MIDI source, CC64 pedal and microphone WAV separately',()=>{
  for(const feature of ['requestMIDIAccess','receivedTime','note_on','note_off',"kind==='pedal'",'getUserMedia','wavFromChunks','midiBlob']){
    assert.ok(html.includes(feature),'missing '+feature);
  }
  assert.match(html,/performance\.now\(\)-state\.startMs/);
  assert.match(html,/TICKS_PER_SECOND=960/);
  assert.match(html,/MThd/);
});
test('held keys and sustain pedals close on stop and preserve source/channel identity',()=>{
  assert.match(html,/state\.activeMidi\.set/);
  assert.match(html,/state\.activeMidi\.delete/);
  assert.match(html,/state\.pedals\.set/);
  assert.match(html,/JSON\.stringify\(\[source,channel,note\]\)/);
  assert.match(html,/JSON\.parse\(identity\)/);
  assert.match(html,/state\.activeMidi\]\)/);
  assert.match(html,/writeEvent\('note_off',Number\(note\),0,source,Number\(channel\)\)/);
  assert.match(html,/writeEvent\('pedal',64,0,source,channel\)/);
  assert.match(html,/close_open_notes_on_stop:true/);
});
test('bounded take and meaningful provenance, with no fake hardware certification',()=>{
  assert.match(html,/elapsed>=90000/);
  assert.match(html,/hardware_input_reported:/);
  assert.doesNotMatch(html,/hardware_input_verified:/);
  assert.match(html,/source_types:source/);
});
