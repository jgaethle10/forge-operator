#!/usr/bin/env node
/**
 * On-host enrollment candidate generator. Do NOT copy the private PEM out of
 * the owned consumer runtime or commit it to source control.
 */
import { pathToFileURL } from 'node:url';
import { createLocalOneBodyEnrollment } from './one-body-enrollment.mjs';

export async function runOneBodyEnrollmentCli(args) {
  if(!Array.isArray(args)||args.length!==4)
    throw Error('usage: <consumer-id> <lane> <signer-key-id> <private-output-directory>');
  const [consumerId,lane,signerKeyId,outputDir]=args;
  return createLocalOneBodyEnrollment({consumerId,lane,signerKeyId,outputDir});
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  try {
    const result=await runOneBodyEnrollmentCli(process.argv.slice(2));
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
  } catch(e) {
    const allowed=/^(usage:|invalid_consumer_|enrollment_|unsafe_enrollment_)/;
    process.stderr.write((allowed.test(String(e?.message))?e.message:'enrollment_candidate_creation_failed')+'\n');
    process.exitCode=1;
  }
}
