/**
 * Produces an offline preview bundle from repo-owned static viewers.
 * ALL displayed operational and agent data in this bundle is synthetic.
 * Does not contact or read live Systemia, workers, customers or payments.
 */
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGoalState, admitGoalPlan } from '../../organism/goal-runtime.mjs';
import { projectGoalToVisualSnapshot } from './goal-visual-bridge.mjs';
import { evaluateAgentTrials } from '../agent-arena/evaluate.mjs';

const directory=dirname(fileURLToPath(import.meta.url));
const now=new Date('2026-11-04T22:30:00.000Z');
const initial=createGoalState({
  goalKey:'SYNTHETIC-GOAL',
  missionKey:'SYNTHETIC-MISSION',
  objective:'SYNTHETIC: demonstrate a three-step work chain',
  now,
});
const state=admitGoalPlan({
  state:initial,now,
  plan:[
    {work_key:'demo-observe',work_type:'research'},
    {work_key:'demo-human-gate',work_type:'outreach',dependency_keys:['demo-observe']},
    {work_key:'demo-finalize',work_type:'research',dependency_keys:['demo-human-gate']},
  ],
});
state.tasks[0].status='complete';
state.tasks[0].updated_at=now.toISOString();
state.tasks[0].receipt_refs=['SYNTHETIC-reference-only-not-verified'];
state.tasks[1].status='blocked';
state.tasks[1].updated_at=now.toISOString();
state.tasks[2].updated_at=now.toISOString();
state.status='blocked';
const graph=projectGoalToVisualSnapshot(state,{now:new Date(now.getTime()+60*1000)});
const source=await readFile(resolve(directory,'../agent-arena/examples/synthetic-trials.json'),'utf8');
const trials=evaluateAgentTrials(JSON.parse(source));

const target=process.argv[2] && process.argv.length===3 ? resolve(process.argv[2]) : null;
if(!target)throw Error('Usage: node generate-offline-preview.mjs OUTPUT_DIRECTORY');
await mkdir(target,{recursive:true});
await Promise.all([
  copyFile(join(directory,'index.html'),join(target,'index.html')),
  copyFile(join(directory,'agent-trials.html'),join(target,'agent-trials.html')),
  writeFile(join(target,'SYNTHETIC-goal-snapshot.json'),JSON.stringify(graph,null,2)+'\n',{flag:'wx'}),
  writeFile(join(target,'SYNTHETIC-agent-trial-report.json'),JSON.stringify(trials,null,2)+'\n',{flag:'wx'}),
  writeFile(join(target,'README.txt'),[
    'SYSTEMIA OFFLINE PREVIEW',
    '',
    'THIS PACKAGE CONTAINS ONLY SYNTHETIC DATA. NOT A LIVE SYSTEMIA DEPLOYMENT.',
    '',
    '1. Open index.html in a modern browser to view the Living Graph.',
    '2. Click Import evidence JSON and choose SYNTHETIC-goal-snapshot.json.',
    '3. Open Agent trials in the Living Graph navigation.',
    '4. On that page choose Open agent report and select SYNTHETIC-agent-trial-report.json.',
    '',
    'The viewers are read-only, work without a server and make no remote API calls.',
    'Imported data is explicitly unverified. No status constitutes proof of a',
    'production machine, actual revenue, delivery, payment, or autonomous execution.',
    '',
    'All files built from the GitHub feature branch of Evercraft Systemia.',
    ''
  ].join('\n'),{flag:'wx'})
]);
console.log(JSON.stringify({ok:true,synthetic_only:true,output_directory:target,files:5,production_connected:false}));
