import fs from 'node:fs';
import path from 'node:path';
import {
  createHash,
  randomBytes,
  createCipheriv,
  createDecipheriv,
  sign as cryptoSign,
  verify as cryptoVerify,
} from 'node:crypto';
import { normalizeMicroDeviceManifest } from './microseed-device-bridge.mjs';

const clean=v=>String(v??'').trim();
const shaHex=v=>createHash('sha256').update(v).digest('hex');
const sha=v=>'sha256:'+shaHex(
  typeof v==='string'||Buffer.isBuffer(v)?v:Buffer.from(JSON.stringify(v))
);
function stable(value){
  if(Array.isArray(value)) return value.map(stable);
  if(value&&typeof value==='object'){
    return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])]));
  }
  return value;
}
const canonical=value=>Buffer.from(JSON.stringify(stable(value)));
function safeId(v){
  const id=clean(v).replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,180);
  if(!id) throw new Error('microseed_pairing_id_required');
  return id;
}
function atomicWrite(file,content,mode=0o600){
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  const tmp=file+'.'+process.pid+'.'+randomBytes(4).toString('hex')+'.tmp';
  fs.writeFileSync(tmp,content,{mode});
  fs.renameSync(tmp,file);
  fs.chmodSync(file,mode);
}
function atomicJson(file,value){atomicWrite(file,JSON.stringify(value,null,2)+'\n',0o600);}
function pairingDirs(stateDir){
  const root=path.resolve(stateDir);
  return {
    root,
    tickets:path.join(root,'pairing','tickets'),
    secrets:path.join(root,'pairing','secrets'),
    consumed:path.join(root,'pairing','consumed'),
    deviceTokens:path.join(root,'.secrets','device-tokens'),
  };
}
function derivePairingKey(secret){
  return createHash('sha256').update('evercraft-microseed-pairing-v1|'+secret).digest();
}
function aadFor({ticket_id,device_id,manifest_hash}){
  return Buffer.from([ticket_id,device_id,manifest_hash].join('|'));
}
function encryptCredential({secret,ticket_id,device_id,manifest_hash,device_token}){
  const iv=randomBytes(12);
  const cipher=createCipheriv('aes-256-gcm',derivePairingKey(secret),iv);
  cipher.setAAD(aadFor({ticket_id,device_id,manifest_hash}));
  const ciphertext=Buffer.concat([cipher.update(String(device_token),'utf8'),cipher.final()]);
  return {
    schema:'evercraft.microseed.pairing-credential-envelope.v1',
    algorithm:'A256GCM',
    iv_base64:iv.toString('base64'),
    tag_base64:cipher.getAuthTag().toString('base64'),
    ciphertext_base64:ciphertext.toString('base64'),
  };
}
function decryptCredential({secret,bundle}){
  const env=bundle.credential_envelope;
  if(env?.schema!=='evercraft.microseed.pairing-credential-envelope.v1'||env.algorithm!=='A256GCM'){
    throw new Error('microseed_pairing_credential_envelope_invalid');
  }
  const decipher=createDecipheriv(
    'aes-256-gcm',
    derivePairingKey(secret),
    Buffer.from(env.iv_base64,'base64')
  );
  decipher.setAAD(aadFor({
    ticket_id:bundle.ticket_id,
    device_id:bundle.device_id,
    manifest_hash:bundle.manifest?.manifest_hash,
  }));
  decipher.setAuthTag(Buffer.from(env.tag_base64,'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(env.ciphertext_base64,'base64')),
    decipher.final(),
  ]).toString('utf8');
}

