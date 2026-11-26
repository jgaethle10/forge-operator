import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {activationGrantBytes,verifyActivationGrant} from './node002-activation-authorization.mjs';
const SCHEMA='evercraft.node002.activation-ledger.v1';
function readPrivate(file){
 const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
 try{const s=fs.fstatSync(fd);if(!s.isFile()||s.uid!==process.getuid()||(s.mode&0o077)||s.size>65536)throw Error('activation_file_invalid');return fs.readFileSync(fd,'utf8')}finally{fs.closeSync(fd)}
}
function syncDir(dir){const fd=fs.openSync(dir,'r');try{fs.fsyncSync(fd)}finally{fs.closeSync(fd)}}
// Local owner-controlled inputs only. No remote handler or service execution.
// Staged and current receipts must come from independently verified local
// observations, not the incoming grant. Never initialize missing ledger state.
export function admitActivationIntent({directory,grant,signature,staged,current,nowMs=Date.now()}={}){
 if(!path.isAbsolute(directory)||fs.realpathSync(directory)!==directory)throw Error('activation_directory_invalid');
 const stat=fs.lstatSync(directory);
 if(!stat.isDirectory()||stat.uid!==process.getuid()||(stat.mode&0o077))throw Error('activation_directory_not_private');
 const lock=path.join(directory,'activation.lock'),file=path.join(directory,'activation-ledger.json');
 const fd=fs.openSync(lock,'wx',0o600);
 let uncertain=false,temp;
 try{
 const prior=JSON.parse(readPrivate(file));
 if(prior.schema!==SCHEMA||!Number.isSafeInteger(prior.last_sequence)||prior.last_sequence<0||!['idle','reconciled'].includes(prior.state))throw Error('activation_ledger_requires_reconciliation');
 const ownerPublicKey=readPrivate(path.join(directory,'owner-public.pem'));
 const accepted=verifyActivationGrant({grant,signature,ownerPublicKey,staged,current,lastActivationSequence:prior.last_sequence,nowMs});
 const receipt={schema:SCHEMA,last_sequence:accepted.sequence,commit:accepted.commit,phase:accepted.phase,rollback_commit:accepted.rollback_commit,rollback_phase:accepted.rollback_phase,stage_grant_sha256:accepted.stage_grant_sha256,activation_grant_sha256:createHash('sha256').update(activationGrantBytes(grant)).digest('hex'),expires_at:accepted.expires_at,state:'verified_intent_pending_reconciliation',execution_authorized:false};
 temp=path.join(directory,'.activation-'+randomUUID());
 uncertain=true;
 const tf=fs.openSync(temp,'wx',0o600);
 try{fs.writeFileSync(tf,JSON.stringify(receipt)+'\n');fs.fsyncSync(tf)}finally{fs.closeSync(tf)}
 fs.renameSync(temp,file);temp=undefined;syncDir(directory);uncertain=false;
 return Object.freeze(receipt);
 }finally{
 fs.closeSync(fd);
 // Uncertain writes retain the lock and any temporary evidence for review.
 if(!uncertain){fs.unlinkSync(lock);syncDir(directory)}
 }
}
