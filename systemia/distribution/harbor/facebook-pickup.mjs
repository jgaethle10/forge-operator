import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runFacebookJob, validateFacebookJob } from './facebook-job.mjs';

const repo = 'jgaethle10/forge-operator';
const artifact = 'harbor-facebook-validation';
const [approvalPath, ...extra] = process.argv.slice(2);

try {
  if (!approvalPath || extra.length) throw new Error('approval_file_required');
  // Read local authority before contacting GitHub. The artifact cannot grant it.
  const approval = JSON.parse(readFileSync(approvalPath, 'utf8'));
  if (!/^\d+$/.test(approval.run_id) || !/^[a-f0-9]{40}$/.test(approval.commit)
    || !/^[a-f0-9]{64}$/.test(approval.job_sha256) || !/^\d{5,32}$/.test(approval.page_id)
    || typeof approval.credential_ref !== 'string' || !approval.credential_ref.trim()
    || !/^distribution\/marketing\/(?:[\w-]+\/)*[\w.-]+\.json$/.test(approval.job_path)) {
    throw new Error('approval_invalid');
  }
  const command = (program, args) => execFileSync(program, args, {
    timeout: 60000, maxBuffer: 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const run = JSON.parse(command('gh', ['api', 'repos/'+repo+'/actions/runs/'+approval.run_id]));
  if (run.path !== '.github/workflows/harbor-facebook-page-job.yml' || run.event !== 'workflow_dispatch'
    || run.head_branch !== 'main' || run.head_sha !== approval.commit
    || run.head_repository?.full_name !== repo) throw new Error('run_identity_mismatch');
  if (run.status !== 'completed') {
    console.log(JSON.stringify({status:'waiting_for_validation',run_id:approval.run_id}));
  } else {
    if (run.conclusion !== 'success') throw new Error('validation_run_failed');
    const temp = mkdtempSync(join(tmpdir(), 'harbor-facebook-'));
    try {
      command('gh', ['run', 'download', approval.run_id, '--repo', repo, '--name', artifact, '--dir', temp]);
      const validated = JSON.parse(readFileSync(join(temp, 'validation.json'), 'utf8'));
      if (validated.status !== 'validated' || validated.commit !== approval.commit
        || validated.job_path !== approval.job_path || validated.page_id !== approval.page_id
        || validated.job_sha256 !== approval.job_sha256) throw new Error('validation_receipt_mismatch');
      command('git', ['fetch', '--no-tags', 'https://github.com/jgaethle10/forge-operator.git', 'main']);
      const bytes = command('git', ['show', approval.commit+':'+approval.job_path]);
      const {digest, job} = validateFacebookJob(bytes);
      if (digest !== approval.job_sha256 || job.page_id !== approval.page_id) throw new Error('job_bytes_mismatch');
      const result = await runFacebookJob(bytes, {publish:true, env:{...process.env,
        HARBOR_FACEBOOK_APPROVED_SHA256:approval.job_sha256,
        HARBOR_FACEBOOK_APPROVED_PAGE_ID:approval.page_id,
        CLIP_FACEBOOK_CREDENTIAL_REF:approval.credential_ref,
      }});
      console.log(JSON.stringify({...result, run_id:approval.run_id, commit:approval.commit}));
      if (result.status !== 'published' && !(result.status === 'duplicate_hold' && result.prior_status === 'published')) {
        process.exitCode = 1;
      }
    } finally {
      rmSync(temp, {recursive:true, force:true});
    }
  }
} catch (error) {
  const messages = new Set(['approval_file_required','approval_invalid','run_identity_mismatch',
    'validation_run_failed','validation_receipt_mismatch','job_bytes_mismatch']);
  console.error(messages.has(error.message) ? error.message : 'harbor_pickup_failed');
  process.exitCode = 1;
}
