/**
 * On-host, offline consumer enrollment candidate. Private signing keys never
 * leave the consumer host. This does not update Systemia's operator trust
 * registry and does not grant execution or read authority.
 */
import { createHash, generateKeyPairSync } from 'node:crypto';
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
