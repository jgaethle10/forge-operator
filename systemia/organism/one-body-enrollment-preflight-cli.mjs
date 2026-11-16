#!/usr/bin/env node
/**
 * Read-only enrollment preflight on the actual owned consumer host.
 * Keep the private signing PEM on the host. An expected fingerprint must
 * come from a separately reviewed operator record, not from this file alone.
 */
import { pathToFileURL } from 'node:url';
import { verifyLocalOneBodyEnrollment } from './one-body-enrollment.mjs';

export async function runOneBodyEnrollmentPreflightCli(args) {
  if (!Array.isArray(args) || args.length!==6)
    throw Error('usage: <candidate-json> <private-pem> <consumer-id> <lane> <signer-key-id> <expected-fingerprint>');
  const [publicCandidateFile,privateSigningFile,expectedConsumerId,
    expectedLane,expectedSignerKeyId,expectedFingerprint]=args;
  return verifyLocalOneBodyEnrollment({
    publicCandidateFile,privateSigningFile,expectedConsumerId,
    expectedLane,expectedSignerKeyId,expectedFingerprint,
  });
}

if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    process.stdout.write(JSON.stringify(
      await runOneBodyEnrollmentPreflightCli(process.argv.slice(2)),null,2)+'\n');
  } catch(error) {
    const message=String(error?.message||'');
    const allowed=/^(usage:|enrollment_|unsafe_enrollment_)/;
    process.stderr.write((allowed.test(message)?message:'enrollment_preflight_failed')+'\n');
    process.exitCode=1;
  }
}
