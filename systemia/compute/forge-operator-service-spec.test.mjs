import assert from 'node:assert/strict';
import test from 'node:test';
import { buildForgeOperatorServiceSpec } from './forge-operator-service-spec.mjs';

test('Forge service spec binds immutable image identity without embedding secrets',()=>{
  const spec=buildForgeOperatorServiceSpec({
    releaseRef:'a'.repeat(40),
    imageDigest:'sha256:'+'b'.repeat(64),
    releaseReceiptRef:'release-execution://proof',
    hostname:'forge',
  });
  assert.equal(spec.workload_class,'systemia.forge-operator-runtime.v1');
  assert.equal(spec.input.image_digest,'sha256:'+'b'.repeat(64));
  assert.equal(spec.input.release_receipt_ref,'release-execution://proof');
  assert.equal(spec.health.expect.university_benchmark_ingress_ready,true);
  assert.equal(spec.health.expect.university_remote_persistence,false);
  assert.equal(spec.health.expect.university_public_write_allowed,false);
  assert.equal(spec.route.mode,'public_edge');
  assert.equal(JSON.stringify(spec).includes('GEMINI_API_KEY'),false);
  assert.equal(JSON.stringify(spec).includes('token'),false);
  assert.equal(JSON.stringify(spec).includes('password'),false);
});

test('Forge service spec rejects mutable releases and missing execution receipt',()=>{
  assert.throws(()=>buildForgeOperatorServiceSpec({
    releaseRef:'main',
    imageDigest:'sha256:'+'b'.repeat(64),
    releaseReceiptRef:'receipt://1',
  }),/release_ref_invalid/);
  assert.throws(()=>buildForgeOperatorServiceSpec({
    releaseRef:'a'.repeat(40),
    imageDigest:'sha256:'+'b'.repeat(64),
    releaseReceiptRef:'',
  }),/release_execution_receipt_required/);
});
