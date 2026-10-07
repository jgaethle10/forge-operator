#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ResidentControlPlane } from './resident-runtime.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-resident-control-plane-'));
const statePath = path.join(tmp, 'state.json');
let clock = new Date('2026-10-07T20:00:00.000Z');

const options = {
  statePath,
  rootDir: process.cwd(),
  now: () => new Date(clock),
  triggers: [
    {
      trigger_key: 'payment-settlement-observer',
      event_type: 'payment.settled',
      mission_builder: (event) => ({
        mission_key: 'payment-settlement-' + event.event_id.replace(/[^a-z0-9]+/gi, '-').toLowerCase(),
        objective: 'Reconcile a verified payment settlement into Evercraft economic state.',
        tasks: [{
          work_key: 'reconcile-settlement',
          work_type: 'analyze',
          product_key: 'aliev',
        }],
      }),
    },
    {
      trigger_key: 'external-message-safety-proof',
      event_type: 'customer.followup.requested',
      mission: {
        objective: 'Prepare one customer follow-up through normal Systemia gates.',
        tasks: [{
          work_key: 'customer-follow-up',
          work_type: 'external_message',
        }],
      },
    },
  ],
  schedules: [{
    schedule_key: 'portfolio-heartbeat',
    every_ms: 5 * 60 * 1000,
    mission: {
      objective: 'Run one portfolio heartbeat through Systemia admission.',
      tasks: [{
        work_key: 'portfolio-heartbeat',
        work_type: 'analyze',
      }],
    },
  }],
};

const resident = new ResidentControlPlane(options);

const first = resident.ingest({
  event_id: 'evt-payment-001',
  source: 'evercraft-payments',
  type: 'payment.settled',
  occurred_at: clock,
  payload: { settlement_ref: 'proof-only' },
});
assert.equal(first.admitted, true);
assert.equal(first.authority_granted, false);

const duplicate = resident.ingest({
  event_id: 'evt-payment-001',
  source: 'evercraft-payments',
  type: 'payment.settled',
  occurred_at: clock,
});
assert.equal(duplicate.admitted, false);
assert.equal(duplicate.deduplicated, true);

const paymentTick = resident.tick();
assert.equal(paymentTick.events_considered, 1);
assert.equal(paymentTick.wakes.length, 1);
assert.equal(paymentTick.wakes[0].admitted, true);
assert.equal(paymentTick.wakes[0].authority_granted, false);
assert.equal(paymentTick.wakes[0].dispatch[0].execution_authority_granted, false);

resident.ingest({
  event_id: 'evt-followup-001',
  source: 'relationship-loop',
  type: 'customer.followup.requested',
  occurred_at: clock,
});
const safetyTick = resident.tick();
const followup = safetyTick.wakes.find((row) => row.event_id === 'evt-followup-001');
assert.ok(followup);
assert.equal(followup.dispatch[0].human_gate_required, true);
assert.equal(followup.dispatch[0].hold, 'human_gate_unresolved');
assert.equal(followup.dispatch[0].execution_authority_granted, false);

clock = new Date('2026-10-07T20:05:00.000Z');
const scheduledTick = resident.tick();
assert.equal(scheduledTick.scheduled_events_enqueued, 1);
const heartbeat = scheduledTick.wakes.find((row) => row.route_key === 'schedule:portfolio-heartbeat');
assert.ok(heartbeat);
assert.equal(heartbeat.authority_granted, false);

const restarted = new ResidentControlPlane(options);
const afterRestartDuplicate = restarted.ingest({
  event_id: 'evt-payment-001',
  source: 'evercraft-payments',
  type: 'payment.settled',
  occurred_at: clock,
});
assert.equal(afterRestartDuplicate.deduplicated, true);

const noDoubleFire = restarted.tick();
assert.equal(noDoubleFire.scheduled_events_enqueued, 0);

const snapshot = restarted.snapshot();
assert.equal(snapshot.schema, 'evercraft.systemia.resident-control-plane-state.v1');
assert.ok(snapshot.wakes.length >= 3);
assert.equal(snapshot.schedules['portfolio-heartbeat'].fire_count, 1);

console.log(JSON.stringify({
  ok: true,
  schema: 'evercraft.systemia.resident-control-plane-proof.v1',
  durable_state: fs.existsSync(statePath),
  duplicate_event_suppressed: afterRestartDuplicate.deduplicated,
  restart_recovery_preserved: snapshot.seen_event_ids.includes('evt-payment-001'),
  schedule_fired_once: snapshot.schedules['portfolio-heartbeat'].fire_count === 1,
  existing_human_gate_preserved: followup.dispatch[0].hold === 'human_gate_unresolved',
  wakeups_grant_no_execution_authority:
    snapshot.wakes.every((row) => row.authority_granted === false),
}, null, 2));
