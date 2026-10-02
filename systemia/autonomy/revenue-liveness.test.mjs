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
