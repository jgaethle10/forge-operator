import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const file = fs.readFileSync(
  '.github/workflows/systemia-legacy-rescue-watch.yml', 'utf8'
);

test('Legacy Rescue retains a scheduled five-minute heartbeat and explicit recovery route', () => {
  assert.match(file, /workflow_dispatch:/);
  assert.match(file, /schedule:\s*\n\s*- cron: ["']\*\/5 \* \* \* \*["']/);
});

test('manual recovery cannot cancel a scheduled resident run', () => {
  assert.match(file, /concurrency:\s*\n(?:\s*#[^\n]*\n)*\s*group: systemia-legacy-rescue-watch\s*\n\s*cancel-in-progress: false/);
  assert.doesNotMatch(file, /cancel-in-progress:\s*true/);
});

test('shared group serializes scheduled and recovery work without granting new authority', () => {
  assert.match(file, /permissions:\s*\n\s*contents: read/);
  assert.match(file, /timeout-minutes: 8/);
});
