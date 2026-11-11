#!/usr/bin/env node
/**
 * Evercraft MicroSeed on-node signed evidence field proof v1.
 *
 * Read-only default: inspect EXISTING bootstrap + loopback signed telemetry.
 * --hash-probe: expressly execute one registered local content-hash workload,
 * then reopen and independently verify its private signed journal entry.
 *
 * No bootstrap, service start, new listener, grant, authorization mutation,
 * remote host, shell command, payment or user data upload.
 */
import { createHash, createPublicKey, randomUUID } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { normalizeMicroDeviceManifest } from './microseed-device-bridge.mjs';
import { normalizeMicroSeedExecutionRequest } from './microseed-executor.mjs';
import { verifyMicroSeedExecutionReceipt } from './microseed-receipt-signature.mjs';
import { verifyMicroSeedTelemetry } from './microseed-telemetry-signature.mjs';
import { readSignedMicroSeedReceipt } from './microseed-signed-receipt-store.mjs';
import { loadActiveAmbientReceiptKeys } from '../control-plane/visualization/ambient-receipt-trust.mjs';

const SCHEMA='evercraft.microseed.local-field-proof.v1';
const WORKLOAD='systemia.content-hash.v1';
const MAX_BYTES=256*1024;
const sha=x=>'sha256:'+createHash('sha256').update(x).digest('hex');
function demand(ok,why){if(!ok)throw Error('field_proof_'+why);}
const isObject=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);

async function safeFile(file,limit=MAX_BYTES){
  const stat=await lstat(file);
  demand(stat.isFile()&&!stat.isSymbolicLink()&&stat.size>0&&stat.size<=limit,'file_unsafe');
  demand((stat.mode&0o077)===0,'file_permissions_unsafe');
  demand(await realpath(file)===file,'file_redirected');
  const body=await readFile(file,'utf8');
  demand(Buffer.byteLength(body)<=limit,'file_too_large');
  return body;
}
async function safeRoot(root){
  demand(typeof root==='string'&&root.length>0,'root_required');
  const full=resolve(root);
  const stat=await lstat(full);
  demand(stat.isDirectory()&&!stat.isSymbolicLink()&&
    (stat.mode&0o022)===0,'root_unsafe');
  demand(await realpath(full)===full,'root_redirected');
  return full;
}
function loopbackOrigin(value){
  let url;try{url=new URL(value)}catch{throw Error('field_proof_endpoint_invalid')}
  demand(url.protocol==='http:'&&
    (url.hostname==='127.0.0.1'||url.hostname==='[::1]')&&
    url.pathname==='/'&&!url.search&&!url.hash&&
    !url.username&&!url.password,'loopback_only');
  return url;
}
async function boundedJson(response){
  demand(response&&typeof response.status==='number','response_invalid');
  const body=await response.text();
  demand(Buffer.byteLength(body)<=MAX_BYTES,'response_too_large');
  try{return JSON.parse(body)}catch{throw Error('field_proof_response_not_json')}
}
async function call(origin,path,{method='GET',token='',request,fetchImpl}={}){
  const headers={accept:'application/json'};
  if(token)headers.authorization='Bearer '+token;
  if(method==='POST')headers['content-type']='application/json';
  const reply=await fetchImpl(new URL(path,origin),{
    method,headers,
    ...(method==='POST'?{body:JSON.stringify(request)}:{}),
    signal:AbortSignal.timeout(10000),
  });
  const body=await boundedJson(reply);
  demand(reply.status===200,'http_'+reply.status);
  demand(isObject(body)&&body.ok===true,'agent_result_not_ok');
  return body;
}
function signingChecks(body,publicKey,deviceId,keyId){
  const verification=verifyMicroSeedExecutionReceipt(body,{
    publicKey,expected_device_id:deviceId,
  });
  demand(verification.verified===true&&verification.key_id===keyId,'receipt_signature_invalid');
}
function result({
  mode,telemetryPassed=false,registryPassed=false,hashPassed=false,
  journalPassed=false
}){
  return {
    schema:SCHEMA,ok:true,mode,
    proof_origin:'operator_local_process_not_remote_hardware_attestation',
    manifest_identity_bound:true,
    loopback_only:true,
    signed_telemetry_verified:telemetryPassed,
    ambient_registry_current_trust_verified:registryPassed,
    content_hash_probe_verified:hashPassed,
    private_signed_journal_reopened:journalPassed,
    passport_access_verified:false,
    actual_physical_hardware_attested:false,
    downstream_effect_verified:false,
    delivery_verified:false,
    payment_verified:false,
    execution_authority_granted:false,
    device_identifiers_exported:false,
    credentials_exported:false,
  };
}

