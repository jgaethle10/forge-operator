#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const WORKFLOW_REQUIREMENTS = Object.freeze([
  { lane: 'portfolio_sentinel', workflow: '.github/workflows/systemia-portfolio-sentinel.yml', max_age_minutes: 20, retry_failed_after_minutes: 20, repair: 'dispatch' },
  { lane: 'legacy_rescue', workflow: '.github/workflows/systemia-legacy-rescue-watch.yml', max_age_minutes: 20, retry_failed_after_minutes: 20, repair: 'dispatch' },
  { lane: 'commercial_discovery', workflow: '.github/workflows/portfolio-sentinel-commercial-discovery.yml', max_age_minutes: 45, retry_failed_after_minutes: 30, repair: 'dispatch' },
  { lane: 'revenue_watershed', workflow: '.github/workflows/chum-watershed.yml', max_age_minutes: 420, retry_failed_after_minutes: 45, repair: 'dispatch' },
  { lane: 'owned_newsroom', workflow: '.github/workflows/evercraft-journal-owned.yml', cadence: 'event', repair: 'none' },
]);

export const EXTERNAL_REVENUE_LANES = Object.freeze([
  'competitions_and_hackathons',
  'ai_employment',
  'implementation_partnerships',
  'bridge_builders_reentry',
]);

function readJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function asTime(value) {
  const n = new Date(String(value || '')).getTime();
  return Number.isFinite(n) ? n : null;
}

function latestRunFor(workflowRuns, workflow) {
  return (workflowRuns || [])
    .filter((run) => run?.path === workflow)
    .slice()
    .sort((a, b) => (asTime(b.created_at) || 0) - (asTime(a.created_at) || 0))[0] || null;
}

function continuationFor(publicId, catalogOffer, agentCommerce) {
  const machine = (agentCommerce?.offers || []).find((row) => row?.public_id === publicId);
  const continuation = machine?.continuation || {};
  const candidates = [
    continuation.start_url,
    continuation.machine_offer_url,
    continuation.public_url,
    continuation.universal_mcp,
    catalogOffer?.public_url,
  ].map((value) => String(value || '').trim()).filter(Boolean);
  return {
    ok: candidates.length > 0,
    candidates,
    exact_entry_offer: machine?.exact_entry_offer || null,
  };
}

