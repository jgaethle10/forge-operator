/**
 * Fallen owned-video execution gate. Only an operator-controlled NodeSeed may
 * call this. A signed one-use lease converts a placement intent into a bounded
 * local job. Never accepts a command, URL, private key, or publication authority.
 */
import fs from 'node:fs';
import path from 'node:path';
import {createHash,createPublicKey,verify as cryptoVerify} from 'node:crypto';
import {planOwnedVideoPlacement,OWNED_VIDEO_WORKLOAD} from './owned-video-saban-placement.mjs';

const sha=/^[a-f0-9]{64}$/i;
const assert=(condition,message)=>{if(!condition)throw new Error('owned_video_execution_'+message);};
function stable(value){
  if(Array.isArray(value))return value.map(stable);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,stable(v)]));
  return value;
}
const encode=value=>Buffer.from(JSON.stringify(stable(value)));
const digest=value=>createHash('sha256').update(encode(value)).digest('hex');
const FIELDS=[
  'schema','leaseId','workloadClass','jobId','jobDigest','placementIntentDigest','readinessDigest',
  'taskId','offerId','nodeId','workerBuildDigest','weightsManifestSha256','licenseReceiptId',
  'issuedAt','expiresAt','executionMode','maxExecutions','publicationAuthority','paidComputeAuthorized',
].sort().join('|');

export function makeOwnedVideoLeasePayload({placement,trusted,issuedAt,expiresAt,leaseId}={}){
  assert(placement?.schema==='evercraft.fallen.owned-video-placement-intent.v1'&&placement.state==='placement_ready_no_execution','placement_not_ready');
  assert(/^lease-[a-f0-9]{32}$/.test(leaseId||''),'lease_id_invalid');
  assert(sha.test(trusted?.workerSha256||'')&&sha.test(trusted?.weightsManifestSha256||''),'model_attestation_missing');
  assert(typeof trusted?.nodeId==='string'&&trusted.nodeId.length>=3,'node_binding_missing');
  assert(typeof trusted?.licenseReceiptId==='string'&&trusted.licenseReceiptId.length>5,'license_binding_missing');
  return {
    schema:'evercraft.fallen.owned-video-execution-lease.v1',leaseId,
    workloadClass:OWNED_VIDEO_WORKLOAD,jobId:placement.jobId,jobDigest:placement.jobDigest,
    placementIntentDigest:placement.intentDigest,readinessDigest:placement.readinessDigest,
    taskId:placement.taskId,offerId:placement.offerId,nodeId:trusted.nodeId,
    workerBuildDigest:trusted.workerSha256,weightsManifestSha256:trusted.weightsManifestSha256,
    licenseReceiptId:trusted.licenseReceiptId,issuedAt,expiresAt,
    executionMode:'local-registered-worker-only',maxExecutions:1,
    publicationAuthority:false,paidComputeAuthorized:false,
  };
}

/** Verify signatures against trusted local keys, never keys supplied in a lease. */
export function validateOwnedVideoLease({lease,placement,trusted,ownerPublicKey,systemiaPublicKey,now=new Date()}={}){
  const p=lease?.payload;
  assert(p&&typeof p==='object'&&!Array.isArray(p),'lease_payload_missing');
  assert(Object.keys(p).sort().join('|')===FIELDS,'lease_fields_unexpected');
  assert(p.schema==='evercraft.fallen.owned-video-execution-lease.v1','lease_schema_invalid');
  assert(/^lease-[a-f0-9]{32}$/.test(p.leaseId||''),'lease_id_invalid');
  assert(p.executionMode==='local-registered-worker-only'&&p.maxExecutions===1&&
    p.publicationAuthority===false&&p.paidComputeAuthorized===false,'lease_scope_invalid');
  const expected=makeOwnedVideoLeasePayload({placement,trusted,issuedAt:p.issuedAt,expiresAt:p.expiresAt,leaseId:p.leaseId});
  assert(digest(expected)===digest(p),'lease_binding_mismatch');
  const nowMs=now instanceof Date?now.getTime():Date.parse(String(now));
  const issued=Date.parse(String(p.issuedAt||''));
  const expires=Date.parse(String(p.expiresAt||''));
  assert(Number.isFinite(nowMs)&&Number.isFinite(issued)&&Number.isFinite(expires)&&
    issued<=nowMs+15_000&&nowMs<expires&&expires>issued&&expires-issued<=180_000,'lease_expired_or_too_long');
  assert(ownerPublicKey&&systemiaPublicKey,'signing_keys_missing');
  const owner=ownerPublicKey?.type==='public'?ownerPublicKey:createPublicKey(ownerPublicKey);
  const systemia=systemiaPublicKey?.type==='public'?systemiaPublicKey:createPublicKey(systemiaPublicKey);
  assert(owner.asymmetricKeyType==='ed25519'&&systemia.asymmetricKeyType==='ed25519','non_ed25519_signing_key');
  assert(!owner.export({format:'der',type:'spki'}).equals(systemia.export({format:'der',type:'spki'})),'signer_separation_required');
  const signature=(value,role)=>{
    assert(typeof value==='string'&&/^[A-Za-z0-9+/]+={0,2}$/.test(value),'signature_missing_'+role);
    const raw=Buffer.from(value,'base64');
    assert(raw.length===64&&raw.toString('base64')===value,'signature_encoding_invalid_'+role);
    return raw;
  };
  const payloadBytes=encode(p);
  assert(cryptoVerify(null,payloadBytes,owner,signature(lease.signatures?.owner,'owner')),'owner_signature_invalid');
  assert(cryptoVerify(null,payloadBytes,systemia,signature(lease.signatures?.systemia,'systemia')),'systemia_signature_invalid');
  return {schema:'evercraft.fallen.owned-video-authorization-check.v1',leaseId:p.leaseId,
    placementIntentDigest:p.placementIntentDigest,leaseDigest:digest(p),signaturesVerified:true,
    oneTimeUseRequired:true,publicationAuthority:false,remoteCommandAuthority:false};
}

