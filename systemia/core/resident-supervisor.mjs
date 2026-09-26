import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';

const sha = (value) => createHash('sha256').update(
  typeof value === 'string' ? value : JSON.stringify(value)
).digest('hex');

function inside(root, target) {
  const rel = path.relative(root, target);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o750 });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, file);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function limitText(value, max = 8192) {
  const text = String(value || '');
  return text.length > max ? text.slice(-max) : text;
}

function resolveArgs(service, env) {
  const args = Array.isArray(service.static_args)
    ? service.static_args.map(String)
    : [];

  for (const [flag, envName] of Object.entries(service.env_args || {})) {
    const value = String(env[envName] || '').trim();
    if (!value) {
      const error = new Error(`required environment binding missing: ${envName}`);
      error.code = 'required_environment_binding_missing';
      throw error;
    }
    args.push(flag, value);
  }

  for (const [flag, envName] of Object.entries(service.optional_env_args || {})) {
    const value = String(env[envName] || '').trim();
    if (value) args.push(flag, value);
  }

  return args;
}

function normalizeService({ service, manifest, repoRoot }) {
  const mode = String(service.mode || '');
  if (!['cycle', 'resident'].includes(mode)) {
    throw new Error(`invalid resident service mode for ${service.service_key}`);
  }
  const serviceKey = String(service.service_key || '').trim();
  if (!/^[a-zA-Z0-9._-]{1,128}$/.test(serviceKey)) {
    throw new Error('invalid resident service key');
  }

  const executable = path.resolve(repoRoot, String(service.executable || ''));
  if (!inside(repoRoot, executable) || !fs.existsSync(executable)) {
    throw new Error(`resident service executable unavailable: ${serviceKey}`);
  }

  const cadenceSeconds = Math.max(
    1,
    Number(service.cadence_seconds || manifest.cadence_seconds || 300)
  );

  return {
    ...service,
    service_key: serviceKey,
    mode,
    executable,
    cadence_seconds: cadenceSeconds,
    manifest_workflow_key: manifest.workflow_key || null,
  };
}

export class SystemiaCoreResidentSupervisor {
  constructor({
    repoRoot,
    configPath,
    stateDir,
    env = process.env,
    clock = () => new Date(),
    spawnImpl = spawn,
  } = {}) {
    if (!repoRoot) throw new Error('repoRoot is required');
    if (!configPath) throw new Error('configPath is required');
    if (!stateDir) throw new Error('stateDir is required');

    this.repoRoot = path.resolve(repoRoot);
    this.configPath = path.resolve(configPath);
    this.stateDir = path.resolve(stateDir);
    this.env = env;
    this.clock = clock;
    this.spawnImpl = spawnImpl;
    this.running = false;
    this.services = new Map();
    this.timers = new Map();
    this.children = new Map();
    this.cycleChildren = new Map();
    this.restartHistory = new Map();
    this.receiptFile = path.join(this.stateDir, 'receipts.jsonl');
    this.healthFile = path.join(this.stateDir, 'health.json');
    this.deploymentReceiptFile = path.join(this.stateDir, 'deployment-receipt.json');
    this.deploymentReceipt = fs.existsSync(this.deploymentReceiptFile)
      ? readJson(this.deploymentReceiptFile)?.receipt_ref || null
      : null;

    if (!inside(this.repoRoot, this.configPath)) {
      throw new Error('resident_supervisor_config_outside_repo');
    }
    fs.mkdirSync(this.stateDir, { recursive: true, mode: 0o750 });

    const config = readJson(this.configPath);
    if (config.schema !== 'evercraft.systemia.resident-supervisor-config.v1') {
      throw new Error('resident_supervisor_config_invalid');
    }

    for (const service of config.services || []) {
      const manifestPath = path.resolve(this.repoRoot, String(service.manifest || ''));
      if (!inside(this.repoRoot, manifestPath) || !fs.existsSync(manifestPath)) {
        throw new Error(`resident service manifest unavailable: ${service.service_key}`);
      }
      const manifest = readJson(manifestPath);
      if (manifest.schema !== 'evercraft.systemia.workflow-manifest.v1') {
        throw new Error(`workflow manifest invalid: ${service.service_key}`);
      }
      const normalized = normalizeService({
        service,
        manifest,
        repoRoot: this.repoRoot,
      });
      this.services.set(normalized.service_key, {
        config: normalized,
        manifest,
        state: {
          service_key: normalized.service_key,
          mode: normalized.mode,
          status: 'stopped',
          last_started_at: null,
          last_completed_at: null,
          last_exit_code: null,
          last_receipt_hash: null,
          run_count: 0,
          restart_count: 0,
          hold_reason: null,
        },
      });
    }

    if (this.services.size === 0) throw new Error('resident supervisor has no services');
    this.#persistHealth();
  }

