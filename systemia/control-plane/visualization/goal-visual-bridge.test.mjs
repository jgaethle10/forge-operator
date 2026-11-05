import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createGoalState, admitGoalPlan } from '../../organism/goal-runtime.mjs';
import { createGoalStateFile, readGoalState } from '../../organism/goal-store.mjs';
import { exportGoalVisualSnapshot, projectGoalToVisualSnapshot, SNAPSHOT_SCHEMA } from './goal-visual-bridge.mjs';

const NOW=new Date('2026-11-04T22:30:00.000Z');
const PERSISTED=new Date('2026-11-04T22:29:00.000Z');

function goal(){
  const initial=createGoalState({
    goalKey:'PRIVATE-customer-123',
    missionKey:'PRIVATE-mission-a',
    objective:'PRIVATE objective: serve Alice, secret@example.com',
    successCondition:'PRIVATE bank account 12345',
    now:PERSISTED,
  });
  return admitGoalPlan({
    state:initial,now:PERSISTED,
    plan:[
      {work_key:'secret-work-key-1',title:'PRIVATE-HOST-123',work_type:'research'},
      {work_key:'secret-work-key-2',title:'PRIVATE customer message',work_type:'external_message',dependency_keys:['secret-work-key-1']},
    ],
  });
}
const show=state=>projectGoalToVisualSnapshot(state,{now:NOW});