export function evaluateRevenueAutonomy({
  workflowSnapshot = {},
  machineCatalog = {},
  agentCommerce = {},
  now = new Date(),
  workflowRequirements = WORKFLOW_REQUIREMENTS,
} = {}) {
  const observedAt = now instanceof Date ? now : new Date(now);
  const nowMs = observedAt.getTime();
  const runs = Array.isArray(workflowSnapshot?.workflow_runs)
    ? workflowSnapshot.workflow_runs
    : [];

  const workflowFindings = [];
  const workflowStates = [];
  const repairs = [];
  // The scheduled event is distinct from push, PR and manual workflow execution.
  // Null means an older snapshot that did not collect schedule evidence.
  const scheduledRuns = Array.isArray(workflowSnapshot?.schedule_runs)
    ? workflowSnapshot.schedule_runs
    : null;
  const scheduleStates = [];
  const scheduleFindings = [];

  for (const requirement of workflowRequirements) {
    const run = latestRunFor(runs, requirement.workflow);
    if (!run && requirement.cadence === 'event') {
      workflowStates.push({
        lane: requirement.lane,
        workflow: requirement.workflow,
        state: 'awaiting_event',
        cadence: 'event',
        latest_run_id: null,
        latest_conclusion: null,
        age_minutes: null,
      });
      continue;
    }
    if (!run) {
      workflowStates.push({
        lane: requirement.lane,
        workflow: requirement.workflow,
        state: 'missing',
        latest_run_id: null,
        latest_conclusion: null,
        age_minutes: null,
      });
      workflowFindings.push({
        severity: 'critical',
        code: 'autonomy_workflow_missing',
        lane: requirement.lane,
        workflow: requirement.workflow,
        detail: 'No main-branch workflow run was found in the current liveness window.',
      });
      if (requirement.repair === 'dispatch') repairs.push({
        lane: requirement.lane,
        action: 'dispatch',
        workflow: requirement.workflow,
        reason: 'missing_run',
      });
      continue;
    }

    const createdMs = asTime(run.created_at);
    const ageMinutes = createdMs == null ? null : Math.max(0, (nowMs - createdMs) / 60000);
    const active = ['queued', 'pending', 'in_progress', 'waiting', 'requested'].includes(String(run.status || ''));
    const failed = run.status === 'completed' && !['success', 'skipped'].includes(String(run.conclusion || ''));
    const activeStalled = active && (ageMinutes == null ||
      (requirement.cadence !== 'event' && ageMinutes > requirement.max_age_minutes));
    const stale = requirement.cadence !== 'event' && !active &&
      (ageMinutes == null || ageMinutes > requirement.max_age_minutes);

    let state = requirement.cadence === 'event' ? 'event_observed' : 'healthy';
    if (activeStalled) state = 'stalled_active';
    else if (active) state = 'active';
    else if (failed) state = 'failed';
    else if (stale) state = 'stale';

    workflowStates.push({
      lane: requirement.lane,
      workflow: requirement.workflow,
      state,
      latest_run_id: run.id || null,
      latest_status: run.status || null,
      latest_conclusion: run.conclusion || null,
      latest_created_at: run.created_at || null,
      age_minutes: ageMinutes == null ? null : Number(ageMinutes.toFixed(1)),
      max_age_minutes: requirement.max_age_minutes,
      html_url: run.html_url || null,
    });

    if (activeStalled) {
      // A timed-out active run needs investigation, not another overlapping dispatch.
      workflowFindings.push({
        severity: 'critical',
        code: 'autonomy_workflow_stalled_active',
        lane: requirement.lane,
        workflow: requirement.workflow,
        run_id: run.id || null,
        detail: 'An active workflow exceeded its observed execution window; no duplicate repair dispatched.',
      });
    } else if (failed) {
      workflowFindings.push({
        severity: 'critical',
        code: 'autonomy_workflow_failed',
        lane: requirement.lane,
        workflow: requirement.workflow,
        run_id: run.id || null,
        detail: `Latest run concluded ${run.conclusion || 'non-success'}.`,
      });
      const retryAfter = Number(requirement.retry_failed_after_minutes || requirement.max_age_minutes || 20);
      if (
        requirement.repair === 'dispatch' &&
        ageMinutes != null &&
        ageMinutes >= retryAfter
      ) {
        repairs.push({
          lane: requirement.lane,
          action: 'dispatch',
          workflow: requirement.workflow,
          reason: 'failed_after_cooldown',
          failed_run_id: run.id || null,
          failed_age_minutes: Number(ageMinutes.toFixed(1)),
          retry_failed_after_minutes: retryAfter,
        });
      }
    } else if (stale) {
      workflowFindings.push({
        severity: 'critical',
        code: 'autonomy_workflow_stale',
        lane: requirement.lane,
        workflow: requirement.workflow,
        run_id: run.id || null,
        detail: `Latest run is ${ageMinutes?.toFixed(1) ?? 'unknown'} minutes old; allowed age is ${requirement.max_age_minutes} minutes.`,
      });
      if (requirement.repair === 'dispatch') repairs.push({
        lane: requirement.lane,
        action: 'dispatch',
        workflow: requirement.workflow,
        reason: 'stale',
      });
    }
  }

  // A recent push or workflow_dispatch proves an execution attempt, NOT that cron is healthy.
  // Schedule observations only exist when the upstream GitHub run query includes event=schedule.
  // Cron recovery cannot be repaired by repeatedly invoking a regular job.
  if (scheduledRuns !== null) {
    for (const requirement of workflowRequirements) {
      if (requirement.cadence === 'event') continue;
      const run = latestRunFor(scheduledRuns, requirement.workflow);
      const age = run ? asTime(run.created_at) : null;
      const ageMinutes = age == null ? null : Math.max(0, (nowMs - age) / 60000);
      const active = run && ['queued', 'pending', 'in_progress', 'waiting', 'requested'].includes(String(run.status || ''));
      const failed = run?.status === 'completed' && !['success', 'skipped'].includes(String(run.conclusion || ''));
      const state = !run ? 'missing' :
        ageMinutes == null || ageMinutes > requirement.max_age_minutes ? 'stale' :
        failed ? 'failed' : active ? 'active' : 'healthy';
      scheduleStates.push({
        lane: requirement.lane,
        workflow: requirement.workflow,
        state,
        latest_scheduled_run_id: run?.id || null,
        latest_scheduled_at: run?.created_at || null,
        latest_status: run?.status || null,
        latest_conclusion: run?.conclusion || null,
        age_minutes: ageMinutes == null ? null : Number(ageMinutes.toFixed(1)),
        max_age_minutes: requirement.max_age_minutes,
        html_url: run?.html_url || null,
      });
      if (state !== 'healthy' && state !== 'active') {
        scheduleFindings.push({
          severity: 'critical',
          code: 'autonomy_schedule_' + state,
          lane: requirement.lane,
          workflow: requirement.workflow,
          run_id: run?.id || null,
          detail: 'No fresh successful scheduled-event receipt. Push/PR/manual runs cannot certify cron cadence; do not auto-dispatch a duplicate.',
        });
      }
    }
  }

  const commerceFindings = [];
  const sellNow = (machineCatalog?.offers || []).filter((offer) =>
    offer?.public_id && offer?.commercial_state === 'sell_now'
  );
  const commerceStates = sellNow.map((offer) => {
    const continuation = continuationFor(offer.public_id, offer, agentCommerce);
    if (!continuation.ok) {
      commerceFindings.push({
        severity: 'high',
        code: 'sell_now_without_continuation',
        public_id: offer.public_id,
        name: offer.name || offer.public_id,
        detail: 'Offer is marked sell_now but no structured human or machine continuation is currently published.',
      });
    }
    return {
      public_id: offer.public_id,
      name: offer.name || null,
      machine_state: offer.machine_state || null,
      continuation_ready: continuation.ok,
      continuation_candidates: continuation.candidates,
      exact_entry_offer: continuation.exact_entry_offer,
    };
  });

  const critical = [...workflowFindings, ...scheduleFindings].filter((row) => row.severity === 'critical').length;
  const high = commerceFindings.length + workflowFindings.filter((row) => row.severity === 'high').length;
  const status = critical > 0 ? 'critical' : high > 0 ? 'degraded' : 'healthy';

  return {
    schema: 'evercraft.systemia.revenue-autonomy-liveness.v1',
    observed_at: observedAt.toISOString(),
    status,
    doctrine: {
      active_is_not_a_terminal_state: true,
      every_internal_revenue_lane_requires_fresh_execution_evidence: true,
      sell_now_requires_structured_continuation: true,
      external_terms_and_job_applications_remain_human_gated: true,
      attempted_repair_is_not_success: true,
      push_or_manual_run_does_not_prove_cron: true,
    },
    external_monitor_contract: {
      lanes: EXTERNAL_REVENUE_LANES,
      state: 'must_be_supplied_by_external_opportunity_monitor',
      note: 'Repository automation cannot truthfully substitute for authenticated inbox/web intake or accept third-party legal terms.',
    },
    workflows: workflowStates,
    schedule: scheduleStates,
    commerce: commerceStates,
    findings: [...workflowFindings, ...scheduleFindings, ...commerceFindings],
    repairs,
    summary: {
      monitored_workflows: workflowStates.length,
      observed_scheduled_workflows: scheduleStates.length,
      critical_schedule_findings: scheduleFindings.length,
      healthy_or_active_workflows: workflowStates.filter((row) => ['healthy', 'active'].includes(row.state)).length,
      critical_workflow_findings: critical,
      sell_now_offers: commerceStates.length,
      sell_now_with_continuation: commerceStates.filter((row) => row.continuation_ready).length,
      sell_now_without_continuation: commerceStates.filter((row) => !row.continuation_ready).length,
      high_findings: high,
    },
  };
}

function arg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function writeGithubOutput(file, key, value) {
  if (!file) return;
  fs.appendFileSync(file, `${key}=${String(value)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const workflowSnapshot = readJson(arg('--workflows', 'artifacts/autonomy-revenue/workflows.json'), { workflow_runs: [] });
  const machineCatalog = readJson(arg('--catalog', 'public/.well-known/evercraft-machine-catalog.json'), { offers: [] });
  const agentCommerce = readJson(arg('--agent-commerce', 'public/.well-known/evercraft-agent-commerce.json'), { offers: [] });
  const out = arg('--out', 'artifacts/autonomy-revenue/liveness.json');
  const githubOutput = arg('--github-output', process.env.GITHUB_OUTPUT || '');

  const receipt = evaluateRevenueAutonomy({ workflowSnapshot, machineCatalog, agentCommerce });
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(receipt, null, 2) + '\n');

  writeGithubOutput(githubOutput, 'status', receipt.status);
  writeGithubOutput(githubOutput, 'critical', receipt.summary.critical_workflow_findings);
  writeGithubOutput(githubOutput, 'commerce_gaps', receipt.summary.sell_now_without_continuation);

  console.log(JSON.stringify(receipt.summary));
  if (receipt.status === 'critical') process.exitCode = 2;
}
