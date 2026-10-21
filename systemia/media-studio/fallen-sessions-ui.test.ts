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


test('Fallen Sessions note expression inspector edits canonical note state',()=>{
  const ui=fs.readFileSync('src/FallenSessions.tsx','utf8');
  assert.match(ui,/selectedNoteId/);
  assert.match(ui,/type:'note\.set_expression'/);
  assert.match(ui,/type:'note\.resize'/);
  assert.match(ui,/velocity:Number\(event\.target\.value\)/);
  assert.match(ui,/probability:Number\(event\.target\.value\)/);
  assert.match(ui,/microtiming:Number\(event\.target\.value\)/);
  assert.doesNotMatch(ui,/selectedNote\.velocity\s*=/);
  assert.doesNotMatch(ui,/selectedNote\.probability\s*=/);
  assert.doesNotMatch(ui,/selectedNote\.microtiming\s*=/);
});

test('Fallen Sessions piano roll selects existing notes and reserves double-click for delete',()=>{
  const ui=fs.readFileSync('src/FallenSessions.tsx','utf8');
  assert.match(ui,/setSelectedNoteId\(existing\.id\)/);
  assert.match(ui,/onDoubleClick=\{\(\)=>\{if\(note\)deleteNote\(note\.id\)\}\}/);
  assert.match(ui,/fsNoteCell.*selected/);
});

test('Fallen Sessions note inspector remains responsive without widening the workspace',()=>{
  const css=fs.readFileSync('src/fallen-sessions.css','utf8');
  assert.match(css,/\.fsNoteInspector/);
  assert.match(css,/grid-template-columns:repeat\(4,minmax\(120px,1fr\)\)/);
  assert.match(css,/@media\(max-width:520px\).*\.fsNoteInspector\{grid-template-columns:minmax\(0,1fr\)\}/s);
});


test('Fallen Sessions piano roll moves notes through canonical note.move',()=>{
  const ui=fs.readFileSync('src/FallenSessions.tsx','utf8');
  assert.match(ui,/type:'note\.move'/);
  assert.match(ui,/draggable=\{Boolean\(note\)\}/);
  assert.match(ui,/onDragStart/);
  assert.match(ui,/onDragOver/);
  assert.match(ui,/onDrop/);
  assert.match(ui,/dataTransfer\.setData\('text\/plain',note\.id\)/);
  assert.match(ui,/moveNote\(draggedNoteId,pitch,step\)/);
  assert.doesNotMatch(ui,/selectedNote\.start\s*=/);
  assert.doesNotMatch(ui,/selectedNote\.pitch\s*=/);
});

test('Fallen Sessions note placement rejects occupied piano-roll cells',()=>{
  const ui=fs.readFileSync('src/FallenSessions.tsx','utf8');
  assert.match(ui,/candidate\.id!==noteId/);
  assert.match(ui,/candidate\.pitch===pitch/);
  assert.match(ui,/That piano-roll cell already contains a note/);
});

test('Fallen Sessions note placement remains editable without drag input',()=>{
  const ui=fs.readFileSync('src/FallenSessions.tsx','utf8');
  assert.match(ui,/Start step/);
  assert.match(ui,/Pitch \{noteName\(selectedNote\.pitch\)\}/);
  assert.match(ui,/moveSelectedNote\(\{start:Number\(event\.target\.value\)-1\}\)/);
  assert.match(ui,/moveSelectedNote\(\{pitch:Number\(event\.target\.value\)\}\)/);
});

test('Fallen Sessions renders an explicit drag state for movable notes',()=>{
  const css=fs.readFileSync('src/fallen-sessions.css','utf8');
  assert.match(css,/\.fsNoteCell\[draggable="true"\]\{cursor:grab\}/);
  assert.match(css,/\.fsNoteCell\.dragging/);
});


