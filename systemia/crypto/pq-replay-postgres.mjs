/**
 * Post-quantum encrypted message replay admission via an operator-controlled
 * SHARED PostgreSQL primary (or equivalent strongly consistent primary).
 *
 * This is a lab adapter, NOT a deployment or transport. No embedded secrets,
 * schema creation, local cache, alternate database, or permissive fallback.
 * All producers must use the same database authority for one trust domain.
 */
import {createHash} from 'node:crypto';

const SCHEMA='systemia.crypto.replay-ledger.postgres.v1';
const MAX_LIFETIME_MS=10*60*1000;
const SQL=[
  'INSERT INTO public.pq_replay_nonces_v1 (token_digest, expires_at_ms)',
  'SELECT $1::text, $2::bigint',
  'WHERE $2::bigint > (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint',
  'ON CONFLICT (token_digest) DO NOTHING',
  'RETURNING token_digest'
].join('\n');

function validated(input) {
  if (!input || typeof input!=='object') return false;
  const {senderId,senderKeyId,context,nonce,nowMs,expiresAtMs}=input;
  if (typeof senderId!=='string' || !/^[a-z0-9][a-z0-9._:-]{0,127}$/.test(senderId)) return false;
  if (typeof senderKeyId!=='string' || !/^[a-f0-9]{64}$/.test(senderKeyId)) return false;
  if (typeof context!=='string' || !/^[a-z0-9._:/-]{1,128}$/.test(context)) return false;
  if (typeof nonce!=='string' || !/^[A-Za-z0-9_-]{32}$/.test(nonce) ||
      Buffer.from(nonce,'base64url').toString('base64url')!==nonce) return false;
  if (!Number.isSafeInteger(nowMs) || nowMs < 0 ||
      !Number.isSafeInteger(expiresAtMs) || expiresAtMs <= nowMs ||
      expiresAtMs-nowMs > MAX_LIFETIME_MS) return false;
  return true;
}

function digest(input) {
  // Domain separation prevents accidental collision with single-host SQLite
  // replay records. Store only a digest, not raw names, routes, or nonces.
  return createHash('sha256')
    .update(JSON.stringify([SCHEMA,input.senderId,input.senderKeyId,input.context,input.nonce]))
    .digest('hex');
}

/**
 * client.query(sql, params) must be the pg-compatible API of an authenticated
 * pool aimed at the ONE authoritative PostgreSQL writer for this trust domain.
 * The operator provisions the schema, auth, TLS and strong failover guarantees.
 */
export function createSharedPostgresReplayGuard({client}={}) {
  if (!client || typeof client.query!=='function')
    throw new TypeError('A shared PostgreSQL client with query(sql,params) is required');
  return Object.freeze({
    schema:SCHEMA,
    durability:'shared-postgres-single-primary',
    async consume(input) {
      if (!validated(input)) return false;
      const tokenDigest=digest(input);
      try {
        // The unique PK and single SQL statement provide atomic admission
        // across competing sessions/processes, without a SELECT-then-INSERT race.
        // PostgreSQL's database clock rejects already-expired admissions.
        const result=await client.query(SQL,[tokenDigest,String(input.expiresAtMs)]);
        return result?.rowCount===1 &&
          result.rows?.length===1 &&
          result.rows[0]?.token_digest===tokenDigest;
      } catch {
        // Including unavailable, timeout, read-only replica and schema missing.
        // A failed/uncertain acknowledgment must NEVER permit plaintext release.
        return false;
      }
    }
  });
}