  #receipt(type, data = {}) {
    const body = {
      schema: 'evercraft.systemia.resident-supervisor-receipt.v1',
      type,
      at: this.clock().toISOString(),
      ...data,
    };
    const receipt = { ...body, receipt_hash: `sha256:${sha(body)}` };
    fs.appendFileSync(this.receiptFile, JSON.stringify(receipt) + '\n', { mode: 0o600 });
    return receipt;
  }

  #persistHealth() {
    atomicJson(this.healthFile, this.health());
  }

  health() {
    const rows = [...this.services.values()].map(({ state }) => ({ ...state }));
    return {
      schema: 'evercraft.systemia.resident-supervisor-health.v1',
      running: this.running,
      observed_at: this.clock().toISOString(),
      service_count: rows.length,
      healthy_count: rows.filter((x) => ['running', 'healthy', 'idle'].includes(x.status)).length,
      disabled_count: rows.filter((x) => x.status === 'disabled').length,
      held_count: rows.filter((x) => x.status === 'held').length,
      failed_count: rows.filter((x) => x.status === 'failed').length,
      deployment_receipt: this.deploymentReceipt,
      services: rows,
    };
  }

  setDeploymentReceipt(receiptRef) {
    const value = String(receiptRef || '').trim();
    if (!value) throw new Error('deployment receipt is required');
    this.deploymentReceipt = value;
    atomicJson(this.deploymentReceiptFile, {
      schema: 'evercraft.systemia.core-deployment-binding.v1',
      receipt_ref: value,
      bound_at: this.clock().toISOString(),
    });
    const receipt = this.#receipt('deployment.receipt.bound', {
      deployment_receipt: value,
    });
    this.#persistHealth();
    return { ...this.health(), binding_receipt_hash: receipt.receipt_hash };
  }

  async #runCycle(entry) {
    const { config, state } = entry;
    if (state.status === 'running') {
      const receipt = this.#receipt('cycle.held', {
        service_key: config.service_key,
        reason: 'previous_cycle_still_running',
      });
      state.status = 'held';
      state.hold_reason = 'previous_cycle_still_running';
      state.last_receipt_hash = receipt.receipt_hash;
      this.#persistHealth();
      return;
    }

    let args;
    try {
      args = resolveArgs(config, this.env);
    } catch (error) {
      if (
        config.optional_when_unconfigured === true &&
        error.code === 'required_environment_binding_missing'
      ) {
        const receipt = this.#receipt('cycle.disabled', {
          service_key: config.service_key,
          reason: 'optional_environment_not_configured',
        });
        state.status = 'disabled';
        state.hold_reason = 'optional_environment_not_configured';
        state.last_receipt_hash = receipt.receipt_hash;
        this.#persistHealth();
        return;
      }
      const receipt = this.#receipt('cycle.held', {
        service_key: config.service_key,
        reason: error.code || 'argument_resolution_failed',
      });
      state.status = 'held';
      state.hold_reason = error.code || 'argument_resolution_failed';
      state.last_receipt_hash = receipt.receipt_hash;
      this.#persistHealth();
      return;
    }

    state.status = 'running';
    state.hold_reason = null;
    state.last_started_at = this.clock().toISOString();
    state.run_count += 1;
    this.#persistHealth();

    const started = this.#receipt('cycle.started', {
      service_key: config.service_key,
      run_count: state.run_count,
    });
    state.last_receipt_hash = started.receipt_hash;

    await new Promise((resolve) => {
      const child = this.spawnImpl(process.execPath, [config.executable, ...args], {
        cwd: this.repoRoot,
        env: this.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      this.cycleChildren.set(config.service_key, child);
      let stdout = '';
      let stderr = '';
      child.stdout?.on('data', (chunk) => { stdout = limitText(stdout + chunk); });
      child.stderr?.on('data', (chunk) => { stderr = limitText(stderr + chunk); });
      child.once('error', (error) => {
        stderr = limitText(`${stderr}\n${error.message}`);
      });
      child.once('close', (code) => {
        this.cycleChildren.delete(config.service_key);
        state.last_completed_at = this.clock().toISOString();
        state.last_exit_code = Number(code ?? -1);
        state.status = code === 0 ? 'idle' : 'failed';
        state.hold_reason = null;
        const receipt = this.#receipt('cycle.completed', {
          service_key: config.service_key,
          exit_code: state.last_exit_code,
          stdout_hash: `sha256:${sha(stdout)}`,
          stderr_hash: `sha256:${sha(stderr)}`,
        });
        state.last_receipt_hash = receipt.receipt_hash;
        this.#persistHealth();
        resolve();
      });
    });
  }

  #scheduleCycle(entry, { immediate = true } = {}) {
    const { config } = entry;
    const intervalMs = config.cadence_seconds * 1000;
    if (immediate) this.#runCycle(entry).catch(() => {});
    const timer = setInterval(() => {
      this.#runCycle(entry).catch(() => {});
    }, intervalMs);
    this.timers.set(config.service_key, timer);
  }

  #pruneRestarts(serviceKey, nowMs) {
    const history = (this.restartHistory.get(serviceKey) || [])
      .filter((time) => nowMs - time < 60 * 60 * 1000);
    this.restartHistory.set(serviceKey, history);
    return history;
  }

  async #startResident(entry) {
    const { config, state } = entry;
    if (!this.running) return;
    if (this.children.has(config.service_key)) return;

    let args;
    try {
      args = resolveArgs(config, this.env);
    } catch (error) {
      if (
        config.optional_when_unconfigured === true &&
        error.code === 'required_environment_binding_missing'
      ) {
        const receipt = this.#receipt('resident.disabled', {
          service_key: config.service_key,
          reason: 'optional_environment_not_configured',
        });
        state.status = 'disabled';
        state.hold_reason = 'optional_environment_not_configured';
        state.last_receipt_hash = receipt.receipt_hash;
        this.#persistHealth();
        return;
      }
      const receipt = this.#receipt('resident.held', {
        service_key: config.service_key,
        reason: error.code || 'argument_resolution_failed',
      });
      state.status = 'held';
      state.hold_reason = error.code || 'argument_resolution_failed';
      state.last_receipt_hash = receipt.receipt_hash;
      this.#persistHealth();
      return;
    }

    const nowMs = this.clock().getTime();
    const history = this.#pruneRestarts(config.service_key, nowMs);
    const maxRestarts = Math.max(1, Number(config.max_restarts_per_hour || 12));
    if (history.length >= maxRestarts) {
      const receipt = this.#receipt('resident.held', {
        service_key: config.service_key,
        reason: 'restart_budget_exhausted',
      });
      state.status = 'held';
      state.hold_reason = 'restart_budget_exhausted';
      state.last_receipt_hash = receipt.receipt_hash;
      this.#persistHealth();
      return;
    }

    state.status = 'running';
    state.hold_reason = null;
    state.last_started_at = this.clock().toISOString();
    state.run_count += 1;
    this.#persistHealth();

    const started = this.#receipt('resident.started', {
      service_key: config.service_key,
      run_count: state.run_count,
    });
    state.last_receipt_hash = started.receipt_hash;

    const child = this.spawnImpl(process.execPath, [config.executable, ...args], {
      cwd: this.repoRoot,
      env: this.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.children.set(config.service_key, child);

    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => { stdout = limitText(stdout + chunk); });
    child.stderr?.on('data', (chunk) => { stderr = limitText(stderr + chunk); });

    child.once('error', (error) => {
      stderr = limitText(`${stderr}\n${error.message}`);
    });

    child.once('close', (code) => {
      this.children.delete(config.service_key);
      state.last_completed_at = this.clock().toISOString();
      state.last_exit_code = Number(code ?? -1);
      if (!this.running) {
        state.status = 'stopped';
        const stopped = this.#receipt('resident.stopped', {
          service_key: config.service_key,
          exit_code: state.last_exit_code,
        });
        state.last_receipt_hash = stopped.receipt_hash;
        this.#persistHealth();
        return;
      }

      const receipt = this.#receipt('resident.exited', {
        service_key: config.service_key,
        exit_code: state.last_exit_code,
        stdout_hash: `sha256:${sha(stdout)}`,
        stderr_hash: `sha256:${sha(stderr)}`,
      });
      state.last_receipt_hash = receipt.receipt_hash;
      state.status = 'failed';
      state.restart_count += 1;
      this.#pruneRestarts(config.service_key, this.clock().getTime()).push(this.clock().getTime());
      this.#persistHealth();

      const base = Math.max(1000, Number(config.restart_backoff_ms || 5000));
      const delay = Math.min(60_000, base * (2 ** Math.min(5, state.restart_count - 1)));
      const timer = setTimeout(() => {
        this.timers.delete(`restart:${config.service_key}`);
        this.#startResident(entry).catch(() => {});
      }, delay);
      this.timers.set(`restart:${config.service_key}`, timer);
    });
  }

  start({ immediateCycles = true } = {}) {
    if (this.running) return this.health();
    this.running = true;

    for (const entry of this.services.values()) {
      if (entry.config.mode === 'cycle') {
        this.#scheduleCycle(entry, { immediate: immediateCycles });
      } else {
        this.#startResident(entry).catch(() => {});
      }
    }

    const receipt = this.#receipt('supervisor.started', {
      service_count: this.services.size,
    });
    this.#persistHealth();
    return { ...this.health(), receipt_hash: receipt.receipt_hash };
  }

  async stop() {
    if (!this.running) return this.health();
    this.running = false;

    for (const timer of this.timers.values()) clearInterval(timer);
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();

    const waits = [];
    const terminate = (serviceKey, child) => {
      waits.push(new Promise((resolve) => {
        let settled = false;
        const done = () => {
          if (settled) return;
          settled = true;
          resolve();
        };
        child.once('close', done);
        try { child.kill('SIGTERM'); } catch { done(); }
        setTimeout(() => {
          if (settled) return;
          try { child.kill('SIGKILL'); } catch {}
          done();
        }, 3000).unref?.();
      }));
      const entry = this.services.get(serviceKey);
      if (entry) entry.state.status = 'stopping';
    };

    for (const [serviceKey, child] of this.children.entries()) {
      terminate(serviceKey, child);
    }
    for (const [serviceKey, child] of this.cycleChildren.entries()) {
      terminate(serviceKey, child);
    }

    await Promise.all(waits);
    this.children.clear();
    this.cycleChildren.clear();

    for (const entry of this.services.values()) {
      if (entry.state.status !== 'held') entry.state.status = 'stopped';
    }
    const receipt = this.#receipt('supervisor.stopped', {
      service_count: this.services.size,
    });
    this.#persistHealth();
    return { ...this.health(), receipt_hash: receipt.receipt_hash };
  }
}
