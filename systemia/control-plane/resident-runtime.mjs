#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { admitMission } from './control-plane.mjs';

const STATE_SCHEMA = 'evercraft.systemia.resident-control-plane-state.v1';
const RECEIPT_SCHEMA = 'evercraft.systemia.resident-control-plane-receipt.v1';

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function iso(value = new Date()) {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function hash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function atomicWrite(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = filePath + '.tmp-' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, filePath);
}

function initialState() {
  return {
    schema: STATE_SCHEMA,
    version: 1,
    updated_at: null,
    seen_event_ids: [],
    queue: [],
    wakes: [],
    schedules: {},
  };
}

function loadState(statePath) {
  if (!fs.existsSync(statePath)) return initialState();
  const parsed = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  if (parsed.schema !== STATE_SCHEMA) {
    throw new Error('resident_control_plane_state_schema_mismatch');
  }
  return {
    ...initialState(),
    ...parsed,
    seen_event_ids: Array.isArray(parsed.seen_event_ids) ? parsed.seen_event_ids : [],
    queue: Array.isArray(parsed.queue) ? parsed.queue : [],
    wakes: Array.isArray(parsed.wakes) ? parsed.wakes : [],
    schedules: parsed.schedules && typeof parsed.schedules === 'object' ? parsed.schedules : {},
  };
}

function eventId(event) {
  const explicit = clean(event?.event_id || event?.id);
  if (explicit) return explicit;
  const canonical = JSON.stringify({
    source: clean(event?.source || 'unknown'),
    type: clean(event?.type),
    occurred_at: clean(event?.occurred_at || event?.at),
    payload: event?.payload ?? null,
  });
  return 'event:sha256:' + hash(canonical);
}

function normalizeEvent(event, now) {
  const type = clean(event?.type);
  if (!type) throw new Error('resident_event_type_required');
  return {
    event_id: eventId(event),
    source: clean(event?.source || 'unknown'),
    type,
    occurred_at: iso(event?.occurred_at || event?.at || now),
    observed_at: iso(now),
    payload: event?.payload ?? null,
    status: 'pending',
  };
}

function normalizeTrigger(trigger, index) {
  const eventType = clean(trigger?.event_type || trigger?.type);
  if (!eventType) throw new Error('resident_trigger_event_type_required:' + index);
  if (!trigger?.mission && typeof trigger?.mission_builder !== 'function') {
    throw new Error('resident_trigger_mission_required:' + index);
  }
  return {
    trigger_key: clean(trigger?.trigger_key || trigger?.key || 'trigger-' + (index + 1)),
    event_type: eventType,
    mission: trigger?.mission ? clone(trigger.mission) : null,
    mission_builder: typeof trigger?.mission_builder === 'function' ? trigger.mission_builder : null,
  };
}

function normalizeSchedule(schedule, index) {
  const everyMs = Number(schedule?.every_ms || 0);
  if (!Number.isFinite(everyMs) || everyMs <= 0) {
    throw new Error('resident_schedule_every_ms_required:' + index);
  }
  if (!schedule?.mission && typeof schedule?.mission_builder !== 'function') {
    throw new Error('resident_schedule_mission_required:' + index);
  }
  return {
    schedule_key: clean(schedule?.schedule_key || schedule?.key || 'schedule-' + (index + 1)),
    every_ms: Math.floor(everyMs),
    enabled: schedule?.enabled !== false,
    mission: schedule?.mission ? clone(schedule.mission) : null,
    mission_builder: typeof schedule?.mission_builder === 'function' ? schedule.mission_builder : null,
  };
}

export class ResidentControlPlane {
  constructor({
    statePath,
    rootDir = process.cwd(),
    triggers = [],
    schedules = [],
    now = () => new Date(),
    maxHistory = 1000,
  } = {}) {
    if (!statePath) throw new Error('resident_state_path_required');
    this.statePath = path.resolve(statePath);
    this.rootDir = path.resolve(rootDir);
    this.now = now;
    this.maxHistory = Math.max(100, Number(maxHistory || 1000));
    this.triggers = triggers.map(normalizeTrigger);
    this.schedules = schedules.map(normalizeSchedule);
    this.state = loadState(this.statePath);
    this.#initializeSchedules();
    this.#persist();
  }

