#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import {
  admitGoalPlan,
  authorizeGoalWork,
  createGoalCompletionReceipt,
  createGoalState,
  goalSnapshot,
  heartbeatGoalWork,
  recordGoalOutcome,
  startGoalWork,
} from './goal-runtime.mjs';
import {
  createGoalStateFile,
  mutateGoalState,
  readGoalState,
} from './goal-store.mjs';
import { inspectInterruptedGoalWork, holdInterruptedGoalWork } from './goal-recovery.mjs';

function fail(message) {
  console.error(JSON.stringify({ ok: false, error: message }));
  process.exitCode = 1;
}

function output(value) {
  console.log(JSON.stringify({ ok: true, ...value }, null, 2));
}

const [, , command, ...args] = process.argv;

try {
  if (command === 'init') {
    const [file, goalKey, objective, successCondition = ''] = args;
    if (!file || !goalKey || !objective) throw new Error('usage: init <file> <goalKey> <objective> [successCondition]');
    const state = createGoalState({ goalKey, objective, successCondition });
    const receipt = await createGoalStateFile(file, state);
    output({ state: goalSnapshot(state), storage_receipt: receipt });
  } else if (command === 'plan') {
    const [file, planFile] = args;
    if (!file || !planFile) throw new Error('usage: plan <file> <plan.json>');
    const plan = JSON.parse(await readFile(planFile, 'utf8'));
    const result = await mutateGoalState(file, (state) => admitGoalPlan({ state, plan }));
    output({ state: goalSnapshot(result.state), storage_receipt: result.receipt });
  } else if (command === 'authorize') {
    const [file, workKey, authorizationRef] = args;
    if (!file || !workKey || !authorizationRef) throw new Error('usage: authorize <file> <workKey> <authorizationRef>');
    const result = await mutateGoalState(file, (state) => authorizeGoalWork({ state, workKey, authorizationRef }));
    output({ state: goalSnapshot(result.state), storage_receipt: result.receipt });
  } else if (command === 'start') {
    const [file, workKey] = args;
    if (!file || !workKey) throw new Error('usage: start <file> <workKey>');
    const result = await mutateGoalState(file, (state) => startGoalWork({ state, workKey }));
    output({ state: goalSnapshot(result.state), storage_receipt: result.receipt });
  } else if (command === 'outcome') {
    const [file, workKey, resultName, receiptRef = '', blocker = '', ...evidenceRefs] = args;
    if (!file || !workKey || !resultName) throw new Error('usage: outcome <file> <workKey> <result> [receiptRef] [blocker] [evidenceRef...]');
    const result = await mutateGoalState(file, (state) => recordGoalOutcome({
      state,
      workKey,
      result: resultName,
      receiptRef,
      blocker,
      evidenceRefs,
    }));
    output({ state: goalSnapshot(result.state), storage_receipt: result.receipt });
  } else if (command === 'heartbeat') {
    const [file,workKey,expectedAttempt] = args;
    if(!file||!workKey||!expectedAttempt)throw new Error('usage: heartbeat <file> <workKey> <expectedAttempt>');
    const result=await mutateGoalState(file,state=>heartbeatGoalWork({
      state,workKey,expectedAttempt:Number(expectedAttempt),
    }));
    output({state:goalSnapshot(result.state),storage_receipt:result.receipt});
  } else if (command === 'recovery-scan') {
    const [file,staleAfterMs='3600000']=args;
    if(!file)throw new Error('usage: recovery-scan <file> [staleAfterMs]');
    const state=await readGoalState(file);
    output({inspection:inspectInterruptedGoalWork({state,staleAfterMs:Number(staleAfterMs)})});
  } else if (command === 'recovery-hold') {
    const [file,workKey,expectedAttempt,expectedUpdatedAt,staleAfterMs='3600000']=args;
    if(!file||!workKey||!expectedAttempt||!expectedUpdatedAt)throw new Error(
      'usage: recovery-hold <file> <workKey> <expectedAttempt> <expectedUpdatedAt> [staleAfterMs]'
    );
    const result=await mutateGoalState(file,state=>holdInterruptedGoalWork({
      state,workKey,expectedAttempt:Number(expectedAttempt),expectedUpdatedAt,
      staleAfterMs:Number(staleAfterMs),
    }));
    output({state:goalSnapshot(result.state),storage_receipt:result.receipt,
      operator_warning:'attempt held; verify actual upstream outcome before any retry'});
  } else if (command === 'status') {
    const [file] = args;
    if (!file) throw new Error('usage: status <file>');
    const state = await readGoalState(file);
    output({ state: goalSnapshot(state) });
  } else if (command === 'receipt') {
    const [file, ...successEvidenceRefs] = args;
    if (!file) throw new Error('usage: receipt <file> [successEvidenceRef...]');
    const state = await readGoalState(file);
    output({ receipt: createGoalCompletionReceipt({ state, successEvidenceRefs }) });
  } else {
    throw new Error('commands: init, plan, authorize, start, heartbeat, recovery-scan, recovery-hold, outcome, status, receipt');
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
