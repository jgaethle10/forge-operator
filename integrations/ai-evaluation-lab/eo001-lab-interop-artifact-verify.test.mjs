import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {verifyLabInteropArtifact}
  from './eo001-lab-interop-artifact-verify.mjs';

const producer=new URL('./eo001-lab-interop-reproducer.mjs',import.meta.url);
const source=new URL('./eo001-held-cgroup-kill-survey-join.mjs',import.meta.url);
const verifier=fileURLToPath(new URL('./eo001-lab-interop-artifact-verify.mjs',import.meta.url));
const bytes=()=>fs.readFileSync(source);
const gitBlob=buf=>createHash('sha1')
  .update(Buffer.from('blob '+buf.length+'\0')).update(buf).digest('hex');
const example=()=>JSON.parse(execFileSync(process.execPath,
  [fileURLToPath(producer)],{
    encoding:'utf8',timeout:10000,maxBuffer:1024*1024
  }));
const evaluate=(report=example(),b=bytes(),p=gitBlob(b))=>
  verifyLabInteropArtifact({
    report,sourceBytes:b,expectedSourceGitBlob:p
  });
const invalid=(mutate,error)=>{
  const report=example();mutate(report);
  assert.throws(()=>evaluate(report),new RegExp(error));
};
function inPrivateTemp(fn){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'eo001-lab-artifact-ci-'));
  try{return fn(dir);}finally{fs.rmSync(dir,{recursive:true,force:true});}
}
test('independent reviewer accepts current forged-identity-free synthetic Lab report only',()=>{
  const result=evaluate();
  assert.equal(result.state,'SOURCE_BOUND_SYNTHETIC_REPORT_CONSISTENT_REVIEW_ONLY');
  assert.equal(result.verified_case_count,15);
  assert.equal(result.verified_negative_cases,14);
  assert.equal(result.report_structure_consistent,true);
  assert.equal(result.independent_lab_verification_proven,false);
  assert.equal(result.independently_authenticated_ci_runner,false);
  assert.equal(result.host_provenance_verified,false);
  assert.equal(result.model_execution_authorized,false);
  assert.equal(result.kernel_stop_authorized,false);
  assert.equal(result.physical_scope_cleanup_proven,false);
  assert.equal(result.contract_frozen,false);
  assert.equal(Object.isFrozen(result),true);
});
test('source blob must come from reviewed tree, not forged or changed bytes',()=>{
  const b=bytes();
  assert.throws(()=>evaluate(example(),b,'a'.repeat(40)),
    /EO001_ARTIFACT_GIT_SOURCE_MISMATCH/);
  const changed=Buffer.from(b);changed[250]^=1;
  assert.throws(()=>evaluate(example(),changed,gitBlob(changed)),
    /EO001_ARTIFACT_IDENTITY_OR_SCHEMA_MISMATCH/);
  assert.throws(()=>evaluate(example(),b,'not-a-blob'),
    /EO001_ARTIFACT_TRUSTED_SOURCE_REQUIRED/);
});
test('wrong Lab review, case counts and forged hardware authority are refused',()=>{
  invalid(r=>{r.lab_review_commit='0'.repeat(40);},
    'EO001_ARTIFACT_IDENTITY_OR_SCHEMA_MISMATCH');
  invalid(r=>{r.case_count=16;},'EO001_ARTIFACT_COUNTS_OR_AUTHORITY_INVALID');
  invalid(r=>{r.passed_count=14;},'EO001_ARTIFACT_COUNTS_OR_AUTHORITY_INVALID');
  invalid(r=>{r.physical_experiment_authorized=true;},
    'EO001_ARTIFACT_COUNTS_OR_AUTHORITY_INVALID');
  invalid(r=>{r.independently_authenticated_host=true;},
    'EO001_ARTIFACT_COUNTS_OR_AUTHORITY_INVALID');
});
test('a changed case result, order or refusal code cannot pass',()=>{
  invalid(r=>{r.cases[12].actual='ACCEPT_REVIEW_ONLY';},
    'EO001_ARTIFACT_VECTOR_RESULT_MISMATCH');
  invalid(r=>{r.cases[12].refusal_code=null;},
    'EO001_ARTIFACT_VECTOR_RESULT_MISMATCH');
  invalid(r=>{const t=r.cases[0];r.cases[0]=r.cases[1];r.cases[1]=t;},
    'EO001_ARTIFACT_VECTOR_RESULT_MISMATCH');
  invalid(r=>{r.cases[1]=r.cases[0];},
    'EO001_ARTIFACT_VECTOR_RESULT_MISMATCH');
  invalid(r=>{r.cases.pop();},'EO001_ARTIFACT_CASE_COUNT_INVALID');
  invalid(r=>{r.cases[0].returned_authority_flags_false=false;},
    'EO001_ARTIFACT_VECTOR_RESULT_MISMATCH');
});
test('unknown additional source, report or case claims fail closed',()=>{
  invalid(r=>{r.execution_authorized=true;},
    'EO001_ARTIFACT_IDENTITY_OR_SCHEMA_MISMATCH');
  invalid(r=>{r.cases[0].new_authority_claim=true;},
    'EO001_ARTIFACT_VECTOR_RESULT_MISMATCH');
});
test('external CLI verifies canonical on-disk report with pinned Git blob',()=>{
  inPrivateTemp(dir=>{
    const report=example();
    const file=path.join(dir,'interop.json');
    fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n',{mode:0o600});
    const r=spawnSync(process.execPath,
      [verifier,file,fileURLToPath(source),gitBlob(bytes())],
      {encoding:'utf8',timeout:10000,maxBuffer:1024*1024});
    assert.equal(r.status,0,r.stderr);
    const result=JSON.parse(r.stdout);
    assert.equal(result.verified_case_count,15);
    assert.match(result.inspected_report_sha256,/^[0-9a-f]{64}$/);
    assert.equal(result.kernel_stop_authorized,false);
    assert.equal(result.independent_lab_verification_proven,false);
  });
});
test('external CLI refuses altered JSON, symlinked report and wrong trust blob',()=>{
  inPrivateTemp(dir=>{
    const file=path.join(dir,'interop.json');
    const sourcePath=fileURLToPath(source);
    const expected=gitBlob(bytes());
    fs.writeFileSync(file,JSON.stringify(example(),null,2)+'\n',{mode:0o600});
    const invoke=(name,blob=expected)=>spawnSync(process.execPath,
      [verifier,name,sourcePath,blob],
      {encoding:'utf8',timeout:10000,maxBuffer:1024*1024});
    assert.equal(invoke(file,'0'.repeat(40)).status,2);
    const original=fs.readFileSync(file,'utf8');
    fs.writeFileSync(file,original.replace(/"passed_count": 15/,
      '"passed_count": 1'));
    const altered=invoke(file);
    assert.equal(altered.status,2);
    assert.match(altered.stderr,/EO001_ARTIFACT_COUNTS_OR_AUTHORITY_INVALID/);
    assert.equal(altered.stdout,'');
    fs.writeFileSync(file,original);
    const duplicate=original.replace('"passed_count": 15,',
      '"passed_count": 15,\n  "passed_count": 15,');
    fs.writeFileSync(file,duplicate);
    const nonCanonical=invoke(file);
    assert.equal(nonCanonical.status,2);
    assert.match(nonCanonical.stderr,/EO001_ARTIFACT_NONCANONICAL_JSON/);
    fs.writeFileSync(file,original);
    const link=path.join(dir,'symlink.json');
    fs.symlinkSync(file,link);
    assert.equal(invoke(link).status,2);
  });
});
test('external CLI rejects unexpected argument count and source lacks active effects',()=>{
  const r=spawnSync(process.execPath,[verifier],{
    encoding:'utf8',timeout:10000
  });
  assert.equal(r.status,2);
  assert.match(r.stderr,/EO001_ARTIFACT_CLI_ARGS_INVALID/);
  const code=fs.readFileSync(verifier,'utf8');
  for(const forbidden of ['process.kill(','spawnSync(','execFileSync(',
    'fetch(','writeFileSync(', "from 'node:net'"])
    assert.equal(code.includes(forbidden),false,forbidden);
});
