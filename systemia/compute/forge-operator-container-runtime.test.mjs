import assert from 'node:assert/strict';
import test from 'node:test';
import { forgeOperatorImageRef } from './forge-operator-container-runtime.mjs';

test('Forge Operator runtime requires immutable release SHA and digest',()=>{
  const release='a'.repeat(40);
  const digest='sha256:'+'b'.repeat(64);
  const ref=forgeOperatorImageRef({releaseRef:release,imageDigest:digest});
  assert.equal(ref.release_ref,release);
  assert.equal(ref.image_digest,digest);
  assert.equal(ref.release_tag,'ghcr.io/jgaethle10/forge-operator:'+release);
  assert.equal(ref.digest_ref,'ghcr.io/jgaethle10/forge-operator@'+digest);
});

test('Forge Operator runtime rejects mutable or malformed image identity',()=>{
  assert.throws(
    ()=>forgeOperatorImageRef({releaseRef:'main',imageDigest:'sha256:'+'b'.repeat(64)}),
    /release_ref_invalid/
  );
  assert.throws(
    ()=>forgeOperatorImageRef({releaseRef:'a'.repeat(40),imageDigest:'latest'}),
    /image_digest_invalid/
  );
  assert.throws(
    ()=>forgeOperatorImageRef({
      releaseRef:'a'.repeat(40),
      imageDigest:'sha256:'+'b'.repeat(64),
      repository:'docker.io/not-evercraft/forge'
    }),
    /repository_invalid/
  );
});
