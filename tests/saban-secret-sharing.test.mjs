import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { splitSecret, combineSecret } from '../systemia/saban/secret-sharing.mjs';

test('Shamir shares reconstruct from any threshold subset',()=>{
  const secret=randomBytes(32);
  const shares=splitSecret(secret,{shares:5,threshold:3});
  assert.equal(shares.length,5);
  for(const subset of [
    [shares[0],shares[1],shares[2]],
    [shares[0],shares[2],shares[4]],
    [shares[1],shares[3],shares[4]],
  ]){
    const recovered=combineSecret(subset,{threshold:3});
    assert.equal(recovered.equals(secret),true);
  }
});

test('fewer than threshold shares cannot reconstruct',()=>{
  const shares=splitSecret(Buffer.from('threshold-secret'),{shares:4,threshold:3});
  assert.throws(
    ()=>combineSecret(shares.slice(0,2),{threshold:3}),
    /insufficient_shares/
  );
});

test('duplicate share coordinates are rejected',()=>{
  const shares=splitSecret(Buffer.from('duplicate-proof'),{shares:3,threshold:2});
  assert.throws(
    ()=>combineSecret([shares[0],shares[0]],{threshold:2}),
    /duplicate_share_x/
  );
});