/** Intended to run ON the owner-controlled machine, not in a hosted browser. */
export async function inspectLocalMicroSeedEvidence({
  root=join(homedir(),'.local/state/evercraft/microseed'),
  ambientRegistryRoot=null,
  hashProbe=false,
  fetchImpl=fetch,
  now=new Date(),
}={}){
  const at=now instanceof Date?now:new Date(now);
  demand(Number.isFinite(at.getTime()),'clock_invalid');
  demand(typeof fetchImpl==='function','fetch_required');
  const base=await safeRoot(root);
  const manifest=JSON.parse(await safeFile(join(base,'manifest.json')));
  demand(manifest?.schema==='evercraft.microseed.device-manifest.v1'&&
    manifest.bridge_mode==='native_agent'&&
    manifest.compute_execution_mode==='native_device'&&
    manifest.attestation?.receipt_signing_required===true&&
    manifest.attestation?.telemetry_signing_required===true,
    'signed_native_manifest_required');
  demand(normalizeMicroDeviceManifest(manifest).manifest_hash===manifest.manifest_hash,
    'manifest_integrity_invalid');
  const identityRoot=await safeRoot(join(base,'identity'));
  const identity=JSON.parse(await safeFile(join(identityRoot,'identity.json')));
  const publicPem=await safeFile(join(identityRoot,'current-public.pem'),8192);
  demand(identity.schema==='evercraft.microseed.device-identity.v1'&&
    identity.device_id===manifest.device_id&&
    manifest.attestation.receipt_key_id===identity.key_id&&
    manifest.attestation.receipt_public_key_pem===publicPem&&
    identity.public_key_fingerprint===sha(publicPem)&&
    manifest.attestation.device_identity===identity.public_key_fingerprint,
    'pinned_identity_mismatch');
  const publicKey=createPublicKey(publicPem);
  demand(publicKey.asymmetricKeyType==='ed25519','signer_not_ed25519');
  const origin=loopbackOrigin(manifest.endpoint);
  let registryPassed=false;
  if(ambientRegistryRoot!==null){
    const anchors=await loadActiveAmbientReceiptKeys({
      ambientRegistryRoot,deviceIds:[manifest.device_id],now:at,
    });
    const pinned=anchors[identity.key_id];
    demand(pinned?.device_id===manifest.device_id&&
      pinned.public_key_pem===publicPem&&
      pinned.manifest_hash===manifest.manifest_hash&&
      pinned.allowed_workload_classes.includes(WORKLOAD),
      'registry_manifest_mismatch');
    registryPassed=true;
  }
  const token=await safeFile(join(base,'secrets','agent-token'),4096);
  demand(token.trim().length>=32,'token_missing');
  const health=await call(origin,'/health',{fetchImpl});
  demand(health.schema==='evercraft.microseed.native-agent-health.v1'&&
    health.device_id===manifest.device_id&&
    health.signed_receipts_required===true&&health.signed_receipts_enabled===true&&
    health.signed_telemetry_required===true&&health.signed_telemetry_enabled===true&&
    health.arbitrary_code_execution===false,'agent_health_mismatch');

  const telemetry=await call(origin,'/v1/telemetry',{fetchImpl,token:token.trim()});
  const tCheck=verifyMicroSeedTelemetry(telemetry,{
    publicKey,expected_device_id:manifest.device_id,
  });
  demand(tCheck.verified===true&&tCheck.key_id===identity.key_id,
    'telemetry_signature_invalid');
  const observed=Date.parse(telemetry.telemetry?.observed_at||'');
  demand(Number.isFinite(observed)&&
    observed<=Date.now()+120000&&Date.now()-observed<=120000,
    'telemetry_not_recent');
  if(!hashProbe)return result({mode:'signed_telemetry_only',telemetryPassed:true,registryPassed});

  demand(manifest.supported_workloads?.includes(WORKLOAD),'content_hash_not_declared');
  // Explicit opt-in: one deterministic, local, low-cost registered workload.
  const nonce=randomUUID();
  const key='on-node-proof-'+nonce;
  const value='Evercraft signed field proof '+nonce;
  const request={
    device_id:manifest.device_id,workload_class:WORKLOAD,
    idempotency_key:key,payload:{value},
    requested_memory_mb:0,requested_cpu_fraction:0,
  };
  const expectedRequestHash=normalizeMicroSeedExecutionRequest(request).request_hash;
  const expectedDigest=sha(JSON.stringify(value));
  const response=await call(origin,'/v1/execute',{
    method:'POST',fetchImpl,token:token.trim(),request:{request},
  });
  signingChecks(response,publicKey,manifest.device_id,identity.key_id);
  demand(response.workload_class===WORKLOAD&&
    response.idempotency_key===key&&
    response.request_hash===expectedRequestHash&&
    response.manifest_hash===manifest.manifest_hash&&
    response.result?.ok===true&&
    response.result?.algorithm==='sha256'&&
    response.result?.digest===expectedDigest&&
    response.result?.byte_count===Buffer.byteLength(JSON.stringify(value))&&
    response.execution_location==='device'&&
    response.arbitrary_code_execution===false&&
    response.external_cash_spend_usd===0&&
    response.deduplicated===false,'hash_probe_result_mismatch');

  const persisted=await readSignedMicroSeedReceipt({
    stateDir:join(base,'state'),device_id:manifest.device_id,
    idempotency_key:key,
  });
  signingChecks(persisted,publicKey,manifest.device_id,identity.key_id);
  demand(persisted.receipt_hash===response.receipt_hash&&
    persisted.request_hash===response.request_hash&&
    persisted.manifest_hash===response.manifest_hash&&
    persisted.device_signature.signature_base64===response.device_signature.signature_base64&&
    persisted.result?.digest===expectedDigest,'signed_journal_mismatch');
  if(ambientRegistryRoot!==null){
    // A revocation or key rotation during this probe must fail before disclosure.
    const current=await loadActiveAmbientReceiptKeys({
      ambientRegistryRoot,deviceIds:[manifest.device_id],now:new Date(),
    });
    demand(current[identity.key_id]?.manifest_hash===manifest.manifest_hash&&
      current[identity.key_id]?.public_key_pem===publicPem,
      'registry_changed_during_probe');
  }
  return result({
    mode:'one_registered_hash_and_signed_journal',
    telemetryPassed:true,registryPassed,
    hashPassed:true,journalPassed:true,
  });
}

