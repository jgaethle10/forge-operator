import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { pulseGridSha256Hex } from './pulsegrid-asset-vault.js';

test('PulseGrid browser vault computes canonical SHA-256 digests',async()=>{
  const bytes=new TextEncoder().encode('abc');
  const digest=await pulseGridSha256Hex(bytes.buffer);
  assert.equal(digest,'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('PulseGrid browser vault verifies bytes on both put and get',()=>{
  const source=fs.readFileSync('systemia/media-studio/pulsegrid-asset-vault.ts','utf8');
  assert.match(source,/pulseGridSha256Hex\(bytes\)/);
  assert.match(source,/audio bytes do not match the canonical asset digest/);
  assert.match(source,/stored audio bytes failed SHA-256 verification/);
  assert.match(source,/record\.byte_length!==asset\.byte_length/);
});

test('PulseGrid browser vault keeps bytes outside the canonical graph',()=>{
  const source=fs.readFileSync('systemia/media-studio/pulsegrid-asset-vault.ts','utf8');
  assert.match(source,/indexedDB/);
  assert.match(source,/audio-by-content-digest/);
  assert.doesNotMatch(source,/applyPulseGridOperation/);
  assert.doesNotMatch(source,/applyPulseGridTransaction/);
});

test('PulseGrid browser vault rejects empty or unprovenanced ingest',()=>{
  const source=fs.readFileSync('systemia/media-studio/pulsegrid-asset-vault.ts','utf8');
  assert.match(source,/refuses to ingest an empty audio asset/);
  assert.match(source,/requires at least one source reference/);
});

test('PulseGrid browser vault has explicit deletion but no automatic graph mutation',()=>{
  const source=fs.readFileSync('systemia/media-studio/pulsegrid-asset-vault.ts','utf8');
  assert.match(source,/async remove\(assetId:string\)/);
  assert.doesNotMatch(source,/session\s*=/);
});
