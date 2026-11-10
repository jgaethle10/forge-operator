/**
 * LAB ONLY: atomic revision high-water for authenticated trust snapshots.
 * A single consistent PostgreSQL writer must be shared by all consumers.
 * This is not root enrollment, trust distribution, or HA/failover proof.
 */
const SQL=[
  'INSERT INTO public.pq_trust_highwater_v1 (authority, revision, digest)',
  'VALUES ($1::text, $2::bigint, $3::text)',
  'ON CONFLICT (authority) DO UPDATE SET',
  'revision = EXCLUDED.revision, digest = EXCLUDED.digest',
  'WHERE public.pq_trust_highwater_v1.revision < EXCLUDED.revision',
  'OR (public.pq_trust_highwater_v1.revision = EXCLUDED.revision',
  'AND public.pq_trust_highwater_v1.digest = EXCLUDED.digest)',
  'RETURNING authority, revision, digest'
].join('\n');

export function createSharedPostgresTrustRevisionGuard({client}={}) {
  if (!client || typeof client.query!=='function')
    throw new TypeError('Shared, authoritative PostgreSQL client required');
  return Object.freeze({
    schema:'systemia.crypto.trust-revision.postgres.lab.v1',
    async admit({authority,revision,digest}={}) {
      if (typeof authority!=='string' ||
          !/^[a-z0-9][a-z0-9._:-]{0,127}$/.test(authority) ||
          !Number.isSafeInteger(revision) || revision<1 ||
          typeof digest!=='string' || !/^[a-f0-9]{64}$/.test(digest)) return false;
      try {
        const result=await client.query(SQL,[authority,String(revision),digest]);
        return result?.rowCount===1 && result.rows?.length===1 &&
          result.rows[0]?.authority===authority &&
          String(result.rows[0]?.revision)===String(revision) &&
          result.rows[0]?.digest===digest;
      } catch {
        // Includes DB outage, read-only replica, ambiguous commit or schema error.
        // Never replace with a local or untracked in-memory high-water.
        return false;
      }
    }
  });
}
