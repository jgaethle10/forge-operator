#!/usr/bin/env node
// Evercraft/Systemia GitHub Actions fan-out evidence. GET-only, no workflow mutation.
// A CI run's title or success is NOT a production execution receipt.
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const SHA_RE = /^[a-f\d]{40}$/i;
const REPO_RE = /^(?!\.{1,2}\/)(?![^/]+\/\.{1,2}$)[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const HOLD_NAME_RE = /(?:^|[^a-z\d])(?:rivet|aliev)(?:$|[^a-z\d])/i;
const clamp = (v, n = 180) => typeof v === 'string' ? v.replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, n) : '';
const assert = (condition, error) => { if (!condition) throw new Error(error); };

export function analyzeFanout(snapshot, {maxExpectedWorkflows = 12} = {}) {
  assert(snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot), 'snapshot_required');
  const {repository, head_sha: headSha, changed_files: files, workflow_runs: runs} = snapshot;
  assert(REPO_RE.test(repository), 'invalid_repository');
  assert(SHA_RE.test(headSha), 'invalid_head_sha');
  assert(Array.isArray(files) && files.length <= 500 && files.every(x => typeof x === 'string'), 'invalid_changed_files');
  assert(Array.isArray(runs) && runs.length <= 1000, 'invalid_workflow_runs');
  assert(Number.isSafeInteger(maxExpectedWorkflows) && maxExpectedWorkflows >= 1 && maxExpectedWorkflows <= 500, 'invalid_budget');
  const observed = runs.filter(run => run && typeof run === 'object' &&
    run.head_sha === headSha && run.event === 'pull_request' &&
    Number.isSafeInteger(run.id) && run.id > 0 && typeof run.name === 'string');
  const byRunId = new Map();
  for (const run of observed) {
    const prev = byRunId.get(run.id);
    if (!prev || (Number(run.run_attempt) || 0) > (Number(prev.run_attempt) || 0)) byRunId.set(run.id, run);
  }
  const exactRuns = [...byRunId.values()];
  const groups = new Map();
  for (const run of exactRuns) {
    const k = Number.isSafeInteger(run.workflow_id) ? `id:${run.workflow_id}` : `name:${run.name}`;
    const item = groups.get(k) || {workflow_name:clamp(run.name),runs:0,completed:0,successful:0,failed:0,cancelled:0,queued_or_running:0};
    item.runs++;
    if (run.status === 'completed') {
      item.completed++;
      if (run.conclusion === 'success') item.successful++;
      if (['failure','timed_out','action_required'].includes(run.conclusion)) item.failed++;
      if (run.conclusion === 'cancelled') item.cancelled++;
    } else item.queued_or_running++;
    groups.set(k, item);
  }
  const workflows = [...groups.values()].sort((a,b)=>a.workflow_name.localeCompare(b.workflow_name));
  const flaggedHeldNames=workflows.filter(x=>HOLD_NAME_RE.test(x.workflow_name)).map(x=>x.workflow_name);
  const uniqueNames = [...new Set(files.map(x=>clamp(x,240)))].sort();
  const overBudget=workflows.length > maxExpectedWorkflows;
  const reasonCodes=[];
  if(overBudget)reasonCodes.push('workflow_fanout_above_advisory_budget');
  if(flaggedHeldNames.length)reasonCodes.push('legally_held_name_requires_manual_trigger_review');
  return {
    schema:'evercraft.github.ci-fanout-evidence.v1',
    source:'github_actions_run_metadata',
    evidence_kind:'observation_not_deployment',
    repository,head_sha:headSha.toLowerCase(),
    changed_file_count:uniqueNames.length,
    shared_manifest_changed:uniqueNames.includes('package.json'),
    workflow_definition_changed:uniqueNames.some(x=>x.startsWith('.github/workflows/')),
    workflow_run_count:exactRuns.length,
    unique_workflow_count:workflows.length,
    completed_runs:exactRuns.filter(x=>x.status==='completed').length,
    pending_runs:exactRuns.filter(x=>x.status!=='completed').length,
    successful_runs:exactRuns.filter(x=>x.conclusion==='success').length,
    failed_runs:exactRuns.filter(x=>['failure','timed_out','action_required'].includes(x.conclusion)).length,
    cancelled_runs:exactRuns.filter(x=>x.conclusion==='cancelled').length,
    held_named_workflows:flaggedHeldNames,
    workflows,
    advisory_budget:maxExpectedWorkflows,
    review_required:reasonCodes.length>0,
    review_reasons:reasonCodes,
    billing_minutes_verified:false,
    trigger_causation_verified:false,
    host_execution_verified:false,
    production_deployment_verified:false,
    permissions_modified:false,
    workflows_disabled:false
  };
}

