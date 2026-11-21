import { createPublicKey, verify } from 'node:crypto';

const RECEIPT_SCHEMA = 'evercraft.one-body.lane-consumer-receipt.v1';
const CLAIM_KEYS = ['schema','event_id','lane','receipt_ref','observed_at','signer_key_id'];
const ALL_KEYS = [...CLAIM_KEYS,'signature_base64'];
const exact = (object, keys) => object && typeof object === 'object' &&
  !Array.isArray(object) && Object.keys(object).sort().join(',') ===
  [...keys].sort().join(',');
const nonempty = value => typeof value === 'string' && value.trim() && value.length <= 512;

/** Domain-separated canonical bytes. The producer signs *only* these claims. */
export function bodyLaneReceiptSigningMessage(claims) {
  if (!exact(claims, CLAIM_KEYS) || claims.schema !== RECEIPT_SCHEMA ||
      !nonempty(claims.event_id) || !nonempty(claims.lane) ||
      !nonempty(claims.receipt_ref) || !nonempty(claims.signer_key_id) ||
      !Number.isFinite(Date.parse(claims.observed_at))) {
    throw new Error('invalid_lane_receipt_claims');
  }
  return Buffer.from('evercraft.one-body.lane-consumer-ack.v1\n' +
    JSON.stringify(Object.fromEntries(CLAIM_KEYS.map(key => [key,claims[key]]))),
    'utf8');
}

/**
 * Verifies *who signed a lane acknowledgement*; does not prove a provider
 * outcome, customer delivery or permission to act.
 *
 * The privileged Systemia runtime must supply trustedConsumers as an owned,
 * lane-scoped trust registry. Never accept a public key from the receipt.
 */
export function verifySignedBodyLaneReceipt(receipt, { trustedConsumers = {} } = {}) {
  try {
    if (!exact(receipt, ALL_KEYS) || receipt.schema !== RECEIPT_SCHEMA ||
        !nonempty(receipt.signature_base64) ||
        !/^[a-zA-Z0-9+/]{86}==$/.test(receipt.signature_base64) ||
        !Object.hasOwn(trustedConsumers, receipt.signer_key_id)) return false;
    const anchor = trustedConsumers[receipt.signer_key_id];
    if (!anchor || anchor.lane !== receipt.lane ||
        typeof anchor.public_key_pem !== 'string' || !anchor.public_key_pem) return false;
    const publicKey = createPublicKey(anchor.public_key_pem);
    if (publicKey.asymmetricKeyType !== 'ed25519') return false;
    const signature = Buffer.from(receipt.signature_base64, 'base64');
    if (signature.length !== 64) return false;
    const claims = Object.fromEntries(CLAIM_KEYS.map(key => [key,receipt[key]]));
    return verify(null,bodyLaneReceiptSigningMessage(claims),publicKey,signature);
  } catch {
    return false;
  }
}
