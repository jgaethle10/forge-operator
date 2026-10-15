import test from 'node:test';
import assert from 'node:assert/strict';

import {
  WORKFLOW_REQUIREMENTS,
  evaluateRevenueAutonomy,
} from './revenue-liveness.mjs';

const now = new Date('2026-10-02T06:30:00.000Z');

function healthyRuns() {
  return WORKFLOW_REQUIREMENTS.map((requirement, index) => ({
    id: 1000 + index,
    path: requirement.workflow,
    status: 'completed',
    conclusion: 'success',
    created_at: new Date(now.getTime() - 5 * 60_000).toISOString(),
    html_url: 'https://github.com/example/run/' + (1000 + index),
  }));
}

test('healthy revenue fabric requires fresh workflows and real sell-now continuation', () => {
  const result = evaluateRevenueAutonomy({
    workflowSnapshot: { workflow_runs: healthyRuns() },
    machineCatalog: {
      offers: [{
        public_id: 'offer-1',
        name: 'Offer 1',
        commercial_state: 'sell_now',
        machine_state: 'payment_ready',
        public_url: 'https://example.com/buy/offer-1',
      }],
    },
    agentCommerce: { offers: [] },
    now,
  });

  assert.equal(result.status, 'healthy');
  assert.equal(result.summary.critical_workflow_findings, 0);
  assert.equal(result.summary.sell_now_without_continuation, 0);
  assert.equal(result.repairs.length, 0);
});

test('stale revenue workflow becomes a critical liveness incident with bounded dispatch repair', () => {
  const runs = healthyRuns();
  const target = WORKFLOW_REQUIREMENTS.find((row) => row.lane === 'legacy_rescue');
  const row = runs.find((run) => run.path === target.workflow);
  row.created_at = new Date(now.getTime() - (target.max_age_minutes + 5) * 60_000).toISOString();

  const result = evaluateRevenueAutonomy({
    workflowSnapshot: { workflow_runs: runs },
    machineCatalog: { offers: [] },
    agentCommerce: { offers: [] },
    now,
  });

  assert.equal(result.status, 'critical');
  assert.ok(result.findings.some((finding) =>
    finding.code === 'autonomy_workflow_stale' &&
    finding.lane === 'legacy_rescue'
  ));
  assert.ok(result.repairs.some((repair) =>
    repair.action === 'dispatch' &&
    repair.workflow === target.workflow
  ));
});

test('sell-now without any continuation is degraded and cannot masquerade as a live sale', () => {
  const result = evaluateRevenueAutonomy({
    workflowSnapshot: { workflow_runs: healthyRuns() },
    machineCatalog: {
      offers: [{
        public_id: 'broken-offer',
        name: 'Broken offer',
        commercial_state: 'sell_now',
        machine_state: 'payment_ready',
        public_url: '',
      }],
    },
    agentCommerce: {
      offers: [{
        public_id: 'broken-offer',
        continuation: {
          start_url: null,
          machine_offer_url: null,
          public_url: null,
          universal_mcp: null,
        },
      }],
    },
    now,
  });

  assert.equal(result.status, 'degraded');
  assert.equal(result.summary.sell_now_without_continuation, 1);
  assert.ok(result.findings.some((finding) =>
    finding.code === 'sell_now_without_continuation' &&
    finding.public_id === 'broken-offer'
  ));
});

test('active workflow does not get mislabeled stale while it is executing', () => {
  const runs = healthyRuns();
  const target = WORKFLOW_REQUIREMENTS.find((row) => row.lane === 'revenue_watershed');
  const row = runs.find((run) => run.path === target.workflow);
  row.status = 'in_progress';
  row.conclusion = null;
  row.created_at = new Date(now.getTime() - 180 * 60_000).toISOString();

  const result = evaluateRevenueAutonomy({
    workflowSnapshot: { workflow_runs: runs },
    machineCatalog: { offers: [] },
    agentCommerce: { offers: [] },
    now,
  });

  assert.equal(result.workflows.find((state) => state.lane === 'revenue_watershed').state, 'active');
  assert.equal(result.status, 'healthy');
});

test('failed workflow retries only after its cooldown instead of hot-looping', () => {
  const target = WORKFLOW_REQUIREMENTS.find((row) => row.lane === 'portfolio_sentinel');

  const recent = healthyRuns();
  const recentRow = recent.find((run) => run.path === target.workflow);
  recentRow.conclusion = 'failure';
  recentRow.created_at = new Date(now.getTime() - 5 * 60_000).toISOString();

  let result = evaluateRevenueAutonomy({
    workflowSnapshot: { workflow_runs: recent },
    machineCatalog: { offers: [] },
    agentCommerce: { offers: [] },
    now,
  });
  assert.equal(result.status, 'critical');
  assert.equal(result.repairs.some((repair) => repair.workflow === target.workflow), false);

  const cooled = healthyRuns();
  const cooledRow = cooled.find((run) => run.path === target.workflow);
  cooledRow.conclusion = 'failure';
  cooledRow.created_at = new Date(
    now.getTime() - (target.retry_failed_after_minutes + 1) * 60_000
  ).toISOString();

  result = evaluateRevenueAutonomy({
    workflowSnapshot: { workflow_runs: cooled },
    machineCatalog: { offers: [] },
    agentCommerce: { offers: [] },
    now,
  });
  assert.ok(result.repairs.some((repair) =>
    repair.workflow === target.workflow &&
    repair.reason === 'failed_after_cooldown'
  ));
});