function pairingDisplayCode({ticket_id,pairing_secret}){
  const digest=shaHex(String(ticket_id)+'|'+String(pairing_secret)).toUpperCase();
  return ['PAIR',digest.slice(0,4),digest.slice(4,8),digest.slice(8,12)].join('-');
}
function validateEnrollmentUrl(value){
  const raw=clean(value);
  if(!raw) return '';
  let url;
  try{url=new URL(raw);}catch{throw new Error('microseed_pairing_enrollment_url_invalid');}
  const loopback=['127.0.0.1','localhost','::1'].includes(url.hostname.toLowerCase());
  if(url.protocol!=='https:'&&!(url.protocol==='http:'&&loopback)){
    throw new Error('microseed_pairing_enrollment_url_https_required');
  }
  if(url.username||url.password) throw new Error('microseed_pairing_enrollment_url_credentials_forbidden');
  return url.toString();
}
function pairingUri({ticket_id,pairing_secret,expires_at,enrollment_url}){
  const q=new URLSearchParams({
    ticket:ticket_id,
    secret:pairing_secret,
    expires:expires_at,
  });
  if(enrollment_url) q.set('enroll',enrollment_url);
  return 'evercraft://microseed/pair?'+q.toString();
}
export function formatMicroSeedPairingTicket(issue={}){
  if(issue?.schema!=='evercraft.microseed.pairing-ticket-issue.v1'){
    throw new Error('microseed_pairing_issue_receipt_required');
  }
  const displayCode=pairingDisplayCode(issue);
  const uri=pairingUri(issue);
  return {
    schema:'evercraft.microseed.pairing-ticket-card.v1',
    ticket_id:issue.ticket_id,
    display_code:displayCode,
    pairing_uri:uri,
    expires_at:issue.expires_at,
    enrollment_url:issue.enrollment_url||null,
    device_id:issue.device_id||null,
    allowed_device_classes:issue.allowed_device_classes||[],
    allowed_workloads:issue.allowed_workloads||[],
    single_use:true,
    explicit_owner_approval_required:true,
    secret_exposed_in_pairing_uri:true,
    safe_to_publish:false,
    card_text:[
      'EVERCRAFT MICROSEED PAIRING TICKET',
      'Code: '+displayCode,
      'Ticket: '+issue.ticket_id,
      'Expires: '+issue.expires_at,
      issue.device_id?'Device: '+issue.device_id:'Device: any device allowed by this ticket',
      'Classes: '+((issue.allowed_device_classes||[]).join(', ')||'ticket policy'),
      'Workloads: '+((issue.allowed_workloads||[]).join(', ')||'ticket policy'),
      issue.enrollment_url?'Enrollment return: '+issue.enrollment_url:'Enrollment return: local/import required',
      'PAIR THIS DEVICE:',
      uri,
      'Single use. Treat this pairing URI like a password until consumed or expired.',
    ].join('\n'),
  };
}

export function parseMicroSeedPairingUri(value){
  const raw=clean(value);
  let url;
  try{url=new URL(raw);}catch{throw new Error('microseed_pairing_uri_invalid');}
  if(url.protocol!=='evercraft:'||url.hostname!=='microseed'||url.pathname!=='/pair'){
    throw new Error('microseed_pairing_uri_invalid');
  }
  const ticket_id=clean(url.searchParams.get('ticket'));
  const pairing_secret=clean(url.searchParams.get('secret'));
  const expires_at=clean(url.searchParams.get('expires'));
  const enrollment_url=clean(url.searchParams.get('enroll'));
  if(!ticket_id||!pairing_secret||!expires_at){
    throw new Error('microseed_pairing_uri_fields_missing');
  }
  return {
    ticket_id,
    pairing_secret,
    expires_at,
    enrollment_url:enrollment_url?validateEnrollmentUrl(enrollment_url):'',
  };
}

function ticketFile(dirs,id){return path.join(dirs.tickets,safeId(id)+'.json');}
function secretFile(dirs,id){return path.join(dirs.secrets,safeId(id)+'.secret');}
function consumedFile(dirs,id){return path.join(dirs.consumed,safeId(id)+'.json');}

