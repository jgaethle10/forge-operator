/**
 * Read-only PQ runtime capability probe for Evercraft field nodes.
 *
 * No network requests, DB queries, service control, key files, environment
 * variables, or production secrets are accessed. Ephemeral key pairs exist
 * only in memory when --self-test is explicitly requested.
 *
 * Outputs capability evidence, not a production security certification.
 */
import * as crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {pqRuntime,generatePqRecipient,encryptPqEnvelope,decryptPqEnvelope} from './pq-envelope.mjs';
import {generatePqSigner} from './pq-signed-envelope.mjs';

function supportedPq() {
  return typeof crypto.encapsulate==='function' &&
    typeof crypto.decapsulate==='function';
}
function failureDetail(error) {
  // Deliberately do not report message text, file paths, stack traces, keys
  // or values from the failing provider.
  return typeof error?.code==='string' ? error.code : 'CRYPTO_SELF_TEST_FAILED';
}
export function getPqFieldPreflight({selfTest=false}={}) {
  const runtime=pqRuntime();
  const result={
    schema:'systemia.crypto.pq-field-preflight.v1',
    read_only:true,
    node_version:process.versions.node,
    openssl_version:process.versions.openssl||'unknown',
    platform:process.platform,
    arch:process.arch,
    ml_kem_api_available:supportedPq(),
    self_test_requested:selfTest,
    self_test_passed:null,
    usable_for_isolated_lab:runtime.available,
    live_relay_tested:false,
    field_enrolled:false,
    production_ready:false
  };
  if(!selfTest) return Object.freeze(result);
  try {
    if(!supportedPq()) throw Object.assign(new Error('Unavailable'),{code:'PQ_API_UNAVAILABLE'});
    const recipient=generatePqRecipient();
    const sender=generatePqSigner();
    const route='systemia.lab.field-preflight';
    const encrypted=encryptPqEnvelope({
      recipientPublicKey:recipient.publicKey,plaintext:'evercraft-field-self-test',context:route
    });
    const plain=decryptPqEnvelope({
      recipientPrivateKey:recipient.privateKey,envelope:encrypted,expectedContext:route
    });
    const bytes=Buffer.from('evercraft-field-self-test','utf8');
    if(!crypto.timingSafeEqual(Buffer.from(plain),bytes)) throw Error('Failed');
    const signature=crypto.sign(null,bytes,sender.privateKey);
    if(!crypto.verify(null,bytes,sender.publicKey,signature)) throw Error('Failed');
    result.self_test_passed=true;
  } catch(error) {
    result.self_test_passed=false;
    result.failure_code=failureDetail(error);
  }
  result.usable_for_isolated_lab=runtime.available && result.self_test_passed===true;
  return Object.freeze(result);
}

if(process.argv[1] && fileURLToPath(import.meta.url)===process.argv[1]) {
  const selfTest=process.argv.includes('--self-test');
  const strict=process.argv.includes('--require-pq');
  const output=getPqFieldPreflight({selfTest});
  process.stdout.write(JSON.stringify(output,null,2)+'\n');
  if(strict && !output.usable_for_isolated_lab) process.exitCode=1;
}
