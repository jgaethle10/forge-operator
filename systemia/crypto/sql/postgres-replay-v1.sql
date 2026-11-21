-- Evercraft PQ replay lab PostgreSQL migration v1.
-- Apply manually in an isolated, operator-owned test database before using adapter.
-- Do not execute against an unreviewed production database.
BEGIN;
CREATE TABLE IF NOT EXISTS public.pq_replay_nonces_v1 (
  token_digest text PRIMARY KEY NOT NULL,
  expires_at_ms bigint NOT NULL CHECK (expires_at_ms > 0),
  CHECK (length(token_digest) = 64),
  CHECK (token_digest ~ '^[0-9a-f]{64}$')
);
CREATE INDEX IF NOT EXISTS pq_replay_nonces_v1_expiry
  ON public.pq_replay_nonces_v1 (expires_at_ms);
COMMIT;

-- Operator-run maintenance after backups/retention approval, never in the
-- admission path. Expired signed messages are rejected before admission.
-- A generous buffer protects against clock skew during cleanup:
--
-- DELETE FROM public.pq_replay_nonces_v1
-- WHERE expires_at_ms < (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint - 300000;
--
-- The runtime role should have only INSERT and SELECT rights needed for
-- INSERT ... RETURNING. Do not grant DDL/DELETE to the runtime role.