async function apiGet(repo, path, token, transport = fetch) {
  const url=`https://api.github.com/repos/${repo}/${path}`;
  const response=await transport(url, {method:'GET',headers:{
    'Accept':'application/vnd.github+json',
    'X-GitHub-Api-Version':'2022-11-28',
    'User-Agent':'Evercraft-Systemia-ReadOnly-Fanout-Audit',
    ...(token?{'Authorization':`Bearer ${token}`}:{})
  },redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!response.ok) throw new Error(`github_read_failed_http_${response.status}`);
  return response.json();
}

export async function readGitHubFanout({repository, pullNumber, expectedHeadSha = null, token = '', transport = fetch} = {}) {
  assert(REPO_RE.test(repository), 'invalid_repository');
  assert(Number.isSafeInteger(pullNumber) && pullNumber >= 1, 'invalid_pull_number');
  assert(!expectedHeadSha || SHA_RE.test(expectedHeadSha), 'invalid_expected_sha');
  const pr=await apiGet(repository,`pulls/${pullNumber}`,token,transport);
  const head=pr?.head?.sha;
  assert(SHA_RE.test(head), 'invalid_provider_head_sha');
  if(expectedHeadSha && head!==expectedHeadSha) throw new Error('pull_head_changed_retry_read_only');
  const files=[];
  for(let page=1;page<=5;page++) {
    const body=await apiGet(repository,`pulls/${pullNumber}/files?per_page=100&page=${page}`,token,transport);
    assert(Array.isArray(body), 'invalid_provider_files');
    files.push(...body.map(x=>x.filename));
    if(body.length < 100) break;
  }
  assert(files.length<=500, 'file_page_limit_exceeded');
  const workflow_runs=[];
  for(let page=1;page<=10;page++) {
    const body=await apiGet(repository,`actions/runs?head_sha=${head}&event=pull_request&per_page=100&page=${page}`,token,transport);
    assert(Array.isArray(body?.workflow_runs), 'invalid_provider_actions');
    workflow_runs.push(...body.workflow_runs);
    if(body.workflow_runs.length<100) break;
  }
  assert(workflow_runs.length<=1000,'run_page_limit_exceeded');
  // Repeat PR head check to refuse to misattribute concurrent updates.
  const final=await apiGet(repository,`pulls/${pullNumber}`,token,transport);
  if(final?.head?.sha!==head) throw new Error('pull_head_changed_retry_read_only');
  return {repository,head_sha:head,changed_files:files,workflow_runs};
}

function parseCli(argv) {
  const opts={};
  for(let i=0;i<argv.length;i++) {
    const key=argv[i];
    if(!['--snapshot','--repo','--pr','--sha','--budget'].includes(key)||!argv[i+1])throw new Error('usage: --snapshot FILE OR --repo owner/repo --pr NUMBER [--sha HEAD] [--budget COUNT]');
    if(opts[key]!==undefined)throw new Error('duplicate_argument');
    opts[key]=argv[++i];
  }
  return opts;
}

async function main(argv) {
  const o=parseCli(argv);
  const budget=o['--budget']===undefined?12:Number(o['--budget']);
  let snapshot;
  if(o['--snapshot']){
    assert(!o['--repo']&&!o['--pr']&&!o['--sha'],'snapshot_cannot_mix_live_args');
    snapshot=JSON.parse(await readFile(o['--snapshot'],'utf8'));
  } else {
    assert(o['--repo']&&o['--pr'],'live_repo_and_pr_required');
    snapshot=await readGitHubFanout({repository:o['--repo'],pullNumber:Number(o['--pr']),expectedHeadSha:o['--sha']||null,token:process.env.GITHUB_TOKEN||''});
  }
  process.stdout.write(JSON.stringify(analyzeFanout(snapshot,{maxExpectedWorkflows:budget}),null,2)+'\n');
}

if(process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch(error=>{process.stderr.write(`${clamp(error?.message||'audit_failed')}\n`);process.exitCode=1;});
}
