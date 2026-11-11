import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createWorkState,leaseNext,complete} from '../saban/work-state.mjs';
import {openOperatorSnapshot,classifySnapshotClock} from './saban-work-operator.mjs';

const at=Date.parse('2026-11-09T18:00:00.000Z');
const SECRET='SECRET_CUSTOMER_PAYLOAD___127';
function make(){
  const work=createWorkState({softwareId:'internal-private-customer',
    assignments:[
      {agent_id:'sensitive-worker-id',role:'sensitive-role',
       work:{kind:'private',key:SECRET},item:{customer:SECRET}},
      {agent_id:'sensitive-worker-id-b',role:'sensitive-role',
       work:{kind:'private',key:SECRET+'2'},item:{customer:SECRET}}
    ],createdAt:at});
  const j=leaseNext(work,{workerId:'private-device',now:at+1000});
  complete(work,{jobId:j.job_id,workerId:'private-device',result:{secret:SECRET},now:at+2000});
  return work;
}
function sandbox(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'saban-operator-'));
  const root=path.join(dir,'authorized-root');
  const review=path.join(dir,'private-review');
  fs.mkdirSync(root);
  const state=path.join(root,'saban-work.json');
  fs.writeFileSync(state,JSON.stringify(make()));
  return {dir,root,review,state};
}
test('operator view consumes a real Saban snapshot and renders only private-safe aggregates',()=>{
  const s=sandbox();
  try{
    const receipt=openOperatorSnapshot({authorizedRoot:s.root,snapshot:s.state,
      reviewRoot:s.review,filename:'office-proof.html',now:at+20*60000});
    assert.equal(receipt.total_jobs,2);
    assert.deepEqual(receipt.counts,{queued:1,leased:0,completed:1,dead_letter:0});
    assert.equal(receipt.mode,'private_operator_snapshot');
    assert.equal(receipt.clock.clock_state,'stale_source_timestamp');
    assert.equal(receipt.live,false);
    assert.equal(receipt.publication_authority,false);
    const html=fs.readFileSync(receipt.output,'utf8');
    assert.match(html,/OLDER SNAPSHOT/);
    assert.match(html,/PRIVATE OPERATOR SNAPSHOT/);
    assert.match(html,/This is a file review, not a live feed/);
    assert.match(html,/noindex,nofollow/);
    assert.doesNotMatch(html,/SECRET_CUSTOMER_PAYLOAD|sensitive-role|sensitive-worker-id|private-device|internal-private-customer|<script/i);
    assert.equal(fs.statSync(receipt.output).mode&0o777,0o600);
    assert.throws(()=>openOperatorSnapshot({authorizedRoot:s.root,snapshot:s.state,reviewRoot:s.review,
      filename:'office-proof.html',now:at+20*60000}),/EEXIST/);
  }finally{fs.rmSync(s.dir,{recursive:true,force:true});}
});
test('out-of-scope, symlinked, relative and non-JSON inputs fail closed',()=>{
  const s=sandbox();
  try{
    const other=path.join(s.dir,'foreign.json');
    fs.copyFileSync(s.state,other);
    const base={authorizedRoot:s.root,snapshot:s.state,reviewRoot:s.review,filename:'proof.html',now:at+3000};
    assert.throws(()=>openOperatorSnapshot({...base,snapshot:other}),/outside authorized/);
    assert.throws(()=>openOperatorSnapshot({...base,snapshot:path.relative(process.cwd(),s.state)}),/absolute path/);
    assert.throws(()=>openOperatorSnapshot({...base,authorizedRoot:path.parse(s.root).root}),/filesystem/);
    assert.throws(()=>openOperatorSnapshot({...base,filename:'../escape.html'}),/filename/);
    const forbiddenReview=path.resolve('public/saban-private-review-must-not-exist');
    assert.equal(fs.existsSync(forbiddenReview),false);
    assert.throws(()=>openOperatorSnapshot({...base,reviewRoot:forbiddenReview}),/outside repository and source roots/);
    assert.equal(fs.existsSync(forbiddenReview),false,'Must fail before making a public directory');
    assert.throws(()=>openOperatorSnapshot({...base,reviewRoot:s.root}),/outside repository and source roots/);
    const link=path.join(s.root,'alias.json');
    fs.symlinkSync(other,link);
    assert.throws(()=>openOperatorSnapshot({...base,snapshot:link}),/root escape|symlink/);
    const nested=path.join(s.root,'nested');fs.mkdirSync(nested);
    fs.symlinkSync(other,path.join(nested,'alias.json'));
    assert.throws(()=>openOperatorSnapshot({...base,snapshot:path.join(nested,'alias.json')}),/root escape|symlink/);
    const bad=path.join(s.root,'not-json.json');fs.writeFileSync(bad,'not json');
    assert.throws(()=>openOperatorSnapshot({...base,snapshot:bad}),/Invalid Saban JSON/);
  }finally{fs.rmSync(s.dir,{recursive:true,force:true});}
});
test('age classification is explicitly source-reported, not live attestation',()=>{
  const stamp='2026-11-09T18:00:00.000Z';
  assert.equal(classifySnapshotClock(stamp,{now:at+2000}).clock_state,'recent_source_timestamp');
  assert.equal(classifySnapshotClock(stamp,{now:at+16*60000}).clock_state,'stale_source_timestamp');
  assert.equal(classifySnapshotClock(stamp,{now:at-6*60000}).clock_state,'future_source_timestamp');
  assert.equal(classifySnapshotClock(stamp,{now:at}).freshness_is_independently_attested,false);
});
test('one-shot operator CLI accepts explicit scope and never uploads source',()=>{
  const s=sandbox();
  try{
    const command=fileURLToPath(new URL('./saban-work-operator.mjs',import.meta.url));
    const result=spawnSync(process.execPath,[command,'--authorized-root',s.root,
      '--snapshot',s.state,'--review-root',s.review,'--filename','local.html'],{encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
    const receipt=JSON.parse(result.stdout);
    assert.equal(receipt.live,false);
    assert.equal(receipt.publication_authority,false);
    assert.ok(fs.existsSync(path.join(s.review,'local.html')));
    assert.ok(!result.stdout.includes(SECRET));
  }finally{fs.rmSync(s.dir,{recursive:true,force:true});}
});
