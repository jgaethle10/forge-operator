import test from 'node:test';
import assert from 'node:assert/strict';
import {makeBrushedMetalTextures} from './brushed-metal.js';
import {textureAssetDigest,validateTextureAsset} from './texture.js';

test('generated photographic-free metal maps are reproducible and legal GPU texture assets',()=>{
  const spec={idPrefix:'owned:industrial-steel',size:64 as const,grainStrength:.22,roughness:.31};
  const first=makeBrushedMetalTextures(spec),second=makeBrushedMetalTextures(spec);
  assert.deepEqual(first.digests,second.digests);
  assert.deepEqual(first.baseColor.data,second.baseColor.data);
  for(const key of ['baseColor','orm','normal'] as const){
    assert.equal(validateTextureAsset(first[key]),true);
    assert.equal(first[key].data.length,64*64*4);
    assert.equal(textureAssetDigest(first[key]),first.digests[key]);
    assert.equal(first[key].data.every(v=>Number.isInteger(v)&&v>=0&&v<=255),true);
  }
  assert.equal(first.baseColor.format,'rgba8unorm-srgb');
  assert.equal(first.orm.format,'rgba8unorm');
  assert.equal(first.normal.format,'rgba8unorm');
});
test('brushed surface actually contains varied roughness and surface normal values',()=>{
  const data=makeBrushedMetalTextures({idPrefix:'owned:steel-b',size:64,grainStrength:.45});
  const colors=new Set<number>(),roughness=new Set<number>(),bump=new Set<number>();
  for(let i=0;i<64*64;i++){
    colors.add(data.baseColor.data[i*4]);roughness.add(data.orm.data[i*4+1]);
    bump.add(data.normal.data[i*4]);
  }
  assert.ok(colors.size>10);
  assert.ok(roughness.size>8);
  assert.ok(bump.size>5);
  assert.ok(data.orm.data.every(x=>x>=0&&x<=255));
});
test('texture parameters are bounded and fail closed for unsupported sizes and nonfinite values',()=>{
  for(const bad of [
    {size:65},{size:512},{grainStrength:-.1},{grainStrength:.9},
    {baseBrightness:NaN},{roughness:0},{roughness:Infinity},
    {metallic:2},{idPrefix:'../secret'}
  ]){
    assert.throws(()=>makeBrushedMetalTextures({
      idPrefix:'owned:steel-c',...(bad as any)
    }),/brushed_metal_invalid/);
  }
});
