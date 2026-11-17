#!/usr/bin/env node
/**
 * EO-001 | Independent read-only reviewer of the Forge/Lab interop JSON.
 *
 * Does not import or run the producer, tested join, host I/O, models,
 * systemd, subprocesses or network. Checks the externally supplied artifact
 * against immutable Git blob identity supplied by the reviewer and the 15
 * separately documented Lab boundary outcomes (Lab PR #51, 317af00).
 *
 * This protects against accidental/malicious *report* drift relative to the
 * provided reviewed source. It is NOT a signed provenance attestation: someone
 * able to replace both the Git trust root and the report can forge either.
 */
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import process from 'node:process';

const SHA40=/^[a-f0-9]{40}$/;
const SHA64=/^[a-f0-9]{64}$/;
const MAX_REPORT=256*1024;
const MAX_SOURCE=64*1024;
const LAB_COMMIT='317af00e51dc613342e9a4e13948441f36a7ead1';
const REVIEWED_FORGE='70510dbc18a326c8846e5a7005aa7198a9744987';
const sha=b=>createHash('sha256').update(b).digest('hex');
const blob=b=>createHash('sha1').update(
  Buffer.from('blob '+b.length+'\0')).update(b).digest('hex');
const fail=code=>{const e=new Error(code);e.code=code;throw e;};
const guard=(v,code)=>{if(!v)fail(code);};
const EXPECTED=[
  ['matching_metadata','existing_boundary','ACCEPT_REVIEW_ONLY',null],
  ['boot_mismatch','existing_boundary','REJECT','CGKILL_JOIN_BOOT_OR_KERNEL_IDENTITY_MISMATCH'],
  ['source_mismatch','existing_boundary','REJECT','CGKILL_JOIN_SCOPE_OR_SOURCE_MISMATCH'],
  ['inode_mismatch','existing_boundary','REJECT','CGKILL_JOIN_BOOT_OR_KERNEL_IDENTITY_MISMATCH'],
  ['old_stop_permit','existing_boundary','REJECT','CGKILL_JOIN_CANDIDATE_AUTHORITY_OR_METHOD_INVALID'],
  ['name_based_target','existing_boundary','REJECT','CGKILL_JOIN_CANDIDATE_AUTHORITY_OR_METHOD_INVALID'],
  ['kernel_write_claim','existing_boundary','REJECT','CGKILL_JOIN_CANDIDATE_AUTHORITY_OR_METHOD_INVALID'],
  ['hardware_attestation_claim','existing_boundary','REJECT','CGKILL_JOIN_SURVEY_AUTHORITY_OR_PROVENANCE_INVALID'],
  ['effective_permission_claim','existing_boundary','REJECT','CGKILL_JOIN_SURVEY_AUTHORITY_OR_PROVENANCE_INVALID'],
  ['old_method_write_value','existing_boundary','REJECT','CGKILL_JOIN_CANDIDATE_AUTHORITY_OR_METHOD_INVALID'],
  ['fabricated_lab_approval','existing_boundary','REJECT','CGKILL_JOIN_SURVEY_AUTHORITY_OR_PROVENANCE_INVALID'],
  ['unbounded_resource_policy','existing_boundary','REJECT','CGKILL_JOIN_UNREVIEWED_PROPOSAL'],
  ['numeric_device_and_inode','lab_hardening','REJECT','CGKILL_JOIN_BOOT_OR_KERNEL_IDENTITY_MISMATCH'],
  ['relative_path_agreed_by_both_views','lab_hardening','REJECT','CGKILL_JOIN_UNREVIEWED_PROPOSAL'],
  ['dotdot_path_agreed_by_both_views','lab_hardening','REJECT','CGKILL_JOIN_UNREVIEWED_PROPOSAL']
];
const REPORT_KEYS=[
  'schema','state','lab_review_commit','originally_reviewed_forge_commit',
  'current_tested_source_sha256','current_tested_git_blob',
  'runtime_major','case_count','passed_count','failure_count',
  'original_boundary_count','independent_lab_hardening_count',
  'matching_records_independently_attested','independently_authenticated_host',
  'kernel_stop_attempted','qwen_executed','actual_scope_cleanup_proven',
  'physical_experiment_authorized','lab_v02_contract_frozen','cases'
].sort();
const CASE_KEYS=['case','group','expected','actual','expectation_met',
  'refusal_code','returned_authority_flags_false'].sort();
const exactKeys=(obj,keys)=>obj&&typeof obj==='object'&&
  !Array.isArray(obj)&&Object.keys(obj).sort().join('|')===keys.join('|');
