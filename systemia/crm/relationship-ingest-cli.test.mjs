import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const runner=fileURLToPath(new URL('./relationship-ingest-cli.mjs',import.meta.url));
function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'crm-evidence-cli-'));
 fs.chmodSync(root,0o700);
 const input=path.join(root,'inbox-evidence.json'),out=path.join(root,'relationships.json');
 const obj={
  schema:'evercraft.crm.source-evidence-envelope.v1',
  initial:{relationship_ref:'test:partner-record',
    subject_ref:'test:private-person',division_id:'evercraft-home',
    stage:'interested',kind:'partner',source_ref:'test:private-thread',
    not_before:'2026-10-01T00:00:00Z',next_review_at:'2026-10-21T00:00:00Z'},
  event:{event_ref:'test:mail-123',type:'meeting_discussed',
    evidence_ref:'test:private-thread:123',
    occurred_at:'2026-10-18T00:00:00Z',
    private_context:'TEST SECRET: only after busy September event.'}
 };
 fs.writeFileSync(input,JSON.stringify(obj),{mode:0o600});
 const run=()=>spawnSync(process.execPath,[runner,'--evidence-file',input,'--relationship-ledger-file',out],
   {encoding:'utf8'});
 return {root,input,out,run,cleanup:()=>fs.rmSync(root,{recursive:true,force:true})};
}
test('CLI persists real private evidence, dedupes replay, never exposes context in output',()=>{
 const f=fixture();
 try{
  const first=f.run();
  assert.equal(first.status,0,first.stderr);
  assert.equal(JSON.parse(first.stdout).state,'created');
  assert.equal(first.stdout.includes('TEST SECRET'),false);
  assert.equal(first.stdout.includes('test:private-person'),false);
  const persisted=JSON.parse(fs.readFileSync(f.out,'utf8'));
  assert.equal(persisted.records[0].outbound_policy,'manual_review_only');
  assert.deepEqual(persisted.records[0].allowed_purposes,[]);
  assert.equal(persisted.records[0].timeline[0].private_context.includes('TEST SECRET'),true);
  assert.equal(fs.statSync(f.out).mode&0o077,0);
  const second=f.run();
  assert.equal(second.status,0);
  assert.equal(JSON.parse(second.stdout).state,'duplicate');
  assert.equal(JSON.parse(fs.readFileSync(f.out,'utf8')).records[0].timeline.length,1);
 }finally{f.cleanup();}
});
test('CLI holds insecure input without printing file content or path',()=>{
 const f=fixture();
 try{
  fs.chmodSync(f.input,0o644);
  const result=f.run();
  assert.equal(result.status,2);
  assert.equal(JSON.parse(result.stderr).state,'held');
  assert.equal(result.stderr.includes('TEST SECRET'),false);
  assert.equal(result.stderr.includes(f.input),false);
  assert.equal(fs.existsSync(f.out),false);
 }finally{f.cleanup();}
});
