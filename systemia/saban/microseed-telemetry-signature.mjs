import { createHash, sign as cryptoSign, verify as cryptoVerify } from 'node:crypto';

function stable(value){
  if(Array.isArray(value)) return value.map(stable);
  if(value&&typeof value==='object'){
    return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])]));
  }
  return value;
}
const canonical=value=>Buffer.from(JSON.stringify(stable(value)));
const sha=value=>'sha256:'+createHash('sha256').update(value).digest('hex');

export function microSeedTelemetrySigningPayload(envelope={}){
  return canonical({
    schema:envelope.schema||null,
    device_id:envelope.device_id||null,
    telemetry:envelope.telemetry??null,
    arbitrary_code_execution:envelope.arbitrary_code_execution===true,
  });
}

export function signMicroSeedTelemetry(envelope,{
  privateKey,
  key_id='microseed-device-key',
}={}){
  if(envelope?.schema!=='evercraft.microseed.device-telemetry.v1'){
    throw new Error('microseed_telemetry_envelope_required');
  }
  if(!privateKey) throw new Error('microseed_telemetry_private_key_required');
  const payload=microSeedTelemetrySigningPayload(envelope);
  return {
    ...envelope,
    device_signature:{
      schema:'evercraft.microseed.telemetry-signature.v1',
      algorithm:'Ed25519',
      key_id:String(key_id||'microseed-device-key'),
      payload_sha256:sha(payload),
      signature_base64:cryptoSign(null,payload,privateKey).toString('base64'),
    },
  };
}

export function verifyMicroSeedTelemetry(envelope,{
  publicKey,
  expected_device_id='',
}={}){
  if(envelope?.schema!=='evercraft.microseed.device-telemetry.v1'){
    return {verified:false,reason:'telemetry_schema_invalid'};
  }
  const sig=envelope.device_signature;
  if(sig?.schema!=='evercraft.microseed.telemetry-signature.v1'){
    return {verified:false,reason:'telemetry_signature_missing'};
  }
  if(sig.algorithm!=='Ed25519'){
    return {verified:false,reason:'telemetry_signature_algorithm_invalid'};
  }
  if(!publicKey){
    return {verified:false,reason:'telemetry_public_key_missing'};
  }
  if(expected_device_id&&envelope.device_id!==expected_device_id){
    return {verified:false,reason:'telemetry_device_identity_mismatch'};
  }
  const payload=microSeedTelemetrySigningPayload(envelope);
  if(sig.payload_sha256!==sha(payload)){
    return {verified:false,reason:'telemetry_signature_payload_hash_mismatch'};
  }
  let signature;
  try{signature=Buffer.from(String(sig.signature_base64||''),'base64');}
  catch{return {verified:false,reason:'telemetry_signature_encoding_invalid'};}
  try{
    const verified=cryptoVerify(null,payload,publicKey,signature);
    return verified
      ? {
          verified:true,
          reason:'verified',
          algorithm:'Ed25519',
          key_id:sig.key_id||null,
          payload_sha256:sig.payload_sha256,
        }
      : {verified:false,reason:'telemetry_signature_invalid'};
  }catch{
    return {verified:false,reason:'telemetry_signature_verification_error'};
  }
}
