import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { runLocalCommercialBrief } from '../systemia/saban/work-skills/run-local.mjs';
import { renderLocalWorkroom } from '../systemia/saban/work-skills/workroom.mjs';

const outDir = path.resolve('artifacts/work-saban-ci-example');
const receipt = await runLocalCommercialBrief({
  task: 'Create a 30-second narrated commercial for Example Cleaning Co',
  brief: {
    business_name: 'Example Cleaning Co (fictional CI fixture)',
    audience: 'Busy households',
    call_to_action: 'Request an estimate',
    duration_seconds: 30,
    claims: [{text: 'We clean offices', evidence_ref: ''}],
    approved_assets: []
  },
  outDir
});
assert.equal(receipt.worker_receipts.length, 4);
assert.equal(receipt.state, 'drafts_produced_held');
assert.equal(receipt.generated_video, false);
assert.equal(receipt.external_effects_performed, false);
assert.equal(receipt.publication_performed, false);
fs.writeFileSync(path.join(outDir, 'work-saban-workroom.html'), renderLocalWorkroom(receipt), {mode:0o600});
fs.writeFileSync(path.join(outDir, 'DEMO_NOT_LIVE.txt'),
  'FICTIONAL CI FIXTURE. Bounded local registered-worker execution proved. No model agent, rendered video, deployed website, publication, or customer delivery.\n',
  {mode:0o600});
console.log(JSON.stringify({schema:'evercraft.work-saban.ci-proof.v1',
  status:'pass',fictional_demo:true,receipt_sha256:receipt.receipt_sha256,
  registered_worker_receipts:receipt.role_count,commercial_ready:false,
  external_effects:false,artifact_directory:outDir},null,2));
