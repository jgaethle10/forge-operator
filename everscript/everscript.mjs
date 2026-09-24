import {
  createHash,
  randomUUID,
  sign as cryptoSign,
  verify as cryptoVerify,
} from 'node:crypto';

export class EverScriptCompileError extends Error {
  constructor(message) {
    super(message);
    this.name = 'EverScriptCompileError';
  }
}

export class EverScriptExecutionError extends Error {
  constructor(message, receipt) {
    super(message);
    this.name = 'EverScriptExecutionError';
    this.receipt = receipt;
  }
}

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function stripComments(source) {
  return source
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+\/\/.*$/, '').trim())
    .filter(Boolean);
}

function parseLiteral(raw) {
  const value = raw.trim();
  if (!value) throw new EverScriptCompileError('Empty expression');
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return { kind: 'literal', value: value.slice(1, -1) };
  }
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return { kind: 'literal', value: Number(value) };
  if (value === 'true' || value === 'false') return { kind: 'literal', value: value === 'true' };
  if (value === 'null') return { kind: 'literal', value: null };
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) return { kind: 'variable', name: value };
  throw new EverScriptCompileError(`Unsupported expression: ${value}`);
}

function splitArgs(raw) {
  const out = [];
  let current = '';
  let quote = null;
  let escaped = false;
  for (const ch of raw) {
    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      current += ch;
      escaped = true;
      continue;
    }
    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === ',') {
      out.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (quote) throw new EverScriptCompileError('Unterminated string literal');
  if (current.trim()) out.push(current.trim());
  return out.filter(Boolean);
}

function parseMoney(raw) {
  const match = raw.match(/^\$?(\d+(?:\.\d{1,2})?)(?:\s+([A-Z]{3}))?$/);
  if (!match) throw new EverScriptCompileError(`Invalid budget: ${raw}`);
  return { cents: Math.round(Number(match[1]) * 100), currency: match[2] ?? 'USD' };
}

