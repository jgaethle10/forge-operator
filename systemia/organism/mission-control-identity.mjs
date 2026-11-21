import {fingerprintPublicKey,verifyNodeAttestation} from '../compute/device-identity.mjs';
import {NODE_KEYS} from './mission-control-node-watch.mjs';

// Cryptographic key possession against an explicitly PINNED operator trust key.
// A passing proof does not establish remote origin, transport authentication,
// live node connectivity, health, device enrollment or work authority.
export function projectPinnedNodeIdentity(attestation,{
 nodeKey,expectedNodeId,expectedNonce,trustedPublicKeyPem,now=Date.now()
}={}){
 if(!NODE_KEYS.includes(nodeKey))throw Error('unknown node slot');
 if(typeof expectedNodeId!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{2,99}$/.test(expectedNodeId))throw Error('expected node ID required');
 if(typeof expectedNonce!=='string'||!/^[A-Za-z0-9._:-]{16,256}$/.test(expectedNonce))throw Error('valid exact one-time nonce required');
 if(typeof trustedPublicKeyPem!=='string'||trustedPublicKeyPem.length<20||trustedPublicKeyPem.length>8192)throw Error('pinned trust key invalid');
 if(!attestation||typeof attestation!=='object'||Array.isArray(attestation)||!attestation.public_key_pem)throw Error('attestation missing');
 if(fingerprintPublicKey(attestation.public_key_pem)!==fingerprintPublicKey(trustedPublicKeyPem))throw Error('attestation key differs from operator pin');
 if(!Number.isFinite(now))throw Error('invalid observation clock');
 const receipt=verifyNodeAttestation({
  attestation,expectedNonce,expectedNodeId,maxAgeMs:60000,now:new Date(now)
 });
 if(receipt.ok!==true)throw Error('signed node attestation rejected: '+receipt.reason);
 return {
  node_key:nodeKey,verification:'pinned_signature_verified',
  observed_at:new Date(Date.parse(receipt.observed_at)).toISOString(),
  provenance:'OWNER-PINNED ED25519 / LOCAL VERIFICATION',
  note:'Signature matches selected owner-pinned key and exact challenge. Remote connectivity, NodeSeed health, enrollment and execution NOT verified.'
 };
}
