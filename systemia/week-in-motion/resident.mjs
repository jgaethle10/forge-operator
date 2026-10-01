import fs from 'node:fs/promises';
import path from 'node:path';
import { runWeekInMotionMachine } from './machine.mjs';
import { collectGitHubEvidence, resolveCompletedWeek, resolveCurrentWeek } from './engine.mjs';
import { appendEvidenceEvent } from './ledger.mjs';

const DEFAULT_INTERVAL_MS = 60 * 60 * 1000;
const DEFAULT_RETRY_MS = 6 * 60 * 60 * 1000;

function statePath() {
  const root = process.env.WEEK_IN_MOTION_STATE_DIR || 'artifacts/week-in-motion';
  return path.join(root, 'resident-state.json');
}

async function readState() {
  try {
    return JSON.parse(await fs.readFile(statePath(), 'utf8'));
  } catch {
    return { schema: 'evercraft.week-in-motion.resident-state.v1', weeks: {}, pulses: {} };
  }
}

async function writeState(state) {
  const target = statePath();
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(state, null, 2));
}

function laParts(now = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    weekday: 'short',
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  return { weekday: parts.weekday, hour: Number(parts.hour || 0), minute: Number(parts.minute || 0) };
}

export function shouldAttemptResidentRun(now = new Date()) {
  const local = laParts(now);
  if (local.weekday !== 'Mon') return false;
  const startHour = Number(process.env.WEEK_IN_MOTION_RESIDENT_HOUR || 8);
  return local.hour >= startHour;
}

export async function collectEvidencePulse(options = {}) {
  const now = options.now ? new Date(options.now) : new Date();
  const window = resolveCurrentWeek(now);
  const repo = options.repo || process.env.GITHUB_REPOSITORY || process.env.EVERCRAFT_REPOSITORY || 'jgaethle10/forge-operator';
  const token = options.githubToken ?? process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? '';
  const collectEvidence = options.collectEvidence || collectGitHubEvidence;
  const appendEvidence = options.appendEvidence || appendEvidenceEvent;

  const rows = await collectEvidence({ repo, token, window });
  let accepted = 0;
  let deduplicated = 0;
  for (const row of rows) {
    const result = await appendEvidence({
      ...row,
      producer: row.producer || 'week-in-motion-github-pulse',
    }, now);
    if (result.status === 'accepted') accepted += 1;
    else deduplicated += 1;
  }

  return {
    status: 'collected',
    window: { start: window.startDate, end: window.endDate },
    observed: rows.length,
    accepted,
    deduplicated,
  };
}

export async function residentTick(options = {}) {
  const now = options.now ? new Date(options.now) : new Date();
  let pulse;
  try {
    pulse = await collectEvidencePulse({ ...options, now });
  } catch (error) {
    pulse = {
      status: 'degraded',
      reason: error instanceof Error ? error.message : String(error),
    };
  }

  const state = await readState();
  state.pulses ||= {};
  const liveWindow = resolveCurrentWeek(now);
  state.pulses[liveWindow.key] = {
    ...pulse,
    lastPulseAt: now.toISOString(),
  };
  await writeState(state);

  if (!options.force && !shouldAttemptResidentRun(now)) {
    return {
      status: 'collecting',
      week: liveWindow.key,
      pulse,
      reason: 'live evidence pulse complete; weekly synthesis window has not opened',
    };
  }

  const window = resolveCompletedWeek(now);
  state.weeks ||= {};
  const prior = state.weeks[window.key] || null;
  const retryMs = Number(process.env.WEEK_IN_MOTION_RETRY_MS || DEFAULT_RETRY_MS);

  if (!options.force && prior?.status === 'published') {
    return { status: 'deduplicated', week: window.key, prior, pulse };
  }
  if (!options.force && prior?.lastAttemptAt) {
    const elapsed = now.getTime() - Date.parse(prior.lastAttemptAt);
    if (Number.isFinite(elapsed) && elapsed < retryMs) {
      return { status: 'backoff', week: window.key, retryAfterMs: retryMs - elapsed, prior, pulse };
    }
  }

  state.weeks[window.key] = {
    ...(prior || {}),
    status: 'running',
    lastAttemptAt: now.toISOString(),
  };
  await writeState(state);

  try {
    const result = await runWeekInMotionMachine({ publish: true, now });
    state.weeks[window.key] = {
      status: result.status,
      lastAttemptAt: now.toISOString(),
      lastCompletedAt: new Date().toISOString(),
      articleUrl: result.publication?.data?.article_url || null,
      reasons: result.gate?.reasons || [],
    };
    await writeState(state);
    return { ...result, pulse };
  } catch (error) {
    state.weeks[window.key] = {
      status: 'error',
      lastAttemptAt: now.toISOString(),
      lastCompletedAt: new Date().toISOString(),
      reasons: [error instanceof Error ? error.message : String(error)],
    };
    await writeState(state);
    return { status: 'error', week: window.key, pulse, error: error instanceof Error ? error.message : String(error) };
  }
}

export function startWeekInMotionResident() {
  if (String(process.env.WEEK_IN_MOTION_RESIDENT || 'true').toLowerCase() === 'false') {
    return { enabled: false };
  }

  const intervalMs = Number(process.env.WEEK_IN_MOTION_RESIDENT_INTERVAL_MS || DEFAULT_INTERVAL_MS);
  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const result = await residentTick();
      if (!['collecting', 'backoff', 'deduplicated'].includes(result.status)) {
        console.log('[week-in-motion]', JSON.stringify(result));
      }
    } catch (error) {
      console.error('[week-in-motion] resident tick failed', error);
    } finally {
      running = false;
    }
  };

  const timer = setInterval(tick, intervalMs);
  timer.unref?.();
  setTimeout(tick, 15_000).unref?.();
  return { enabled: true, intervalMs };
}
