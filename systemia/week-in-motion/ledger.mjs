import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

function rootDir() {
  return process.env.WEEK_IN_MOTION_STATE_DIR || 'artifacts/week-in-motion';
}

function ledgerPath() {
  return path.join(rootDir(), 'evidence-inbox.jsonl');
}

function clean(value, max = 12000) {
  return String(value ?? '').replace(/\r\n/g, '\n').trim().slice(0, max);
}

function hash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

export function normalizeEvidenceEvent(input, now = new Date()) {
  const occurredAt = input?.occurredAt ? new Date(input.occurredAt) : now;
  if (!Number.isFinite(occurredAt.getTime())) throw new Error('occurredAt must be a valid date');
  const title = clean(input?.title, 500);
  const detail = clean(input?.detail, 20000);
  const sourceType = clean(input?.sourceType, 120);
  const sourceRef = clean(input?.sourceRef, 4000);
  const truthState = clean(input?.truthState, 120);
  const theme = clean(input?.theme || 'portfolio_other', 120);
  if (!title || !detail || !sourceType || !sourceRef || !truthState) {
    throw new Error('title, detail, sourceType, sourceRef, and truthState are required');
  }
  const digest = hash(JSON.stringify({ sourceType, sourceRef, occurredAt: occurredAt.toISOString(), title, detail, truthState, theme }));
  return {
    id: clean(input?.id, 260) || `evercraft-evidence-${digest.slice(0, 20)}`,
    sourceType,
    sourceRef,
    occurredAt: occurredAt.toISOString(),
    title,
    detail,
    truthState,
    theme,
    digest,
    producer: clean(input?.producer || 'unknown', 200),
    receivedAt: now.toISOString(),
  };
}

export async function appendEvidenceEvent(input, now = new Date()) {
  const event = normalizeEvidenceEvent(input, now);
  const target = ledgerPath();
  await fs.mkdir(path.dirname(target), { recursive: true });

  const existing = await readAllEvidenceEvents();
  if (existing.some((row) => row.digest === event.digest || row.id === event.id)) {
    return { status: 'deduplicated', event };
  }

  await fs.appendFile(target, JSON.stringify(event) + '\n', { encoding: 'utf8', mode: 0o600 });
  return { status: 'accepted', event };
}

export async function readAllEvidenceEvents() {
  let raw = '';
  try { raw = await fs.readFile(ledgerPath(), 'utf8'); } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
  return raw.split(/\n+/).filter(Boolean).flatMap((line) => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
}

export async function readEvidenceWindow(window) {
  const start = window.start.getTime();
  const end = window.end.getTime();
  return (await readAllEvidenceEvents())
    .filter((row) => {
      const t = Date.parse(row.occurredAt);
      return Number.isFinite(t) && t >= start && t <= end;
    })
    .sort((a, b) => String(a.occurredAt).localeCompare(String(b.occurredAt)));
}
