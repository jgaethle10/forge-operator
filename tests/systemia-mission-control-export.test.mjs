import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createGoalState} from '../systemia/organism/goal-runtime.mjs';
import {projectGoalStates,projectGoalToOperatorMission} from '../systemia/organism/mission-control-projection.mjs';
import {parseOperatorSnapshot} from '../public/live/mission-source.mjs';
const now=Date.parse('2026-11-05T16:00:00Z'),at=new Date(now);
function state(){return createGoalState({goalKey:'private-goal-123',objective:'Private customer name withheld',now:at});}
function task(status){return {work_key:'pay',work_type:'payment',impact:'payment',status,dependency_keys:[],human_gate_unresolved:false,receipt_refs:[],evidence_refs:[],last_heartbeat_at:new Date(now-60000).toISOString(),updated_at:new Date(now-60000).toISOString()};}
test('local state export hides private goal keys/objectives; imported status stays unverified',()=>{
 const s=state();s.revision=2;s.tasks=[task('blocked')];
 const projected=projectGoalStates([s],{now});
 assert.equal(projected.missions[0].lane,'revenue');
 assert.equal(projected.missions[0].status,'held');
 assert.doesNotMatch(JSON.stringify(projected),/private-goal-123|Private customer name/);
 assert.equal(parseOperatorSnapshot(projected,now).authority,'OPERATOR-REPORTED / UNVERIFIED');
});
test('running goal needs a recent persisted heartbeat, not execution guarantees',()=>{
 const s=state();s.revision=2;s.tasks=[task('executing')];
 assert.equal(projectGoalToOperatorMission(s,{now}).status,'running');
 s.tasks[0].last_heartbeat_at=new Date(now-3600000).toISOString();
 assert.equal(projectGoalToOperatorMission(s,{now}).status,'held');
});
test('completed locally requires task evidence but not provider finality',()=>{
 const s=state();s.revision=2;s.tasks=[task('complete')];
 assert.equal(projectGoalToOperatorMission(s,{now}).status,'held');
 s.tasks[0].receipt_refs=['local:test'];s.evidence_refs=['local:test'];
 assert.equal(projectGoalToOperatorMission(s,{now}).status,'completed');
 assert.match(projectGoalToOperatorMission(s,{now}).note,/provider outcome unverified/i);
});
test('invalid timestamps and duplicated goals fail closed',()=>{
 const s=state();
 assert.throws(()=>projectGoalStates([s,s],{now}),/duplicate/);
 assert.throws(()=>projectGoalToOperatorMission({...s,updated_at:'2025-01-01T00:00:00Z'},{now}));
});
test('CLI writes read-only export outside repo and refuses overwrite',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'systemia-snapshot-'));
 try{
  const a=path.join(dir,'state.json'),b=path.join(dir,'out.json');
  await writeFile(a,JSON.stringify(state()));
  const cli=new URL('../systemia/organism/mission-control-export.mjs',import.meta.url);
  execFileSync(process.execPath,[cli.pathname,'--state',a,'--out',b]);
  assert.equal(JSON.parse(await readFile(b,'utf8')).missions.length,1);
  if(process.platform!=='win32')assert.equal((await stat(b)).mode&0o777,0o600);
  assert.throws(()=>execFileSync(process.execPath,[cli.pathname,'--state',a,'--out',b],{stdio:'pipe'}));
 }finally{await rm(dir,{recursive:true,force:true});}
});
