/**
 * LAB ONLY: atomic sender-trust freshness + replay admission on ONE
 * authoritative PostgreSQL writer, with no fallback when unavailable.
 *
 * The trust revision row is locked FOR SHARE during the same SQL statement
 * that inserts a unique replay nonce, serializing against revocation updates.
 * This provides admission-time consistency, not promises about a subsequent
 * revocation after the message has already been admitted.
 */
import {validPqReplayInput,digestPqReplayToken} from './pq-replay-postgres.mjs';
import {isVerifiedPqTrustImport} from './pq-trust-snapshot.mjs';
import {openPinnedPqMessageAsync} from './pq-pinned-signers.mjs';

const SQL=[
  'WITH trusted AS MATERIALIZED (',
  '  SELECT authority FROM public.pq_trust_highwater_v1',
  '  WHERE authority = $1::text AND revision = $2::bigint AND digest = $3::text',
  '  FOR SHARE',
  '), admission AS (',
  '  INSERT INTO public.pq_replay_nonces_v1(token_digest, expires_at_ms)',
  '  SELECT $4::text, $5::bigint',
  '  FROM trusted',
  '  WHERE $6::bigint <= (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint',
  '    AND $7::bigint > (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint',
  '    AND $5::bigint > (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint',
  '  ON CONFLICT(token_digest) DO NOTHING',
  '  RETURNING token_digest',
  ')',
  'SELECT token_digest FROM admission'
].join('\n');

const validWindow=s=>
  Number.isSafeInteger(s.validFromMs) && Number.isSafeInteger(s.validUntilMs) &&
  s.validFromMs >= 0 && s.validUntilMs>s.validFromMs &&
  s.validUntilMs-s.validFromMs<=15*60_000;

/**
 * Caller supplies a prior importSignedPqTrustSnapshot result, not arbitrary
 * metadata. The imported registry remains immutable and independently
 * signature-verified; a fresh DB high-water check happens on every message.
 */
export function createCurrentTrustReplayGuard({client,importedSnapshot}={}) {
  if (!client || typeof client.query!=='function')
    throw new TypeError('A shared PostgreSQL authority is required');
  if (!isVerifiedPqTrustImport(importedSnapshot) || !validWindow(importedSnapshot))
    throw new TypeError('A verified and unexpired-capable trust import is required');
  return Object.freeze({
    schema:'systemia.crypto.current-trust-replay.postgres.lab.v1',
    async consume(input) {
      if (!validPqReplayInput(input)) return false;
      try {
        const tokenDigest=digestPqReplayToken(input);
        const args=[
          importedSnapshot.authority,String(importedSnapshot.revision),importedSnapshot.digest,
          tokenDigest,String(input.expiresAtMs),String(importedSnapshot.validFromMs),
          String(importedSnapshot.validUntilMs)
        ];
        const result=await client.query(SQL,args);
        return result?.rowCount===1 && result.rows?.length===1 &&
          result.rows[0]?.token_digest===tokenDigest;
      } catch {
        // Includes uncertain commit, stale snapshot, DB failure, split authority.
        return false;
      }
    }
  });
}

/** Message plaintext is released ONLY after current trust and replay admission. */
export async function openCurrentTrustPqMessageAsync({
  client,importedSnapshot,signedMessage,expectedSender,
  recipientPrivateKey,expectedContext,nowMs=Date.now()
}={}) {
  if (!isVerifiedPqTrustImport(importedSnapshot)) throw new Error('Current PQ trust denied');
  try {
    const replayGuard=createCurrentTrustReplayGuard({client,importedSnapshot});
    return await openPinnedPqMessageAsync({
      registry:importedSnapshot.registry,signedMessage,expectedSender,
      recipientPrivateKey,expectedContext,replayGuard,nowMs
    });
  } catch {throw new Error('Current PQ trust denied');}
}
