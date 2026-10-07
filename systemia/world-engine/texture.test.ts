import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyTextureHotReload,
  normalizeTextureSampler,
  planTextureResidency,
  textureAssetDigest,
  textureByteLength,
  textureSamplerKey,
  validateTextureAsset,
  verifyTextureResidencyPlan,
  type TextureAsset
} from './texture.js';

function texture(id='texture:a',size=2,byte=128):TextureAsset{
  return {
    schema:'evercraft.world-engine.texture.v1',
    id,
    width:size,
    height:size,
    format:'rgba8unorm',
    data:new Array(size*size*4).fill(byte)
  };
}

test('texture assets validate exact RGBA byte length and range',()=>{
  const asset=texture();
  assert.equal(validateTextureAsset(asset),true);
  assert.equal(textureByteLength(asset),16);

  const badLength=structuredClone(asset);
  badLength.data.pop();
  assert.throws(
    ()=>validateTextureAsset(badLength),
    /texture_data_length_invalid/
  );

  const badByte=structuredClone(asset);
  badByte.data[0]=999;
  assert.throws(
    ()=>validateTextureAsset(badByte),
    /texture_data_byte_invalid/
  );
});

test('sampler normalization is deterministic and explicit',()=>{
  const defaults=normalizeTextureSampler(undefined);
  assert.deepEqual(defaults,{
    addressModeU:'repeat',
    addressModeV:'repeat',
    magFilter:'linear',
    minFilter:'linear'
  });
  assert.equal(
    textureSamplerKey(defaults),
    'repeat:repeat:linear:linear'
  );

  const custom=normalizeTextureSampler({
    addressModeU:'clamp-to-edge',
    addressModeV:'mirror-repeat',
    magFilter:'nearest',
    minFilter:'linear'
  });
  assert.equal(
    textureSamplerKey(custom),
    'clamp-to-edge:mirror-repeat:nearest:linear'
  );
});

test('texture hot reload preserves identity and emits deterministic receipts',()=>{
  const first=texture('texture:hero',2,32);
  const next=texture('texture:hero',2,64);

  const a=applyTextureHotReload([first],next);
  const b=applyTextureHotReload([first],next);

  assert.equal(a.receipt.digest,b.receipt.digest);
  assert.equal(a.receipt.replaced,true);
  assert.equal(a.receipt.previousDigest,textureAssetDigest(first));
  assert.equal(a.receipt.nextDigest,textureAssetDigest(next));
  assert.deepEqual(a.textures[0].data,next.data);
});

test('texture residency loads required textures and evicts unused residents canonically',()=>{
  const a=texture('texture:a',2,1);
  const b=texture('texture:b',4,2);
  const c=texture('texture:c',2,3);

  const plan=planTextureResidency(
    ['texture:a','texture:c'],
    ['texture:b','texture:a','texture:b'],
    [c,b,a],
    1024
  );

  assert.deepEqual(plan.requiredTextureIds,['texture:a','texture:b']);
  assert.deepEqual(plan.retainedTextureIds,['texture:a']);
  assert.deepEqual(plan.loadTextureIds,['texture:b']);
  assert.deepEqual(plan.evictTextureIds,['texture:c']);
  assert.equal(plan.totalResidentBytes,16+64);
  assert.equal(verifyTextureResidencyPlan(plan),true);
});

test('texture residency fails closed when required assets exceed budget',()=>{
  const big=texture('texture:big',8,1);
  assert.throws(
    ()=>planTextureResidency([],['texture:big'],[big],100),
    /texture_residency_budget_exceeded:256:100/
  );
});

test('texture residency fails closed on missing referenced assets',()=>{
  assert.throws(
    ()=>planTextureResidency([],['texture:missing'],[],1024),
    /texture_residency_asset_missing:texture:missing/
  );
});
