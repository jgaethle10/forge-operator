import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('Fallen Sessions UI consumes the canonical PulseGrid browser entrypoint',()=>{
  const ui=fs.readFileSync('src/FallenSessions.tsx','utf8');
  assert.match(ui,/from '\.\.\/systemia\/media-studio\/pulsegrid-browser'/);
  assert.match(ui,/applyPulseGridTransaction/);
  assert.match(ui,/PulseGridAudioEngine/);
  assert.match(ui,/PulseGridBrowserAudioAssetVault/);
  assert.match(ui,/setAudioAssetResolver/);
  assert.match(ui,/getVerifiedBlob/);
  assert.match(ui,/audioRef\.current\?\.updateSession\(session\)/);
  assert.match(ui,/audioRef\.current\?\.play\(session,selectedScene\)/);
  assert.match(ui,/audioStatus\.clock_mode/);
  assert.match(ui,/audioStatus\.track_buses/);
  assert.match(ui,/audioStatus\.latency_ms/);
  assert.match(ui,/undoPulseGridReceipt/);
  assert.match(ui,/clip\.fork_variation/);
  assert.doesNotMatch(ui,/function\s+createPulseGridSession\s*\(/);
  assert.doesNotMatch(ui,/const\s+createPulseGridSession\s*=/);
});

test('Fallen Sessions route wins before the broader Fallen route',()=>{
  const main=fs.readFileSync('src/main.tsx','utf8');
  const sessions=main.indexOf("startsWith('/fallen-sessions')");
  const fallen=main.indexOf("startsWith('/fallen')",sessions+1);
  assert.ok(sessions>=0,'Missing /fallen-sessions route.');
  assert.ok(fallen>sessions,'/fallen-sessions must route before /fallen.');
});

test('Fallen Sessions UI keeps a bounded responsive shell',()=>{
  const css=fs.readFileSync('src/fallen-sessions.css','utf8');
  assert.match(css,/max-width\s*:\s*100%/i);
  assert.match(css,/overflow-x\s*:\s*hidden/i);
  assert.match(css,/minmax\(0\s*,\s*1fr\)/i);
  assert.match(css,/-webkit-text-size-adjust\s*:\s*100%/i);
  assert.match(css,/min-height\s*:\s*44px/i);
});


test('PulseGrid browser entrypoint exports the canonical audio adapter',()=>{
  const browser=fs.readFileSync('systemia/media-studio/pulsegrid-browser.ts','utf8');
  const audio=fs.readFileSync('systemia/media-studio/pulsegrid-audio.ts','utf8');
  assert.match(browser,/PulseGridAudioEngine/);
  assert.match(audio,/pulsegrid-session/);
  assert.match(audio,/PulseGridSession/);
  assert.match(audio,/PulseGridTrack/);
  assert.doesNotMatch(audio,/node:/);
});


test('Fallen Sessions imports audio through vault plus one canonical transaction',()=>{
  const ui=fs.readFileSync('src/FallenSessions.tsx','utf8');
  assert.match(ui,/importAudioFile/);
  assert.match(ui,/vault\.ingest/);
  assert.match(ui,/asset\.register_audio/);
  assert.match(ui,/clip\.attach_audio_asset/);
  assert.match(ui,/applyPulseGridTransaction/);
  assert.match(ui,/rights:'unknown'/);
  assert.doesNotMatch(ui,/rights:'owned'/);
});

test('Fallen Sessions audio picker remains browser-local and audio-scoped',()=>{
  const ui=fs.readFileSync('src/FallenSessions.tsx','utf8');
  assert.match(ui,/type="file"/);
  assert.match(ui,/accept="audio\/\*"/);
  assert.match(ui,/local-file:/);
  assert.doesNotMatch(ui,/fetch\(/);
});


test('Fallen Sessions microphone recording uses the canonical asset pipeline',()=>{
  const ui=fs.readFileSync('src/FallenSessions.tsx','utf8');
  assert.match(ui,/navigator\.mediaDevices\.getUserMedia/);
  assert.match(ui,/new MediaRecorder/);
  assert.match(ui,/source_state:'recording'/);
  assert.match(ui,/rights:'unknown'/);
  assert.match(ui,/vault\.ingest\(blob/);
  assert.match(ui,/commitAudioAsset/);
  assert.match(ui,/applyPulseGridTransaction/);
});

test('Fallen Sessions recording pins destination scene but commits against latest graph state',()=>{
  const ui=fs.readFileSync('src/FallenSessions.tsx','utf8');
  assert.match(ui,/recordingSceneRef\.current=selectedScene/);
  assert.match(ui,/const current=sessionRef\.current/);
  assert.match(ui,/const scene=recordingSceneRef\.current/);
});

test('Fallen Sessions recorder cleanup severs callbacks before unmount teardown',()=>{
  const ui=fs.readFileSync('src/FallenSessions.tsx','utf8');
  assert.match(ui,/recorder\.ondataavailable=null/);
  assert.match(ui,/recorder\.onstop=null/);
  assert.match(ui,/recorder\.onerror=null/);
  assert.match(ui,/getTracks\(\)\.forEach/);
});


test('Fallen Sessions Web MIDI note lifecycle commits canonical controller notes',()=>{
  const ui=fs.readFileSync('src/FallenSessions.tsx','utf8');
  assert.match(ui,/requestMIDIAccess/);
  assert.match(ui,/onmidimessage/);
  assert.match(ui,/command===0x90&&rawVelocity>0/);
  assert.match(ui,/command===0x80\|\|\(command===0x90&&rawVelocity===0\)/);
  assert.match(ui,/type:'note.add'/);
  assert.match(ui,/\},'controller'\)/);
  assert.match(ui,/velocity:held\.velocity/);
  assert.match(ui,/length,/);
});

test('Fallen Sessions MIDI pins note-on destination and commits against latest graph',()=>{
  const ui=fs.readFileSync('src/FallenSessions.tsx','utf8');
  assert.match(ui,/selectedTrackRef\.current/);
  assert.match(ui,/selectedSceneRef\.current/);
  assert.match(ui,/heldMidiNotesRef\.current\.set/);
  assert.match(ui,/const current=sessionRef\.current/);
  assert.match(ui,/performance\.now\(\)-held\.startedAt/);
});

test('Fallen Sessions MIDI disconnect clears device handlers and held-note state',()=>{
  const ui=fs.readFileSync('src/FallenSessions.tsx','utf8');
  assert.match(ui,/input\.onmidimessage=null/);
  assert.match(ui,/access\.onstatechange=null/);
  assert.match(ui,/heldMidiNotesRef\.current\.clear\(\)/);
});
