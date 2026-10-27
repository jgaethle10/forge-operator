import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { runLocalCreativeCouncilPreview } from '../systemia/saban/work-skills/fallen-council-bridge.mjs';
import { renderFallenCouncilWorkroom } from '../systemia/saban/work-skills/workroom.mjs';

const outDir=path.resolve('artifacts/work-saban-fallen-ci');
const preview=await runLocalCreativeCouncilPreview({
  task:'Build a 30-second narrated commercial for Example Cleaning Co',
  brief:{
    business_name:'Example Cleaning Co (fictional CI fixture)',
    audience:'Busy households',
    call_to_action:'Request an estimate',
    duration_seconds:30,
    claims:[{text:'We clean offices',evidence_ref:''}],
    approved_assets:[]
  },
  outDir
});
assert.equal(preview.registered_council_invocations,56);
assert.equal(preview.council_reconciliation.blocked_shot_count,4);
assert.equal(preview.provider_calls_performed,0);
assert.equal(preview.generated_media,false);
fs.writeFileSync(path.join(outDir,'work-saban-fallen-workroom.html'),
  renderFallenCouncilWorkroom(preview),{mode:0o600});
fs.writeFileSync(path.join(outDir,'FIXTURE_NOT_PRODUCTION.txt'),
  'FICTIONAL CUSTOMER. Four real local deterministic Work Saban role calls and 56 real local deterministic Fallen council calls. No independent agents, model inference, provider requests, source footage, voice synthesis, score, video rendering, publication, payment, or commercial delivery. Source evidence held.\n',
  {mode:0o600});
console.log(JSON.stringify({schema:'evercraft.work-saban.fallen-ci-proof.v1',
  status:'pass',fictional_fixture:true,work_role_receipts:4,
  creative_council_role_receipts:56,shots:4,
  blocked_for_source_count:preview.council_reconciliation.blocked_shot_count,
  provider_calls:0,generated_media:false,receipt_hash:preview.receipt_sha256},null,2));
