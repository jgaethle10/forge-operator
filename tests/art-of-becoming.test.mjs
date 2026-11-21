import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  GOALS, THEMES, dayKey, validDay, shiftDay, emptyState, normalizeState,
  setCheckIn, getProgress, artworkSeed,
} from '../public/art-of-becoming/engine.mjs';

const TODAY = '2026-11-09';
const GOAL = 'alcohol-free';

test('date keys and day arithmetic are deterministic', () => {
  assert.equal(dayKey(new Date(2026, 10, 9, 14)), TODAY);
  assert.equal(shiftDay('2026-03-01', -1), '2026-02-28');
  assert.equal(shiftDay('2024-03-01', -1), '2024-02-29');
  assert.equal(validDay('2026-02-29'), false);
  assert.equal(validDay('2024-02-29'), true);
  assert.equal(validDay('2026-1-9'), false);
});

test('state normalization accepts only known goals, themes, valid past dates and outcomes', () => {
  const raw = { goal: 'not-a-goal', theme: '<script>', entries: {
    [GOAL]: { '2026-11-09': 'kept', '2026-11-10': 'kept', '2026-13-01': 'hard', '2026-11-08': 'anything' },
    madeUp: { '2026-11-09': 'kept' },
  }};
  const state = normalizeState(raw, TODAY);
  assert.equal(state.goal, GOAL);
  assert.equal(state.theme, 'garden');
  assert.deepEqual(state.entries[GOAL], { '2026-11-09': 'kept' });
  assert.equal(state.entries.madeUp, undefined);
  assert.equal(GOALS.length, 6);
  assert.deepEqual(THEMES, ['garden', 'constellation', 'mosaic']);
});

test('successful check-ins grow a canvas and every seventh day produces finished art', () => {
  let state = emptyState();
  for (let i = 6; i >= 0; i--) state = setCheckIn(state, GOAL, shiftDay(TODAY,-i), 'kept', TODAY);
  const progress = getProgress(state,GOAL,TODAY);
  assert.equal(progress.successes, 7);
  assert.equal(progress.streak, 7);
  assert.equal(progress.completedPieces, 1);
  assert.equal(progress.brushstrokes, 0);
  assert.equal(progress.nextPieceIn, 7);
  assert.deepEqual(progress.milestones,[7]);
});

test('a hard day changes the current streak but never erases earlier artwork', () => {
  let state = emptyState();
  for(let i=7;i>=1;i--) state=setCheckIn(state,GOAL,shiftDay(TODAY,-i),'kept',TODAY);
  state=setCheckIn(state,GOAL,TODAY,'hard',TODAY);
  const result=getProgress(state,GOAL,TODAY);
  assert.equal(result.streak,0);
  assert.equal(result.successes,7);
  assert.equal(result.completedPieces,1);
  assert.equal(result.difficultDays,1);
});

test('a finished painting survives reclassifying the exact seventh successful day', () => {
  let state = emptyState();
  for (let i = 6; i >= 0; i--) state = setCheckIn(state, GOAL, shiftDay(TODAY, -i), 'kept', TODAY);
  assert.equal(getProgress(state, GOAL, TODAY).completedPieces, 1);
  state = setCheckIn(state, GOAL, TODAY, 'hard', TODAY);
  const afterCorrection = getProgress(state, GOAL, TODAY);
  assert.equal(afterCorrection.successes, 6);
  assert.equal(afterCorrection.artMarks, 7);
  assert.equal(afterCorrection.completedPieces, 1);
  assert.equal(afterCorrection.streak, 0);
  state = setCheckIn(state, GOAL, TODAY, 'kept', TODAY);
  assert.equal(getProgress(state, GOAL, TODAY).artMarks, 7, 'The same date cannot double award art');
  state = setCheckIn(state, GOAL, shiftDay(TODAY, -7), 'kept', TODAY);
  assert.equal(getProgress(state, GOAL, TODAY).brushstrokes, 1);
  assert.equal(getProgress(state, GOAL, TODAY).completedPieces, 1);
});

