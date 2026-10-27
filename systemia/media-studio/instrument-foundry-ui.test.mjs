import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ui=()=>fs.readFileSync('src/FallenSessions.tsx','utf8');
const clip=()=>fs.readFileSync('systemia/media-studio/pulsegrid-audio.ts','utf8');

test('Foundry WAV appears as a separate deliberate import path, not a replacement for generic audio',()=>{
  const source=ui();
  assert.match(source,/Import Audio<\/button>/);
  assert.match(source,/Import Foundry WAV<\/button>/);
  assert.match(source,/importFoundryWavFile/);
  assert.match(source,/importAudioFile/);
  assert.match(source,/accept="\.wav,audio\/wav,audio\/x-wav,audio\/wave"/);
});
test('actual stored WAV bytes undergo separate verification before graph mutation',()=>{
  const source=ui();
  const fn=source.slice(source.indexOf('async function importFoundryWavFile'),source.indexOf('async function importAudioFile'));
  assert.match(fn,/vault\.ingest/);
  assert.match(fn,/await vault\.getVerifiedBlob\(asset\)/);
  assert.match(fn,/await verifyFoundryWavBytes\(/);
  assert.match(fn,/compileFoundryImport\(/);
  assert.match(fn,/applyPulseGridTransaction\(/);
  assert.ok(fn.indexOf('verifyFoundryWavBytes')<fn.indexOf('applyPulseGridTransaction'));
});
test('Foundry local audition cannot grant rights, assert provider auth or release',()=>{
  const source=ui();
  const fn=source.slice(source.indexOf('async function importFoundryWavFile'),source.indexOf('async function importAudioFile'));
  assert.match(fn,/rights:'unknown'/);
  assert.match(fn,/local audition/);
  assert.match(fn,/no commercial release clearance/);
  assert.doesNotMatch(fn,/rights:'owned'/);
  assert.doesNotMatch(fn,/release_ready:true/);
});
test('Foundry WAV scene adapts to recording and rejects >16 bars instead of silent truncation',()=>{
  const source=ui();
  const fn=source.slice(source.indexOf('async function importFoundryWavFile'),source.indexOf('async function importAudioFile'));
  assert.match(fn,/const requiredBars=/);
  assert.match(fn,/PULSEGRID_MAX_CLIP_BARS/);
  assert.match(fn,/throw new Error\('Foundry take exceeds the 16-bar audition limit/);
  assert.match(fn,/type:'clip.set_bars'/);
  assert.ok(fn.indexOf('requiredBars>PULSEGRID_MAX_CLIP_BARS')<fn.indexOf('applyPulseGridTransaction'));
  assert.match(clip(),/scheduleAudioAsset\(bus\.input,assetBuffer,time,sceneDuration,mode\)/);
});
test('browser already uses the same local verified asset vault for actual audio execution',()=>{
  const source=ui();
  assert.match(source,/new PulseGridAudioEngine\(\)/);
  assert.match(source,/setAudioAssetResolver\(\(asset\)=>vaultRef\.current!\.getVerifiedBlob\(asset\)\)/);
  assert.match(source,/audioRef\.current\?\.play\(session,selectedScene\)/);
});

test('Foundry take explicitly selects one-shot while other PulseGrid audio remains loop-capable',()=>{
  const source=ui();
  const fn=source.slice(source.indexOf('async function importFoundryWavFile'),source.indexOf('async function importAudioFile'));
  assert.match(fn,/type:'clip.set_audio_playback_mode'/);
  assert.match(fn,/mode:'one_shot'/);
  assert.match(clip(),/schedulePulseGridAudioBuffer/);
  assert.match(clip(),/audio_playback_mode==='one_shot'/);
});
test('missing verified audio fails visibly instead of pretending an empty buffer played',()=>{
  assert.match(clip(),/throw new Error\('PulseGrid audio asset is missing from verified storage:/);
});

test('the same Fallen Sessions screen exposes recording to playable canonical piano binding',()=>{
 const source=ui();
 assert.match(source,/Arm Recorded Piano/);
 assert.match(source,/Foundry piano root MIDI note/);
 assert.match(source,/async function armFoundryPianoFromTake\(\)/);
 const fn=source.slice(source.indexOf('async function armFoundryPianoFromTake'),source.indexOf('async function importFoundryWavFile'));
 assert.match(fn,/vaultRef\.current\?\.getVerifiedBlob/);
 assert.match(fn,/verifyFoundryWavBytes/);
 assert.match(fn,/type:'clip.set_foundry_piano_patch'/);
 assert.match(fn,/applyPulseGridTransaction/);
 assert.match(fn,/setSelectedTrackId\(keysTrack.id\)/);
 assert.match(fn,/release_sec:0\.22/);
 assert.match(fn,/raw take detached/);
 assert.ok(fn.indexOf('verifyFoundryWavBytes')<fn.indexOf('applyPulseGridTransaction'));
});
test('piano patch remains bounded by user-selected pitch and cannot claim commercial clearance',()=>{
 const source=ui();
 const fn=source.slice(source.indexOf('async function armFoundryPianoFromTake'),source.indexOf('async function importFoundryWavFile'));
 assert.match(fn,/root<21\|\|root>108/);
 assert.match(fn,/appendFoundryPianoSample/);
 assert.match(fn,/rights==='restricted'/);
 assert.doesNotMatch(fn,/rights:'owned'/);
 assert.doesNotMatch(fn,/release_ready:true/);
});

test('arming a piano sample atomically detaches original Audio Take to avoid double playback',()=>{
 const source=ui();
 const fn=source.slice(source.indexOf('async function armFoundryPianoFromTake'),source.indexOf('async function importFoundryWavFile'));
 assert.match(fn,/type:'clip.attach_audio_asset',track_id:audioTrack.id,scene:selectedScene,asset_id:null/);
 const detach=fn.indexOf("type:'clip.attach_audio_asset'");
 const patch=fn.indexOf("type:'clip.set_foundry_piano_patch'");
 const apply=fn.indexOf("applyPulseGridTransaction(current");
 assert.ok(apply>=0&&detach>apply&&patch>detach,'raw WAV must detach and patch attach inside same transaction');
 assert.match(fn,/asset_id:asset.id/);
});

test('Foundry UI accumulates additional pitch and velocity layers without replacing the piano bank',()=>{
 const source=ui();
 const fn=source.slice(source.indexOf('async function armFoundryPianoFromTake'),source.indexOf('async function importFoundryWavFile'));
 assert.match(fn,/const existing=keysTrack.clips\[selectedScene\]\?\.provenance\?\.foundry_piano_patch/);
 assert.match(fn,/appendFoundryPianoSample\(existing/);
 assert.match(fn,/velocity_min:foundryVelocityMin/);
 assert.match(fn,/velocity_max:foundryVelocityMax/);
 assert.match(fn,/patch\.samples\.length/);
 assert.match(source,/Foundry minimum sample velocity/);
 assert.match(source,/Foundry maximum sample velocity/);
});

test('Foundry does not arm a silent, clipped, DC-damaged or truncated recording as piano',()=>{
 const fn=ui().slice(ui().indexOf('async function armFoundryPianoFromTake'),ui().indexOf('async function importFoundryWavFile'));
 assert.match(fn,/analyzeFoundryPianoWav\(sampleBytes\)/);
 assert.match(fn,/signalQa\.status!=='technical_signal_pass'/);
 assert.match(fn,/Piano capture held:/);
 assert.match(fn,/signalQa\.blockers\.join/);
 assert.ok(fn.indexOf('await verifyFoundryWavBytes')<fn.indexOf('analyzeFoundryPianoWav'));
 assert.ok(fn.indexOf('analyzeFoundryPianoWav')<fn.indexOf('applyPulseGridTransaction'));
 assert.match(fn,/musician review and performer rights still unverified/);
});

test('recorded piano root is checked against actual WAV waveform before any canonical transaction',()=>{
 const source=ui();
 const fn=source.slice(source.indexOf('async function armFoundryPianoFromTake'),source.indexOf('async function importFoundryWavFile'));
 assert.match(fn,/checkFoundryPianoRootPitch\(sampleBytes,root\)/);
 assert.match(fn,/pitchEvidence\.status!=='consistent'/);
 assert.match(fn,/Piano root MIDI/);
 assert.match(fn,/independent musician pitch review/);
 assert.match(fn,/pitchEvidence\.cents_error/);
 assert.ok(fn.indexOf('checkFoundryPianoRootPitch')<fn.indexOf('appendFoundryPianoSample'));
 assert.ok(fn.indexOf('checkFoundryPianoRootPitch')<fn.indexOf('applyPulseGridTransaction'));
});

test('Web MIDI CC64 is decoded independently of notes and committed as a reversible canonical controller edit',()=>{
 const source=ui();
 const midi=source.slice(source.indexOf('function handleMidiMessage'),source.indexOf('async function toggleMidi'));
 assert.match(source,/decodeFoundryMidiSustain/);
 assert.match(midi,/decodeFoundryMidiSustain\(data\)/);
 assert.ok(midi.indexOf('decodeFoundryMidiSustain')<midi.indexOf('const isNoteOn='));
 assert.match(midi,/mergeFoundryMidiPedalEvent/);
 assert.match(midi,/controllerKey/);
 assert.match(midi,/midiPedalSourceRef/);
 assert.match(midi,/type:'clip.set_foundry_piano_pedal'/);
 assert.match(midi,/applyPulseGridOperation\(current/);
 assert.match(midi,/sessionRef\.current=result\.session/);
});
test('MIDI CC64 during playback is buffered and requires explicit commit, not a disruptive audio-graph mutation',()=>{
 const source=ui();
 const handler=source.slice(source.indexOf('function handleMidiMessage'),source.indexOf('async function toggleMidi'));
 assert.match(handler,/const playingNow=Boolean\(audioRef\.current\?\.status\.playing\)/);
 assert.match(handler,/if\(playingNow\|\|pending\)/);
 assert.match(handler,/midiPedalCaptureRef\.current=pending/);
 assert.match(source,/function commitCapturedPedal\(\)/);
 assert.match(source,/function discardCapturedPedal\(\)/);
 assert.match(source,/Commit Pedal Take/);
 assert.match(source,/Discard Take/);
 const commit=source.slice(source.indexOf('function commitCapturedPedal'),source.indexOf('function discardCapturedPedal'));
 assert.match(commit,/JSON\.stringify\(currentEvents\)!==JSON\.stringify\(captured\.original\)/);
 assert.match(commit,/captured\.clipId/);
 assert.match(commit,/applyPulseGridOperation\(current/);
 assert.doesNotMatch(commit,/rights:'owned'|release_ready:true/);
});
test('manual piano pedal editing removes only one step and CC64 readiness is not called verified human listening',()=>{
 const source=ui();
 assert.match(source,/removeFoundryMidiPedalEvent/);
 assert.match(source,/Remove step event/);
 assert.match(source,/No live acoustic damper response is asserted/);
 assert.match(source,/not device-audible verification/);
});

test('piano tail audit is explicitly metadata-only and ranks short recorded note holds',()=>{
  const source=ui();
  assert.match(source,/analyzeFoundryPianoTailCoverage\(session,selectedScene\)/);
  assert.match(source,/Recorded Piano Tail Budget/);
  assert.match(source,/recording-duration estimate/i);
  assert.match(source,/key_hold_shortfalls/);
  assert.match(source,/release_tail_shortfalls/);
  assert.match(source,/unknown_rights_note_uses/);
  assert.match(source,/not an audible pass or rights clearance/);
});

test('PCM chord audit can only run on demand after music stops, with honest pre-effects wording',()=>{
 const src=ui();
 assert.match(src,/Inspect decoded chord PCM/);
 assert.match(src,/auditRecordedPianoDryPeak\(\)/);
 assert.match(src,/disabled=\{playing\|\|recording/);
 assert.match(src,/sample_peak/);
 assert.match(src,/over_full_scale_frames/);
 assert.match(src,/Partial window only/);
 assert.match(src,/does not measure actual speaker output/);
 assert.match(src,/No automatic compression or gain adjustment is applied/);
});