export function issueMicroSeedPairingTicket({
  stateDir,
  approval_ref,
  device_id=null,
  allowed_device_classes=[],
  allowed_workloads=[],
  ttl_ms=15*60*1000,
  enrollment_url='',
  now=new Date(),
}={}){
  if(!stateDir) throw new Error('microseed_pairing_state_dir_required');
  if(!clean(approval_ref)) throw new Error('microseed_pairing_explicit_approval_ref_required');
  const dirs=pairingDirs(stateDir);
  for(const dir of Object.values(dirs).slice(1)) fs.mkdirSync(dir,{recursive:true,mode:0o700});

  const at=now instanceof Date?now:new Date(now);
  const secret=randomBytes(32).toString('base64url');
  const ticketId='mpair-'+randomBytes(12).toString('hex');
  const record={
    schema:'evercraft.microseed.pairing-ticket.v1',
    ticket_id:ticketId,
    approval_ref_hash:sha(clean(approval_ref)),
    approval_ref:clean(approval_ref),
    device_id:device_id?clean(device_id):null,
    allowed_device_classes:[...new Set((allowed_device_classes||[]).map(clean).filter(Boolean))],
    allowed_workloads:[...new Set((allowed_workloads||[]).map(clean).filter(Boolean))],
    enrollment_url:validateEnrollmentUrl(enrollment_url),
    issued_at:at.toISOString(),
    expires_at:new Date(at.getTime()+Math.max(60_000,Number(ttl_ms||0))).toISOString(),
    consumed_at:null,
    explicit_owner_approval_required:true,
    authorization_granted_by_ticket:true,
    active_probe_allowed:false,
    secret_hash:sha(secret),
    secret_value_persisted_separately:true,
  };
  atomicJson(ticketFile(dirs,ticketId),record);
  atomicWrite(secretFile(dirs,ticketId),secret+'\n',0o600);

  const issue={
    schema:'evercraft.microseed.pairing-ticket-issue.v1',
    ticket_id:ticketId,
    pairing_secret:secret,
    pairing_secret_exposed_once:true,
    approval_ref_hash:record.approval_ref_hash,
    device_id:record.device_id,
    allowed_device_classes:record.allowed_device_classes,
    allowed_workloads:record.allowed_workloads,
    enrollment_url:record.enrollment_url||'',
    expires_at:record.expires_at,
    authorization_granted:false,
    device_credential_created:false,
  };
  return {...issue,ticket_card:formatMicroSeedPairingTicket(issue)};
}


export function listMicroSeedPairingTickets({
  stateDir,
  now=new Date(),
  include_expired=false,
}={}){
  if(!stateDir) throw new Error('microseed_pairing_state_dir_required');
  const dirs=pairingDirs(stateDir);
  fs.mkdirSync(dirs.tickets,{recursive:true,mode:0o700});
  fs.mkdirSync(dirs.consumed,{recursive:true,mode:0o700});
  const nowMs=now instanceof Date?now.getTime():Date.parse(String(now));
  const tickets=fs.readdirSync(dirs.tickets)
    .filter(name=>name.endsWith('.json'))
    .map(name=>JSON.parse(fs.readFileSync(path.join(dirs.tickets,name),'utf8')))
    .map(ticket=>({
      schema:ticket.schema,
      ticket_id:ticket.ticket_id,
      display_code:null,
      device_id:ticket.device_id,
      allowed_device_classes:ticket.allowed_device_classes||[],
      allowed_workloads:ticket.allowed_workloads||[],
      enrollment_url:ticket.enrollment_url||null,
      issued_at:ticket.issued_at,
      expires_at:ticket.expires_at,
      expired:nowMs>=Date.parse(ticket.expires_at),
      pairing_secret_exposed:false,
      safe_to_publish:false,
    }))
    .filter(ticket=>include_expired||!ticket.expired)
    .sort((a,b)=>a.expires_at.localeCompare(b.expires_at));
  return {
    schema:'evercraft.microseed.pairing-ticket-list.v1',
    active_count:tickets.filter(x=>!x.expired).length,
    ticket_count:tickets.length,
    tickets,
    pairing_secrets_exposed:false,
  };
}

