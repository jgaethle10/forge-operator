#!/usr/bin/env node
import fs from 'node:fs';
import { evaluateBenchmarkAttempt } from './benchmark-engine.mjs';
import { ingestBenchmarkSubmission } from './submission-pipeline.mjs';

const args=process.argv.slice(2);
function value(flag){
  const i=args.indexOf(flag);
  return i>=0?args[i+1]:null;
}

const missionPath=value('--mission');
const attemptPath=value('--attempt');
const evaluatorVersion=value('--evaluator-version')||'1.0.0';

if(!missionPath || !attemptPath){
  console.error('usage: node systemia/university/benchmark-submit.mjs --mission <mission.json> --attempt <attempt.json> [--evaluator-version <version>]');
  process.exit(2);
}

const mission=JSON.parse(fs.readFileSync(missionPath,'utf8'));
const attempt=JSON.parse(fs.readFileSync(attemptPath,'utf8'));
const evaluation=evaluateBenchmarkAttempt({mission,attempt,evaluatorVersion});
const receipt=ingestBenchmarkSubmission({attempt,mission,evaluation});

process.stdout.write(JSON.stringify({
  schema:'systemia.university.local-submission-output.v1',
  submission_mode:'repo_local_cli_only_no_remote_ingress',
  evaluation,
  submission_receipt:receipt,
  public_write_performed:false,
  boundary:'This command evaluates and receipts an attempt locally. It does not verify provider identity, publish a result, or write to the public submissions ledger.'
},null,2)+'\n');

process.exitCode=evaluation.passed?0:1;
