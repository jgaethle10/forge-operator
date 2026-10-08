import { createPublicKey, verify } from 'node:crypto';

// Trust anchors MUST be loaded by the privileged runtime from its own configuration.
// Public keys inside an approval envelope are never accepted as trust anchors.
const ENVELOPE='evercraft.goal.human-approval-envelope.v1';
const CLAIMS='evercraft.goal.human-approval-claims.v1';
const SCOPE='systemia.goal.authorize';
const MAX_VALIDITY_MS=24*3600*1000;
const CLOCK_SKEW_MS=5*60*1000;
const clean=value=>String(value??'').trim();

export function humanApprovalMessage(claims) {
  // Domain-separated, fixed-order canonical bytes. Extra unrecognized claim keys
  // are prohibited rather than silently left outside the signature.
  const keys=['schema','mission_key','goal_key','work_key','scope','approved','receipt_ref','issued_at','expires_at'];
  if(!claims||typeof claims!=='object'||Array.isArray(claims)||
    Object.keys(claims).sort().join(',')!==[...keys].sort().join(',')) {
    throw new Error('approval claims shape invalid');
  }
  return Buffer.from('evercraft.goal.human-approval.v1\n'+JSON.stringify(
    Object.fromEntries(keys.map(key=>[key,claims[key]]))
  ),'utf8');
}

export function verifyGoalHumanApproval({
  approval,state,workKey,trustedPublicKeys={},now=new Date()
}={}) {
  if(!state||state.schema!=='evercraft.goal.state.v1') throw new Error('goal state required');
  if(!approval||approval.schema!==ENVELOPE||typeof approval!=='object'||
    Object.keys(approval).sort().join(',')!=='claims,key_id,schema,signature_base64') {
    throw new Error('signed human approval envelope required');
  }
  const claims=approval.claims;
  const message=humanApprovalMessage(claims);
  if(claims.schema!==CLAIMS||claims.scope!==SCOPE||claims.approved!==true ||
    claims.mission_key!==state.mission_key||claims.goal_key!==state.goal_key||
    claims.work_key!==clean(workKey)||!clean(claims.receipt_ref)) {
    throw new Error('human approval claim mismatch');
  }
  const issued=Date.parse(claims.issued_at);
  const expires=Date.parse(claims.expires_at);
  const clock=now instanceof Date?now.getTime():new Date(now).getTime();
  if(!Number.isFinite(issued)||!Number.isFinite(expires)||!Number.isFinite(clock)||
    expires<=issued||expires-issued>MAX_VALIDITY_MS||
    issued>clock+CLOCK_SKEW_MS||expires<=clock) {
    throw new Error('human approval outside validity window');
  }
  const keyId=clean(approval.key_id);
  // Own-property access avoids prototype keys. No fallback to envelope public keys.
  if(!keyId||!Object.hasOwn(trustedPublicKeys,keyId))throw new Error('trusted human approval signer missing');
  const key=createPublicKey(trustedPublicKeys[keyId]);
  if(key.asymmetricKeyType!=='ed25519')throw new Error('approval signer must use Ed25519');
  const b64=clean(approval.signature_base64);
  if(!/^[a-zA-Z0-9+/]{86}==$/.test(b64))throw new Error('human approval signature encoding invalid');
  const signature=Buffer.from(b64,'base64');
  if(signature.length!==64 || !verify(null,message,key,signature)) {
    throw new Error('human approval signature not verified');
  }
  return {
    schema:'evercraft.goal.verified-human-approval.v1',
    key_id:keyId,receipt_ref:claims.receipt_ref,scope:claims.scope,
    expires_at:claims.expires_at,verified:true,
  };
}
