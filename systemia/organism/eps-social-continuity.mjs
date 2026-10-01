#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const MODULE_FILE = fileURLToPath(import.meta.url);
const SOCIAL_MISSION_KEY = 'evercraft-social-distribution-engine-2026-09';
const EPS_WORK_KEY = 'eps-social-continuity-repair-v1';
const CADENCE_MS = 30 * 60 * 1000;

function clean(value, max = 4000) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function sha(value) {
  return createHash('sha256')
    .update(typeof value === 'string' ? value : JSON.stringify(value))
    .digest('hex');
}

function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o750 });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, file);
}

function appendJsonl(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o750 });
  fs.appendFileSync(file, JSON.stringify(value) + '\n', { mode: 0o600 });
}

function arg(argv, name, fallback = '') {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
}

function loadJson(file, fallback = null) {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function bucketAt(now = new Date()) {
  return Math.floor(now.getTime() / CADENCE_MS);
}

export function evaluateClipResult({ httpOk, data = {} } = {}) {
  const published = data?.published === true;
  const verified = data?.verified === true;
  const noOp = data?.no_op === true;
  const providerOk = data?.success === true;

  if (!httpOk || !providerOk) {
    return {
      ok: false,
      result: 'failed',
      reason: clean(data?.raw_error || data?.error || 'clip_ingress_failed', 1200),
      published,
      verified,
      no_op: noOp,
    };
  }

  if (noOp) {
    return {
      ok: true,
      result: 'no_op',
      reason: clean(data?.reason || 'no eligible EPS content', 500),
      published: false,
      verified: false,
      no_op: true,
    };
  }

  if (published && verified) {
    return {
      ok: true,
      result: 'published_verified',
      reason: '',
      published: true,
      verified: true,
      no_op: false,
    };
  }

  return {
    ok: false,
    result: published ? 'published_unverified' : 'ambiguous_success',
    reason: published
      ? 'Clip reported a publish but provider-visible verification did not pass.'
      : 'Clip returned success without a verified publish or explicit no-op.',
    published,
    verified,
    no_op: false,
  };
}

export async function runEpsSocialContinuity({
  ingressUrl,
  secret,
  stateDir,
  now = new Date(),
  fetchImpl = fetch,
} = {}) {
  const url = clean(ingressUrl, 2000);
  const token = String(secret ?? '').trim().slice(0, 12000);
  if (!url) throw new Error('Clip EPS ingress URL is required');
  if (!token) throw new Error('Clip shared secret is required');

  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') throw new Error('Clip EPS ingress must use HTTPS');
  const host = parsed.hostname.toLowerCase();
  if (host === 'base44.app' || host.endsWith('.base44.app')) {
    throw new Error('Legacy provider Clip ingress is retired; configure an Evercraft-owned ingress.');
  }

  const root = path.resolve(stateDir || 'artifacts/eps-social-continuity');
  const stateFile = path.join(root, 'state.json');
  const latestFile = path.join(root, 'latest.json');
  const ledgerFile = path.join(root, 'receipts.jsonl');
  const bucket = bucketAt(now);
  const prior = loadJson(stateFile, {});

  if (
    Number(prior?.bucket) === bucket &&
    ['published_verified', 'no_op'].includes(clean(prior?.result))
  ) {
    return {
      ok: true,
      held: true,
      reason: 'current_30_minute_bucket_already_completed',
      bucket,
      prior_result: prior.result,
      receipt_ref: prior.receipt_ref || null,
    };
  }

  const startedAt = now.toISOString();
  const requestBody = {
    source_system: 'evercraft-systemia-yard',
    mission_key: SOCIAL_MISSION_KEY,
    work_key: EPS_WORK_KEY,
    action: 'publish_due_eps_facebook',
  };

  let response;
  let data = {};
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'User-Agent': 'SystemiaCoreSocialContinuity/1.0',
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(20_000),
    });
    data = await response.json().catch(() => ({}));
  } catch (error) {
    data = { error: clean(error?.message || error, 1200) };
    response = { ok: false, status: null };
  }

  const evaluated = evaluateClipResult({ httpOk: response.ok === true, data });
  const completedAt = new Date().toISOString();
  const receiptBody = {
    schema: 'evercraft.systemia.eps-social-continuity-receipt.v1',
    mission_key: SOCIAL_MISSION_KEY,
    work_key: EPS_WORK_KEY,
    scheduler: 'systemia-core-resident-supervisor',
    runtime_target: 'yard_evercraft_compute',
    source_system: 'evercraft-systemia-yard',
    cadence_seconds: 1800,
    bucket,
    started_at: startedAt,
    completed_at: completedAt,
    endpoint_host: parsed.hostname,
    http_status: Number.isFinite(Number(response.status)) ? Number(response.status) : null,
    result: evaluated.result,
    ok: evaluated.ok,
    no_op: evaluated.no_op,
    published: evaluated.published,
    verified: evaluated.verified,
    reason: evaluated.reason,
    package_id: clean(data?.package_id, 160) || null,
    post_id: clean(data?.post_id, 260) || null,
    permalink: clean(data?.permalink, 1800) || null,
    verification_id: clean(data?.verification_id, 180) || null,
    preflight_receipt_id: clean(data?.preflight_receipt_id, 180) || null,
    secret_persisted: false,
  };
  const receiptRef = `sha256:${sha(receiptBody)}`;
  const receipt = { ...receiptBody, receipt_ref: receiptRef };

  atomicJson(latestFile, receipt);
  appendJsonl(ledgerFile, receipt);
  atomicJson(stateFile, {
    schema: 'evercraft.systemia.eps-social-continuity-state.v1',
    bucket,
    result: evaluated.result,
    receipt_ref: receiptRef,
    updated_at: completedAt,
  });

  return {
    ok: evaluated.ok,
    held: evaluated.no_op,
    bucket,
    result: evaluated.result,
    receipt_ref: receiptRef,
    published: evaluated.published,
    verified: evaluated.verified,
    no_op: evaluated.no_op,
    reason: evaluated.reason,
  };
}

async function cli() {
  const argv = process.argv.slice(2);
  const ingressUrl = arg(
    argv,
    '--url',
    process.env.EVERCRAFT_CLIP_EPS_INGRESS_URL || ''
  );
  const secretFile = arg(
    argv,
    '--secret-file',
    process.env.SYSTEMIA_CLIP_SHARED_SECRET_FILE || ''
  );
  const stateDir = arg(
    argv,
    '--state-dir',
    process.env.SYSTEMIA_EPS_SOCIAL_STATE_DIR || 'artifacts/eps-social-continuity'
  );

  if (!secretFile) throw new Error('SYSTEMIA_CLIP_SHARED_SECRET_FILE is required');
  const resolvedSecretFile = path.resolve(secretFile);
  const secret = fs.readFileSync(resolvedSecretFile, 'utf8').trim();
  const result = await runEpsSocialContinuity({ ingressUrl, secret, stateDir });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === MODULE_FILE;
if (isCli) {
  cli().catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      result: 'failed',
      error: clean(error?.message || error, 1200),
    }));
    process.exitCode = 1;
  });
}