export function showMicroSeedPairingTicket({
  stateDir,
  ticket_id,
  now=new Date(),
}={}){
  if(!stateDir) throw new Error('microseed_pairing_state_dir_required');
  const dirs=pairingDirs(stateDir);
  const tf=ticketFile(dirs,ticket_id);
  const sf=secretFile(dirs,ticket_id);
  if(fs.existsSync(consumedFile(dirs,ticket_id))){
    throw new Error('microseed_pairing_ticket_already_consumed');
  }
  if(!fs.existsSync(tf)||!fs.existsSync(sf)){
    throw new Error('microseed_pairing_ticket_not_found');
  }
  const record=JSON.parse(fs.readFileSync(tf,'utf8'));
  const nowMs=now instanceof Date?now.getTime():Date.parse(String(now));
  if(nowMs>=Date.parse(record.expires_at)) throw new Error('microseed_pairing_ticket_expired');
  const secret=fs.readFileSync(sf,'utf8').trim();
  if(record.secret_hash!==sha(secret)) throw new Error('microseed_pairing_ticket_secret_integrity_failed');
  return formatMicroSeedPairingTicket({
    schema:'evercraft.microseed.pairing-ticket-issue.v1',
    ticket_id:record.ticket_id,
    pairing_secret:secret,
    pairing_secret_exposed_once:false,
    approval_ref_hash:record.approval_ref_hash,
    device_id:record.device_id,
    allowed_device_classes:record.allowed_device_classes,
    allowed_workloads:record.allowed_workloads,
    enrollment_url:record.enrollment_url||'',
    expires_at:record.expires_at,
    authorization_granted:false,
    device_credential_created:false,
  });
}

export function revokeMicroSeedPairingTicket({
  stateDir,
  ticket_id,
  reason='operator_revoked',
  now=new Date(),
}={}){
  if(!stateDir) throw new Error('microseed_pairing_state_dir_required');
  const dirs=pairingDirs(stateDir);
  const tf=ticketFile(dirs,ticket_id);
  const sf=secretFile(dirs,ticket_id);
  if(fs.existsSync(consumedFile(dirs,ticket_id))){
    throw new Error('microseed_pairing_ticket_already_consumed');
  }
  if(!fs.existsSync(tf)) throw new Error('microseed_pairing_ticket_not_found');
  const record=JSON.parse(fs.readFileSync(tf,'utf8'));
  const receipt={
    schema:'evercraft.microseed.pairing-revoked.v1',
    ticket_id:record.ticket_id,
    device_id:record.device_id,
    reason:clean(reason)||'operator_revoked',
    pairing_secret_destroyed:true,
    authorization_granted:false,
    device_credential_created:false,
    revoked_at:(now instanceof Date?now:new Date(now)).toISOString(),
  };
  const revokedDir=path.join(dirs.root,'pairing','revoked');
  fs.mkdirSync(revokedDir,{recursive:true,mode:0o700});
  atomicJson(path.join(revokedDir,safeId(record.ticket_id)+'.json'),receipt);
  fs.rmSync(sf,{force:true});
  fs.rmSync(tf,{force:true});
  return receipt;
}

function enrollmentSigningBody(bundle){
  return {
    schema:bundle.schema,
    ticket_id:bundle.ticket_id,
    device_id:bundle.device_id,
    manifest:bundle.manifest,
    credential_envelope:bundle.credential_envelope,
    request_nonce:bundle.request_nonce,
    created_at:bundle.created_at,
  };
}

