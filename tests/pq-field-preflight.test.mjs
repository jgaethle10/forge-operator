import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {getPqFieldPreflight} from '../systemia/crypto/pq-field-preflight.mjs';
import {pqRuntime} from '../systemia/crypto/pq-envelope.mjs';

test('read-only field probe exposes no keys, secrets or implied live enrollment',()=>{
  const result=getPqFieldPreflight();
  assert.equal(result.schema,'systemia.crypto.pq-field-preflight.v1');
  assert.equal(result.read_only,true);
  assert.equal(result.production_ready,false);
  assert.equal(result.live_relay_tested,false);
  assert.equal(result.field_enrolled,false);
  assert.equal(result.self_test_requested,false);
  assert.equal(result.self_test_passed,null);
  assert.equal(result.usable_for_isolated_lab,pqRuntime().available);
  const keys=Object.keys(result);
  assert.ok(keys.every(k=>!/(secret|private_key|pem|password|credential)/.test(k)));
  assert.throws(()=>{result.production_ready=true;},TypeError);
});

test('optional ephemeral ML-KEM + ML-DSA self-test proves crypto but never claims production',()=>{
  const result=getPqFieldPreflight({selfTest:true});
  assert.equal(result.self_test_requested,true);
  assert.equal(result.self_test_passed,pqRuntime().available);
  assert.equal(result.production_ready,false);
  assert.equal(result.field_enrolled,false);
  assert.equal(result.usable_for_isolated_lab,pqRuntime().available);
});

test('field probe CLI outputs JSON and strict mode rejects unsupported runtime',()=>{
  const cli=fileURLToPath(new URL('../systemia/crypto/pq-field-preflight.mjs',import.meta.url));
  const run=spawnSync(process.execPath,[cli,'--self-test','--require-pq'],{
    encoding:'utf8',timeout:30000
  });
  assert.equal(run.error,undefined);
  assert.equal(run.status,pqRuntime().available?0:1);
  const data=JSON.parse(run.stdout);
  assert.equal(data.self_test_requested,true);
  assert.equal(data.production_ready,false);
  assert.equal(data.self_test_passed,pqRuntime().available);
});