async function main(){
  if(process.argv.includes('--help')){
    console.log('node systemia/saban/microseed-local-field-proof.mjs [--root PATH] [--ambient-registry-root PATH] [--hash-probe]');
    console.log('Default verifies existing local bootstrap, signed telemetry and loopback agent only. --hash-probe explicitly runs ONE registered local content hash and verifies its signed journal.');
    return;
  }
  const argv=process.argv.slice(2);
  const options={};
  for(let i=0;i<argv.length;i++){
    const flag=argv[i];
    if(flag==='--hash-probe'){options.hashProbe=true;continue}
    if(flag==='--root'||flag==='--ambient-registry-root'){
      const value=argv[++i];
      demand(value&&!value.startsWith('--'),'flag_value_required');
      options[flag==='--root'?'root':'ambientRegistryRoot']=value;
      continue;
    }
    throw Error('field_proof_flag_invalid');
  }
  const output=await inspectLocalMicroSeedEvidence(options);
  process.stdout.write(JSON.stringify(output)+'\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  main().catch(e=>{
    const reason=String(e?.message||'unknown');
    const safe=/^field_proof_[a-z0-9_]+$/.test(reason)?reason:'field_proof_incomplete_or_unavailable';
    process.stdout.write(JSON.stringify({
      schema:SCHEMA,ok:false,state:'held',reason:safe,
      physical_hardware_attested:false,downstream_effect_verified:false,
      credentials_exported:false,
    })+'\n');
    process.exitCode=1;
  });
}
