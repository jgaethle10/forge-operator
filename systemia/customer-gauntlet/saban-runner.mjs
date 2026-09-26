#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {
  loadMultiplicationRegistry,
  resolveMultiplicationContract,
  buildMultiplicationPlan,
  executeMultiplicationPlan
} from '../saban/multiplier.mjs';
import { loadWorkState } from '../saban/work-state.mjs';

const catalog = JSON.parse(
  fs.readFileSync('public/.well-known/evercraft-machine-catalog.json', 'utf8')
);
const personas = JSON.parse(
  fs.readFileSync('systemia/customer-gauntlet/personas.json', 'utf8')
);
const gateway = String(
  process.env.EVERCRAFT_MACHINE_COMMERCE_GATEWAY ||
  'https://evercraft-ai-suite-08c4d2b8.base44.app/api/apps/692b4178919afe7d08c4d2b8/functions/machineCommerceGateway'
);
const timeoutMs = Number(process.env.CUSTOMER_GAUNTLET_TIMEOUT_MS || 20000);
const physicalWorkers = Math.max(
  1,
  Math.min(
    64,
    Number(process.env.CUSTOMER_GAUNTLET_SABAN_WORKERS || personas.personas?.length || 12)
  )
);

async function request(url, { json = false } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      headers: {
        accept: json
          ? 'application/json'
          : 'text/html,application/json,text/plain;q=0.8,*/*;q=0.2',
        'user-agent': 'Evercraft-Saban-Lennox-Formation/1.0'
      },
      signal: controller.signal
    });
    const text = await response.text();
    let body = null;
    try { body = JSON.parse(text); } catch {}
    return {
      ok: response.ok,
      status: response.status,
      final_url: response.url,
      text,
      body
    };
  } finally {
    clearTimeout(timer);
  }
}

const offers = (catalog.offers || [])
  .filter((offer) => offer?.public_id && offer?.commercial_state === 'sell_now');

const preflight = await Promise.all(offers.map(async (offer) => {
  const offerUrl = new URL(gateway);
  offerUrl.searchParams.set('action', 'offer');
  offerUrl.searchParams.set('public_id', offer.public_id);

  const reviewUrl = new URL(gateway);
  reviewUrl.searchParams.set('view', 'service');
  reviewUrl.searchParams.set('public_id', offer.public_id);

  const machine = await request(offerUrl, { json: true });
  const continuation = machine.body?.continuation || null;
  const buyerUrl = typeof continuation?.buyer_url === 'string'
    ? continuation.buyer_url.trim()
    : '';

  return {
    kind: 'customer_offer',
    key: offer.public_id,
    source_file: 'public/.well-known/evercraft-machine-catalog.json',
    raw: {
      offer,
      review_url: reviewUrl.toString(),
      buyer_url: buyerUrl || null,
      offer_http_status: machine.status,
      continuation_mode: continuation?.mode || null
    }
  };
}));

const registry = loadMultiplicationRegistry();
const contract = resolveMultiplicationContract('customer-gauntlet', registry);
const logicalAgents = offers.length * (personas.personas || []).length;

const plan = buildMultiplicationPlan({
  contract,
  logicalAgents,
  physicalWorkers,
  workItems: preflight
});

const outDir = path.join('artifacts', 'customer-gauntlet');
fs.mkdirSync(outDir, { recursive: true });
const statePath = path.join(outDir, 'saban-state.json');

const receipt = await executeMultiplicationPlan({
  contract,
  plan,
  workItems: preflight,
  rootDir: process.cwd(),
  reconcile: true,
  statePath,
  resume: false
});

const state = loadWorkState(statePath);
const completed = Object.values(state.jobs || {})
  .filter((job) => job.state === 'completed')
  .map((job) => job.result)
  .filter(Boolean);
const findings = completed.flatMap((row) =>
  (row.findings || []).map((finding) => ({
    public_id: row.public_id,
    persona_id: row.persona_id,
    ...finding
  }))
);

const output = {
  schema: 'evercraft.customer-gauntlet.saban-receipt.v1',
  generated_at: new Date().toISOString(),
  control_plane: 'Systemia',
  multiplication: 'Saban',
  execution: 'Raven Nexus Lennox',
  logical_agents: plan.logical_agents,
  physical_workers: plan.physical_workers,
  expected_customer_sessions: logicalAgents,
  completed_customer_sessions: completed.length,
  scheduler_summary: receipt.scheduler_summary,
  results_digest: receipt.results_digest,
  quality: receipt.quality,
  reconciliation: receipt.reconciliation,
  findings_summary: {
    p0: findings.filter((f) => f.severity === 'P0').length,
    p1: findings.filter((f) => f.severity === 'P1').length,
    p2: findings.filter((f) => f.severity === 'P2').length
  },
  boundaries: {
    owned_execution: true,
    live_charge_attempted: false,
    payment_not_inferred: true,
    fulfillment_not_inferred: true
  }
};

fs.writeFileSync(
  path.join(outDir, 'saban-latest.json'),
  JSON.stringify(output, null, 2) + '\n'
);
fs.writeFileSync(
  path.join(outDir, 'saban-latest.md'),
  [
    '# Saban Lennox Formation',
    '',
    'Logical customer agents: ' + output.logical_agents,
    'Physical workers: ' + output.physical_workers,
    'Completed customer sessions: ' + output.completed_customer_sessions,
    'P0 findings: ' + output.findings_summary.p0,
    'P1 findings: ' + output.findings_summary.p1,
    'P2 observations: ' + output.findings_summary.p2,
    '',
    '> Saban schedules the customer swarm. Raven Nexus Lennox executes each isolated customer session. No live charge is attempted.',
    ''
  ].join('\n')
);

console.log(JSON.stringify({
  logical_agents: output.logical_agents,
  physical_workers: output.physical_workers,
  completed_customer_sessions: output.completed_customer_sessions,
  p0: output.findings_summary.p0,
  p1: output.findings_summary.p1,
  p2: output.findings_summary.p2
}));

if (
  output.completed_customer_sessions !== logicalAgents ||
  output.findings_summary.p0 > 0 ||
  output.findings_summary.p1 > 0 ||
  receipt.quality?.status === 'fail'
) {
  process.exit(1);
}
