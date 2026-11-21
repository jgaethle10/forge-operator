#!/usr/bin/env node
// Local-only, no network. Emits receipt to a new private file, never stdout.
import { open, mkdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { acceptLocalOneBodyHandoff } from './one-body-local-consumer.mjs';

export async function runLocalConsumerCli(args) {
  if(!Array.isArray(args) || args.length!==7)
    throw Error('usage: state inbox event_id lane signer_key_id private_key_file receipt_output_file');
  const [bodyStateFile,inboxFile,eventId,lane,signerKeyId,signerPrivateKeyFile,outputFile]=args;
  if(!outputFile || !String(outputFile).trim()) throw Error('receipt_output_file_required');
  const target=path.resolve(outputFile);
  const accepted=await acceptLocalOneBodyHandoff({
    bodyStateFile,inboxFile,eventId,lane,signerKeyId,signerPrivateKeyFile,
  });
  await mkdir(path.dirname(target),{recursive:true,mode:0o700});
  // Create-only: retries must use a new output filename and do not overwrite
  // an earlier signed receipt. A crash after inbox write is recoverable.
  let h;
  try {
    h=await open(target,'wx',0o600);
    await h.writeFile(JSON.stringify(accepted.receipt,null,2)+'\n','utf8');
    await h.sync();
  } catch(e) {
    if(e.code==='EEXIST') throw Error('receipt_output_already_exists');
    if(h) await unlink(target).catch(()=>{});
    throw e;
  } finally { if(h) await h.close(); }
  return {
    schema:'evercraft.one-body.local-consumer-result.v1',
    accepted_to_local_inbox:true,
    replayed:accepted.replayed,
    receipt_file_created:true,
    work_completed:false,
    execution_authority_granted:false,
    remote_delivery_verified:false,
  };
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    const result=await runLocalConsumerCli(process.argv.slice(2));
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
  } catch(e) {
    const safe=/^(usage:|invalid_|unknown_body_|lane_|consumer_|unsafe_|receipt_|event_id_|signer_key_id_)/;
    console.error(safe.test(String(e.message))?e.message:'local_consumer_accept_failed');
    process.exitCode=1;
  }
}