test('canonical persisted goal state maps into existing visual snapshot contract',()=>{
  const state=goal();
  const snapshot=show(state);
  assert.equal(snapshot.schema,SNAPSHOT_SCHEMA);
  assert.equal(snapshot.observed_at,PERSISTED.toISOString());
  assert.equal(snapshot.exported_at,NOW.toISOString());
  assert.equal(snapshot.nodes.length,3);
  assert.equal(snapshot.edges.length,3);
  assert.ok(snapshot.edges.some(x=>x.relationship==='depends_on_declared'));
  assert.deepEqual(snapshot.receipts,[]);
  assert.equal(snapshot.provenance.signature_verified,false);
  assert.equal(snapshot.provenance.passport_authorization_verified,false);
  assert.equal(snapshot.provenance.execution_authority_granted,false);
  assert.equal(snapshot.provenance.independent_effect_verified,false);
});
test('private identifiers, agent names, customer details, receipt refs never escape',()=>{
  const state=goal();
  state.tasks[0].receipt_refs=['private-receipt-for-Alice'];
  state.tasks[0].evidence_refs=['s3://very-private-key'];
  state.tasks[0].assigned_agents=['private-agent@example.com'];
  state.tasks[0].blockers=['private tenant address'];
  const text=JSON.stringify(show(state));
  for(const secret of ['PRIVATE','Alice','example.com','secret-work-key','s3://','very-private-key','tenant address']){
    assert.ok(!text.includes(secret),'sensitive string leaked: '+secret);
  }
  assert.equal(show(state).summary.reported_receipt_references,1);
  assert.equal(show(state).summary.verified_receipts,0);
});
test('fresh complete status without reference held, with reference still unverified',()=>{
  const state=goal();
  state.tasks[0].status='complete';
  state.tasks[0].updated_at=PERSISTED.toISOString();
  let snapshot=show(state);
  assert.equal(snapshot.nodes[1].status,'held_missing_receipt');
  assert.equal(snapshot.summary.completed_tasks_missing_receipt_reference,1);
  state.tasks[0].receipt_refs=['untrusted-paid-claim'];
  snapshot=show(state);
  assert.equal(snapshot.nodes[1].status,'reported_complete_unverified');
  assert.equal(snapshot.summary.verified_receipts,0);
});
test('held gate and recovery hold are visible without exposing raw details',()=>{
  const state=goal();
  state.tasks[1].updated_at=PERSISTED.toISOString();
  const snapshot=show(state);
  assert.equal(snapshot.nodes[2].status,'held');
  assert.equal(snapshot.nodes[2].human_gate_unresolved,true);
  state.tasks[1].human_gate_unresolved=false;
  state.tasks[1].recovery_hold={upstream_provider_secret:'blocked'};
  assert.equal(show(state).nodes[2].status,'held');
  assert.ok(!JSON.stringify(show(state)).includes('upstream_provider_secret'));
});
test('missing task timestamps are unknown, not silently refreshed from export time',()=>{
  const snapshot=show(goal());
  assert.equal(snapshot.nodes[1].status,'unknown');
  assert.equal(snapshot.nodes[1].timestamp_source,'persisted_goal_state.updated_at_fallback');
  assert.equal(snapshot.nodes[1].observed_at,PERSISTED.toISOString());
});
test('stale and future source timestamps never become healthy',()=>{
  const stale=goal();
  stale.updated_at='2026-11-03T00:00:00.000Z';
  stale.tasks[0].updated_at=stale.updated_at;
  const st=show(stale);
  assert.equal(st.provenance.freshness,'stale');
  assert.equal(st.nodes[0].status,'stale');
  assert.equal(st.nodes[1].status,'stale');
  const future=goal();
  future.updated_at='2026-11-05T22:00:00.000Z';
  future.tasks[0].updated_at=future.updated_at;
  const f=show(future);
  assert.equal(f.provenance.freshness,'unknown');
  assert.equal(f.nodes[1].status,'unknown');
});
test('duplicate or undefined dependencies fail closed',()=>{
  const dup=goal();dup.tasks[1].work_key=dup.tasks[0].work_key;
  assert.throws(()=>show(dup),/duplicate_work_key/);
  const missing=goal();missing.tasks[1].dependency_keys=['not-a-task'];
  assert.throws(()=>show(missing),/unknown_dependency/);
});
test('unbounded tasks, malformed arrays, timestamps or revision fail closed',()=>{
  const a=goal();a.tasks=Array.from({length:51},(_,i)=>({...a.tasks[0],work_key:'key'+i}));
  assert.throws(()=>show(a),/task_count/);
  const b=goal();b.tasks[0].receipt_refs='unstructured';
  assert.throws(()=>show(b),/receipt_refs/);
  const c=goal();c.updated_at='yesterday';
  assert.throws(()=>show(c),/updated_at/);
  const d=goal();d.revision=0;
  assert.throws(()=>show(d),/revision/);
});
test('actual goal-store export is read-only and creates bounded private output',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'systemia-goal-bridge-'));
  try{
    const inputFile=join(dir,'goal.json'),outputFile=join(dir,'snapshot.json');
    await createGoalStateFile(inputFile,goal(),{now:PERSISTED});
    const before=await readFile(inputFile,'utf8');
    const report=await exportGoalVisualSnapshot({inputFile,outputFile,now:NOW});
    assert.equal(report.nodes.length,3);
    const after=await readFile(inputFile,'utf8');
    assert.equal(after,before);
    const raw=JSON.parse(await readFile(outputFile,'utf8'));
    assert.equal(raw.schema,SNAPSHOT_SCHEMA);
    assert.equal(raw.summary.verified_receipts,0);
    assert.equal((await stat(outputFile)).mode & 0o777,0o600);
    await assert.rejects(exportGoalVisualSnapshot({inputFile,outputFile,now:NOW}),{code:'EEXIST'});
    const source=await readGoalState(inputFile);
    assert.equal(source.revision,2);
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('symbolic-link input is rejected rather than following external path',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'systemia-goal-bridge-'));
  try{
    const input=join(dir,'real.json'),link=join(dir,'link.json'),output=join(dir,'out.json');
    await writeFile(input,JSON.stringify(goal()));
    await symlink(input,link);
    await assert.rejects(exportGoalVisualSnapshot({inputFile:link,outputFile:output,now:NOW}),/unsafe_input_file/);
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('CLI can export the real goal state without modifying it',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'systemia-goal-cli-'));
  try{
    const input=join(dir,'goal.json'),output=join(dir,'graph.json');
    await createGoalStateFile(input,goal(),{now:PERSISTED});
    const before=await readFile(input,'utf8');
    const run=spawnSync(process.execPath,[new URL('./goal-visual-bridge.mjs',import.meta.url).pathname,input,output],{encoding:'utf8'});
    assert.equal(run.status,0,run.stderr);
    assert.equal(JSON.parse(run.stdout).execution_authority_granted,false);
    assert.equal(JSON.parse(await readFile(output,'utf8')).schema,SNAPSHOT_SCHEMA);
    assert.equal(await readFile(input,'utf8'),before);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('Living Graph import surface exposes redacted freshness and missing receipt gaps',async()=>{
  const html=await readFile(new URL('./index.html',import.meta.url),'utf8');
  const {Script}=await import('node:vm');
  const start=html.indexOf('<script>');
  const end=html.lastIndexOf('</script>');
  assert.ok(start>=0&&end>start);
  assert.doesNotThrow(()=>new Script(html.slice(start+8,end)));
  assert.match(html,/UNVERIFIED IMPORT/);
  assert.match(html,/Completed tasks missing receipt references/);
  assert.match(html,/passport_authorization_verified|Passport authority/);
});
