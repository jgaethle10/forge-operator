#!/usr/bin/env node
import fs from 'node:fs';
import { planWorkSaban } from './index.mjs';

const arg = key => { const i = process.argv.indexOf(key); return i < 0 ? '' : (process.argv[i + 1] || ''); };
try {
  const text = arg('--task-file') ? fs.readFileSync(arg('--task-file'), 'utf8') : arg('--task');
  const plan = planWorkSaban({ task: text, skillId: arg('--skill') || null });
  process.stdout.write(JSON.stringify(plan, null, 2) + '\n');
  if (plan.status !== 'planned') process.exitCode = 2;
} catch (error) {
  process.stderr.write(JSON.stringify({
    schema: 'evercraft.work-saban.skill-plan-error.v1',
    status: 'blocked',
    execution_performed: false,
    error: error instanceof Error ? error.message : String(error)
  }) + '\n');
  process.exitCode = 1;
}
