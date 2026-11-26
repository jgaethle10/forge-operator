import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const ORIGIN='https://github.com/jgaethle10/forge-operator.git';
const phases=new Set(['hash-only','cemetery-restore','cemetery-ingest']);
function privateDir(dir){
 if(!path.isAbsolute(dir)||fs.realpathSync(dir)!==dir)throw Error('stage_directory_invalid');
 const s=fs.lstatSync(dir);
 if(!s.isDirectory()||s.uid!==process.getuid()||(s.mode&0o077))throw Error('stage_directory_not_private');
}
function readLedger(directory){
 privateDir(directory);
 const fd=fs.openSync(path.join(directory,'ledger.json'),fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
 try{const s=fs.fstatSync(fd);if(!s.isFile()||s.uid!==process.getuid()||(s.mode&0o077)||s.size>65536)throw Error('stage_ledger_invalid');return JSON.parse(fs.readFileSync(fd,'utf8'))}finally{fs.closeSync(fd)}
}
// Trusted local caller only. No incoming repository, shell command or executable path.
// Stage never runs fetched code, restarts services or changes the resident checkout.
export function stageAuthorizedRelease({ledgerDirectory,stageDirectory,expectedSequence}={}){
 privateDir(stageDirectory);
 const lock=path.join(ledgerDirectory,'admission.lock');
 privateDir(ledgerDirectory);
 const fd=fs.openSync(lock,'wx',0o600);
 try{
 const receipt=readLedger(ledgerDirectory);
 if(receipt.schema!=='evercraft.node002.release-ledger.v1'||receipt.state!=='authorized_not_staged'||receipt.activation_authorized!==false||!Number.isSafeInteger(expectedSequence)||expectedSequence<1||receipt.last_sequence!==expectedSequence||! /^[a-f0-9]{40}$/.test(receipt.commit)||!phases.has(receipt.phase)||! /^[a-f0-9]{64}$/.test(receipt.grant_sha256))throw Error('stage_authorization_invalid');
 const target=path.join(stageDirectory,receipt.commit);
 // Existing directories are never overwritten or executed.
 if(fs.existsSync(target))throw Error('stage_target_exists_reconcile');
 fs.mkdirSync(target,{mode:0o700});
 const env={PATH:'/usr/bin:/bin',HOME:process.env.HOME||'/nonexistent',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_TERMINAL_PROMPT:'0',GIT_ALLOW_PROTOCOL:'https',GIT_LFS_SKIP_SMUDGE:'1'};
 function git(args){
 const r=spawnSync('/usr/bin/git',['-c','core.hooksPath=/dev/null','-c','protocol.file.allow=never','-c','http.followRedirects=false','-C',target,...args],{env,encoding:'utf8',timeout:120000,maxBuffer:1048576});
 if(r.error||r.status!==0)throw Error('stage_git_failed:'+args[0]);
 return r.stdout.trim();
 }
 git(['init','--quiet']);
 git(['fetch','--no-tags','--depth=1',ORIGIN,receipt.commit]);
 if(git(['rev-parse','FETCH_HEAD'])!==receipt.commit)throw Error('stage_commit_mismatch');
 git(['checkout','--detach','--quiet',receipt.commit]);
 if(git(['rev-parse','HEAD'])!==receipt.commit||git(['status','--porcelain'])!=='')throw Error('stage_checkout_unverified');
 const result={schema:'evercraft.node002.release-stage-receipt.v1',commit:receipt.commit,phase:receipt.phase,sequence:receipt.last_sequence,grant_sha256:receipt.grant_sha256,state:'staged_not_validated',activation_authorized:false};
 const out=path.join(stageDirectory,receipt.commit+'.receipt.json');
 const rf=fs.openSync(out,'wx',0o600);
 try{fs.writeFileSync(rf,JSON.stringify(result)+'\n');fs.fsyncSync(rf)}finally{fs.closeSync(rf)}
 const dirfd=fs.openSync(stageDirectory,'r');try{fs.fsyncSync(dirfd)}finally{fs.closeSync(dirfd)}
 return Object.freeze(result);
 }finally{fs.closeSync(fd);fs.unlinkSync(lock)}
}