  #initializeSchedules() {
    const nowMs = this.now().getTime();
    for (const schedule of this.schedules) {
      if (!this.state.schedules[schedule.schedule_key]) {
        this.state.schedules[schedule.schedule_key] = {
          next_due_at: new Date(nowMs + schedule.every_ms).toISOString(),
          last_fired_at: null,
          fire_count: 0,
        };
      }
    }
  }

  #persist() {
    this.state.updated_at = iso(this.now());
    this.state.seen_event_ids = this.state.seen_event_ids.slice(-this.maxHistory * 4);
    this.state.wakes = this.state.wakes.slice(-this.maxHistory);
    this.state.queue = this.state.queue.slice(-this.maxHistory);
    atomicWrite(this.statePath, this.state);
  }

  ingest(event) {
    const normalized = normalizeEvent(event, this.now());
    const seen = new Set(this.state.seen_event_ids);
    const queued = this.state.queue.some((row) => row.event_id === normalized.event_id);
    if (seen.has(normalized.event_id) || queued) {
      return {
        schema: RECEIPT_SCHEMA,
        action: 'ingest',
        event_id: normalized.event_id,
        admitted: false,
        deduplicated: true,
        authority_granted: false,
      };
    }
    this.state.queue.push(normalized);
    this.#persist();
    return {
      schema: RECEIPT_SCHEMA,
      action: 'ingest',
      event_id: normalized.event_id,
      admitted: true,
      deduplicated: false,
      authority_granted: false,
    };
  }

  #enqueueDueSchedules() {
    const now = this.now();
    const nowMs = now.getTime();
    let enqueued = 0;
    for (const schedule of this.schedules) {
      if (!schedule.enabled) continue;
      const state = this.state.schedules[schedule.schedule_key];
      let dueMs = new Date(state.next_due_at).getTime();
      if (dueMs > nowMs) continue;

      const dueAt = new Date(dueMs).toISOString();
      const receipt = this.ingest({
        event_id: 'schedule:' + schedule.schedule_key + ':' + dueAt,
        source: 'systemia-resident-scheduler',
        type: 'schedule.' + schedule.schedule_key,
        occurred_at: dueAt,
        payload: { schedule_key: schedule.schedule_key, due_at: dueAt },
      });
      if (receipt.admitted) enqueued += 1;

      state.last_fired_at = dueAt;
      state.fire_count = Number(state.fire_count || 0) + 1;
      while (dueMs <= nowMs) dueMs += schedule.every_ms;
      state.next_due_at = new Date(dueMs).toISOString();
    }
    this.#persist();
    return enqueued;
  }

  #routeFor(event) {
    const schedulePrefix = 'schedule.';
    if (event.type.startsWith(schedulePrefix)) {
      const key = event.type.slice(schedulePrefix.length);
      const schedule = this.schedules.find((row) => row.schedule_key === key);
      if (schedule) return {
        route_key: 'schedule:' + key,
        mission: schedule.mission,
        mission_builder: schedule.mission_builder,
      };
    }
    const trigger = this.triggers.find((row) => row.event_type === event.type)
      || this.triggers.find((row) => row.event_type === '*');
    if (!trigger) return null;
    return {
      route_key: 'trigger:' + trigger.trigger_key,
      mission: trigger.mission,
      mission_builder: trigger.mission_builder,
    };
  }

  tick() {
    const scheduled = this.#enqueueDueSchedules();
    const pending = this.state.queue.filter((row) => row.status === 'pending');
    const wakes = [];

    for (const event of pending) {
      const route = this.#routeFor(event);
      if (!route) {
        event.status = 'unrouted';
        event.processed_at = iso(this.now());
        this.state.seen_event_ids.push(event.event_id);
        wakes.push({
          event_id: event.event_id,
          event_type: event.type,
          state: 'unrouted',
          authority_granted: false,
        });
        continue;
      }

      const request = route.mission_builder
        ? route.mission_builder(clone(event))
        : clone(route.mission);
      if (!request || typeof request !== 'object') {
        throw new Error('resident_route_mission_invalid:' + route.route_key);
      }

      const plan = admitMission({
        request,
        rootDir: this.rootDir,
        now: this.now(),
      });

      const wake = {
        event_id: event.event_id,
        event_type: event.type,
        route_key: route.route_key,
        state: plan.receipt?.admitted === false ? 'held' : 'admitted',
        mission_key: plan.receipt?.mission_key || plan.mission_key || null,
        admitted: plan.receipt?.admitted !== false,
        human_holds: Array.isArray(plan.receipt?.human_holds) ? plan.receipt.human_holds : [],
        dispatch: (plan.dispatch || []).map((row) => ({
          work_key: row.work_key,
          specialist_component: row.specialist_component,
          execution_component: row.execution_component,
          hold: row.hold,
          human_gate_required: row.human_gate_required,
          execution_gate_required: row.execution_gate_required,
          execution_authority_granted: row.execution_authority_granted,
        })),
        authority_granted: false,
        processed_at: iso(this.now()),
      };

      event.status = 'processed';
      event.processed_at = wake.processed_at;
      this.state.seen_event_ids.push(event.event_id);
      this.state.wakes.push(wake);
      wakes.push(wake);
    }

    this.#persist();
    return {
      schema: RECEIPT_SCHEMA,
      action: 'tick',
      observed_at: iso(this.now()),
      scheduled_events_enqueued: scheduled,
      events_considered: pending.length,
      wakes,
      queue: {
        pending: this.state.queue.filter((row) => row.status === 'pending').length,
        processed: this.state.queue.filter((row) => row.status === 'processed').length,
        unrouted: this.state.queue.filter((row) => row.status === 'unrouted').length,
      },
      authority_boundary:
        'Resident wakeups may observe, deduplicate, schedule, and submit missions to Systemia admission. They do not grant execution authority or bypass existing human, relationship, metering, trust, or execution gates.',
    };
  }

  snapshot() {
    return clone(this.state);
  }
}

export function createResidentControlPlane(options) {
  return new ResidentControlPlane(options);
}
