/**
 * On-host, offline consumer enrollment candidate. Private signing keys never
 * leave the consumer host. This does not update Systemia's operator trust
 * registry and does not grant execution or read authority.
 */
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync } from 'node:crypto';
import { mkdir, lstat, open, readFile, rm } from 'node:fs/promises';
import path from 'node:path';

const idValue = value => typeof value === 'string' && /^[a-zA-Z0-9._:-]{3,96}$/.test(value);
const laneValue = value => typeof value === 'string' && /^[a-z][a-z0-9_]{2,63}$/.test(value);
const sha256 = str => 'sha256:' + createHash('sha256').update(str).digest('hex');

async function privateDir(where) {
  if (typeof where !== 'string' || !where.trim()) throw Error('enrollment_directory_required');
  const resolved=path.resolve(where);
  try {await mkdir(resolved,{mode:0o700});}
  catch(e) {if(e.code!=='EEXIST')throw e;}
  const st=await lstat(resolved);
  if(!st.isDirectory()||st.isSymbolicLink()||(st.mode & 0o077)!==0)
    throw Error('enrollment_directory_not_private');
  return resolved;
}
async function createOnly(file,content,mode=0o600) {
  const handle=await open(file,'wx',mode);
  try {
    await handle.writeFile(content,{encoding:'utf8'});
    await handle.sync();
  } finally {await handle.close();}
}
export async function createLocalOneBodyEnrollment({
  consumerId, lane, signerKeyId, outputDir, now=new Date(),
}={}) {
  if(!idValue(consumerId))throw Error('invalid_consumer_id');
  if(!laneValue(lane))throw Error('invalid_consumer_lane');
  if(!idValue(signerKeyId))throw Error('invalid_consumer_signer_key_id');
  const directory=await privateDir(outputDir);
  const suffix=createHash('sha256').update(JSON.stringify([consumerId,lane,signerKeyId]))
    .digest('hex').slice(0,20);
  const secretPath=path.join(directory,'one-body-'+suffix+'.private.pem');
  const publicPath=path.join(directory,'one-body-'+suffix+'.enrollment.json');
  // Fail early if either path already exists. Actual create is exclusive to
  // avoid overwriting an existing signing identity during concurrent retries.
  for(const target of [secretPath,publicPath]){
    try {await lstat(target);throw Error('enrollment_identity_already_exists');}
    catch(e){if(e.code!=='ENOENT')throw e;}
  }
  const {privateKey,publicKey}=generateKeyPairSync('ed25519');
  const pem=publicKey.export({type:'spki',format:'pem'});
  const secret=privateKey.export({type:'pkcs8',format:'pem'});
  const time=now instanceof Date?now.toISOString():new Date(now).toISOString();
  const enrollment={
    schema:'evercraft.one-body.consumer-enrollment-candidate.v1',
    consumer_id:consumerId,
    lane,
    signer_key_id:signerKeyId,
    public_key_pem:pem,
    public_key_fingerprint_sha256:sha256(pem),
    created_at:time,
    state:'pending_operator_verification',
    enrolled:false,
    execution_authority_granted:false,
    consumer_acknowledgement_verified:false,
  };
  await createOnly(secretPath,secret);
  try {
    await createOnly(publicPath,JSON.stringify(enrollment,null,2)+'\n');
  } catch(e) {
    // A failed public candidate must not leave an orphan secret behind.
    await rm(secretPath,{force:true});
    throw e;
  }
  return {
    public_enrollment_file:publicPath,
    private_signing_file:secretPath,
    public_key_fingerprint_sha256:enrollment.public_key_fingerprint_sha256,
    state:'pending_operator_verification',
    trust_registry_updated:false,
    private_key_exported_to_operator:false,
    execution_authority_granted:false,
  };
}

