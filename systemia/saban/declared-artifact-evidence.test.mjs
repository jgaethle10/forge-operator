import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {evaluateDeclaredArtifact} from './declared-artifact-evidence.mjs';

const digest = b => 'sha256:' + createHash('sha256').update(b).digest('hex');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'saban-delegation-'));
  t.after(() => fs.rmSync(root, {recursive:true, force:true}));
  fs.mkdirSync(path.join(root, 'out'));
  fs.writeFileSync(path.join(root, 'out/result.txt'), '2\n');
  return {root, relativePath:'out/result.txt', expectedSha256:digest('2\n'), expectedBytes:2,
    workerReport:{status:'completed',verified:true}, agentId:'raw-1', idempotencyKey:'test-204'};
}

test('declared bytes match; claim does not supply independent runtime attestation', t => {
  const receipt = evaluateDeclaredArtifact(fixture(t));
  assert.equal(receipt.status, 'declared_artifact_match');
  assert.equal(receipt.independent_runtime_attestation, false);
  assert.equal(receipt.objective_semantics_verified, false);
  assert.equal(receipt.runtime_dispatched, false);
  assert.equal(receipt.observed_bytes, 2);
});

test('self-reported completed/verified cannot cure absent artifact', t => {
  const f = fixture(t); fs.unlinkSync(path.join(f.root, f.relativePath));
  const receipt = evaluateDeclaredArtifact(f);
  assert.equal(receipt.worker_claimed_complete, true);
  assert.equal(receipt.status, 'hold');
  assert.equal(receipt.reason, 'artifact_missing');
});

test('changed output fails despite zero exit and worker success', t => {
  const f = fixture(t); fs.writeFileSync(path.join(f.root, f.relativePath), '3\n');
  const r = evaluateDeclaredArtifact(f);
  assert.equal(r.status, 'hold');
  assert.equal(r.reason, 'declared_artifact_mismatch');
});

test('invalid and undeclared expected digest fail closed', t => {
  const f = fixture(t);
  assert.equal(evaluateDeclaredArtifact({...f,expectedSha256:'success'}).status,'hold');
  assert.equal(evaluateDeclaredArtifact({...f,expectedBytes:undefined}).status,'hold');
});

test('path traversal and absolute path fail closed', t => {
  const f = fixture(t);
  assert.equal(evaluateDeclaredArtifact({...f,relativePath:'../outside.txt'}).status,'hold');
  assert.equal(evaluateDeclaredArtifact({...f,relativePath:'/etc/passwd'}).status,'hold');
  assert.equal(evaluateDeclaredArtifact({...f,relativePath:'out//result.txt'}).status,'hold');
});

test('symlinked artifact and directory fail closed', t => {
  const f = fixture(t);
  fs.symlinkSync('result.txt',path.join(f.root,'out','link.txt'));
  assert.equal(evaluateDeclaredArtifact({...f,relativePath:'out/link.txt'}).status,'hold');
  fs.symlinkSync('out',path.join(f.root,'linked-out'));
  assert.equal(evaluateDeclaredArtifact({...f,relativePath:'linked-out/result.txt'}).status,'hold');
});

test('artifact above declared one MiB maximum fails closed', t => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.root,f.relativePath),Buffer.alloc(1024*1024+1));
  assert.equal(evaluateDeclaredArtifact(f).status,'hold');
});

test('model output alone never advances hold without real bytes', t => {
  const f = fixture(t);
  fs.unlinkSync(path.join(f.root,f.relativePath));
  for (const report of [{status:'completed'},{verified:true},{text:'Completed and verified'}]) {
    assert.equal(evaluateDeclaredArtifact({...f,workerReport:report}).status,'hold');
  }
});
