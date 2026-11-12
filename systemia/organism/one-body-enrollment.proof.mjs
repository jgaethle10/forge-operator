import assert from 'node:assert/strict';
import {createPrivateKey,sign} from 'node:crypto';
import {mkdtemp,readFile,stat,chmod,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createLocalOneBodyEnrollment,readLocalOneBodyEnrollmentCandidate} from './one-body-enrollment.mjs';
import {bodyLaneReceiptSigningMessage,verifySignedBodyLaneReceipt} from './one-body-lane-signature.mjs';

const temp=await mkdtemp(path.join(os.tmpdir(),'evercraft-onebody-enroll-proof-'));
const directory=path.join(temp,'owned-consumer');
try {
  await assert.rejects(()=>createLocalOneBodyEnrollment({
    consumerId:'../../unsafe',lane:'context_fabric',
    signerKeyId:'node001:context:v1',outputDir:directory
  }),/invalid_consumer_id/);
  const cli=fileURLToPath(new URL('./one-body-enroll-cli.mjs',import.meta.url));
  const outcome=JSON.parse(execFileSync(process.execPath,[
    cli,'node001','context_fabric','node001:context:v1',directory
  ],{encoding:'utf8'}));
  assert.equal(outcome.state,'pending_operator_verification');
  assert.equal(outcome.trust_registry_updated,false);
  assert.equal(outcome.execution_authority_granted,false);
  assert.equal(outcome.private_key_exported_to_operator,false);
  assert.equal((await stat(directory)).mode & 0o777,0o700);
  assert.equal((await stat(outcome.private_signing_file)).mode & 0o777,0o600);
  assert.equal((await stat(outcome.public_enrollment_file)).mode & 0o777,0o600);
  const secret=await readFile(outcome.private_signing_file,'utf8');
  const publicText=await readFile(outcome.public_enrollment_file,'utf8');
  const publicCandidate=await readLocalOneBodyEnrollmentCandidate(outcome.public_enrollment_file);
  assert.equal(publicCandidate.consumer_id,'node001');
  assert.equal(publicCandidate.lane,'context_fabric');
  assert.equal(publicCandidate.enrolled,false);
  assert.equal(publicCandidate.public_key_fingerprint_sha256,outcome.public_key_fingerprint_sha256);
  assert.ok(secret.includes('PRIVATE KEY'));
  assert.ok(!publicText.includes(secret));
  assert.ok(!JSON.stringify(outcome).includes(secret));
  await assert.rejects(()=>createLocalOneBodyEnrollment({
    consumerId:'node001',lane:'context_fabric',
    signerKeyId:'node001:context:v1',outputDir:directory
  }),/enrollment_identity_already_exists/);
  const claims={
    schema:'evercraft.one-body.lane-consumer-receipt.v1',
    event_id:'body-synthetic-event',
    lane:'context_fabric',
    receipt_ref:'private-test-inbox-reference',
    observed_at:new Date().toISOString(),
    signer_key_id:'node001:context:v1',
  };
  const receipt={
    ...claims,
    signature_base64:sign(null,bodyLaneReceiptSigningMessage(claims),
      createPrivateKey(secret)).toString('base64')
  };
  assert.equal(verifySignedBodyLaneReceipt(receipt),false,
    'public candidate never automatically adds trusted authority');
  const pinned={
    [publicCandidate.signer_key_id]:{
      lane:publicCandidate.lane,
      public_key_pem:publicCandidate.public_key_pem,
    }
  };
  assert.equal(verifySignedBodyLaneReceipt(receipt,{trustedConsumers:pinned}),true);
  assert.equal(verifySignedBodyLaneReceipt({...receipt,lane:'payment_authority_reconciliation'},{
    trustedConsumers:pinned
  }),false);
  assert.equal(verifySignedBodyLaneReceipt(receipt,{trustedConsumers:{}}),false);
  await chmod(outcome.public_enrollment_file,0o644);
  await assert.rejects(()=>readLocalOneBodyEnrollmentCandidate(outcome.public_enrollment_file),
    /unsafe_enrollment_candidate/);
  await chmod(outcome.public_enrollment_file,0o600);
  await chmod(directory,0o755);
  await assert.rejects(()=>createLocalOneBodyEnrollment({
    consumerId:'node002',lane:'context_fabric',
    signerKeyId:'node002:context:v1',outputDir:directory
  }),/enrollment_directory_not_private/);
  console.log(JSON.stringify({
    ok:true,schema:'evercraft.one-body.enrollment-proof.v1',
    checks:[
      'per-consumer keypair generated on host with private file mode',
      'public candidate is not a trust grant',
      'no private key in public enrollment, CLI JSON or graph inputs',
      'duplicate enrollment does not overwrite signer',
      'operator-pinned lane key authenticates canonical receipt',
      'revoked or mismatched public trust fails closed',
      'unsafe directory and candidate file modes rejected',
    ]
  },null,2));
} finally {await rm(temp,{recursive:true,force:true})}
