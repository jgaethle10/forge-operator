// Owned, local-only HumanFilter engineering proof; no feed access or release authority.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const FILES=['products/humanfilter/extension/rules.js','products/humanfilter/extension/content.js','products/humanfilter/tests/rules.test.cjs','products/humanfilter/README.md'];
const TEST=FILES[2];
export function proveHumanFilter({root,spawn=spawnSync}={}){
 const base=fs.realpathSync(root);
 const hash=createHash('sha256');
 const baseReceipt={schema:'evercraft.kaidance.humanfilter-proof.v1',scope:'local_deterministic_rules_only',source_fingerprint:null,executed:false,release_authorized:false,private_feed_accessed:false,code_changes:0};
 try{
  for(const file of FILES){
   const target=path.resolve(base,file), stat=fs.lstatSync(target);
   if(fs.realpathSync(target)!==target||!stat.isFile()||stat.size>1024*1024)throw Error('untrusted_source');
   hash.update(file+'\0');hash.update(fs.readFileSync(target));hash.update('\0');
  }
 }catch{return {...baseReceipt,status:'source_unavailable'};}
 const fingerprint='sha256:'+hash.digest('hex');
 try{
  const result=spawn(process.execPath,['--test',TEST],{cwd:base,encoding:'utf8',timeout:15000,maxBuffer:65536,env:{PATH:process.env.PATH||'/usr/bin:/bin'}});
  return {...baseReceipt,source_fingerprint:fingerprint,executed:true,status:result.status===0&&!result.error?'passed':'failed',exit_code:Number.isInteger(result.status)?result.status:null};
 }catch{return {...baseReceipt,source_fingerprint:fingerprint,status:'execution_unavailable'};}
}
export function humanFilterCandidate(proof){
 if(!proof||proof.schema!=='evercraft.kaidance.humanfilter-proof.v1'||proof.release_authorized!==false||proof.private_feed_accessed!==false)return null;
 const passed=proof.status==='passed'&&proof.executed===true&&/^sha256:[a-f0-9]{64}$/.test(proof.source_fingerprint||'');
 return {work_key:passed?'humanfilter:release-evidence-review':'humanfilter:proof-reconciliation',lane_key:'humanfilter',priority:passed?3:1,action:passed?'review_browser_regression_and_versioned_package_gates':'investigate_local_rule_proof',authority:'systemia_operator_review_required',execution_authorized:false,publication_authorized:false};
}