export function parse(source) {
  const lines = stripComments(source);
  const header = lines.shift();
  const headerMatch = header?.match(/^mission\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*\{$/);
  if (!headerMatch) throw new EverScriptCompileError('Expected: mission Name(param1, param2) {');

  const plan = {
    language: 'everscript',
    version: '0.3',
    sourceHash: sha256(source),
    mission: headerMatch[1],
    params: headerMatch[2].split(',').map((x) => x.trim()).filter(Boolean),
    capabilities: [],
    budgetCents: null,
    currency: 'USD',
    approvalRules: [],
    receiptPolicy: 'calls',
    timeoutMs: 60_000,
    replayPolicy: 'prefer-live',
    steps: [],
    returnExpr: null,
  };

  let closed = false;
  for (const line of lines) {
    if (line === '}') {
      closed = true;
      break;
    }

    let m = line.match(/^use\s+([A-Za-z_][A-Za-z0-9_.-]*)(?:@([^\s]+))?$/);
    if (m) {
      plan.capabilities.push({ name: m[1], version: m[2] ?? '*' });
      continue;
    }

    m = line.match(/^budget\s+(.+)$/);
    if (m) {
      const money = parseMoney(m[1]);
      plan.budgetCents = money.cents;
      plan.currency = money.currency;
      continue;
    }

    m = line.match(/^require\s+approval\s+before\s+([A-Za-z_][A-Za-z0-9_.-]*)$/);
    if (m) {
      plan.approvalRules.push(m[1]);
      continue;
    }

    m = line.match(/^receipt\s+(everything|calls|none)$/);
    if (m) {
      plan.receiptPolicy = m[1];
      continue;
    }

    m = line.match(/^timeout\s+(\d+)(ms|s|m)$/);
    if (m) {
      const n = Number(m[1]);
      plan.timeoutMs = m[2] === 'ms' ? n : m[2] === 's' ? n * 1000 : n * 60_000;
      continue;
    }

    m = line.match(/^replay\s+(prefer-live|prefer-replay|require-replay)$/);
    if (m) {
      plan.replayPolicy = m[1];
      continue;
    }

    m = line.match(/^call\s+([A-Za-z_][A-Za-z0-9_.-]*)\.([A-Za-z_][A-Za-z0-9_-]*)\((.*)\)\s*->\s*([A-Za-z_][A-Za-z0-9_]*)$/);
    if (m) {
      plan.steps.push({
        kind: 'call',
        capability: m[1],
        action: m[2],
        args: m[3].trim() ? splitArgs(m[3]).map(parseLiteral) : [],
        assignTo: m[4],
      });
      continue;
    }

    m = line.match(/^return\s+(.+)$/);
    if (m) {
      plan.returnExpr = parseLiteral(m[1]);
      continue;
    }

    throw new EverScriptCompileError(`Unknown statement: ${line}`);
  }

  if (!closed) throw new EverScriptCompileError('Mission is missing closing brace');
  if (!plan.returnExpr) throw new EverScriptCompileError('Mission must return a value');
  return plan;
}

function versionMatches(requested, actual) {
  if (!requested || requested === '*') return true;
  if (requested.startsWith('^')) {
    const reqMajor = requested.slice(1).split('.')[0];
    const actualMajor = actual.split('.')[0];
    return reqMajor === actualMajor;
  }
  return requested === actual;
}

function unsignedManifest(manifest) {
  const { signature, ...body } = manifest;
  return body;
}

export function signCapabilityManifest(manifest, privateKey, { keyId = 'default' } = {}) {
  const body = unsignedManifest(manifest);
  const payload = Buffer.from(canonicalize(body));
  const signature = cryptoSign(null, payload, privateKey).toString('base64url');
  return {
    ...body,
    signature: { algorithm: 'Ed25519', keyId, value: signature },
  };
}

export function verifyCapabilityManifest(manifest, publicKey) {
  if (!manifest?.signature || manifest.signature.algorithm !== 'Ed25519') return false;
  const payload = Buffer.from(canonicalize(unsignedManifest(manifest)));
  try {
    return cryptoVerify(null, payload, publicKey, Buffer.from(manifest.signature.value, 'base64url'));
  } catch {
    return false;
  }
}

function validateManifest(step, declaration, manifest, { requireSignedManifests = false, trustedManifestKeys = {} } = {}) {
  if (!manifest) return;
  if (manifest.name !== step.capability) {
    throw new EverScriptCompileError(`Manifest name mismatch for ${step.capability}`);
  }
  if (!versionMatches(declaration.version, manifest.version)) {
    throw new EverScriptCompileError(
      `Capability ${step.capability} requested ${declaration.version} but manifest is ${manifest.version}`,
    );
  }
  if (requireSignedManifests) {
    const keyId = manifest.signature?.keyId;
    const publicKey = keyId ? trustedManifestKeys[keyId] : null;
    if (!publicKey || !verifyCapabilityManifest(manifest, publicKey)) {
      throw new EverScriptCompileError(`Capability ${step.capability} does not have a trusted manifest signature`);
    }
  }
  const action = manifest.actions?.[step.action];
  if (!action) throw new EverScriptCompileError(`Capability ${step.capability} has no action '${step.action}'`);
  if (Number.isInteger(action.arity) && action.arity !== step.args.length) {
    throw new EverScriptCompileError(
      `${step.capability}.${step.action} expects ${action.arity} args, got ${step.args.length}`,
    );
  }
}

export function compile(source, {
  manifests = [],
  requireSignedManifests = false,
  trustedManifestKeys = {},
} = {}) {
  const plan = parse(source);
  if (plan.currency !== 'USD') throw new EverScriptCompileError('v0.3 supports USD budgets only');
  if (plan.budgetCents !== null && plan.budgetCents <= 0) throw new EverScriptCompileError('Budget must be greater than zero');
  if (plan.timeoutMs <= 0 || plan.timeoutMs > 15 * 60_000) throw new EverScriptCompileError('Timeout must be > 0 and <= 15m');

  const params = new Set();
  for (const param of plan.params) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(param)) throw new EverScriptCompileError(`Invalid parameter: ${param}`);
    if (params.has(param)) throw new EverScriptCompileError(`Duplicate parameter: ${param}`);
    params.add(param);
  }

  const declarations = new Map();
  for (const cap of plan.capabilities) {
    if (declarations.has(cap.name)) throw new EverScriptCompileError(`Duplicate capability declaration: ${cap.name}`);
    declarations.set(cap.name, cap);
  }

  const manifestMap = new Map(manifests.map((m) => [m.name, m]));
  const known = new Set(plan.params);
  for (const step of plan.steps) {
    const declaration = declarations.get(step.capability);
    if (!declaration) throw new EverScriptCompileError(`Capability '${step.capability}' is not declared`);
    validateManifest(step, declaration, manifestMap.get(step.capability), { requireSignedManifests, trustedManifestKeys });
    for (const arg of step.args) {
      if (arg.kind === 'variable' && !known.has(arg.name)) {
        throw new EverScriptCompileError(`Unknown variable '${arg.name}' in ${step.capability}.${step.action}`);
      }
    }
    if (known.has(step.assignTo)) throw new EverScriptCompileError(`Variable '${step.assignTo}' is already defined`);
    known.add(step.assignTo);
  }
  if (plan.returnExpr.kind === 'variable' && !known.has(plan.returnExpr.name)) {
    throw new EverScriptCompileError(`Unknown variable '${plan.returnExpr.name}' in return`);
  }
  return Object.freeze(plan);
}

