// Separate one-time PAPER-only owner authorization. Not usable for LIVE trading.
// The signing secret must be owned by the human operator, not a strategy agent.
import { createHmac, timingSafeEqual } from 'node:crypto';

const SCHEMA = 'evercraft.daytrade.paper-one-shot-owner-permit.v1';
const KEYS = [
  'schema', 'client_order_id', 'account_fingerprint', 'symbol',
  'notional', 'broker_snapshot_at', 'issued_at', 'expires_at',
];
const CLIENT_ID = /^ecpaper_[0-9a-f]{32}$/;
const HASH = /^[0-9a-f]{64}$/;

function payloadFrom(permit) {
  const p = {};
  for (const key of KEYS) p[key] = permit?.[key];
  return p;
}
function payloadJSON(permit) {
  const p = payloadFrom(permit);
  if (Object.values(p).some(v => typeof v !== 'string')) throw new Error('paper_owner_permit_fields_invalid');
  return JSON.stringify(p);
}
function signedDigest(permit, secret) {
  if (typeof secret !== 'string' || secret.length < 32) throw new Error('paper_owner_signing_key_missing');
  return createHmac('sha256', secret).update(payloadJSON(permit)).digest('hex');
}

export function signPaperOwnerPermit(fields, signingSecret) {
  const permit = payloadFrom(fields);
  if (permit.schema !== SCHEMA) throw new Error('paper_owner_permit_schema_invalid');
  return Object.freeze({ ...permit, signature: signedDigest(permit, signingSecret) });
}

export function verifyPaperOwnerPermit({
  permit, signingSecret, proposal, broker, now = new Date(),
} = {}) {
  if (!proposal?.admitted || proposal.mode !== 'PAPER_PROPOSAL_ONLY' ||
    proposal.broker_order_submission_enabled !== false || proposal.live_trade_authority !== false ||
    !proposal.hypothetical_order || !CLIENT_ID.test(proposal.client_order_id || '')) {
    throw new Error('paper_owner_proposal_not_eligible');
  }
  if (!permit || permit.schema !== SCHEMA || permit.client_order_id !== proposal.client_order_id ||
    permit.symbol !== proposal.hypothetical_order.symbol ||
    permit.notional !== proposal.hypothetical_order.notional ||
    permit.broker_snapshot_at !== broker?.observed_at ||
    !HASH.test(permit.account_fingerprint || '') ||
    permit.account_fingerprint !== broker?.account_fingerprint ||
    !CLIENT_ID.test(permit.client_order_id || '')) {
    throw new Error('paper_owner_permit_mismatch');
  }
  if (!Number.isFinite(now?.getTime?.())) throw new Error('paper_owner_clock_invalid');
  const issued = Date.parse(permit.issued_at), expires = Date.parse(permit.expires_at);
  if (!Number.isFinite(issued) || !Number.isFinite(expires) ||
    expires <= issued || expires - issued > 120_000 ||
    issued > now.getTime() + 2_000 || now.getTime() > expires ||
    now.getTime() - issued > 120_000) throw new Error('paper_owner_permit_expired');
  if (typeof permit.signature !== 'string' || !HASH.test(permit.signature)) {
    throw new Error('paper_owner_signature_invalid');
  }
  const expected = Buffer.from(signedDigest(permit, signingSecret), 'hex');
  const actual = Buffer.from(permit.signature, 'hex');
  if (!timingSafeEqual(expected, actual)) throw new Error('paper_owner_signature_invalid');
  return Object.freeze({
    verified: true,
    scope: 'ONE_PAPER_BUY_ORDER_ONLY',
    client_order_id: permit.client_order_id,
    expires_at: permit.expires_at,
    live_trade_authority: false,
  });
}

export const PAPER_OWNER_PERMIT_SCHEMA = SCHEMA;
