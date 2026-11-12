import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runResidentCycle } from '../systemia/production-continuity/resident.mjs';

const NOW = Date.parse('2026-11-11T23:00:00.000Z');
const project = () => ({
  project_id: 'synthetic-story', current_stage: 'EDITORIAL_QA',
  next_action: { kind: 'chapter_review', owner: 'little-red-studio' },
  last_verified_receipt: null,
});
const ledger = () => ({
  schema: 'evercraft.production.continuity.v1', projects: [project()]
});
function fixture(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-private-'));
  fs.chmodSync(root, 0o700);
  fs.writeFileSync(path.join(root, 'ledger.json'), JSON.stringify(ledger()), {mode:0o600});
  try { return fn(root); } finally { fs.rmSync(root, {recursive:true, force:true}); }
}
function state(root) {
  return JSON.parse(fs.readFileSync(path.join(root, 'resident-state.json'), 'utf8'));
}

test('first cycle creates private integrity-bound state without dispatch', () => fixture(root => {
  const receipt = runResidentCycle({privateDir:root, now:NOW});
  const saved = state(root);
  assert.equal(receipt.sequence,1);
  assert.equal(receipt.projects,1);
  assert.equal(receipt.need_attention,1);
  assert.equal(receipt.agent_dispatch_performed,false);
  assert.equal(saved.plan.assignments.length > 0,true);
  assert.equal(saved.ledger.projects[0].current_stage,'EDITORIAL_QA');
  assert.equal(fs.statSync(path.join(root,'resident-state.json')).mode & 0o777,0o600);
  assert.equal(fs.existsSync(path.join(root,'.resident.lock')),false);
}));

test('restart retains ledger and chains prior digest without a fabricated progress receipt', () => fixture(root => {
  const first = runResidentCycle({privateDir:root, now:NOW});
  // The seed file changing after the first successful cycle must not overwrite state.
  fs.writeFileSync(path.join(root,'ledger.json'), JSON.stringify({schema:'evercraft.production.continuity.v1',projects:[]}));
  const second = runResidentCycle({privateDir:root,now:NOW + 60000});
  const saved = state(root);
  assert.equal(second.sequence,2);
  assert.equal(saved.previous_digest,first.digest);
  assert.equal(second.projects,1);
  assert.equal(second.verified_artifacts_imported,0);
  assert.equal(saved.ledger.projects[0].last_verified_receipt,null);
}));

test('tampered resident state refuses continuation', () => fixture(root => {
  runResidentCycle({privateDir:root,now:NOW});
  const corrupt = state(root);
  corrupt.ledger.projects[0].current_stage='RELEASED_VERIFIED';
  fs.writeFileSync(path.join(root,'resident-state.json'),JSON.stringify(corrupt));
  assert.throws(()=>runResidentCycle({privateDir:root,now:NOW + 60000}),/integrity check failed/);
}));

test('held lock fails closed rather than acting as a second worker', () => fixture(root => {
  fs.writeFileSync(path.join(root,'.resident.lock'),'held',{mode:0o600});
  assert.throws(()=>runResidentCycle({privateDir:root,now:NOW}),/already locked/);
  assert.equal(fs.existsSync(path.join(root,'resident-state.json')),false);
}));

test('symlink or group-readable seed cannot be accepted', () => fixture(root => {
  fs.chmodSync(path.join(root,'ledger.json'),0o644);
  assert.throws(()=>runResidentCycle({privateDir:root,now:NOW}),/owner-only/);
  fs.chmodSync(path.join(root,'ledger.json'),0o600);
  fs.renameSync(path.join(root,'ledger.json'),path.join(root,'real.json'));
  fs.symlinkSync(path.join(root,'real.json'),path.join(root,'ledger.json'));
  assert.throws(()=>runResidentCycle({privateDir:root,now:NOW}),/not symlinked/);
}));

test('a repository checkout is not a private ledger directory', () => fixture(root => {
  fs.mkdirSync(path.join(root,'.git'));
  assert.throws(()=>runResidentCycle({privateDir:root,now:NOW}),/inside source repository/);
}));

test('backdated cycle does not roll back private liveness clock', () => fixture(root => {
  runResidentCycle({privateDir:root,now:NOW});
  assert.throws(()=>runResidentCycle({privateDir:root,now:NOW-10000}),/clock rollback/);
}));

test('real Saban artifact must match owner, job, bytes and SHA before a receipt appears', () => fixture(root => {
  const artifacts=path.join(root,'artifacts');
  fs.mkdirSync(artifacts,{mode:0o700});
  const body='SYNTHETIC EDITORIAL QA NOT A BOOK RELEASE';
  fs.writeFileSync(path.join(artifacts,'proof.txt'),body,{mode:0o600});
  const digest=crypto.createHash('sha256').update(body).digest('hex');
  const work={
    schema:'evercraft.saban.work-state.v1',jobs:{
      synthetic:{job_id:'synthetic-001',state:'completed',agent_id:'little-red-studio',
        updated_at:'2026-11-11T22:45:00.000Z',
        work:{key:'synthetic-story',kind:'chapter_review'},
        result:{schema:'evercraft.production.artifact-result.v1',project_id:'synthetic-story',
          action_kind:'chapter_review',artifact_relpath:'proof.txt',artifact_sha256:digest}}
    }
  };
  fs.writeFileSync(path.join(root,'saban-work-state.json'),JSON.stringify(work),{mode:0o600});
  const result=runResidentCycle({privateDir:root,now:NOW});
  assert.equal(result.verified_artifacts_imported,1);
  const saved=state(root);
  assert.equal(saved.ledger.projects[0].last_verified_receipt.artifact_sha256,digest);
  assert.equal(saved.ledger.projects[0].current_stage,'EDITORIAL_QA');
  assert.equal(result.publication_performed,false);
  const again=runResidentCycle({privateDir:root,now:NOW+60000});
  assert.equal(again.verified_artifacts_imported,0);
}));

test('founder-gated canon selection remains blocked even when a completed job contains an artifact', () => fixture(root => {
  const l=ledger();
  l.projects[0].next_action.requires_gate='canon';
  fs.writeFileSync(path.join(root,'ledger.json'),JSON.stringify(l),{mode:0o600});
  const r=runResidentCycle({privateDir:root,now:NOW});
  assert.equal(r.verified_artifacts_imported,0);
  assert.equal(r.publication_performed,false);
  assert.equal(r.canon_modified,false);
}));
