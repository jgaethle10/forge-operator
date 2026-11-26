import {createPublicKey,verify} from 'node:crypto';
const fields=['schema','repository','node_id','operation','commit','phase','sequence','rollback_commit','rollback_phase','stage_grant_sha256','issued_at','expires_at'];
const phases=new Set(['hash-only','cemetery-restore','cemetery-ingest']);
const sha=v=>typeof v==='string'&&/^[a-f0-9]{40}$/.test(v);
export function activationGrantBytes(grant){
 if(!grant||Object.keys(grant).sort().join(',')!==[...fields].sort().join(','))throw Error('activation_fields_invalid');
 return Buffer.from(JSON.stringify(fields.map(k=>grant[k])));
}
// Local trusted controller supplies pinned key, staged receipt, current baseline
// and durable activation sequence. This verifier alone has no execution authority.
export function verifyActivationGrant({grant,signature,ownerPublicKey,staged,current,lastActivationSequence,nowMs=Date.now()}={}){
 const bytes=activationGrantBytes(grant);
 if(grant.schema!=='evercraft.node002.activation-grant.v1'||grant.repository!=='jgaethle10/forge-operator'||grant.node_id!=='evercraft-node002-nextgen'||grant.operation!=='activate'||!sha(grant.commit)||!sha(grant.rollback_commit)||grant.commit===grant.rollback_commit||!phases.has(grant.phase)||!phases.has(grant.rollback_phase)||typeof grant.stage_grant_sha256!=='string'||! /^[a-f0-9]{64}$/.test(grant.stage_grant_sha256))throw Error('activation_scope_denied');
 if(!Number.isSafeInteger(lastActivationSequence)||lastActivationSequence<0||!Number.isSafeInteger(grant.sequence)||grant.sequence<=lastActivationSequence)throw Error('activation_sequence_denied');
 if(staged?.schema!=='evercraft.node002.release-stage-receipt.v1'||staged.state!=='staged_not_validated'||staged.activation_authorized!==false||staged.commit!==grant.commit||staged.phase!==grant.phase||staged.sequence!==grant.sequence||staged.grant_sha256!==grant.stage_grant_sha256)throw Error('activation_stage_binding_denied');
 if(current?.healthy!==true||current.node_id!==grant.node_id||current.commit!==grant.rollback_commit||current.phase!==grant.rollback_phase)throw Error('activation_rollback_binding_denied');
 const issued=Date.parse(grant.issued_at),expires=Date.parse(grant.expires_at);
 if(!Number.isFinite(nowMs)||!Number.isFinite(issued)||!Number.isFinite(expires)||issued>nowMs||expires<=nowMs||expires<=issued||expires-issued>3600000)throw Error('activation_time_denied');
 const key=createPublicKey(ownerPublicKey);
 if(key.asymmetricKeyType!=='ed25519'||typeof signature!=='string'||! /^[A-Za-z0-9+/]{86}==$/.test(signature)||!verify(null,bytes,key,Buffer.from(signature,'base64')))throw Error('activation_signature_denied');
 return Object.freeze({...grant,signature_verified:true,execution_authorized:false});
}