/** Only return the public candidate for operator review. */
export async function readLocalOneBodyEnrollmentCandidate(filename) {
  const stat=await lstat(filename);
  if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode & 0o077)!==0)
    throw Error('unsafe_enrollment_candidate');
  const candidate=JSON.parse(await readFile(filename,'utf8'));
  if(candidate?.schema!=='evercraft.one-body.consumer-enrollment-candidate.v1'||
    !idValue(candidate.consumer_id)||!laneValue(candidate.lane)||
    !idValue(candidate.signer_key_id)||
    typeof candidate.public_key_pem!=='string'||
    candidate.public_key_fingerprint_sha256!==sha256(candidate.public_key_pem)||
    candidate.enrolled!==false || candidate.execution_authority_granted!==false)
    throw Error('invalid_enrollment_candidate');
  return candidate;
}

/**
 * Local operator preflight performed on the actual consumer host. This proves
 * only that the 0600 candidate and 0600 private key agree with independently
 * supplied expected identity/fingerprint values. It does not enroll a host,
 * modify the operator trust registry, attest hardware, or verify runtime work.
 */
export async function verifyLocalOneBodyEnrollment({
  publicCandidateFile, privateSigningFile,
  expectedConsumerId, expectedLane, expectedSignerKeyId, expectedFingerprint,
}={}) {
  if (!idValue(expectedConsumerId) || !laneValue(expectedLane) ||
      !idValue(expectedSignerKeyId) ||
      typeof expectedFingerprint !== 'string' ||
      !/^sha256:[a-f0-9]{64}$/.test(expectedFingerprint))
    throw Error('enrollment_expected_identity_required');
  if (typeof publicCandidateFile !== 'string' || !publicCandidateFile.trim() ||
      typeof privateSigningFile !== 'string' || !privateSigningFile.trim())
    throw Error('enrollment_files_required');

  const candidatePath=path.resolve(publicCandidateFile);
  const secretPath=path.resolve(privateSigningFile);
  if (path.dirname(candidatePath)!==path.dirname(secretPath))
    throw Error('enrollment_files_must_share_private_directory');
  const directory=await lstat(path.dirname(candidatePath));
  if (!directory.isDirectory() || directory.isSymbolicLink() ||
      (directory.mode & 0o077)!==0)
    throw Error('enrollment_directory_not_private');

  const candidate=await readLocalOneBodyEnrollmentCandidate(candidatePath);
  if (candidate.consumer_id!==expectedConsumerId ||
      candidate.lane!==expectedLane ||
      candidate.signer_key_id!==expectedSignerKeyId ||
      candidate.public_key_fingerprint_sha256!==expectedFingerprint)
    throw Error('enrollment_identity_or_fingerprint_mismatch');
  const secretStat=await lstat(secretPath);
  if (!secretStat.isFile() || secretStat.isSymbolicLink() ||
      (secretStat.mode & 0o077)!==0)
    throw Error('unsafe_enrollment_private_key');
  // Never print, return, log, or transmit the private PEM.
  const signingKey=createPrivateKey(await readFile(secretPath,'utf8'));
  if (signingKey.asymmetricKeyType!=='ed25519')
    throw Error('enrollment_signing_key_not_ed25519');
  const derivedPem=createPublicKey(signingKey).export({type:'spki',format:'pem'});
  if (derivedPem!==candidate.public_key_pem ||
      sha256(derivedPem)!==expectedFingerprint)
    throw Error('enrollment_private_public_key_mismatch');

  return {
    schema:'evercraft.one-body.local-enrollment-preflight.v1',
    ok:true,consumer_id:expectedConsumerId,lane:expectedLane,
    signer_key_id:expectedSignerKeyId,
    public_key_fingerprint_sha256:expectedFingerprint,
    local_keypair_matched:true,
    on_host_file_permissions_checked:true,
    operator_trust_registry_updated:false,
    consumer_acknowledgement_verified:false,
    remote_runtime_connected:false,
    execution_authority_granted:false,
  };
}
