import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {Script} from 'node:vm';

const root=new URL('../public/live/',import.meta.url);
const html=await readFile(new URL('producer.html',root),'utf8');
const css=await readFile(new URL('producer.css',root),'utf8');
const js=await readFile(new URL('producer.mjs',root),'utf8');
test('genuine local media, never a fabricated or auto-approved stream',()=>{
  assert.match(html,/Real Media Producer/);
  assert.match(html,/NO UPLOAD/);
  assert.match(html,/NOT BROADCASTING/);
  assert.match(html,/Human rights\/privacy review required/);
  assert.doesNotMatch(html,/LIVE TELEMETRY|autonomous agents running/i);
  assert.doesNotMatch(html,/<iframe|<canvas|video autoplay src=/i);
});
test('no remote requests, storage, credentials, external media or publication',()=>{
  assert.match(html,/connect-src 'none'/);
  assert.match(html,/media-src blob:/);
  assert.match(html,/img-src blob:/);
  assert.doesNotMatch(html,/https?:\/\//i);
  assert.doesNotMatch(js,/\bfetch\s*\(|WebSocket|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|indexedDB|postMessage|serviceWorker/i);
  assert.match(js,/URL\.createObjectURL\(file\)/);
  assert.match(js,/URL\.revokeObjectURL\(item\.url\)/);
  assert.match(js,/beforeunload/);
  assert.match(js,/e\.preventDefault\(\)/);
});
test('operator file selection, safety, playback and output control',()=>{
  for(const id of ['mediaPicker','emptyAdd','add','film','exitFilm','next','prev','pause','sound','fit','queue','stage'])assert.ok(html.includes('id="'+id+'"'),id);
  assert.match(js,/MAX_ITEMS=24/);
  assert.match(js,/MAX_BYTES=3_000_000_000/);
  assert.match(js,/if\(file\.type&&file\.type!==expected\)return null/);
  assert.match(js,/\.mp4/);
  assert.match(js,/\.webm/);
  assert.match(js,/\.png/);
  assert.match(js,/\.jpg/);
  assert.match(js,/state\.muted=true/);
  assert.match(js,/node\.addEventListener\('ended'/);
  assert.match(js,/document\.addEventListener\('keydown'/);
  assert.doesNotThrow(()=>new Script(js));
});
test('camera layout responsive and film mode obscures local filename panels',async()=>{
  assert.ok((await stat(new URL('producer.html',root))).size>1000);
  assert.match(css,/@media\(max-width:850px\)/);
  assert.match(css,/@media\(max-width:480px\)/);
  assert.match(css,/#app\.film \.header,#app\.film \.transport,#app\.film \.tray,#app\.film \.footer/);
  assert.match(css,/object-fit:contain/);
  assert.match(css,/object-fit:cover/);
  assert.match(html,/Preview only/);
});