test('a recent successful push cannot masquerade as a healthy scheduled heartbeat', () => {
  const result = evaluateRevenueAutonomy({
    workflowSnapshot: { workflow_runs: healthyRuns(), schedule_runs: [] },
    machineCatalog: { offers: [] },
    agentCommerce: { offers: [] },
    now,
  });

  assert.equal(result.status, 'critical');
  assert.equal(result.summary.critical_schedule_findings,
    WORKFLOW_REQUIREMENTS.filter((row) => row.cadence !== 'event').length);
  assert.ok(result.findings.some((finding) =>
    finding.code === 'autonomy_schedule_missing' && finding.lane === 'portfolio_sentinel'
  ));
  assert.equal(result.repairs.length, 0, 'Missing cron never auto-dispatches a duplicate job');
});

test('real schedule receipts respect the six-hour CHUM interval and event-only newsroom', () => {
  const scheduled = healthyRuns().filter((row) => row.path !== '.github/workflows/evercraft-journal-owned.yml');
  const watershed = scheduled.find((row) => row.path === '.github/workflows/chum-watershed.yml');
  watershed.created_at = new Date(now.getTime() - 350 * 60_000).toISOString();
  const result = evaluateRevenueAutonomy({
    workflowSnapshot: { workflow_runs: healthyRuns(), schedule_runs: scheduled },
    machineCatalog: { offers: [] },
    agentCommerce: { offers: [] },
    now,
  });

  assert.equal(result.status, 'healthy');
  assert.equal(result.summary.critical_schedule_findings, 0);
  assert.equal(result.schedule.find((row) => row.lane === 'revenue_watershed').state, 'healthy');
  assert.equal(result.schedule.some((row) => row.lane === 'owned_newsroom'), false);
});

test('event-only newsroom does not create recurring alerts or duplicate dispatches when idle', () => {
  const workflowRuns = healthyRuns().filter((row) => row.path !== '.github/workflows/evercraft-journal-owned.yml');
  const result = evaluateRevenueAutonomy({
    workflowSnapshot: { workflow_runs: workflowRuns, schedule_runs: workflowRuns },
    machineCatalog: { offers: [] },
    agentCommerce: { offers: [] },
    now,
  });

  assert.equal(result.status, 'healthy');
  assert.equal(result.workflows.find((row) => row.lane === 'owned_newsroom').state, 'awaiting_event');
  assert.equal(result.repairs.length, 0);
});

test('failed cron evidence is critical even if a newer push run passed', () => {
  const scheduled = healthyRuns().filter((row) => row.path !== '.github/workflows/evercraft-journal-owned.yml');
  const target = scheduled.find((row) => row.path === '.github/workflows/systemia-portfolio-sentinel.yml');
  target.status = 'completed';
  target.conclusion = 'failure';
  const result = evaluateRevenueAutonomy({
    workflowSnapshot: { workflow_runs: healthyRuns(), schedule_runs: scheduled },
    machineCatalog: { offers: [] },
    agentCommerce: { offers: [] },
    now,
  });

  assert.equal(result.status, 'critical');
  assert.ok(result.findings.some((finding) =>
    finding.code === 'autonomy_schedule_failed' && finding.lane === 'portfolio_sentinel'
  ));
  assert.equal(result.repairs.length, 0, 'Cron failure does not authorize recursive duplicate dispatch');
});

test('old in-progress jobs are stalled, not healthy and not retried concurrently', () => {
  const runs = healthyRuns();
  const stuck = runs.find((row) => row.path === '.github/workflows/systemia-legacy-rescue-watch.yml');
  stuck.status = 'in_progress';
  stuck.conclusion = null;
  stuck.created_at = new Date(now.getTime() - 180 * 60_000).toISOString();

  const result = evaluateRevenueAutonomy({
    workflowSnapshot: { workflow_runs: runs },
    machineCatalog: { offers: [] },
    agentCommerce: { offers: [] },
    now,
  });

  assert.equal(result.status, 'critical');
  assert.equal(result.workflows.find((row) => row.lane === 'legacy_rescue').state, 'stalled_active');
  assert.ok(result.findings.some((finding) =>
    finding.code === 'autonomy_workflow_stalled_active' && finding.lane === 'legacy_rescue'
  ));
  assert.equal(result.repairs.some((repair) => repair.lane === 'legacy_rescue'), false);
});
