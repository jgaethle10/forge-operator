import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import { extractOwnedShader } from './webgpu-reference-frame.mjs';

test('reference-frame proof extracts and hashes the exact owned World Engine WGSL',()=>{
  const repoRoot=path.resolve(process.cwd(),'../../..');
  const shader=extractOwnedShader(repoRoot);

  assert.equal(shader.source_file,'systemia/world-engine/webgpu.ts');
  assert.match(shader.source,/@vertex/);
  assert.match(shader.source,/@fragment/);
  assert.match(shader.source,/textureSample/);
  assert.match(shader.source,/@group\(1\) @binding\(4\)/);
  assert.match(shader.source,/@group\(1\) @binding\(5\)/);
  assert.match(shader.source,/input\.tangent/);
  assert.match(shader.source,/normalTexture/);

  const expected='sha256:'+crypto
    .createHash('sha256')
    .update(shader.source)
    .digest('hex');
  assert.equal(shader.sha256,expected);
});
