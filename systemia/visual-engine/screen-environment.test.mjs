import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  SCREEN_ENVIRONMENT_WGSL,ENVIRONMENT_PRESETS,
  compileScreenEnvironment,verifyScreenEnvironment
} from './screen-environment.mjs';

test('environment preview emits 112-byte aligned deterministic shader uniforms',()=>{
  const a=compileScreenEnvironment(ENVIRONMENT_PRESETS.clear_coastal_day,1280,720);
  const b=compileScreenEnvironment(ENVIRONMENT_PRESETS.clear_coastal_day,1280,720);
  assert.equal(a.schema,'evercraft.visual-engine.screen-environment.v1');
  assert.equal(a.uniformData.length,28);
  assert.equal(new Float32Array(a.uniformData).byteLength,112);
  assert.deepEqual(a,b);
  assert.equal(verifyScreenEnvironment(a),true);
  assert.equal(a.shaderSha256,'sha256:'+crypto.createHash('sha256')
    .update(SCREEN_ENVIRONMENT_WGSL).digest('hex'));
});
test('golden coast and time variation preserve asset-independent shader identity',()=>{
  const a=compileScreenEnvironment(ENVIRONMENT_PRESETS.clear_coastal_day,1280,720);
  const b=compileScreenEnvironment(ENVIRONMENT_PRESETS.golden_coast,1280,720);
  const changed=compileScreenEnvironment({
    ...ENVIRONMENT_PRESETS.clear_coastal_day,timeSec:3
  },1280,720);
  assert.notEqual(a.digest,b.digest);
  assert.notEqual(a.digest,changed.digest);
  assert.equal(a.shaderSha256,b.shaderSha256);
  assert.equal(a.shaderSha256,changed.shaderSha256);
  assert.equal(verifyScreenEnvironment(b),true);
});
test('preview is not certified as volumetric or physically accurate',()=>{
  const a=compileScreenEnvironment({},720,1280);
  assert.ok(a.limitations.includes('screen_space_preview_not_3d_water'));
  assert.ok(a.limitations.includes('nonvolumetric_procedural_cloud_layers'));
  assert.ok(a.limitations.includes('no_physically_verified_scattering_or_reflections'));
  assert.equal(a.uniformData[0],720);
  assert.equal(a.uniformData[1],1280);
});
test('nonfinite colors, invalid controls and impossible dimensions are rejected',()=>{
  for(const [options,w,h] of [
    [{skyZenith:[0,NaN,0]},1280,720],
    [{skyHorizon:[.4,1.5,.5]},1280,720],
    [{oceanDeep:[0,.1]},1280,720],
    [{sunRadius:0},1280,720],
    [{sunStrength:Infinity},1280,720],
    [{timeSec:-1},1280,720],
    [{horizonY:.99},1280,720],
    [{sunY:-.01},1280,720],
    [{cloudAmount:2},1280,720],
    [{},0,720],
    [{},1280,8193]
  ])assert.throws(()=>compileScreenEnvironment(options,w,h));
});
test('tampered background colors or uniform arrays are detected',()=>{
  const p=compileScreenEnvironment(ENVIRONMENT_PRESETS.golden_coast,1280,720);
  p.uniformData[8]=.999;
  assert.equal(verifyScreenEnvironment(p),false);
  const q=compileScreenEnvironment({},1280,720);
  q.preset.sunX=.42;
  assert.equal(verifyScreenEnvironment(q),false);
});
