/** Command: node visual-lock-preflight.mjs SPEC.json ATTEMPT.json WORKSPACE_ROOT */
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {collectAssetEvidence,evaluateVisualLock} from './visual-lock.mjs';
const [specFile, submissionFile, workspace] = process.argv.slice(2);
if(!specFile || !submissionFile || !workspace) {
  process.stderr.write('Usage: node visual-lock-preflight.mjs SPEC.json ATTEMPT.json WORKSPACE_ROOT\n');
  process.exit(2);
}
try {
  const spec=JSON.parse(readFileSync(specFile,'utf8'));
  const attempt=JSON.parse(readFileSync(submissionFile,'utf8'));
  const measured=collectAssetEvidence(workspace,{
    reference:spec?.reference?.asset, ...attempt?.artifacts
  });
  if(measured.rig_proof?.sha256) {
    try {
      const verifiedPath=resolve(workspace,measured.rig_proof.path);
      attempt.rigProof=JSON.parse(readFileSync(verifiedPath,'utf8'));
    } catch { attempt.rigProof=null; }
  } else attempt.rigProof=null;
  const result=evaluateVisualLock(spec,attempt,measured);
  process.stdout.write(JSON.stringify({
    schema:'evercraft.animation.visual-preflight.result.v1',
    productionId:spec.productionId,checkedAssets:measured,...result
  },null,2)+'\n');
  process.exit(result.status==='BLOCKED'?1:0);
} catch(e) {
  process.stderr.write(JSON.stringify({status:'BLOCKED',
    blockers:['preflight_error'],message:String(e.message)})+'\n');
  process.exit(2);
}