export function createMicroSeedEnrollmentBundle({
  manifest,
  privateKey,
  ticket_id,
  pairing_secret,
  device_token,
  now=new Date(),
}={}){
  if(manifest?.schema!=='evercraft.microseed.device-manifest.v1'){
    throw new Error('microseed_pairing_manifest_required');
  }
  if(!privateKey) throw new Error('microseed_pairing_private_key_required');
  if(!clean(ticket_id)||!clean(pairing_secret)||!clean(device_token)){
    throw new Error('microseed_pairing_ticket_secret_and_device_token_required');
  }
  const expectedAuth=sha(clean(ticket_id));
  if(manifest.authorization_ref_hash!==expectedAuth){
    throw new Error('microseed_pairing_manifest_not_bound_to_ticket');
  }
  const publicKey=manifest.attestation?.receipt_public_key_pem;
  if(!publicKey) throw new Error('microseed_pairing_manifest_public_key_required');

  const credential=encryptCredential({
    secret:clean(pairing_secret),
    ticket_id:clean(ticket_id),
    device_id:manifest.device_id,
    manifest_hash:manifest.manifest_hash,
    device_token:clean(device_token),
  });
  const body={
    schema:'evercraft.microseed.enrollment-bundle.v1',
    ticket_id:clean(ticket_id),
    device_id:manifest.device_id,
    manifest,
    credential_envelope:credential,
    request_nonce:randomBytes(18).toString('hex'),
    created_at:(now instanceof Date?now:new Date(now)).toISOString(),
  };
  const payload=canonical(enrollmentSigningBody(body));
  const signature=cryptoSign(null,payload,privateKey);
  return {
    ...body,
    device_signature:{
      schema:'evercraft.microseed.enrollment-signature.v1',
      algorithm:'Ed25519',
      key_id:manifest.attestation?.receipt_key_id||null,
      payload_sha256:sha(payload),
      signature_base64:signature.toString('base64'),
    },
    device_token_exposed:false,
    pairing_secret_exposed:false,
  };
}

export function verifyMicroSeedEnrollmentBundle(bundle,{now=new Date()}={}){
  if(bundle?.schema!=='evercraft.microseed.enrollment-bundle.v1'){
    return {verified:false,reason:'enrollment_bundle_schema_invalid'};
  }
  if(bundle.device_id!==bundle.manifest?.device_id){
    return {verified:false,reason:'enrollment_device_manifest_mismatch'};
  }
  const sig=bundle.device_signature;
  if(sig?.schema!=='evercraft.microseed.enrollment-signature.v1'||sig.algorithm!=='Ed25519'){
    return {verified:false,reason:'enrollment_signature_missing_or_invalid'};
  }
  const publicKey=bundle.manifest?.attestation?.receipt_public_key_pem;
  if(!publicKey) return {verified:false,reason:'enrollment_public_key_missing'};
  const payload=canonical(enrollmentSigningBody(bundle));
  if(sig.payload_sha256!==sha(payload)){
    return {verified:false,reason:'enrollment_payload_hash_mismatch'};
  }
  let verified=false;
  try{
    verified=cryptoVerify(null,payload,publicKey,Buffer.from(sig.signature_base64,'base64'));
  }catch{
    return {verified:false,reason:'enrollment_signature_verification_error'};
  }
  if(!verified) return {verified:false,reason:'enrollment_signature_invalid'};
  const created=Date.parse(String(bundle.created_at||''));
  const nowMs=now instanceof Date?now.getTime():Date.parse(String(now));
  if(!Number.isFinite(created)||Math.abs(nowMs-created)>30*60*1000){
    return {verified:false,reason:'enrollment_bundle_stale'};
  }
  return {
    verified:true,
    reason:'verified',
    device_id:bundle.device_id,
    manifest_hash:bundle.manifest.manifest_hash,
    key_id:sig.key_id||null,
    payload_sha256:sig.payload_sha256,
  };
}

