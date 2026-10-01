import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { promisify } from 'node:util';
import { observeNodeNetwork } from './network-observer.mjs';

const execFileAsync = promisify(execFile);
const sha = (value) => {
  const hash = createHash('sha256');
  if (Buffer.isBuffer(value)) hash.update(value);
  else hash.update(typeof value === 'string' ? value : JSON.stringify(value));
  return 'sha256:' + hash.digest('hex');
};

const DEFAULT_PROGRAMS = new Set([
  'git', 'npm', 'systemctl', 'journalctl'
]);

const GIT_SUBCOMMANDS = new Set([
  'status', 'fetch', 'pull', 'log', 'diff', 'rev-parse', 'branch'
]);

const NPM_SUBCOMMANDS = new Set([
  'install', 'test', 'run', 'start'
]);

const SYSTEMCTL_SUBCOMMANDS = new Set([
  'status', 'restart', 'start', 'stop', 'is-active', 'daemon-reload'
]);

const SENSITIVE_SEGMENTS = new Set([
  '.ssh', '.gnupg', '.aws', '.kube', '.secrets',
  'provider-credentials', 'passport', 'identity'
]);

function cleanRootKey(value) {
  const key = String(value || '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(key)) throw new Error('operator_root_key_invalid');
  return key;
}

function cleanRelative(value = '.') {
  const raw = String(value || '.').trim() || '.';
  if (path.isAbsolute(raw)) throw new Error('operator_absolute_path_denied');
  const normalized = path.normalize(raw);
  if (normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) {
    throw new Error('operator_parent_traversal_denied');
  }
  return normalized;
}

function sensitivePath(relative) {
  const segments = cleanRelative(relative).split(path.sep).filter(Boolean);
  return segments.some((segment) => SENSITIVE_SEGMENTS.has(segment)) ||
    segments.some((segment) =>
      segment === '.env' ||
      segment.startsWith('.env.') ||
      /^(?:id_rsa|id_ed25519|.*\.pem|.*\.key|\.netrc|\.npmrc)$/i.test(segment)
    );
}

function ensureInside(root, target) {
  const relative = path.relative(root, target);
  if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) return;
  throw new Error('operator_path_outside_root');
}

function atomicAppend(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.appendFileSync(file, JSON.stringify(value) + '\n', { mode: 0o600 });
  fs.chmodSync(file, 0o600);
}

