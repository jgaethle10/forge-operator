// Art of Becoming MVP. Local-only, self-reported reflections, never treatment or verification.
import {emptyWorldState, normalizeWorldState} from './world-engine.mjs';
export const STORAGE_KEY = 'evercraft.art-of-becoming.v1';
export const GOALS = Object.freeze([
  { id: 'alcohol-free', name: 'Alcohol-free days', prompt: 'A day I chose not to drink' },
  { id: 'nicotine-free', name: 'Nicotine-free days', prompt: 'A day I chose not to use nicotine' },
  { id: 'movement', name: 'Movement', prompt: 'A day I made room to move' },
  { id: 'nourishment', name: 'Nourishment', prompt: 'A day I nourished myself with care' },
  { id: 'reading', name: 'Reading', prompt: 'A day I made time to read' },
  { id: 'rest', name: 'Rest', prompt: 'A day I prioritized rest' },
]);
export const THEMES = Object.freeze(['garden', 'constellation', 'mosaic']);
const OUTCOMES = new Set(['kept', 'hard']);

export function dayKey(date = new Date()) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) throw new Error('Invalid date');
  const n = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${n(date.getMonth() + 1)}-${n(date.getDate())}`;
}

export function validDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function shiftDay(key, amount) {
  if (!validDay(key) || !Number.isInteger(amount)) throw new Error('Invalid day offset');
  const date = new Date(`${key}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function emptyState() {
  return { version: 1, goal: 'alcohol-free', theme: 'garden', entries: {}, creditedDays: {}, canvasThemes: {}, worldState: emptyWorldState() };
}

export function normalizeState(input, today = dayKey()) {
  const result = emptyState();
  if (!input || typeof input !== 'object' || Array.isArray(input)) return result;
  if (GOALS.some(goal => goal.id === input.goal)) result.goal = input.goal;
  if (THEMES.includes(input.theme)) result.theme = input.theme;
  const allRecords = input.entries && typeof input.entries === 'object' && !Array.isArray(input.entries) ? input.entries : {};
  const priorCredits = input.creditedDays && typeof input.creditedDays === 'object' && !Array.isArray(input.creditedDays) ? input.creditedDays : {};
  const priorThemes = input.canvasThemes && typeof input.canvasThemes === 'object' && !Array.isArray(input.canvasThemes) ? input.canvasThemes : {};
  for (const goal of GOALS) {
    const records = allRecords[goal.id];
    if (records && typeof records === 'object' && !Array.isArray(records)) {
      const valid = Object.entries(records)
        .filter(([date, status]) => validDay(date) && date <= today && OUTCOMES.has(status))
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-730);
      if (valid.length) result.entries[goal.id] = Object.fromEntries(valid);
    }
    // Credits represent artwork *already earned*. Revising a day changes the
    // self-reported success count, never confiscates previously earned artwork.
    // Older backups without creditedDays migrate from their kept entries.
    const historical = Array.isArray(priorCredits[goal.id]) ? priorCredits[goal.id] : [];
    const credited = new Set(historical.filter(date => validDay(date) && date <= today));
    for (const [date, status] of Object.entries(result.entries[goal.id] || {})) {
      if (status === 'kept') credited.add(date);
    }
    if (credited.size) result.creditedDays[goal.id] = [...credited].sort().slice(-40000);
    const completed = Math.floor((result.creditedDays[goal.id] || []).length / 7);
    if (completed) {
      const snapshots = Array.isArray(priorThemes[goal.id]) ? priorThemes[goal.id] : [];
      result.canvasThemes[goal.id] = Array.from({length: completed}, (_, index) =>
        THEMES.includes(snapshots[index]) ? snapshots[index] : result.theme
      );
    }
  }
  result.worldState = normalizeWorldState(input.worldState, GOALS.map(goal=>goal.id));
  return result;
}

export function setCheckIn(state, goalId, date, status, today = dayKey()) {
  if (!GOALS.some(goal => goal.id === goalId)) throw new Error('Unknown goal');
  if (!validDay(date) || date > today) throw new Error('Invalid or future check-in date');
  if (status !== null && !OUTCOMES.has(status)) throw new Error('Unknown outcome');
  const next = normalizeState(state, today);
  const records = { ...(next.entries[goalId] || {}) };
  if (status === null) delete records[date];
  else records[date] = status;
  if (Object.keys(records).length) next.entries[goalId] = records;
  else delete next.entries[goalId];
  if (status === 'kept') {
    const days = new Set(next.creditedDays[goalId] || []);
    const priorCompleted = Math.floor(days.size / 7);
    days.add(date);
    next.creditedDays[goalId] = [...days].sort();
    if (Math.floor(days.size / 7) > priorCompleted) {
      next.canvasThemes[goalId] = [...(next.canvasThemes[goalId] || []), next.theme];
    }
  }
  return next;
}

export function getProgress(state, goalId, today = dayKey()) {
  const normalized = normalizeState(state, today);
  const records = normalized.entries[goalId] || {};
  const successes = Object.values(records).filter(outcome => outcome === 'kept').length;
  const difficultDays = Object.values(records).filter(outcome => outcome === 'hard').length;
  const artMarks = (normalized.creditedDays[goalId] || []).length;
  const completedPieces = Math.floor(artMarks / 7);
  const brushstrokes = artMarks % 7;
  // A skipped check-in is unknown, not a relapse. Show only consecutive recorded wins.
  let cursor = records[today] === 'hard' ? null : (records[today] === 'kept' ? today : shiftDay(today, -1));
  let streak = 0;
  while (cursor && records[cursor] === 'kept') {
    streak += 1;
    cursor = shiftDay(cursor, -1);
  }
  return {
    successes, difficultDays, streak, artMarks, completedPieces, brushstrokes,
    nextPieceIn: 7 - brushstrokes, todayStatus: records[today] || null,
    milestones: [7, 30, 90, 365].filter(amount => successes >= amount),
  };
}

// Pure, deterministic seeds so completed artwork never changes on refresh.
export function artworkSeed(goalId, index, theme) {
  const source = `${goalId}|${index}|${theme}`;
  let hash = 2166136261;
  for (const char of source) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
