import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Script } from 'node:vm';

const html=fs.readFileSync(new URL('../public/voice-foundry/index.html',import.meta.url),'utf8');
test('Voice Foundry device audition ships a self-contained executable client',()=>{
  const source=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(source);
  assert.doesNotThrow(()=>new Script(source,{filename:'public/voice-foundry/index.html'}));
  assert.match(source,/speechSynthesis/);
  assert.match(source,/SpeechSynthesisUtterance/);
});
test('multiple speech languages are auditioned without claiming accent validity',()=>{
  for(const lang of ['en-US','en-GB','es-MX','fr-FR','ja-JP'])assert.ok(html.includes(lang),'Missing language '+lang);
  assert.match(html,/regional accent NOT verified/);
  assert.match(html,/Gender, accent authenticity, and emotional range NOT verified/);
  assert.match(html,/zero-cost auditions/);
});
test('no remote calls, microphones, keys, automatic paid generation, or publish claims',()=>{
  for(const forbidden of [/fetch\(/,/XMLHttpRequest/,/mediaDevices\.getUserMedia/,/elevenlabs\.io/,/api\.elevenlabs/,/xi-api-key/,/localStorage/,/Bearer\s+[A-Za-z0-9]/]){
    assert.doesNotMatch(html,forbidden);
  }
  assert.match(html,/not<\/em> a finished Evercraft neural voice|not<\/em> an approved Evercraft actor/);
  assert.match(html,/No telemetry, cookies, remote scripts or private audio upload/);
});
test('review exports state and never marks quality or production as approved',()=>{
  assert.match(html,/evercraft\.voice-foundry\.device-audition-review\.v1/);
  assert.match(html,/owner first listening impression, NOT independent accredited reviewer/);
  assert.match(html,/unverified device system voices/);
  assert.doesNotMatch(html,/publicationAuthorityGranted\s*:\s*true/);
});