function resolveExpr(expr, vars) {
  if (expr.kind === 'literal') return expr.value;
  if (!vars.has(expr.name)) throw new Error(`Missing runtime variable '${expr.name}'`);
  return vars.get(expr.name);
}

function approvalRequired(plan, capability, action) {
  return plan.approvalRules.some((rule) =>
    rule === action || rule === capability || rule === `${capability}.${action}`,
  );
}

function makeReceipt(plan, startedAt, finishedAt, spentCents, entries) {
  return {
    receiptVersion: '2',
    mission: plan.mission,
    sourceHash: plan.sourceHash,
    startedAt,
    finishedAt,
    currency: plan.currency,
    budgetCents: plan.budgetCents,
    spentCents,
    finalHash: entries.at(-1)?.hash ?? plan.sourceHash,
    entries,
  };
}

function appendReceipt(entries, previousHash, data) {
  const body = { index: entries.length, ...data, previousHash };
  const hash = sha256(canonicalize(body));
  entries.push({ ...body, hash });
  return hash;
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export function callFingerprint({ sourceHash, capability, action, args }) {
  return sha256(canonicalize({ sourceHash, capability, action, args }));
}

export class MemoryReplayStore {
  #values = new Map();
  async get(key) { return this.#values.get(key) ?? null; }
  async put(key, value) { this.#values.set(key, structuredClone(value)); }
}

export class MemoryMeter {
  #reservations = new Map();
  #settlements = [];
  async reserve({ mission, callId, capability, action, quotedCostCents, currency }) {
    const reservationId = `meter_${randomUUID()}`;
    this.#reservations.set(reservationId, {
      mission, callId, capability, action, quotedCostCents, currency, status: 'reserved',
    });
    return { reservationId };
  }
  async settle({ reservationId, actualCostCents }) {
    const reservation = this.#reservations.get(reservationId);
    if (!reservation) throw new Error(`Unknown meter reservation ${reservationId}`);
    if (actualCostCents > reservation.quotedCostCents) throw new Error('Settlement exceeds reservation');
    reservation.status = 'settled';
    reservation.actualCostCents = actualCostCents;
    this.#settlements.push({ reservationId, actualCostCents });
    return { settlementId: `settle_${randomUUID()}` };
  }
  async release({ reservationId }) {
    const reservation = this.#reservations.get(reservationId);
    if (reservation && reservation.status === 'reserved') reservation.status = 'released';
  }
  snapshot() {
    return {
      reservations: [...this.#reservations.entries()].map(([id, value]) => ({ id, ...value })),
      settlements: structuredClone(this.#settlements),
    };
  }
}

export async function run(plan, input, {
  capabilities = [],
  approvalProvider,
  meter,
  replayStore,
  now = () => new Date(),
} = {}) {
  const adapters = new Map(capabilities.map((cap) => [cap.manifest.name, cap]));
  const vars = new Map();
  const entries = [];
  const startedAt = now().toISOString();
  let spentCents = 0;
  let previousHash = plan.sourceHash;

  const fail = (message) => {
    const receipt = makeReceipt(plan, startedAt, now().toISOString(), spentCents, entries);
    throw new EverScriptExecutionError(message, receipt);
  };

  for (const param of plan.params) {
    if (!(param in input)) fail(`Missing mission input '${param}'`);
    vars.set(param, input[param]);
  }

  for (const step of plan.steps) {
    const adapter = adapters.get(step.capability);
    if (!adapter) fail(`No runtime adapter registered for '${step.capability}'`);
    const args = step.args.map((expr) => resolveExpr(expr, vars));
    const callId = randomUUID();
    const fingerprint = callFingerprint({
      sourceHash: plan.sourceHash,
      capability: step.capability,
      action: step.action,
      args,
    });
    const remaining = plan.budgetCents === null ? null : plan.budgetCents - spentCents;
    let quotedCostCents = 0;
    let needsApproval = false;
    let approvalGranted = false;
    let reservationId = null;
    let settlementId = null;

    try {
      if (replayStore && plan.replayPolicy !== 'prefer-live') {
        const replay = await replayStore.get(fingerprint);
        if (replay) {
          vars.set(step.assignTo, replay.value);
          if (plan.receiptPolicy !== 'none') {
            previousHash = appendReceipt(entries, previousHash, {
              callId,
              callFingerprint: fingerprint,
              capability: step.capability,
              action: step.action,
              quotedCostCents: 0,
              actualCostCents: 0,
              approvalRequired: false,
              approvalGranted: false,
              replayed: true,
              status: 'succeeded',
              evidence: replay.evidence ?? null,
              timestamp: now().toISOString(),
            });
          }
          continue;
        }
        if (plan.replayPolicy === 'require-replay') {
          throw new Error(`Replay required but unavailable for ${step.capability}.${step.action}`);
        }
      }

      quotedCostCents = await withTimeout(
        Promise.resolve(adapter.quote(step.action, args, {
          mission: plan.mission,
          callId,
          budgetRemainingCents: remaining,
          currency: plan.currency,
        })),
        plan.timeoutMs,
        `${step.capability}.${step.action} quote`,
      );
      if (!Number.isInteger(quotedCostCents) || quotedCostCents < 0) throw new Error('Quote must be a non-negative integer number of cents');
      if (plan.budgetCents !== null && spentCents + quotedCostCents > plan.budgetCents) {
        throw new Error(`Budget exceeded before ${step.capability}.${step.action}`);
      }

      needsApproval = approvalRequired(plan, step.capability, step.action);
      if (needsApproval) {
        if (!approvalProvider) throw new Error(`Human approval required before ${step.capability}.${step.action}`);
        approvalGranted = await withTimeout(
          Promise.resolve(approvalProvider.request({
            mission: plan.mission,
            capability: step.capability,
            action: step.action,
            args,
            quotedCostCents,
            budgetRemainingCents: remaining,
            currency: plan.currency,
          })),
          plan.timeoutMs,
          `${step.capability}.${step.action} approval`,
        );
        if (!approvalGranted) throw new Error(`Approval denied for ${step.capability}.${step.action}`);
      }

      if (meter && quotedCostCents > 0) {
        const reservation = await withTimeout(
          Promise.resolve(meter.reserve({
            mission: plan.mission,
            callId,
            capability: step.capability,
            action: step.action,
            quotedCostCents,
            currency: plan.currency,
          })),
          plan.timeoutMs,
          `${step.capability}.${step.action} meter reserve`,
        );
        reservationId = reservation?.reservationId ?? null;
        if (!reservationId) throw new Error('Meter did not return a reservationId');
      }

      const result = await withTimeout(
        Promise.resolve(adapter.invoke(step.action, args, {
          mission: plan.mission,
          callId,
          budgetRemainingCents: remaining,
          approvalGranted,
          reservationId,
          currency: plan.currency,
        })),
        plan.timeoutMs,
        `${step.capability}.${step.action}`,
      );
      if (!result || !Number.isInteger(result.costCents) || result.costCents < 0) {
        throw new Error('Capability result must include non-negative integer costCents');
      }
      if (result.costCents > quotedCostCents) throw new Error('Capability charged more than its quote');

      if (meter && reservationId) {
        const settlement = await withTimeout(
          Promise.resolve(meter.settle({ reservationId, actualCostCents: result.costCents })),
          plan.timeoutMs,
          `${step.capability}.${step.action} meter settle`,
        );
        settlementId = settlement?.settlementId ?? null;
      }

      spentCents += result.costCents;
      vars.set(step.assignTo, result.value);
      if (replayStore) {
        await replayStore.put(fingerprint, { value: result.value, evidence: result.evidence ?? null });
      }

      if (plan.receiptPolicy !== 'none') {
        previousHash = appendReceipt(entries, previousHash, {
          callId,
          callFingerprint: fingerprint,
          capability: step.capability,
          action: step.action,
          quotedCostCents,
          actualCostCents: result.costCents,
          approvalRequired: needsApproval,
          approvalGranted,
          replayed: false,
          reservationId,
          settlementId,
          status: 'succeeded',
          evidence: result.evidence ?? null,
          timestamp: now().toISOString(),
        });
      }
    } catch (error) {
      if (meter && reservationId && !settlementId) {
        try { await meter.release({ reservationId }); } catch {}
      }
      const message = error instanceof Error ? error.message : String(error);
      if (plan.receiptPolicy !== 'none') {
        previousHash = appendReceipt(entries, previousHash, {
          callId,
          callFingerprint: fingerprint,
          capability: step.capability,
          action: step.action,
          quotedCostCents,
          actualCostCents: 0,
          approvalRequired: needsApproval,
          approvalGranted,
          replayed: false,
          reservationId,
          settlementId,
          status: 'failed',
          error: message,
          timestamp: now().toISOString(),
        });
      }
      fail(message);
    }
  }

  return {
    value: resolveExpr(plan.returnExpr, vars),
    receipt: makeReceipt(plan, startedAt, now().toISOString(), spentCents, entries),
  };
}

export function verifyReceipt(receipt) {
  let previousHash = receipt.sourceHash;
  for (const entry of receipt.entries) {
    const { hash, ...body } = entry;
    if (body.previousHash !== previousHash) return false;
    if (sha256(canonicalize(body)) !== hash) return false;
    previousHash = hash;
  }
  return receipt.finalHash === previousHash;
}

export function describeCapability(manifest) {
  return {
    kind: 'evercraft.capability',
    manifestVersion: '2',
    ...manifest,
  };
}

export function buildCapabilityIndex(manifests, { registry = 'Evercraft Capability Fabric' } = {}) {
  return {
    kind: 'evercraft.capability-index',
    protocol: 'everscript',
    protocolVersion: '0.3',
    registry,
    capabilities: manifests.map(describeCapability),
  };
}
