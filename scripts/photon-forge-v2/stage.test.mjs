import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const stage=fs.readFileSync(new URL('./stage.html',import.meta.url),'utf8');
test('self-contained exact-frame renderer exposes honest authority and audio state',()=>{
  for(const x of [/getContext\('webgl2'/,/__evercraftRenderAt=renderAt/,/__evercraftRenderFrame=/,/__evercraftStageInfo=/,/__evercraftExportPng=/,/FRAMES=300/,/DURATION=10/,/audioIncluded:false/,/publicationAuthority:false/])assert.match(stage,x);
  assert.doesNotMatch(stage,/https?:\/\//);
  assert.doesNotMatch(stage,/<audio|<video/);
});
test('geometry and optical effects present in experimental GPU stage',()=>{
  for(const x of [/vec2 scene\(vec3 p\)/,/vec3 norm\(vec3 p\)/,/torus\(vec3 p/,/float spec=/,/float fres=/,/float shockR=/])assert.match(stage,x);
});
test('CPU preview backend is explicit; shader errors do not silently fall back',()=>{
  assert.match(stage,/if\(!gl\)\{software=makeCpuRenderer\(canvas\);\}/);
  assert.match(stage,/data-graphic-backend/);
  assert.match(stage,/invalid_exact_frame/);
  assert.match(stage,/if\(!gl.getProgramParameter\(program,gl.LINK_STATUS\)\)fail/);
});
