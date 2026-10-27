#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { runLocalCreativeCouncilPreview } from './fallen-council-bridge.mjs';
import { renderFallenCouncilWorkroom } from './workroom.mjs';

const arg = flag => { const i=process.argv.indexOf(flag); return i<0?'':process.argv[i+1]||''; };
try {
  if (!arg('--task') || !arg('--brief-file') || !arg('--out')) {
    throw Error('usage: --task "commercial request" --brief-file ./brief.json --out ./artifacts/work-saban');
  }
  const brief=JSON.parse(fs.readFileSync(arg('--brief-file'),'utf8'));
  const outDir=path.resolve(arg('--out'));
  const preview=await runLocalCreativeCouncilPreview({
    task:arg('--task'),brief,outDir
  });
  fs.writeFileSync(path.join(outDir,'work-saban-fallen-workroom.html'),
    renderFallenCouncilWorkroom(preview),{mode:0o600});
  process.stdout.write(JSON.stringify({
    schema:'evercraft.work-saban.fallen-cli-receipt.v1',
    state:preview.state,registered_role_receipts:preview.registered_council_invocations,
    shot_count:preview.shot_count,blocked_shots:preview.council_reconciliation.blocked_shot_count,
    output_html:'work-saban-fallen-workroom.html',
    output_receipt:'work-saban-fallen-council-receipt.json',
    generated_media:false,provider_calls_performed:0,
    receipt_sha256:preview.receipt_sha256
  },null,2)+'\n');
} catch(error) {
  process.stderr.write(JSON.stringify({state:'blocked',error:error?.message||String(error),
    generated_media:false,external_effects:false})+'\n');
  process.exitCode=1;
}
