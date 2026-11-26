import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {verifyReleaseGrant,releaseGrantBytes} from './node002-release-authorization.mjs';
const schema='evercraft.node002.release-ledger.v1';
// Trusted local configuration only. Directory and pinned key must be provisioned
// by the owner. Never initialize or reset the sequence from a remote request.
function privateDirectory(dir){
 if(!path.isAbsolute(dir)||fs.realpathSync(dir)!==dir)throw Error('ledger_directory_invalid');
 const s=fs.lstatSync(dir);
 if(!s.isDirectory()||s.uid!==process.getuid()||(s.mode&0o077))throw Error('ledger_directory_not_private');
}
function readPrivate(file){
 const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
 try{const s=fs.fstatSync(fd);if(!s.isFile()||s.uid!==process.getuid()||(s.mode&0o077)||s.size>65536)throw Error('ledger_file_invalid');return fs.readFileSync(fd,'utf8')}finally{fs.closeSync(fd)}
}
function syncDir(dir){const fd=fs.openSync(dir,'r');try{fs.fsyncSync(fd)}finally{fs.closeSync(fd)}}
function persist(dir,file,value){
 const tmp=path.join(dir,'.ledger-'+randomUUID());
 try{
 const fd=fs.openSync(tmp,'wx',0o600);
 try{fs.writeFileSync(fd,JSON.stringify(value)+'\n');fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
 fs.renameSync(tmp,file);syncDir(dir);
 }finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp)}
}
export function admitReleaseGrant({directory,grant,signature,nowMs=Date.now()}={}){
 privateDirectory(directory);
 const lock=path.join(directory,'admission.lock');
 const file=path.join(directory,'ledger.json');
 const fd=fs.openSync(lock,'wx',0o600); // stale lock deliberately requires local reconciliation
 let uncertain=false;
 try{
 const prior=JSON.parse(readPrivate(file));
 if(prior.schema!==schema||!Number.isSafeInteger(prior.last_sequence)||prior.last_sequence<0)throw Error('ledger_state_invalid');
 const ownerPublicKey=readPrivate(path.join(directory,'owner-public.pem'));
 const accepted=verifyReleaseGrant({grant,signature,ownerPublicKey,lastSequence:prior.last_sequence,nowMs});
 const receipt={schema,last_sequence:accepted.sequence,commit:accepted.commit,phase:accepted.phase,grant_sha256:createHash('sha256').update(releaseGrantBytes(grant)).digest('hex'),state:'authorized_not_staged',activation_authorized:false};
 uncertain=true;
 persist(directory,file,receipt);
 uncertain=false;
 return Object.freeze(receipt);
 }finally{
 fs.closeSync(fd);
 // Retain lock after any uncertainty; no automatic reset or replay.
 if(!uncertain){fs.unlinkSync(lock);syncDir(directory)}
 }
}
