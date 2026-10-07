#!/usr/bin/env node
import fs from 'node:fs';
import { evaluateBenchmarkAttempt } from './benchmark-engine.mjs';

const args=process.argv.slice(2);
function value(flag){
  const i=args.indexOf(flag);
  return i>=0?args[i+1]:null;
}
const missionPath=value('--mission');
const attemptPath=value('--attempt');
const evaluatorVersion=value('--evaluator-version')||'1.0.0';
if(!missionPath || !attemptPath){
  console.error('usage: node systemia/university/benchmark-runner.mjs --mission <mission.json> --attempt <attempt.json> [--evaluator-version <version>]');
  process.exit(2);
}
const mission=JSON.parse(fs.readFileSync(missionPath,'utf8'));
const attempt=JSON.parse(fs.readFileSync(attemptPath,'utf8'));
const result=evaluateBenchmarkAttempt({mission,attempt,evaluatorVersion});
process.stdout.write(JSON.stringify(result,null,2)+'\n');
process.exitCode=result.passed?0:1;
