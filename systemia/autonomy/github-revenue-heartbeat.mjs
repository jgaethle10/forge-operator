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

async function latestWorkflowRun(repo, workflow, { event = null } = {}) {
  const file = workflow.split('/').pop();
  const payload = await github(
    '/repos/' + repo + '/actions/workflows/' + encodeURIComponent(file) + '/runs?branch=main&per_page=1' +
      (event ? '&event=' + encodeURIComponent(event) : '')
  );
  const run = payload?.workflow_runs?.[0] || null;
  return run ? { ...run, path: workflow } : null;
}

async function snapshotWorkflows(repo) {
  const rows = [];
  const scheduledRows = [];
  for (const requirement of WORKFLOW_REQUIREMENTS) {
    const run = await latestWorkflowRun(repo, requirement.workflow);
    if (run) rows.push(run);
    // GitHub's latest run can come from a push, PR or manual dispatch. Query
    // event=schedule separately so source activity cannot forge cron liveness.
    if (requirement.cadence !== 'event') {
      const scheduledRun = await latestWorkflowRun(repo, requirement.workflow, { event: 'schedule' });
      if (scheduledRun) scheduledRows.push(scheduledRun);
    }
  }
  return {
    schema: 'evercraft.systemia.revenue-workflow-snapshot.v1',
    observed_at: new Date().toISOString(),
    workflow_runs: rows,
    schedule_runs: scheduledRows,
  };
}

// GitHub is observation-only. Systemia approval is required before any repair execution.

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
    'Read-only liveness status: **' + receipt.liveness.status + '**',
    '',
    '- Workflow lanes monitored: ' + receipt.liveness.summary.monitored_workflows,
    '- Critical workflow findings: ' + receipt.liveness.summary.critical_workflow_findings,
    '- Critical scheduled-cadence findings: ' + receipt.liveness.summary.critical_schedule_findings,
    '- Sell-now offers: ' + receipt.liveness.summary.sell_now_offers,
    '- Sell-now offers with continuation: ' + receipt.liveness.summary.sell_now_with_continuation,
    '- Sell-now continuation gaps: ' + receipt.liveness.summary.sell_now_without_continuation,
    '- Repair proposals held for Systemia: ' + receipt.repair_proposals.length,
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

  // Preserve failure observations and repair intent, never mutate GitHub Actions.
  const repairProposals = (liveness.repairs || []).map((repair) => ({
    workflow: repair.workflow,
    lane: repair.lane,
    reason: repair.reason,
    failed_run_id: repair.failed_run_id || null,
    action: 'request_systemia_admission',
    state: 'review_held_not_dispatched',
  }));

  const receipt = {
    schema: 'evercraft.systemia.revenue-autonomy-heartbeat.v1',
    observed_at: new Date().toISOString(),
    liveness,
    repair_proposals: repairProposals,
    dispatches: [],
    dispatch_errors: [],
    repair_state: repairProposals.length ? 'review_held_awaiting_systemia_admission' : liveness.status,
    boundaries: {
      no_external_terms_accepted: true,
      no_job_application_submitted: true,
      no_checkout_created: true,
      automatic_github_dispatch_disabled: true,
      systemia_admission_required_before_execution: true,
      dispatch_is_not_recovery_proof: true,
      next_cycle_must_verify_green: true,
      schedule_observations_are_distinct_from_push: true,
    },
  };

  writeJson(path.join(outDir, 'workflows.json'), workflowSnapshot);
  writeJson(path.join(outDir, 'liveness.json'), liveness);
  writeJson(path.join(outDir, 'heartbeat.json'), receipt);
  appendSummary(receipt);

  console.log(JSON.stringify({
    status: liveness.status,
    critical_workflow_findings: liveness.summary.critical_workflow_findings,
    critical_schedule_findings: liveness.summary.critical_schedule_findings,
    continuation_gaps: liveness.summary.sell_now_without_continuation,
    repair_proposals: repairProposals.length,
    dispatches: 0,
    dispatch_errors: 0,
  }));

}

await main();
