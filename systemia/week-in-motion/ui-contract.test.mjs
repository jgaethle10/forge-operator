import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const component = fs.readFileSync(path.join(root, 'src', 'WeekInMotionMachine.tsx'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src', 'week-in-motion.css'), 'utf8');

test('Week in Motion presents an editorial command center rather than a generic dashboard', () => {
  for (const required of [
    'THE COMPANY, RECORDED WHILE IT MOVES',
    'Editorial desk',
    'Proof room',
    'Evidence desk',
    'Production rail',
    'FALLEN · VISUAL DESK',
    'EVERCRAFT JOURNAL · DEEP EDITION',
    'EVERCRAFT CLIP · DISTRIBUTION',
    'Standards room',
    'Operator console',
    'Archive room',
  ]) {
    assert.ok(component.includes(required), 'missing product surface: ' + required);
  }
  assert.equal(/cyberpunk|hacker dashboard|neon telemetry/i.test(component + css), false);
});

test('Week in Motion visual system stays responsive and editorial', () => {
  assert.ok(css.includes('font-family:Georgia'));
  assert.ok(css.includes('.motion-hero'));
  assert.ok(css.includes('.motion-archive-grid'));
  assert.ok(css.includes('@media(max-width:760px)'));
  assert.ok(css.includes('@media(max-width:480px)'));
});

test('Week in Motion product copy preserves the long-form publishing doctrine', () => {
  assert.ok(component.includes('No stacked one-line cadence'));
  assert.ok(component.includes('Designed is not built. Built is not deployed. Modeled is not observed. Checkout is not payment.'));
  assert.equal(/[\u2013\u2014]/.test(component), false);
});
