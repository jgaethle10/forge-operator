import { createHash } from 'node:crypto';

const sha=(value)=>'sha256:'+createHash('sha256').update(
  typeof value==='string'?value:JSON.stringify(value)
).digest('hex');

const VALID_STATES=new Set([
  'observed',
  'candidate',
  'authorized',
  'active',
  'degraded',
  'revoked',
  'expired',
]);

function clean(v){return String(v??'').trim();}

function receipt(action,body){
  const base={
    schema:'evercraft.saban.ambient-device-trust-receipt.v1',
    action,
    ...body,
  };
  return {...base,receipt_hash:sha(base)};
}

export function createAmbientTrustRecord({
  device_id,
  capability_manifest_hash='',
  observed_at=new Date().toISOString(),
}={}){
  const id=clean(device_id);
  if(!id) throw new Error('ambient_trust_device_id_required');
  const body={
    schema:'evercraft.saban.ambient-device-trust.v1',
    device_id:id,
    state:'observed',
    capability_manifest_hash:clean(capability_manifest_hash)||null,
    authorization_ref_hash:null,
    authorization_expires_at:null,
    last_heartbeat_at:null,
    heartbeat_target_seconds:null,
    attestation_mode:null,
    attestation_identity:null,
    revoked_at:null,
    revocation_ref_hash:null,
    observed_at,
    updated_at:observed_at,
    history:[],
  };
  const first=receipt('observe',{
    device_id:id,
    state:'observed',
    observed_at,
    capability_manifest_hash:body.capability_manifest_hash,
  });
  body.history.push(first);
  return body;
}

function clone(record){
  if(record?.schema!=='evercraft.saban.ambient-device-trust.v1'){
    throw new Error('ambient_trust_record_required');
  }
  return structuredClone(record);
}

export function markAmbientCandidate(record,{
  capability_manifest_hash,
  observed_at=new Date().toISOString(),
}={}){
  const next=clone(record);
  if(['revoked','expired'].includes(next.state)) throw new Error('ambient_trust_terminal_state');
  const hash=clean(capability_manifest_hash);
  if(!/^sha256:[a-f0-9]{64}$/i.test(hash)) throw new Error('ambient_manifest_hash_required');
  next.capability_manifest_hash=hash;
  next.state='candidate';
  next.updated_at=observed_at;
  next.history.push(receipt('candidate',{
    device_id:next.device_id,
    state:next.state,
    capability_manifest_hash:hash,
    observed_at,
  }));
  return next;
}

export function authorizeAmbientDevice(record,{
  approval_ref,
  expires_at,
  heartbeat_target_seconds=300,
  attestation_mode='gateway_bound',
  attestation_identity='',
  authorized_at=new Date().toISOString(),
}={}){
  const next=clone(record);
  if(next.state!=='candidate') throw new Error('ambient_device_must_be_candidate_before_authorization');
  if(!next.capability_manifest_hash) throw new Error('ambient_capability_manifest_required');
  const approval=clean(approval_ref);
  if(!approval) throw new Error('ambient_device_explicit_approval_required');
  const expiry=Date.parse(String(expires_at||''));
  if(!Number.isFinite(expiry)||expiry<=Date.parse(authorized_at)){
    throw new Error('ambient_device_authorization_expiry_required');
  }
  const heartbeat=Math.max(10,Math.floor(Number(heartbeat_target_seconds||300)));
  next.state='authorized';
  next.authorization_ref_hash=sha(approval);
  next.authorization_expires_at=new Date(expiry).toISOString();
  next.heartbeat_target_seconds=heartbeat;
  next.attestation_mode=clean(attestation_mode)||'gateway_bound';
  next.attestation_identity=clean(attestation_identity)||null;
  next.updated_at=authorized_at;
  next.history.push(receipt('authorize',{
    device_id:next.device_id,
    state:next.state,
    capability_manifest_hash:next.capability_manifest_hash,
    authorization_ref_hash:next.authorization_ref_hash,
    authorization_expires_at:next.authorization_expires_at,
    heartbeat_target_seconds:heartbeat,
    attestation_mode:next.attestation_mode,
    attestation_identity_hash:next.attestation_identity?sha(next.attestation_identity):null,
    authorized_at,
  }));
  return next;
}

