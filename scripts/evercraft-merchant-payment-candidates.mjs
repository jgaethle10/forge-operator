#!/usr/bin/env node
/**
 * Owner-operated Penguin intake; no HTTP listener and no remote provider.
 *
 *   node scripts/evercraft-merchant-payment-candidates.mjs status
 *   node scripts/evercraft-merchant-payment-candidates.mjs stage --owner-approved < /private/input.json
 *
 * The stdin JSON is sourced by the operator, not from Git or public web.
 * No payment handles, Zelle phone, QR, bank info or credentials are printed.
 */
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {
  buildMerchantDestinationCandidates,
  readMerchantDestinationCandidates,
  writeMerchantDestinationCandidates,
  merchantCandidateStatus
} from '../systemia/payments/merchant-destination-candidates.mjs';

async function readJsonFromPipe(){
  if(process.stdin.isTTY)throw Error('candidate_payload_stdin_required');
  let chunks='',bytes=0;
  for await(const chunk of process.stdin){
    bytes+=chunk.length;
    if(bytes>2048)throw Error('merchant_candidate_input_exceeds_limit');
    chunks+=String(chunk);
  }
  let value;
  try{value=JSON.parse(chunks)}catch{throw Error('merchant_candidate_input_json_invalid')}
  if(!value||typeof value!=='object'||Array.isArray(value)||
     Object.keys(value).sort().join('|')!==
       ['cashAppUrl','venmoHandle','zelleQrSubmitted','paypalQrSubmitted'].sort().join('|')){
    throw Error('merchant_candidate_payload_schema_invalid');
  }
  return value;
}
export async function merchantCandidateCli(args){
  if(args.length===1&&args[0]==='status'){
    return merchantCandidateStatus(readMerchantDestinationCandidates());
  }
  if(args.length===2&&args[0]==='stage'&&args[1]==='--owner-approved'){
    const payload=await readJsonFromPipe();
    const data=buildMerchantDestinationCandidates({...payload,ownerApproved:true});
    return writeMerchantDestinationCandidates(data);
  }
  throw Error('usage: status OR stage --owner-approved (JSON through stdin)');
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
  merchantCandidateCli(process.argv.slice(2)).then(result=>{
    console.log(JSON.stringify(result,null,2));
  }).catch(error=>{
    // Never echo payment address, QR content, user-supplied input or URL.
    const code=String(error?.message||'intake_failed');
    const safe=/^[a-z_]+$/.test(code)?code:'merchant_candidate_intake_failed';
    console.error(JSON.stringify({status:'held',reason:safe,
      payment_methods_enabled:false,any_payment_processed:false}));
    process.exitCode=1;
  });
}
