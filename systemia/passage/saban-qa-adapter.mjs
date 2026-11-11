// Passage QA registered Saban worker: fixed test allowlist, no arbitrary command execution.
// Each role executes a real Node test suite on an authorized NodeSeed checkout.
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=resolve(fileURLToPath(new URL('../../',import.meta.url)));
export const PASSAGE_QA_SUITES=Object.freeze({
 catalog_auditor:Object.freeze(['tests/passage-library.test.mjs']),
 signature_auditor:Object.freeze(['tests/passage-package.test.mjs']),
 device_auditor:Object.freeze(['tests/passage-device-kit.test.mjs','tests/passage-device-qa.test.mjs']),
 browser_auditor:Object.freeze(['tests/passage-browser.test.mjs']),
 regression_reviewer:Object.freeze(['tests/passage-package.test.mjs','tests/passage-device-kit.test.mjs']),
});
const sha=bytes=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
const MAX_LOG_BYTES=256000;
const LIMIT_MS=150000;
const count=(stdout,label)=>{
 const values=[...stdout.matchAll(new RegExp('^# '+label+' (\\d+)\\s*$','gm'))];
 return values.length?Number(values.at(-1)[1]):0;
};
export function validatePassageQaAssignment(assignment,rootDir=ROOT){
 const role=String(assignment?.role||'');
 if(!Object.hasOwn(PASSAGE_QA_SUITES,role))throw Error('passage_qa_unregistered_role');
 if(assignment?.work?.kind!=='qa_suite'||assignment.work.key!==role||
    assignment?.item?.kind!=='qa_suite'||assignment.item.key!==role){
  throw Error('passage_qa_assignment_scope_invalid');
 }
 if(resolve(rootDir)!==ROOT)throw Error('passage_qa_checkout_root_mismatch');
 if(assignment?.item?.raw && Object.keys(assignment.item.raw).length>0){
  throw Error('passage_qa_external_parameters_not_allowed');
 }
 return Object.freeze({role,files:PASSAGE_QA_SUITES[role]});
}
function runAllowlistedSuite(files,rootDir=ROOT){
 return new Promise((done)=>{
  const command=process.execPath, args=['--test',...files];
  const childEnv={...process.env,PASSAGE_SABAN_QA_CHILD:'1'};
  // Node's outer --test runner marks its children to prevent recursive invocation.
  // Registered QA worker subprocesses are intentional independent test runners.
  delete childEnv.NODE_TEST_CONTEXT;
  const child=spawn(command,args,{
   cwd:rootDir,env:childEnv,
   stdio:['ignore','pipe','pipe'],shell:false,
  });
  let out='',err='',overflow=false,timedOut=false,settled=false;
  const timer=setTimeout(()=>{timedOut=true;child.kill('SIGKILL')},LIMIT_MS);
  function add(current,chunk){
   const value=chunk.toString('utf8');
   if(Buffer.byteLength(current)+Buffer.byteLength(value)>MAX_LOG_BYTES){
    overflow=true;child.kill('SIGKILL');return current;
   }
   return current+value;
  }
  child.stdout?.on('data',part=>{out=add(out,part)});
  child.stderr?.on('data',part=>{err=add(err,part)});
  const finish=(code,error='')=>{
   if(settled)return;settled=true;clearTimeout(timer);
   const tests=count(out,'tests'),passed=count(out,'pass'),failed=count(out,'fail');
   const ok=code===0&&!timedOut&&!overflow&&tests>0&&passed===tests&&failed===0&&!error;
   done({
    status:ok?'passed':'failed',
    suite_files:[...files],
    test_count:tests,passed_count:passed,failed_count:failed,
    exit_code:Number.isInteger(code)?code:null,
    timed_out:timedOut,output_overflow:overflow,
    stdout_sha256:sha(out),stderr_sha256:sha(err),
    error_code:error||null,
    // Failure excerpt from synthetic CI tests only; no test contents or signing keys included.
    failure_excerpt:ok?null:(err||out).slice(-1200),
   });
  };
  child.on('error',e=>finish(null,e.code||'spawn_failed'));
  child.on('close',code=>finish(code));
 });
}
export async function runAssignment({assignment,rootDir=ROOT}={}){
 const suite=validatePassageQaAssignment(assignment,rootDir);
 const result=await runAllowlistedSuite(suite.files,rootDir);
 return {
  schema:'evercraft.passage.saban-qa-worker.v1',
  mission_key:'PASSAGE-QA-001',
  role:suite.role,
  node_test_runner:true,
  allowlisted_commands_only:true,
  no_paid_capacity:true,
  ...result,
 };
}