export function consumeMicroSeedPairingBundle({
  stateDir,
  registry,
  bundle,
  now=new Date(),
}={}){
  if(!stateDir||!registry) throw new Error('microseed_pairing_state_and_registry_required');
  const dirs=pairingDirs(stateDir);
  const ticketId=clean(bundle?.ticket_id);
  if(!ticketId) throw new Error('microseed_pairing_ticket_id_required');
  if(fs.existsSync(consumedFile(dirs,ticketId))) throw new Error('microseed_pairing_ticket_already_consumed');

  const tf=ticketFile(dirs,ticketId);
  const sf=secretFile(dirs,ticketId);
  if(!fs.existsSync(tf)||!fs.existsSync(sf)) throw new Error('microseed_pairing_ticket_not_found');
  const ticket=JSON.parse(fs.readFileSync(tf,'utf8'));
  const secret=fs.readFileSync(sf,'utf8').trim();
  const at=now instanceof Date?now:new Date(now);
  if(at.getTime()>=Date.parse(ticket.expires_at)) throw new Error('microseed_pairing_ticket_expired');
  if(ticket.secret_hash!==sha(secret)) throw new Error('microseed_pairing_ticket_secret_integrity_failed');

  const verification=verifyMicroSeedEnrollmentBundle(bundle,{now:at});
  if(!verification.verified) throw new Error('microseed_pairing_bundle_rejected:'+verification.reason);

  if(ticket.device_id&&ticket.device_id!==bundle.device_id){
    throw new Error('microseed_pairing_ticket_device_mismatch');
  }
  if(
    ticket.allowed_device_classes?.length &&
    !ticket.allowed_device_classes.includes(bundle.manifest.device_class)
  ) throw new Error('microseed_pairing_device_class_not_allowed');
  const requestedWorkloads=new Set(bundle.manifest.supported_workloads||[]);
  if(ticket.allowed_workloads?.length){
    const allowed=new Set(ticket.allowed_workloads);
    for(const workload of requestedWorkloads){
      if(!allowed.has(workload)) throw new Error('microseed_pairing_workload_not_allowed:'+workload);
    }
  }
  if(bundle.manifest.authorization_ref_hash!==sha(ticketId)){
    throw new Error('microseed_pairing_manifest_ticket_binding_invalid');
  }

  const normalized=normalizeMicroDeviceManifest(bundle.manifest);
  const deviceToken=decryptCredential({secret,bundle});
  if(!clean(deviceToken)) throw new Error('microseed_pairing_decrypted_device_token_empty');

  const tokenFile=path.join(dirs.deviceTokens,safeId(bundle.device_id)+'.token');
  atomicWrite(tokenFile,clean(deviceToken)+'\n',0o600);

  registry.observe({device_id:bundle.device_id,observed_at:bundle.created_at});
  registry.candidate({device_id:bundle.device_id,manifest:normalized});
  registry.authorize({
    device_id:bundle.device_id,
    approval_ref:ticket.approval_ref,
    expires_at:new Date(at.getTime()+30*24*60*60*1000).toISOString(),
    heartbeat_target_seconds:300,
    attestation_mode:normalized.attestation?.mode||'device',
    attestation_identity:
      normalized.attestation?.device_identity||
      normalized.attestation?.receipt_key_id||
      normalized.manifest_hash,
  });
  registry.heartbeat({
    device_id:bundle.device_id,
    capability_manifest_hash:normalized.manifest_hash,
    attestation_identity:
      normalized.attestation?.device_identity||
      normalized.attestation?.receipt_key_id||
      normalized.manifest_hash,
    observed_at:at.toISOString(),
  });

  const consumed={
    schema:'evercraft.microseed.pairing-consumed.v1',
    ticket_id:ticketId,
    device_id:bundle.device_id,
    manifest_hash:normalized.manifest_hash,
    enrollment_signature_verified:true,
    approval_ref_hash:ticket.approval_ref_hash,
    device_token_persisted:true,
    device_token_exposed:false,
    pairing_secret_destroyed:true,
    owner_authorization_source:'explicit_pairing_ticket',
    conformance_required:true,
    calibration_required:true,
    consumed_at:at.toISOString(),
  };
  atomicJson(consumedFile(dirs,ticketId),consumed);
  fs.rmSync(sf,{force:true});
  fs.rmSync(tf,{force:true});
  return consumed;
}