const authorityFlags=[
  'matching_records_independently_attested',
  'independently_authenticated_host','kernel_stop_attempted',
  'qwen_executed','actual_scope_cleanup_proven',
  'physical_experiment_authorized','lab_v02_contract_frozen'
];
/** A supplied valid report still cannot authenticate itself. */
export function verifyLabInteropArtifact({
  report,sourceBytes,expectedSourceGitBlob
}={}){
  guard(Buffer.isBuffer(sourceBytes)&&sourceBytes.length>=100&&
    sourceBytes.length<=MAX_SOURCE&&
    typeof expectedSourceGitBlob==='string'&&
    SHA40.test(expectedSourceGitBlob),
    'EO001_ARTIFACT_TRUSTED_SOURCE_REQUIRED');
  const sourceBlob=blob(sourceBytes);
  const sourceSha=sha(sourceBytes);
  guard(sourceBlob===expectedSourceGitBlob,
    'EO001_ARTIFACT_GIT_SOURCE_MISMATCH');
  guard(exactKeys(report,REPORT_KEYS)&&
    report.schema==='evercraft.eo001.lab-interop-review.v1'&&
    report.state==='SYNTHETIC_INTEROPERABILITY_EXPECTATIONS_MATCHED'&&
    report.lab_review_commit===LAB_COMMIT&&
    report.originally_reviewed_forge_commit===REVIEWED_FORGE&&
    SHA64.test(report.current_tested_source_sha256||'')&&
    SHA40.test(report.current_tested_git_blob||'')&&
    report.current_tested_source_sha256===sourceSha&&
    report.current_tested_git_blob===sourceBlob,
    'EO001_ARTIFACT_IDENTITY_OR_SCHEMA_MISMATCH');
  guard(Number.isSafeInteger(report.runtime_major)&&
    report.runtime_major>=18&&report.runtime_major<=30&&
    report.case_count===EXPECTED.length&&
    report.passed_count===EXPECTED.length&&
    report.failure_count===0&&
    report.original_boundary_count===12&&
    report.independent_lab_hardening_count===3&&
    authorityFlags.every(key=>report[key]===false),
    'EO001_ARTIFACT_COUNTS_OR_AUTHORITY_INVALID');
  guard(Array.isArray(report.cases)&&
    report.cases.length===EXPECTED.length,
    'EO001_ARTIFACT_CASE_COUNT_INVALID');
  for(let i=0;i<EXPECTED.length;i++){
    const c=report.cases[i];
    const [name,group,classification,refusal]=EXPECTED[i];
    guard(exactKeys(c,CASE_KEYS)&&c.case===name&&c.group===group&&
      c.expected===classification&&
      c.actual===classification&&
      c.expectation_met===true&&c.refusal_code===refusal&&
      c.returned_authority_flags_false===
        (classification==='ACCEPT_REVIEW_ONLY'?true:null),
      'EO001_ARTIFACT_VECTOR_RESULT_MISMATCH');
  }
  return Object.freeze({
    schema:'evercraft.eo001.lab-interop-artifact-verification.v1',
    state:'SOURCE_BOUND_SYNTHETIC_REPORT_CONSISTENT_REVIEW_ONLY',
    lab_review_commit:LAB_COMMIT,
    reviewed_source_git_blob:sourceBlob,
    reviewed_source_sha256:sourceSha,
    verified_case_count:EXPECTED.length,
    verified_negative_cases:EXPECTED.length-1,
    report_structure_consistent:true,
    executed_source_bytes_recreated_by_this_verifier:false,
    independently_authenticated_ci_runner:false,
    independent_lab_verification_proven:false,
    host_provenance_verified:false,
    model_execution_authorized:false,
    kernel_stop_authorized:false,
    physical_scope_cleanup_proven:false,
    contract_frozen:false
  });
}
function readBoundedFile(filename,max){
  guard(typeof filename==='string'&&
    path.isAbsolute(filename)&&
    path.normalize(filename)===filename&&!filename.includes('\0'),
    'EO001_ARTIFACT_PATH_INVALID');
  let fd;
  try{
    fd=fs.openSync(filename,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
    const stat=fs.fstatSync(fd);
    guard(stat.isFile()&&stat.size>0&&stat.size<=max&&
      stat.nlink===1,'EO001_ARTIFACT_UNTRUSTED_FILE');
    const bytes=fs.readFileSync(fd);
    guard(bytes.length===stat.size,'EO001_ARTIFACT_FILE_CHANGED');
    return bytes;
  }catch(e){
    if(e?.code?.startsWith('EO001_ARTIFACT_'))throw e;
    fail('EO001_ARTIFACT_READ_BLOCKED');
  }finally{
    if(fd!==undefined)fs.closeSync(fd);
  }
}
function parseReport(bytes){
  let report;
  try{
    const asText=bytes.toString('utf8');
    guard(Buffer.from(asText,'utf8').equals(bytes),
      'EO001_ARTIFACT_UTF8_INVALID');
    report=JSON.parse(asText);
    // Require the producer's canonical pretty-JSON representation so duplicate
    // keys, ambiguous encodings and trailing bytes cannot silently normalize.
    guard(JSON.stringify(report,null,2)+'\n'===asText,
      'EO001_ARTIFACT_NONCANONICAL_JSON');
  }catch(e){
    if(e?.code?.startsWith('EO001_ARTIFACT_'))throw e;
    fail('EO001_ARTIFACT_INVALID_JSON');
  }
  return report;
}
async function main(){
  guard(process.argv.length===5,'EO001_ARTIFACT_CLI_ARGS_INVALID');
  const [, ,jsonPath,sourcePath,expectedGitBlob]=process.argv;
  const raw=readBoundedFile(jsonPath,MAX_REPORT);
  const sourceBytes=readBoundedFile(sourcePath,MAX_SOURCE);
  const result=verifyLabInteropArtifact({
    report:parseReport(raw),sourceBytes,expectedSourceGitBlob:expectedGitBlob
  });
  process.stdout.write(JSON.stringify({
    ...result,
    inspected_report_sha256:sha(raw)
  },null,2)+'\n');
}
if(process.argv[1]&&path.resolve(process.argv[1])===
  fileURLToPath(import.meta.url)){
  try{await main();}
  catch(e){
    const code=typeof e?.code==='string'&&
      /^EO001_ARTIFACT_[A-Z_]+$/.test(e.code)?e.code:
      'EO001_ARTIFACT_REVIEW_FAILED';
    process.stderr.write(code+'\n');
    process.exitCode=2;
  }
}
