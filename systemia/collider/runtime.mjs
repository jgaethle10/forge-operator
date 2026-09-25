import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import {
  admitColliderCycle,
  completeColliderCycle,
  createKaidanceState,
  createMachineWakeLease,
  cycleDue,
  kaidanceHealth,
} from './kernel.mjs';

function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o750 });
  const tmp = `${file}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, file);
}

function appendJsonl(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o750 });
  fs.appendFileSync(file, JSON.stringify(value) + '\n', { mode: 0o600 });
}

export function readMissionSnapshot(snapshotPath) {
  if (!fs.existsSync(snapshotPath)) {
    const error = new Error('mission_snapshot_missing');
    error.code = 'mission_snapshot_missing';
    throw error;
  }
  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  if (snapshot.schema !== 'evercraft.kaidance.mission-snapshot.v1') {
    const error = new Error('mission_snapshot_schema_invalid');
    error.code = 'mission_snapshot_schema_invalid';
    throw error;
  }
  const counts = snapshot.counts || {};
  const scanned = Math.max(0, Number(counts.scanned || 0));
  const changed = Math.max(0, Number(counts.changed || 0));
  const admitted = Math.max(0, Number(counts.admitted || 0));
  const held = Math.max(0, Number(counts.held || 0));
  if (changed > scanned) throw new Error('mission_snapshot_changed_exceeds_scanned');
  if (admitted + held > changed) throw new Error('mission_snapshot_disposition_exceeds_changed');

  return {
    scanned,
    changed,
    admitted,
    held,
    evidenceRefs: Array.isArray(snapshot.evidence_refs)
      ? snapshot.evidence_refs.map(String).slice(0, 200)
      : [],
    snapshotRef: String(snapshot.snapshot_ref || ''),
    observedAt: String(snapshot.observed_at || ''),
  };
}

export class KaidanceRuntime {
  constructor({
    root,
    colliderKey = 'systemia-collider',
    heartbeatTargetSeconds = 300,
    graceSeconds = 90,
    deploymentReceipt = '',
    snapshotPath,
    clock = () => new Date(),
  } = {}) {
    if (!root) throw new Error('root is required');
    this.root = path.resolve(root);
    this.stateFile = path.join(this.root, 'state.json');
    this.receiptFile = path.join(this.root, 'receipts.jsonl');
    this.snapshotPath = path.resolve(snapshotPath || path.join(this.root, 'mission-snapshot.json'));
    this.clock = clock;
    this.deploymentReceipt = String(deploymentReceipt || '');
    this.timer = null;
    this.running = false;
    this.inFlight = false;
    this.lastError = null;
    this.lastAttemptAt = null;

    fs.mkdirSync(this.root, { recursive: true, mode: 0o750 });

    if (fs.existsSync(this.stateFile)) {
      this.state = JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
      if (this.state.schema !== 'evercraft.kaidance.state.v1') {
        throw new Error('persisted_kaidance_state_invalid');
      }
    } else {
      this.state = createKaidanceState({
        colliderKey,
        heartbeatTargetSeconds,
        graceSeconds,
        now: this.clock(),
      });
      atomicJson(this.stateFile, this.state);
    }
  }

  health(now = this.clock()) {
    const core = kaidanceHealth(this.state, now);
    return {
      ...core,
      runtime_schema: 'evercraft.kaidance.runtime-health.v1',
      resident: this.running,
      in_flight: this.inFlight,
      last_attempt_at: this.lastAttemptAt,
      last_error: this.lastError,
      snapshot_ready: fs.existsSync(this.snapshotPath),
    };
  }

  async runOnce(now = this.clock()) {
    if (this.inFlight) return { ok: false, hold: 'cycle_already_in_flight' };
    this.lastAttemptAt = now.toISOString();

    if (!cycleDue(this.state, now)) {
      return { ok: false, hold: 'heartbeat_not_due', health: this.health(now) };
    }

    this.inFlight = true;
    try {
      const scan = readMissionSnapshot(this.snapshotPath);
      const wakeLease = createMachineWakeLease({
        leaseKey: `wake:${this.state.collider_key}:${now.getTime()}`,
        acquiredAt: now,
        ttlSeconds: 120,
        authorityRef: 'systemia:internal-collider-cycle',
      });
      const admission = admitColliderCycle({
        state: this.state,
        wakeLease,
        candidateCount: scan.scanned,
        now,
      });
      if (!admission.ok) {
        return { ok: false, hold: admission.hold, health: this.health(now) };
      }

      this.state = admission.state;
      atomicJson(this.stateFile, this.state);

      const completed = completeColliderCycle({
        state: this.state,
        admission: admission.admission,
        scanned: scan.scanned,
        changed: scan.changed,
        admitted: scan.admitted,
        held: scan.held,
        evidenceRefs: [
          ...scan.evidenceRefs,
          ...(scan.snapshotRef ? [`snapshot:${scan.snapshotRef}`] : []),
        ],
        deploymentReceipt: this.deploymentReceipt,
        now,
      });

      this.state = completed.state;
      this.lastError = null;
      atomicJson(this.stateFile, this.state);
      appendJsonl(this.receiptFile, completed.cycle);
      appendJsonl(this.receiptFile, completed.coverageReceipt);

      return {
        ok: true,
        cycle: completed.cycle,
        coverageReceipt: completed.coverageReceipt,
        health: this.health(now),
      };
    } catch (error) {
      this.lastError = {
        code: String(error?.code || 'cycle_failed'),
        message: String(error?.message || error),
        at: now.toISOString(),
      };
      appendJsonl(this.receiptFile, {
        schema: 'evercraft.kaidance-cycle-hold.v1',
        collider_key: this.state.collider_key,
        at: now.toISOString(),
        reason: this.lastError.code,
      });
      return {
        ok: false,
        hold: this.lastError.code,
        health: this.health(now),
      };
    } finally {
      this.inFlight = false;
    }
  }

  nextDelayMs(now = this.clock()) {
    if (!this.state.last_completed_cycle_at) return 0;
    const last = Date.parse(this.state.last_completed_cycle_at);
    if (!Number.isFinite(last)) return 0;
    const dueAt = last + this.state.heartbeat_target_seconds * 1000;
    return Math.max(0, dueAt - now.getTime());
  }

  #schedule() {
    if (!this.running) return;
    clearTimeout(this.timer);
    const delay = Math.max(25, this.nextDelayMs());
    this.timer = setTimeout(async () => {
      await this.runOnce(this.clock());
      this.#schedule();
    }, delay);
    this.timer.unref?.();
  }

  async start({ immediate = true } = {}) {
    if (this.running) return this.health();
    this.running = true;
    if (immediate) await this.runOnce(this.clock());
    this.#schedule();
    return this.health();
  }

  stop() {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    return this.health();
  }
}

export async function startKaidanceHealthService({
  runtime,
  host = '127.0.0.1',
  port = 0,
} = {}) {
  if (!runtime) throw new Error('runtime is required');

  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      const body = Buffer.from(JSON.stringify(runtime.health()));
      res.writeHead(200, {
        'content-type': 'application/json',
        'content-length': body.length,
        'cache-control': 'no-store',
      });
      res.end(body);
      return;
    }
    res.writeHead(404).end();
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  const address = server.address();
  const actualPort = typeof address === 'object' && address ? address.port : port;

  await runtime.start({ immediate: true });

  return {
    schema: 'evercraft.kaidance.resident-service.v1',
    url: `http://${host}:${actualPort}`,
    health_url: `http://${host}:${actualPort}/health`,
    close: async () => {
      runtime.stop();
      await new Promise((resolve, reject) =>
        server.close((error) => error ? reject(error) : resolve())
      );
    },
  };
}