function boundedInt(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function safeEnvironment(extra = {}) {
  const result = {};
  for (const key of ['PATH', 'HOME', 'USER', 'LOGNAME', 'LANG', 'LC_ALL', 'SHELL', 'TERM', 'TMPDIR']) {
    if (process.env[key]) result[key] = process.env[key];
  }
  result.HOME = os.homedir();
  for (const [key, value] of Object.entries(extra || {})) {
    if (/^(?:PATH|LANG|LC_[A-Z_]+|TERM)$/i.test(key) && typeof value === 'string') {
      result[key] = value;
    }
  }
  return result;
}

function safeProgram(program) {
  const value = String(program || '').trim();
  if (!value || path.isAbsolute(value) || value.includes('/') || value.includes('\\')) {
    throw new Error('operator_program_invalid');
  }
  if (!DEFAULT_PROGRAMS.has(value)) throw new Error('operator_program_not_allowed');
  return value;
}

function safeArgs(program, args = []) {
  if (!Array.isArray(args)) throw new Error('operator_args_invalid');
  const values = args.map((value) => String(value));
  if (values.length > 128) throw new Error('operator_args_too_many');
  if (values.some((value) => value.length > 4096)) throw new Error('operator_arg_too_large');
  if (values.some((value) => /[\r\n\0]/.test(value))) throw new Error('operator_arg_control_character_denied');

  if (program === 'git') {
    if (values.length === 1 && values[0] === '--version') return values;
    const subcommand = values[0] || '';
    if (!GIT_SUBCOMMANDS.has(subcommand)) throw new Error('operator_git_subcommand_denied');
    if (values.some((value) =>
      /^-c$|^--config-env(?:=|$)|^--git-dir(?:=|$)|^--work-tree(?:=|$)|^--exec-path(?:=|$)/.test(value)
    )) {
      throw new Error('operator_git_configuration_override_denied');
    }
  }

  if (program === 'npm') {
    const subcommand = values[0] || '';
    if (!NPM_SUBCOMMANDS.has(subcommand)) throw new Error('operator_npm_subcommand_denied');
    if (values.some((value) => /^(?:--prefix|--global|-g)(?:=|$)/.test(value))) {
      throw new Error('operator_npm_scope_override_denied');
    }
  }

  if (program === 'systemctl') {
    if (values[0] !== '--user') throw new Error('operator_systemctl_user_scope_required');
    const subcommand = values[1] || '';
    if (!SYSTEMCTL_SUBCOMMANDS.has(subcommand)) {
      throw new Error('operator_systemctl_subcommand_denied');
    }
    if (subcommand !== 'daemon-reload') {
      const units = values.slice(2).filter((value) => !value.startsWith('-'));
      if (!units.length || units.some((unit) => !/^evercraft-[a-zA-Z0-9_.@-]+(?:\.service)?$/.test(unit))) {
        throw new Error('operator_systemctl_unit_denied');
      }
    }
  }

  if (program === 'journalctl') {
    if (!values.includes('--user')) throw new Error('operator_journalctl_user_scope_required');
    const unitIndex = values.findIndex((value) => value === '-u' || value === '--unit');
    const unit = unitIndex >= 0 ? values[unitIndex + 1] : '';
    if (!/^evercraft-[a-zA-Z0-9_.@-]+(?:\.service)?$/.test(String(unit || ''))) {
      throw new Error('operator_journalctl_unit_denied');
    }
    if (values.some((value) => /^--file(?:=|$)|^--directory(?:=|$)|^--root(?:=|$)/.test(value))) {
      throw new Error('operator_journalctl_source_override_denied');
    }
  }

  return values;
}

export class EvercraftRemoteOperator {
  constructor({
    roots,
    stateDir,
    maxReadBytes = 1024 * 1024,
    maxWriteBytes = 1024 * 1024,
    maxOutputBytes = 1024 * 1024,
    maxExecMs = 60_000,
  } = {}) {
    if (!roots || typeof roots !== 'object' || Array.isArray(roots)) {
      throw new Error('operator_roots_required');
    }
    this.roots = new Map();
    for (const [rawKey, rawRoot] of Object.entries(roots)) {
      const key = cleanRootKey(rawKey);
      const resolved = fs.realpathSync(path.resolve(String(rawRoot || '')));
      if (!fs.statSync(resolved).isDirectory()) throw new Error('operator_root_not_directory');
      this.roots.set(key, resolved);
    }
    if (!this.roots.size) throw new Error('operator_roots_required');
    if (!stateDir) throw new Error('operator_state_dir_required');
    this.stateDir = path.resolve(stateDir);
    fs.mkdirSync(this.stateDir, { recursive: true, mode: 0o700 });
    fs.chmodSync(this.stateDir, 0o700);
    this.receiptFile = path.join(this.stateDir, 'operator-receipts.jsonl');
    this.maxReadBytes = boundedInt(maxReadBytes, 1024 * 1024, 1024, 8 * 1024 * 1024);
    this.maxWriteBytes = boundedInt(maxWriteBytes, 1024 * 1024, 1024, 8 * 1024 * 1024);
    this.maxOutputBytes = boundedInt(maxOutputBytes, 1024 * 1024, 4096, 4 * 1024 * 1024);
    this.maxExecMs = boundedInt(maxExecMs, 60_000, 1000, 300_000);
    this.instanceId = 'remote_operator_' + randomBytes(10).toString('hex');
  }

  status() {
    return {
      ok: true,
      schema: 'evercraft.remote-operator.status.v1',
      instance_id: this.instanceId,
      roots: [...this.roots.keys()],
      filesystem: {
        list: true,
        read: true,
        write: true,
        sensitive_path_read_block: true,
      },
      execution: {
        mode: 'bounded-program',
        interactive_tty: false,
        root_privilege: false,
        programs: [...DEFAULT_PROGRAMS].sort(),
        ambient_secret_environment_forwarded: false,
      },
      network_observation: {
        read_only: true,
        chromeos_host_boundary_explicit: true,
        external_route_requires_independent_canary: true,
      },
      receipt_semantics: 'hashes_and_metadata_only',
    };
  }

  async networkStatus() {
    const observation = await observeNodeNetwork();
    const receipt = this.#receipt('network.status', {
      observation_hash: observation.receipt_hash,
      interface_count: observation.interfaces.length,
      listener_count: observation.listeners.length,
      crostini_likely: observation.chromeos_boundary.likely_crostini,
      local_fabric_ok: observation.evercraft.probes.fabric_loopback.ok,
      local_tls_edge_ok: observation.evercraft.probes.hostname_aware_tls_loopback.ok,
      external_public_route_verified:
        observation.evercraft.external_public_route.verified,
    });
    return {
      ...observation,
      operator_receipt: receipt,
    };
  }

  #root(rootKey) {
    const key = cleanRootKey(rootKey || 'home');
    const root = this.roots.get(key);
    if (!root) throw new Error('operator_root_not_admitted');
    return { key, root };
  }

  #resolveExisting(rootKey, relativePath, { allowSensitive = false } = {}) {
    const { key, root } = this.#root(rootKey);
    const relative = cleanRelative(relativePath);
    if (!allowSensitive && sensitivePath(relative)) throw new Error('operator_sensitive_path_denied');
    const target = path.resolve(root, relative);
    ensureInside(root, target);
    const real = fs.realpathSync(target);
    ensureInside(root, real);
    return { key, root, relative, target: real };
  }

  #resolveWrite(rootKey, relativePath) {
    const { key, root } = this.#root(rootKey);
    const relative = cleanRelative(relativePath);
    if (sensitivePath(relative)) throw new Error('operator_sensitive_path_denied');
    const target = path.resolve(root, relative);
    ensureInside(root, target);
    let parentCandidate = path.dirname(target);
    while (!fs.existsSync(parentCandidate)) {
      const next = path.dirname(parentCandidate);
      if (next === parentCandidate) throw new Error('operator_write_parent_invalid');
      parentCandidate = next;
    }
    const parent = fs.realpathSync(parentCandidate);
    ensureInside(root, parent);
    if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink()) {
      throw new Error('operator_symlink_write_denied');
    }
    return { key, root, relative, target };
  }

  #receipt(operation, detail = {}) {
    const body = {
      schema: 'evercraft.remote-operator.receipt.v1',
      receipt_id: 'op_' + randomBytes(8).toString('hex'),
      operation,
      at: new Date().toISOString(),
      ...detail,
    };
    const receipt = { ...body, receipt_hash: sha(body) };
    atomicAppend(this.receiptFile, receipt);
    return receipt;
  }

  list({ root_key = 'home', path: relativePath = '.', limit = 250 } = {}) {
    const resolved = this.#resolveExisting(root_key, relativePath);
    const stat = fs.statSync(resolved.target);
    if (!stat.isDirectory()) throw new Error('operator_path_not_directory');
    const max = boundedInt(limit, 250, 1, 1000);
    const entries = fs.readdirSync(resolved.target, { withFileTypes: true })
      .slice(0, max)
      .map((entry) => {
        const child = path.join(resolved.target, entry.name);
        let size = null;
        try { size = entry.isFile() ? fs.statSync(child).size : null; } catch {}
        return {
          name: entry.name,
          type: entry.isDirectory() ? 'directory' : entry.isFile() ? 'file' : entry.isSymbolicLink() ? 'symlink' : 'other',
          size_bytes: size,
        };
      });
    const receipt = this.#receipt('fs.list', {
      root_key: resolved.key,
      path_sha256: sha(resolved.relative),
      entry_count: entries.length,
    });
    return { ok: true, root_key: resolved.key, path: resolved.relative, entries, receipt };
  }

  read({ root_key = 'home', path: relativePath, encoding = 'utf8', max_bytes } = {}) {
    const resolved = this.#resolveExisting(root_key, relativePath);
    const stat = fs.statSync(resolved.target);
    if (!stat.isFile()) throw new Error('operator_path_not_file');
    const limit = boundedInt(max_bytes, this.maxReadBytes, 1, this.maxReadBytes);
    if (stat.size > limit) throw new Error('operator_file_too_large');
    const buffer = fs.readFileSync(resolved.target);
    const normalizedEncoding = encoding === 'base64' ? 'base64' : 'utf8';
    const content = buffer.toString(normalizedEncoding);
    const receipt = this.#receipt('fs.read', {
      root_key: resolved.key,
      path_sha256: sha(resolved.relative),
      bytes: buffer.length,
      content_sha256: sha(buffer),
    });
    return {
      ok: true,
      root_key: resolved.key,
      path: resolved.relative,
      encoding: normalizedEncoding,
      content,
      bytes: buffer.length,
      sha256: sha(buffer),
      receipt,
    };
  }

  write({
    root_key = 'home',
    path: relativePath,
    content,
    encoding = 'utf8',
    overwrite = false,
    approval_ref,
  } = {}) {
    const approval = String(approval_ref || '').trim();
    if (!approval || approval.length > 512) throw new Error('operator_write_approval_required');
    const resolved = this.#resolveWrite(root_key, relativePath);
    if (fs.existsSync(resolved.target) && !overwrite) throw new Error('operator_target_exists');
    const normalizedEncoding = encoding === 'base64' ? 'base64' : 'utf8';
    const buffer = Buffer.from(String(content ?? ''), normalizedEncoding);
    if (buffer.length > this.maxWriteBytes) throw new Error('operator_write_too_large');
    fs.mkdirSync(path.dirname(resolved.target), { recursive: true, mode: 0o750 });
    const tmp = resolved.target + '.evercraft-' + randomBytes(5).toString('hex') + '.tmp';
    fs.writeFileSync(tmp, buffer, { mode: 0o600 });
    fs.renameSync(tmp, resolved.target);
    const receipt = this.#receipt('fs.write', {
      root_key: resolved.key,
      path_sha256: sha(resolved.relative),
      bytes: buffer.length,
      content_sha256: sha(buffer),
      approval_ref: approval,
      overwrite: Boolean(overwrite),
    });
    return {
      ok: true,
      root_key: resolved.key,
      path: resolved.relative,
      bytes: buffer.length,
      sha256: sha(buffer),
      receipt,
    };
  }

  async exec({
    root_key = 'home',
    cwd = '.',
    program,
    args = [],
    timeout_ms,
    approval_ref,
    env = {},
  } = {}) {
    const approval = String(approval_ref || '').trim();
    if (!approval || approval.length > 512) throw new Error('operator_exec_approval_required');
    const resolved = this.#resolveExisting(root_key, cwd);
    if (!fs.statSync(resolved.target).isDirectory()) throw new Error('operator_cwd_not_directory');
    const executable = safeProgram(program);
    const argv = safeArgs(executable, args);
    const timeout = boundedInt(timeout_ms, this.maxExecMs, 1000, this.maxExecMs);
    const started = Date.now();
    let stdout = '';
    let stderr = '';
    let exitCode = 0;
    let signal = null;
    try {
      const result = await execFileAsync(executable, argv, {
        cwd: resolved.target,
        env: safeEnvironment(env),
        timeout,
        maxBuffer: this.maxOutputBytes,
        windowsHide: true,
      });
      stdout = String(result.stdout || '');
      stderr = String(result.stderr || '');
    } catch (error) {
      stdout = String(error?.stdout || '');
      stderr = String(error?.stderr || '');
      exitCode = Number.isInteger(error?.code) ? error.code : 1;
      signal = error?.signal || null;
      if (error?.killed) stderr += (stderr ? '\n' : '') + 'evercraft_remote_operator_timeout';
    }
    const receipt = this.#receipt('exec', {
      root_key: resolved.key,
      cwd_sha256: sha(resolved.relative),
      program: executable,
      args_sha256: sha(argv),
      approval_ref: approval,
      exit_code: exitCode,
      signal,
      duration_ms: Date.now() - started,
      stdout_sha256: sha(stdout),
      stderr_sha256: sha(stderr),
    });
    return {
      ok: exitCode === 0,
      root_key: resolved.key,
      cwd: resolved.relative,
      program: executable,
      exit_code: exitCode,
      signal,
      stdout,
      stderr,
      duration_ms: Date.now() - started,
      receipt,
    };
  }
}
