#!/usr/bin/env node
import { inspectLocalToolProposal } from '../systemia/raven/local-tool-proposal-gate.mjs';

// A harmless compatibility demonstration. Always dry-run unless --run is explicit.
const argv = process.argv.slice(2);
const allowed = a => a === '--run' || a === '--help' || a.startsWith('--model=');
if (argv.some(a => !allowed(a)) || argv.filter(a => a === '--run').length > 1 ||
  argv.filter(a => a.startsWith('--model=')).length > 1) {
  console.error('unsupported_canary_option');
  process.exitCode = 2;
} else if (argv.includes('--help')) {
  console.log('node scripts/run-raven-local-tool-canary.mjs [--run --model=INSTALLED_OLLAMA_MODEL]');
  console.log('Default is a dry-run. The --run mode only requests a non-executing proposal from local Ollama.');
} else {
  const model = argv.find(a => a.startsWith('--model='))?.slice('--model='.length);
  if (!argv.includes('--run')) {
    console.log(JSON.stringify({ status: 'NOT_STARTED', model: model || null,
      task_id: 'canary_001', action: 'native_tool_proposal_only',
      operations_executable: false, model_downloads_authorized: false,
      origin: 'loopback_only', next: 'Explicit --run and --model are required for a local inference request' }, null, 2));
  } else if (!model) {
    console.error('model_required_for_run');
    process.exitCode = 2;
  } else {
    const result = await inspectLocalToolProposal({
      model,
      taskId: 'canary_001',
      objective: 'Propose verifying reports/example.json inside the approved workspace. Do not execute anything.',
    });
    console.log(JSON.stringify(result, null, 2));
    if (result.status !== 'validated_proposal_only') process.exitCode = 2;
  }
}
