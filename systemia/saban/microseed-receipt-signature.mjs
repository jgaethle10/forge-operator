import { createHash, sign as cryptoSign, verify as cryptoVerify } from 'node:crypto';

function stable(value){
  if(Array.isArray(value)) return value.map(stable);
  if(value&&typeof value==='object'){
    return Object.fromEntries(
      Object.keys(value).sort().map(k=>[k,stable(value[k])])
    );
  }
  return value;
}
function canonical(value){return Buffer.from(JSON.stringify(stable(value)));}
function sha(value){return 'sha256:'+createHash('sha256').update(value).digest('hex');}

export function microSeedReceiptSigningPayload(receipt={}){
  const body={
    schema:receipt.schema||null,
    device_id:receipt.device_id||null,
    workload_class:receipt.workload_class||null,
    idempotency_key:receipt.idempotency_key||null,
    request_hash:receipt.request_hash||null,
    manifest_hash:receipt.manifest_hash||null,
    safety_receipt_ref:receipt.safety_receipt_ref||null,
    result:receipt.result??null,
    execution_location:receipt.execution_location||null,
    deduplicated:receipt.deduplicated===true,
    arbitrary_code_execution:receipt.arbitrary_code_execution===true,
    primary_function_priority:receipt.primary_function_priority===true,
    external_cash_spend_usd:Number(receipt.external_cash_spend_usd||0),
    incremental_energy_cost_state:receipt.incremental_energy_cost_state||null,
    completed_at:receipt.completed_at||null,
    receipt_hash:receipt.receipt_hash||null,
  };
  return canonical(body);
}

export function signMicroSeedExecutionReceipt(receipt,{
  privateKey,
  key_id='microseed-device-key',
}={}){
  if(receipt?.schema!=='evercraft.microseed.execution-receipt.v1'){
    throw new Error('microseed_execution_receipt_required');
  }
  if(!privateKey) throw new Error('microseed_receipt_private_key_required');
  const payload=microSeedReceiptSigningPayload(receipt);
  const signature=cryptoSign(null,payload,privateKey);
  return {
    ...receipt,
    device_signature:{
      schema:'evercraft.microseed.device-signature.v1',
      algorithm:'Ed25519',
      key_id:String(key_id||'microseed-device-key'),
      payload_sha256:sha(payload),
      signature_base64:signature.toString('base64'),
    },
  };
}

export function verifyMicroSeedExecutionReceipt(signedReceipt,{
  publicKey,
  expected_device_id='',
}={}){
  if(signedReceipt?.schema!=='evercraft.microseed.execution-receipt.v1'){
    return {verified:false,reason:'execution_receipt_schema_invalid'};
  }
  const sig=signedReceipt.device_signature;
  if(sig?.schema!=='evercraft.microseed.device-signature.v1'){
    return {verified:false,reason:'device_signature_missing'};
  }
  if(sig.algorithm!=='Ed25519'){
    return {verified:false,reason:'device_signature_algorithm_invalid'};
  }
  if(!publicKey){
    return {verified:false,reason:'device_public_key_missing'};
  }
  if(expected_device_id&&signedReceipt.device_id!==expected_device_id){
    return {verified:false,reason:'device_identity_mismatch'};
  }

  const payload=microSeedReceiptSigningPayload(signedReceipt);
  if(sig.payload_sha256!==sha(payload)){
    return {verified:false,reason:'device_signature_payload_hash_mismatch'};
  }
  let signature;
  try{signature=Buffer.from(String(sig.signature_base64||''),'base64');}
  catch{return {verified:false,reason:'device_signature_encoding_invalid'};}

  let verified=false;
  try{verified=cryptoVerify(null,payload,publicKey,signature);}
  catch{return {verified:false,reason:'device_signature_verification_error'};}
  return verified
    ? {
        verified:true,
        reason:'verified',
        algorithm:'Ed25519',
        key_id:sig.key_id||null,
        payload_sha256:sig.payload_sha256,
      }
    : {verified:false,reason:'device_signature_invalid'};
}
