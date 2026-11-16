// Passage QA registered Saban worker: fixed test allowlist, no arbitrary command execution.
// Each role executes a real Node test suite on an authorized NodeSeed checkout.
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=resolve(fileURLToPath(new URL('../../',import.meta.url)));
export const PORTFOLIO_QA_SUITES=Object.freeze({
 work_saban_checker:Object.freeze(['tests/work-saban-customer-csv.test.mjs','tests/work-saban-public-planner.test.mjs']),
 findmypart_checker:Object.freeze(['tests/findmypart-recovery-engine.test.mjs','tests/findmypart-saban-scorecard.test.mjs']),
 forensiscope_checker:Object.freeze(['tests/forensiscope-self-service-admission.test.mjs','tests/forensiscope-buyer-discovery.test.mjs']),
 research_checker:Object.freeze(['tests/evercraft-research-compile.test.mjs','tests/evercraft-research-evidence-dossier.test.mjs']),
});
const sha=bytes=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
const MAX_LOG_BYTES=256000;
const LIMIT_MS=150000;
const count=(stdout,label)=>{
 const values=[...stdout.matchAll(new RegExp('^# '+label+' (\\d+)\\s*$','gm'))];
 return values.length?Number(values.at(-1)[1]):0;
};
export function validatePortfolioQaAssignment(assignment,rootDir=ROOT){
 const role=String(assignment?.role||'');
 if(!Object.hasOwn(PORTFOLIO_QA_SUITES,role))throw Error('portfolio_qa_unregistered_role');
 if(assignment?.work?.kind!=='qa_suite'||assignment.work.key!==role||
    assignment?.item?.kind!=='qa_suite'||assignment.item.key!==role){
  throw Error('portfolio_qa_assignment_scope_invalid');
 }
 if(resolve(rootDir)!==ROOT)throw Error('portfolio_qa_checkout_root_mismatch');
 if(assignment?.item?.raw && Object.keys(assignment.item.raw).length>0){
  throw Error('portfolio_qa_external_parameters_not_allowed');
 }
 return Object.freeze({role,files:PORTFOLIO_QA_SUITES[role]});
}
function runAllowlistedSuite(files,rootDir=ROOT){
 return new Promise((done)=>{
  const command=process.execPath, args=['--test',...files];
  // Deliberately avoid passing repository secrets to the QA subprocess.
  const childEnv={
   PATH:process.env.PATH||'/usr/bin:/bin',
   HOME:process.env.HOME||'/tmp',
   TMPDIR:process.env.TMPDIR||'/tmp',
   CI:'true',PORTFOLIO_SABAN_QA_CHILD:'1'
  };
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
 const suite=validatePortfolioQaAssignment(assignment,rootDir);
 const result=await runAllowlistedSuite(suite.files,rootDir);
 return {
  schema:'evercraft.saban.portfolio-qa-worker.v1',
  mission_key:'PORTFOLIO-QA-001',
  role:suite.role,
  node_test_runner:true,
  allowlisted_commands_only:true,
  no_paid_capacity:true,
  ...result,
 };
}
