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