test('Fallen Sessions automation lane commits canonical points on release',()=>{
  const ui=fs.readFileSync('src/FallenSessions.tsx','utf8');
  assert.match(ui,/type:'clip\.set_automation_point'/);
  assert.match(ui,/parameter:automationParam/);
  assert.match(ui,/onPointerUp=\{\(event\)=>commitAutomationPoint/);
  assert.match(ui,/onKeyUp=\{\(event\)=>commitAutomationPoint/);
  assert.doesNotMatch(ui,/onChange=\{\(event\)=>commitAutomationPoint/);
});

test('Fallen Sessions automation switches between canonical volume and filter lanes',()=>{
  const ui=fs.readFileSync('src/FallenSessions.tsx','utf8');
  assert.match(ui,/useState<'volume'\|'filter'>\('volume'\)/);
  assert.match(ui,/clip\.automation\[automationParam\]/);
  assert.match(ui,/<option value="volume">Track volume<\/option>/);
  assert.match(ui,/<option value="filter">Filter scale<\/option>/);
});

test('Fallen Sessions automation lane stays bounded and horizontally scrollable',()=>{
  const css=fs.readFileSync('src/fallen-sessions.css','utf8');
  assert.match(css,/\.fsAutomationLane/);
  assert.match(css,/grid-auto-flow:column/);
  assert.match(css,/max-width:100%/);
  assert.match(css,/overflow-x:auto/);
  assert.match(css,/writing-mode:vertical-lr/);
});


test('Fallen Sessions drum step inspector edits canonical step expression',()=>{
  const ui=fs.readFileSync('src/FallenSessions.tsx','utf8');
  assert.match(ui,/type:'clip\.set_step_expression'/);
  assert.match(ui,/selectedStepIndex/);
  assert.match(ui,/commitStepExpression/);
  assert.match(ui,/probability:Number\(event\.currentTarget\.value\)/);
  assert.match(ui,/microtiming:Number\(event\.currentTarget\.value\)/);
  assert.match(ui,/velocity:Number\(event\.currentTarget\.value\)/);
});

test('Fallen Sessions drum expression commits sliders on release rather than every movement',()=>{
  const ui=fs.readFileSync('src/FallenSessions.tsx','utf8');
  assert.match(ui,/onPointerUp=\{\(event\)=>commitStepExpression/);
  assert.match(ui,/onKeyUp=\{\(event\)=>commitStepExpression/);
  assert.doesNotMatch(ui,/onChange=\{\(event\)=>commitStepExpression/);
});

test('Fallen Sessions step grid selects, activates and double-click clears',()=>{
  const ui=fs.readFileSync('src/FallenSessions.tsx','utf8');
  const css=fs.readFileSync('src/fallen-sessions.css','utf8');
  assert.match(ui,/function selectStep\(step:number\)/);
  assert.match(ui,/velocity:\.82/);
  assert.match(ui,/onDoubleClick=\{\(\)=>clearStep\(step\)\}/);
  assert.match(ui,/selectedStepIndex===step/);
  assert.match(css,/\.fsStep\.selected/);
});

test('Fallen Sessions does not render decorative drum controls for audio tracks',()=>{
  const ui=fs.readFileSync('src/FallenSessions.tsx','utf8');
  assert.match(ui,/track\.type==='drums'/);
  assert.match(ui,/Canonical audio clip/);
  assert.match(ui,/Verified asset attached/);
  assert.match(ui,/No audio asset attached/);
  assert.match(ui,/Import or record audio to attach verified bytes/);
});


test('Fallen Sessions arrangement editor mutates only through canonical arrangement.set_slot',()=>{
  const ui=fs.readFileSync('src/FallenSessions.tsx','utf8');
  assert.match(ui,/type:'arrangement\.set_slot'/);
  assert.match(ui,/setArrangementSlot/);
  assert.match(ui,/session\.arrangement\[trackIndex\]\?\.\[bar\]/);
  assert.doesNotMatch(ui,/session\.arrangement\[[^\n]+\]\s*=/);
});

test('Fallen Sessions arrangement editor exposes every track and bar through bounded selects',()=>{
  const ui=fs.readFileSync('src/FallenSessions.tsx','utf8');
  const css=fs.readFileSync('src/fallen-sessions.css','utf8');
  assert.match(ui,/Canonical arrangement/);
  assert.match(ui,/session\.tracks\.map\(\(arrangementTrack,trackIndex\)=>/);
  assert.match(ui,/arrangementBars\.map\(\(bar\)=>/);
  assert.match(ui,/arrangementTrack\.clips\.map\(\(arrangementClip,scene\)=>/);
  assert.match(css,/\.fsArrangementScroll/);
  assert.match(css,/overflow-x:auto/);
  assert.match(css,/min-width:980px/);
});

test('Fallen Sessions arrangement transport invokes the canonical audio scheduler',()=>{
  const ui=fs.readFileSync('src/FallenSessions.tsx','utf8');
  assert.match(ui,/playArrangement\(session\)/);
  assert.match(ui,/toggleArrangementPlay/);
  assert.match(ui,/Arrangement is empty\. Assign at least one scene before playback/);
  assert.match(ui,/Transport \{audioStatus\.playback_mode\}/);
  assert.match(ui,/Arrangement bar \{audioStatus\.arrangement_bar\+1\}/);
  assert.match(ui,/Contiguous repeated scene cells preserve clip phase across bars/);
});