export function heartbeatAmbientDevice(record,{
  capability_manifest_hash,
  attestation_identity='',
  observed_at=new Date().toISOString(),
}={}){
  const next=clone(record);
  if(next.state==='revoked') throw new Error('ambient_device_revoked');
  const now=Date.parse(observed_at);
  const expiry=Date.parse(String(next.authorization_expires_at||''));
  if(Number.isFinite(expiry)&&now>=expiry){
    next.state='expired';
    next.updated_at=observed_at;
    next.history.push(receipt('expire',{
      device_id:next.device_id,
      state:'expired',
      expired_at:observed_at,
    }));
    return next;
  }
  if(!['authorized','active','degraded'].includes(next.state)){
    throw new Error('ambient_device_not_authorized');
  }
  if(clean(capability_manifest_hash)!==clean(next.capability_manifest_hash)){
    throw new Error('ambient_capability_manifest_drift');
  }
  if(next.attestation_identity&&clean(attestation_identity)!==clean(next.attestation_identity)){
    throw new Error('ambient_attestation_identity_mismatch');
  }
  next.state='active';
  next.last_heartbeat_at=observed_at;
  next.updated_at=observed_at;
  next.history.push(receipt('heartbeat',{
    device_id:next.device_id,
    state:'active',
    capability_manifest_hash:next.capability_manifest_hash,
    observed_at,
  }));
  return next;
}

export function evaluateAmbientTrust(record,{
  now=new Date(),
  heartbeat_grace_multiplier=2,
}={}){
  const next=clone(record);
  if(!VALID_STATES.has(next.state)) throw new Error('ambient_trust_state_invalid');
  if(next.state==='revoked') return {eligible:false,state:'revoked',reason:'revoked',record:next};

  const nowMs=now instanceof Date?now.getTime():Date.parse(String(now));
  const expiry=Date.parse(String(next.authorization_expires_at||''));
  if(Number.isFinite(expiry)&&nowMs>=expiry){
    next.state='expired';
    return {eligible:false,state:'expired',reason:'authorization_expired',record:next};
  }
  if(!['authorized','active','degraded'].includes(next.state)){
    return {eligible:false,state:next.state,reason:'not_authorized',record:next};
  }
  if(!next.last_heartbeat_at){
    return {eligible:false,state:'authorized',reason:'first_heartbeat_required',record:next};
  }
  const heartbeatMs=Date.parse(next.last_heartbeat_at);
  const targetMs=Math.max(10000,Number(next.heartbeat_target_seconds||300)*1000);
  const maxAge=targetMs*Math.max(1,Number(heartbeat_grace_multiplier||2));
  const age=Math.max(0,nowMs-heartbeatMs);
  if(age>maxAge){
    next.state='degraded';
    return {eligible:false,state:'degraded',reason:'heartbeat_stale',heartbeat_age_ms:age,record:next};
  }
  next.state='active';
  return {eligible:true,state:'active',reason:'authorized_fresh',heartbeat_age_ms:age,record:next};
}

export function revokeAmbientDevice(record,{
  approval_ref,
  reason='operator_revoked',
  revoked_at=new Date().toISOString(),
}={}){
  const next=clone(record);
  const approval=clean(approval_ref);
  if(!approval) throw new Error('ambient_device_revocation_approval_required');
  next.state='revoked';
  next.revoked_at=revoked_at;
  next.revocation_ref_hash=sha(approval);
  next.updated_at=revoked_at;
  next.history.push(receipt('revoke',{
    device_id:next.device_id,
    state:'revoked',
    reason:clean(reason)||'operator_revoked',
    revocation_ref_hash:next.revocation_ref_hash,
    revoked_at,
  }));
  return next;
}
