import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateCreativeRegistry,creativeFingerprint,runKaidanceCreativeDevelopment}
 from '../systemia/organism/kaidance-creative-development.mjs';
const ROOT=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
const registry=JSON.parse(fs.readFileSync(path.join(ROOT,'registry/kaidance-creative-development.v1.json'),'utf8'));
test('both exact first-party projects are source-pinned, deny auto code writes and have real source proofs',()=>{
 assert.equal(validateCreativeRegistry(registry).projects.length,2);
 assert.deepEqual(registry.projects.map(x=>x.project_key).sort(),['evercraft-graphics','leiland-observatory']);
 for(const p of registry.projects){
  assert.match(creativeFingerprint(ROOT,p),/^sha256:[a-f0-9]{64}$/);
  assert.ok(fs.existsSync(path.join(ROOT,p.proof_test)));
 }
 assert.equal(registry.automatic_code_write,false);
 assert.equal(registry.automatic_publication,false);
 assert.equal(registry.authority.provider_calls,false);
});
test('reject malicious paths, extra projects, unsafe power and role escalation',()=>{
 const mutated=structuredClone(registry);
 mutated.projects[0].source_files[0]='../../private/customer.json';
 assert.throws(()=>validateCreativeRegistry(mutated));
 for(const modify of [
  m=>{m.automatic_code_write=true},
  m=>{m.projects.push({...m.projects[0]})},
  m=>{m.projects[1].review_roles=['model_unrestricted','beauty_judge','world_builder']},
  m=>{m.projects[0].source_files[0]='systemia/core/resident-services.json'},
  m=>{m.authority.auto_publish=true}
 ]){
  const m=structuredClone(registry);modify(m);
  assert.throws(()=>validateCreativeRegistry(m));
 }
});
test('one company tick performs bounded registered Saban visual reviews; repeats do no work',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kaidance-creative-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const at=new Date('2026-11-25T23:00:00.000Z');
 const spawn=()=>({status:0,error:null});
 const first=await runKaidanceCreativeDevelopment({root:ROOT,outDir:dir,now:at,spawn});
 assert.equal(first.duplicate,false);
 assert.equal(first.report.projects.length,2);
 assert.equal(first.report.source_review_completed_this_tick,2);
 assert.equal(first.report.code_changes,0);
 assert.equal(first.report.visual_assets_generated,0);
 assert.equal(first.report.autonomous_code_generation,false);
 assert.equal(first.snapshot.counts.changed,2);
 assert.equal(first.snapshot.counts.admitted,0);
 assert.equal(first.queue.execution_authorized,false);
 assert.equal(first.queue.candidates.length,2);
 assert.ok(first.queue.candidates.every(c=>!c.code_write_authorized&&
  c.art_direction.length===3&&c.art_direction.every(d=>d.directives.length>0)));
 for(const f of ['latest.json','queue.json','mission-snapshot.json','state.json']){
  assert.equal(fs.statSync(path.join(dir,f)).mode&0o777,0o600);
 }
 const duplicate=await runKaidanceCreativeDevelopment({root:ROOT,outDir:dir,now:new Date(+at+1000),spawn});
 assert.equal(duplicate.duplicate,true);
 const repeat=await runKaidanceCreativeDevelopment({root:ROOT,outDir:dir,now:new Date(+at+300000),
  spawn:()=>{throw Error('unchanged_source_must_not_spawn')}});
 assert.equal(repeat.report.source_review_completed_this_tick,0);
 assert.equal(repeat.snapshot.counts.changed,0);
 assert.ok(repeat.report.projects.every(p=>p.status==='unchanged_source'));
 assert.equal(repeat.queue.candidates.length,2,'approved implementation candidates remain visible');
});
test('interrupted source review is held, never silently rerun on the next five-minute tick',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kaidance-creative-hold-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const at=new Date('2026-11-25T23:05:00.000Z');
 const first=await runKaidanceCreativeDevelopment({root:ROOT,outDir:dir,now:at,
  spawn:()=>({status:1,error:null})});
 assert.equal(first.report.held_projects,2);
 assert.equal(first.report.source_review_completed_this_tick,0);
 assert.equal(first.snapshot.counts.held,2);
 const next=await runKaidanceCreativeDevelopment({root:ROOT,outDir:dir,
  now:new Date(+at+300000),spawn:()=>{throw Error('must_not_replay_unreconciled_job')}});
 assert.ok(next.report.projects.every(x=>x.status==='held_unreconciled_checkpoint'));
 assert.equal(next.queue.execution_authorized,false);
 assert.equal(next.snapshot.counts.admitted,0);
});