/**
 * Registered NodeSeed local entrypoint. Caller constructs adapter from pinned
 * local code, NOT from untrusted requests. No auto retries or remote shell.
 */
export async function executeApprovedOwnedVideo({
  job,observation,trusted,offer,lease,ownerPublicKey,systemiaPublicKey,
  adapter,ledgerRoot,now=new Date(),plannedIntent,
}={}){
  assert(path.isAbsolute(ledgerRoot||''),'absolute_ledger_root_required');
  const {observationDigest,...raw}=observation||{};
  // The observation producer hashes JSON.stringify(raw) in original key order.
  assert(sha.test(observationDigest||'')&&createHash('sha256').update(JSON.stringify(raw)).digest('hex')===observationDigest,
    'observation_digest_mismatch');
  const issued=Date.parse(String(lease?.payload?.issuedAt||''));
  assert(Number.isFinite(issued),'lease_issued_at_invalid');
  // Saban placement digests include generated_at: rebuild the signed plan
  // at issue time and separately prove the placement is still eligible NOW.
  const placement=planOwnedVideoPlacement({job,observation,trusted,offer,now:new Date(issued)});
  const fresh=planOwnedVideoPlacement({job,observation,trusted,offer,now});
  assert(placement.state==='placement_ready_no_execution'&&fresh.state==='placement_ready_no_execution','fresh_placement_not_ready');
  assert(placement.jobDigest===fresh.jobDigest&&placement.offerId===fresh.offerId&&
    placement.readinessDigest===fresh.readinessDigest,'placement_drift');
  if(plannedIntent)assert(plannedIntent.intentDigest===placement.intentDigest,'planned_placement_changed');
  const check=validateOwnedVideoLease({lease,placement,trusted,ownerPublicKey,systemiaPublicKey,now});
  assert(adapter?.id==='evercraft-local-owned-video-v1'&&adapter.verified===true&&
    adapter.modelId==='evercraft:owned-video-v1'&&adapter.providerId==='evercraft-local'&&
    typeof adapter.execute==='function','registered_attested_adapter_required');
  assert(trusted?.boundOfferId===placement.offerId&&trusted?.nodeId===offer?.metadata?.device_id,'node_offer_binding_invalid');

  const root=path.resolve(ledgerRoot);
  fs.mkdirSync(root,{recursive:true,mode:0o700});
  assert(fs.realpathSync(root)===root,'ledger_root_symlink_rejected');
  const folder=path.join(root,lease.payload.leaseId);
  try{fs.mkdirSync(folder,{mode:0o700});}
  catch(error){if(error?.code==='EEXIST')throw new Error('owned_video_execution_lease_already_used');throw error;}
  fs.writeFileSync(path.join(folder,'admission.json'),JSON.stringify({
    check,jobId:job.id,admittedAt:new Date(now).toISOString(),publicationAuthority:false,
  },null,2),{mode:0o600,flag:'wx'});
  try{
    const result=await adapter.execute(job);
    assert(result?.schema==='evercraft.fallen.visual-execution-receipt.v1'&&
      result.jobId===job.id&&result.requestId===job.requestId&&result.needId===job.needId&&
      result.modelId===job.modelId&&result.providerId===job.providerId&&
      result.continuityDigest===job.continuityDigest,'worker_receipt_binding_invalid');
    assert(result.commercialRights==='allowed'&&result.provenance==='complete'&&
      sha.test(result.artifact?.digest||''),'worker_result_unadmitted');
    const candidate=result.artifact?.path;
    assert(typeof candidate==='string'&&path.isAbsolute(candidate),'candidate_artifact_path_invalid');
    let stat;try{stat=fs.lstatSync(candidate);}catch{}
    assert(stat?.isFile()&&!stat?.isSymbolicLink(),'candidate_artifact_missing_or_symlink');
    assert(createHash('sha256').update(fs.readFileSync(candidate)).digest('hex')===result.artifact.digest,
      'candidate_artifact_digest_mismatch');
    assert(result.sourceRefs?.includes('owned-weights-sha256:'+trusted.weightsManifestSha256)&&
      result.sourceRefs?.includes('owned-worker-sha256:'+trusted.workerSha256),'worker_evidence_binding_invalid');
    const receipt={schema:'evercraft.fallen.owned-video-lease-execution-receipt.v1',
      state:'produced_candidate_for_tournament',jobId:job.id,leaseId:lease.payload.leaseId,
      artifactDigest:result.artifact.digest,offerId:placement.offerId,nodeId:trusted.nodeId,
      intentDigest:placement.intentDigest,executionAuthorized:true,publicationAuthority:false,
      deliveryAuthority:false,paymentAuthority:false,finishedAt:new Date().toISOString()};
    fs.writeFileSync(path.join(folder,'receipt.json'),JSON.stringify(receipt,null,2),{mode:0o600,flag:'wx'});
    return {receipt,candidate:result};
  }catch(error){
    fs.writeFileSync(path.join(folder,'failure.json'),JSON.stringify({
      schema:'evercraft.fallen.owned-video-execution-failure.v1',state:'held',
      reason:error instanceof Error?error.message:String(error),publicationAuthority:false,
    },null,2),{mode:0o600});
    throw error;
  }
}
