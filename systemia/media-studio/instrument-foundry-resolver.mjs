/**
 * Authorized and hash-verified WAV resolver for canonical PulseGridAudioEngine.
 * This never declares sample/master commercial rights or executes playback.
 */
import { verifyFoundryWavBytes } from './instrument-foundry-bridge.mjs';

const HEX64 = /^[0-9a-f]{64}$/;
const PURPOSES = new Set(['audition', 'production_review']);
const DEFAULT_MAX_BYTES = 64 * 1024 * 1024;

/**
 * Host applications MUST derive scope from authenticated session context,
 * never from an unverified user-controlled field. authorizeRead MUST enforce
 * tenant, project, identity and blob-level recording permissions.
 */
export function createFoundryVerifiedResolver({scope, authorizeRead, readBytes, maxBytes=DEFAULT_MAX_BYTES, onReceipt}={}) {
  if(!scope || typeof scope!=='object' || !scope.tenant_id || !scope.session_id || !PURPOSES.has(scope.purpose)) {
    throw new Error('Trusted tenant, session and review scope required');
  }
  if(typeof authorizeRead!=='function' || typeof readBytes!=='function') {
    throw new Error('Independent authorization and byte reader are required');
  }
  if(!Number.isSafeInteger(maxBytes)||maxBytes<44||maxBytes>512*1024*1024) {
    throw new Error('Invalid WAV byte budget');
  }
  if(onReceipt!==undefined && typeof onReceipt!=='function')throw new Error('Receipt callback must be callable');

  return async function resolveFoundryWav(asset){
    if(!asset || typeof asset!=='object' ||
      !HEX64.test(asset.digest||'') || asset.id!=='audio-sha256:'+asset.digest ||
      asset.mime_type!=='audio/wav' || !Number.isSafeInteger(asset.byte_length) ||
      asset.byte_length<44 || asset.byte_length>maxBytes) {
      throw new Error('Foundry audio identity, format or byte budget rejected');
    }
    if(asset.rights==='restricted' || !['owned','licensed','unknown'].includes(asset.rights)) {
      throw new Error('Recording rights prohibit audition');
    }
    if(asset.release_ready===true || asset.commercial_rights_verified===true) {
      throw new Error('Audition resolver cannot self-certify commercial rights');
    }
    const authorized=await authorizeRead({asset,scope});
    if(authorized!==true)throw new Error('Foundry recording read not authorized');
    const payload=await readBytes({asset,scope});
    let bytes;
    if(payload instanceof Uint8Array)bytes=payload;
    else if(payload instanceof ArrayBuffer)bytes=new Uint8Array(payload);
    else if(typeof Blob!=='undefined' && payload instanceof Blob){
      if(payload.size!==asset.byte_length || payload.size>maxBytes)throw new Error('Foundry byte budget violation');
      bytes=new Uint8Array(await payload.arrayBuffer());
    } else throw new Error('Unsupported recorded WAV byte source');
    if(bytes.byteLength!==asset.byte_length||bytes.byteLength>maxBytes)throw new Error('Foundry byte budget violation');
    const snapshot=new Uint8Array(bytes.byteLength);
    snapshot.set(bytes); // copy before asynchronous hash verification to defeat mutation races
    const proof=await verifyFoundryWavBytes(asset,snapshot);
    const wav=new Blob([snapshot],{type:'audio/wav'});
    if(onReceipt)await onReceipt(Object.freeze({event:'foundry.wav.read_verified',digest:proof.digest,
      asset_id:asset.id,tenant_id:scope.tenant_id,session_id:scope.session_id,
      purpose:scope.purpose,bytes:proof.bytes,release_ready:false}));
    return wav;
  };
}
