import {verify,createPublicKey} from 'node:crypto';
const REPO='jgaethle10/forge-operator';
const NODE='evercraft-node002-nextgen';
const FIELDS=['schema','repository','node_id','commit','operation','phase','sequence','issued_at','expires_at'];
export function releaseGrantBytes(grant){
 if(!grant||Object.keys(grant).sort().join(',')!==[...FIELDS].sort().join(','))throw Error('invalid_release_fields');
 return Buffer.from(JSON.stringify(FIELDS.map(k=>grant[k])));
}
// The caller must load the owner public key and durable sequence from local
// protected configuration, never from an incoming grant or broker message.
// Verification alone grants no shell, restart, fetch or filesystem authority.
export function verifyReleaseGrant({grant,signature,ownerPublicKey,lastSequence,nowMs=Date.now()}={}){
 const bytes=releaseGrantBytes(grant);
 if(grant.schema!=='evercraft.node002.release-grant.v1'||grant.repository!==REPO||grant.node_id!==NODE||! /^[a-f0-9]{40}$/.test(grant.commit)||grant.operation!=='stage-only'||!['hash-only','cemetery-restore','cemetery-ingest'].includes(grant.phase))throw Error('release_scope_denied');
 if(!Number.isSafeInteger(lastSequence)||lastSequence<0||!Number.isSafeInteger(grant.sequence)||grant.sequence<=lastSequence)throw Error('release_sequence_denied');
 const issued=Date.parse(grant.issued_at),expires=Date.parse(grant.expires_at);
 if(!Number.isFinite(nowMs)||!Number.isFinite(issued)||!Number.isFinite(expires)||issued>nowMs||expires<=nowMs||expires<=issued||expires-issued>86400000)throw Error('release_time_denied');
 const key=createPublicKey(ownerPublicKey);
 if(key.asymmetricKeyType!=='ed25519'||typeof signature!=='string'||! /^[A-Za-z0-9+/]{86}==$/.test(signature)||!verify(null,bytes,key,Buffer.from(signature,'base64')))throw Error('release_signature_denied');
 return Object.freeze({commit:grant.commit,phase:grant.phase,sequence:grant.sequence,stage_only:true,activation_authorized:false});
}
