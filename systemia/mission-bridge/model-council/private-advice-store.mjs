import fs from 'node:fs';
import path from 'node:path';

// Private result ledger. Never store customer conversations in the public repo
// or send model advice to stdout, GitHub Actions, or public heartbeat projections.
const KEY=/^advice:[a-f0-9]{32}$/;
function privateDir(dir){
 if(!path.isAbsolute(String(dir||'')))throw Error('private_advice_absolute_dir_required');
 fs.mkdirSync(dir,{recursive:true,mode:0o700});
 const s=fs.lstatSync(dir);
 if(!s.isDirectory()||s.isSymbolicLink())throw Error('private_advice_unsafe_directory');
 fs.chmodSync(dir,0o700);
 return dir;
}
export function persistPrivateAdvisory({receiptDir,result,now=new Date().toISOString()}={}){
 const dir=privateDir(receiptDir);
 if(!KEY.test(result?.key||''))throw Error('private_advice_invalid_key');
 if(!['advisory_received','held'].includes(result?.state))throw Error('private_advice_invalid_state');
 const file=path.join(dir,result.key.slice(7)+'.json');
 const body={schema:'evercraft.systemia.private-model-advisory.v1',
   key:result.key,state:result.state,created_at:now,mission_id:result.mission_id||null,
   provider:result.provider||null,model:result.model||null,
   provider_receipt:result.provider_receipt||null,
   evidence_refs:result.evidence_refs||[],
   suggestions_text:result.state==='advisory_received'?String(result.advice||'').slice(0,6000):null,
   verified_external_facts:false,
   authorization:'advisory_only_no_external_action'};
 const fd=fs.openSync(file,'wx',0o600);
 try{fs.writeFileSync(fd,JSON.stringify(body)+'\n','utf8');fs.fsyncSync(fd);}
 finally{fs.closeSync(fd);}
 return {state:'private_receipt_saved',key:result.key,receipt_ref:'private:advisory:'+result.key.slice(7)};
}
