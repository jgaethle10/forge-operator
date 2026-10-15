#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { evaluateRevenueAutonomy, WORKFLOW_REQUIREMENTS } from './revenue-liveness.mjs';

const API = 'https://api.github.com';

function requiredEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(name + '_required');
  return value;
}

async function github(pathname) {
  const token = requiredEnv('GITHUB_TOKEN');
  const response = await fetch(API + pathname, {
    method: 'GET',
    headers: {
      accept: 'application/vnd.github+json',
      authorization: 'Bearer ' + token,
      'x-github-api-version': '2022-11-28',
      'user-agent': 'evercraft-revenue-autonomy-heartbeat',
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error('github_http_' + response.status + ':' + text.slice(0, 500));
  }
  if (response.status === 204) return null;
  return await response.json();
}

async function latestWorkflowRun(repo, workflow) {
  const file = workflow.split('/').pop();
  const payload = await github(
    '/repos/' + repo + '/actions/workflows/' + encodeURIComponent(file) + '/runs?branch=main&per_page=1'
  );
  const run = payload?.workflow_runs?.[0] || null;
  return run ? { ...run, path: workflow } : null;
}

async function snapshotWorkflows(repo) {
  const rows = [];
  for (const requirement of WORKFLOW_REQUIREMENTS) {
    const run = await latestWorkflowRun(repo, requirement.workflow);
    if (run) rows.push(run);
  }
  return {
    schema: 'evercraft.systemia.revenue-workflow-snapshot.v1',
    observed_at: new Date().toISOString(),
    workflow_runs: rows,
  };
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

function appendSummary(receipt) {
  const file = String(process.env.GITHUB_STEP_SUMMARY || '').trim();
  if (!file) return;
  const lines = [
    '## Revenue Autonomy Heartbeat',
    '',
    'Read-only revenue liveness status: **' + receipt.liveness.status + '**',
    '',
    '- Workflow lanes monitored: ' + receipt.liveness.summary.monitored_workflows,
    '- Critical workflow findings: ' + receipt.liveness.summary.critical_workflow_findings,
    '- Sell-now offers: ' + receipt.liveness.summary.sell_now_offers,
    '- Sell-now offers with continuation: ' + receipt.liveness.summary.sell_now_with_continuation,
    '- Sell-now continuation gaps: ' + receipt.liveness.summary.sell_now_without_continuation,
    '- Repair proposals held for Systemia: ' + receipt.repair_proposals.length,
    '- GitHub workflow dispatches: disabled',
    '',
    'External opportunity intake remains a separate authenticated monitor for competitions, AI jobs, Bridge Builders and partnerships. Repository automation does not accept third-party terms.',
    '',
  ];
  fs.appendFileSync(file, lines.join('\n'));
}

async function main() {
  const repo = requiredEnv('GITHUB_REPOSITORY');
  const outDir = process.argv[2] || 'artifacts/autonomy-revenue';
  const machineCatalog = JSON.parse(
    fs.readFileSync('public/.well-known/evercraft-machine-catalog.json', 'utf8')
  );
  const agentCommerce = JSON.parse(
    fs.readFileSync('public/.well-known/evercraft-agent-commerce.json', 'utf8')
  );

  const workflowSnapshot = await snapshotWorkflows(repo);
  const liveness = evaluateRevenueAutonomy({
    workflowSnapshot,
    machineCatalog,
    agentCommerce,
  });

  // Record potential repairs, but never dispatch from the GitHub heartbeat.
  // A real Systemia admission and a separately authorized execution lane are required.
  const repairProposals = (liveness.repairs || []).map((repair) => ({
    workflow: repair.workflow,
    lane: repair.lane,
    reason: repair.reason,
    action: 'request_systemia_admission',
    state: 'proposed_not_dispatched',
  }));
  const dispatches = [];
  const dispatchErrors = [];

  const receipt = {
    schema: 'evercraft.systemia.revenue-autonomy-heartbeat.v1',
    observed_at: new Date().toISOString(),
    liveness,
    dispatches,
    dispatch_errors: dispatchErrors,
    repair_proposals: repairProposals,
    repair_state: repairProposals.length > 0 ? 'held_pending_systemia_admission' : liveness.status,
    boundaries: {
      no_external_terms_accepted: true,
      no_job_application_submitted: true,
      no_checkout_created: true,
      dispatch_is_not_recovery_proof: true,
      github_dispatch_disabled: true,
      real_systemia_admission_required: true,
      next_cycle_must_verify_green: true,
    },
  };

  writeJson(path.join(outDir, 'workflows.json'), workflowSnapshot);
  writeJson(path.join(outDir, 'liveness.json'), liveness);
  writeJson(path.join(outDir, 'heartbeat.json'), receipt);
  appendSummary(receipt);

  console.log(JSON.stringify({
    status: liveness.status,
    critical_workflow_findings: liveness.summary.critical_workflow_findings,
    continuation_gaps: liveness.summary.sell_now_without_continuation,
    dispatches: dispatches.length,
    dispatch_errors: dispatchErrors.length,
    repair_proposals: repairProposals.length,
  }));

}

await main();
