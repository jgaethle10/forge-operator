#!/usr/bin/env node
import { runWeekInMotionMachine } from './machine.mjs';

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const result = await runWeekInMotionMachine({
  publish: process.argv.includes('--publish'),
  now: arg('--now'),
  outDir: arg('--out'),
});

console.log(JSON.stringify(result, null, 2));

if (process.argv.includes('--publish') && result.status !== 'published') {
  process.exitCode = 3;
} else if (result.status === 'blocked' || result.status === 'blocked_quality') {
  process.exitCode = 2;
}