test('old backups migrate art credits, including when entries are missing', () => {
  const old = { version: 1, goal: GOAL, theme: 'garden', entries: { [GOAL]: {} }};
  for (let i=6; i>=0; i--) old.entries[GOAL][shiftDay(TODAY,-i)]='kept';
  let normalized = normalizeState(old, TODAY);
  assert.equal(normalized.creditedDays[GOAL].length,7);
  normalized = normalizeState({...normalized,entries:{}},TODAY);
  assert.equal(getProgress(normalized,GOAL,TODAY).completedPieces,1);
  assert.equal(getProgress(normalized,GOAL,TODAY).successes,0);
});

test('finished artwork keeps the visual style that was earned', () => {
  let state = emptyState();
  for (let i=6; i>=0; i--) state=setCheckIn(state,GOAL,shiftDay(TODAY,-i),'kept',TODAY);
  assert.deepEqual(state.canvasThemes[GOAL], ['garden']);
  state.theme = 'mosaic';
  state = normalizeState(state,TODAY);
  assert.deepEqual(state.canvasThemes[GOAL], ['garden']);
  state=setCheckIn(state,GOAL,shiftDay(TODAY,-7),'kept',TODAY);
  assert.equal(getProgress(state,GOAL,TODAY).brushstrokes,1);
  assert.deepEqual(state.canvasThemes[GOAL], ['garden']);
});

test('missing days are unknown, not assumed relapses', () => {
  let state=setCheckIn(emptyState(),GOAL,'2026-11-07','kept',TODAY);
  let result=getProgress(state,GOAL,TODAY);
  assert.equal(result.successes,1);
  assert.equal(result.streak,0);
  assert.equal(result.difficultDays,0);
  state=setCheckIn(state,GOAL,'2026-11-08','kept',TODAY);
  result=getProgress(state,GOAL,TODAY);
  assert.equal(result.streak,2);
});

test('users can revise and clear entries without damaging other goals', () => {
  let state=setCheckIn(emptyState(),GOAL,TODAY,'kept',TODAY);
  state=setCheckIn(state,'reading',TODAY,'kept',TODAY);
  state=setCheckIn(state,GOAL,TODAY,'hard',TODAY);
  assert.equal(getProgress(state,GOAL,TODAY).successes,0);
  assert.equal(getProgress(state,'reading',TODAY).successes,1);
  state=setCheckIn(state,GOAL,TODAY,null,TODAY);
  assert.equal(getProgress(state,GOAL,TODAY).difficultDays,0);
  assert.equal(getProgress(state,'reading',TODAY).successes,1);
});

test('future dates and fabricated outcomes are rejected', () => {
  assert.throws(()=>setCheckIn(emptyState(),GOAL,'2026-11-10','kept',TODAY),/future/);
  assert.throws(()=>setCheckIn(emptyState(),GOAL,TODAY,'diagnosed',TODAY),/outcome/);
  assert.throws(()=>setCheckIn(emptyState(),'unknown',TODAY,'kept',TODAY),/goal/);
});

test('art seeds are stable for the same canvas and different across paintings', () => {
  assert.equal(artworkSeed(GOAL,1,'garden'),artworkSeed(GOAL,1,'garden'));
  assert.notEqual(artworkSeed(GOAL,1,'garden'),artworkSeed(GOAL,2,'garden'));
  assert.notEqual(artworkSeed(GOAL,1,'garden'),artworkSeed(GOAL,1,'mosaic'));
});

test('browser prototype is local-first and does not silently contact a service', () => {
  const html=fs.readFileSync(new URL('../public/art-of-becoming/index.html',import.meta.url),'utf8');
  for (const id of ['goals','kept','hard','clear-day','art-frame','gallery','export','import','import-file','erase','check-date']) {
    assert.ok(html.includes(`id="${id}"`),id);
  }
  assert.match(html,/type="module"/);
  assert.match(html,/localStorage/);
  assert.match(html,/Every intentional day becomes part of a world you can keep building/);
  assert.match(html,/href="\.\/worlds\.html"/);
  assert.doesNotMatch(html,/fetch\s*\(|XMLHttpRequest|sendBeacon|buy\.stripe\.com|base44/i);
});
