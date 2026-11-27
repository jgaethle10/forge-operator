// Existing Kaidance clock only. Offline, source-contract proofs, not live checkout or customer work.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash,randomBytes} from 'node:crypto';
const DAY=86400000;
const FAMILIES=Object.freeze([
 {key:'eps',products:['evercraft-property-services','eps-estimate-engine'],tests:['tests/eps-email-quote-route.test.mjs']},
 {key:'legacy-rescue',products:['legacy-rescue-lab','ibmi-rescue'],tests:['tests/legacy-rescue-lab-discovery.test.mjs','tests/ibmi-rescue-discovery.test.mjs']},
 {key:'website-audit',products:['systemia-website-audit'],tests:['tests/website-audit-mobile-buyer-first.test.mjs']},
 {key:'faie',products:['faie'],tests:['tests/faie-intelligence-studio.test.mjs']}
]);
const HASH=/^sha256:[a-f0-9]{64}$/;
function privateDir(dir){
 fs.mkdirSync(dir,{recursive:true,mode:0o700});
 const s=fs.lstatSync(dir);
 if(!s.isDirectory()||s.isSymbolicLink()||(s.mode&0o077)!==0||s.uid!==process.getuid()||fs.realpathSync(dir)!==dir)throw Error('commercial_proof_private_path');
}
function read(file){
 let s;try{s=fs.lstatSync(file)}catch(e){if(e.code==='ENOENT')return null;throw e}
 if(!s.isFile()||s.isSymbolicLink()||s.uid!==process.getuid()||(s.mode&0o077)!==0||s.size>65536)throw Error('commercial_proof_state_unsafe');
 return JSON.parse(fs.readFileSync(file,'utf8'));
}
function save(file,value){
 const temp=file+'.'+randomBytes(8).toString('hex')+'.tmp';
 try{fs.writeFileSync(temp,JSON.stringify(value,null,2)+'\n',{mode:0o600,flag:'wx'});fs.renameSync(temp,file)}
 finally{if(fs.existsSync(temp))fs.unlinkSync(temp)}
}
function stateOK(s){
 return s.schema==='evercraft.kaidance.commercial-source-proof-state.v1'&&Number.isSafeInteger(s.tick)&&
  s.attempts&&typeof s.attempts==='object'&&!Array.isArray(s.attempts)&&
  Object.entries(s.attempts).every(([k,v])=>FAMILIES.some(f=>f.key===k)&&
   Number.isFinite(v.at)&&['reserved','passed','failed','missing_source'].includes(v.status)&&
   (v.test_digest===null||HASH.test(v.test_digest)));
}
export function runCommercialSourceProof({root,outDir,now=new Date(),enabled=false,spawn=spawnSync}={}){
 const at=new Date(now),ms=+at,tick=Math.floor(ms/300000);
 if(!enabled)return {status:'not_enabled',executed:false};
 if(!Number.isFinite(ms)||!path.isAbsolute(root)||!path.isAbsolute(outDir))throw Error('commercial_proof_input');
 const dir=path.resolve(outDir);privateDir(dir);
 const sf=path.join(dir,'state.json'),lf=path.join(dir,'latest.json');
 const old=read(sf);
 if(old&&!stateOK(old))throw Error('commercial_proof_state_invalid');
 if(old?.tick>tick)throw Error('commercial_proof_clock_rollback');
 if(old?.tick===tick)return {status:'duplicate_or_interrupted',executed:false};
 const attempts={...old?.attempts};
 if(Object.values(attempts).some(v=>v.at>ms))throw Error('commercial_proof_attempt_clock_rollback');
 const due=FAMILIES.filter(f=>!attempts[f.key]||ms-attempts[f.key].at>=DAY)
  .sort((a,b)=>(attempts[a.key]?.at??-1)-(attempts[b.key]?.at??-1));
 const f=due[0];
 if(!f)return {status:'cooldown',executed:false};
 let digest=null,status='missing_source',executed=false,exitCode=null;
 try{
  const h=createHash('sha256');
  for(const name of f.tests){
   const file=path.join(root,name),s=fs.lstatSync(file);
   if(!s.isFile()||s.isSymbolicLink()||fs.realpathSync(file)!==file||s.size>1024*1024)throw Error('commercial_proof_source_unsafe');
   h.update(name+'\0');h.update(fs.readFileSync(file));h.update('\0');
  }
  digest='sha256:'+h.digest('hex');
 }catch{}
 const state={schema:'evercraft.kaidance.commercial-source-proof-state.v1',tick,attempts};
 // Reserve before invoking a child. Crash leaves a visible hold and does not
 // repeat the same proof or block the other families on subsequent ticks.
 attempts[f.key]={at:ms,status:'reserved',test_digest:digest};
 save(sf,state);
 if(digest){
  executed=true;
  try{
   const p=spawn(process.execPath,['--test',...f.tests],{cwd:root,encoding:'utf8',timeout:30000,maxBuffer:65536,
    env:{PATH:process.env.PATH||'/usr/bin:/bin',LANG:'C.UTF-8'}});
   exitCode=Number.isInteger(p.status)?p.status:null;
   status=exitCode===0&&!p.error?'passed':'failed';
  }catch{status='failed'}
 }
 attempts[f.key]={at:ms,status,test_digest:digest};
 const report={schema:'evercraft.kaidance.commercial-source-proof.v1',tick,observed_at:at.toISOString(),
  status,executed,family:f.key,products:f.products,test_files:f.tests,test_digest:digest,exit_code:exitCode,
  scope:'offline_source_contract_only',live_buyer_route_verified:false,payment_verified:false,
  outreach_authorized:false,production_mutations:0,code_changes:0};
 save(lf,report);save(sf,state);
 return report;
}
