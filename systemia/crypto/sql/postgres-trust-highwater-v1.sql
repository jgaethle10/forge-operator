-- Evercraft laboratory-only trust snapshot high-water migration v1.
-- Apply only to a disposable owned test database.
-- Runtime principal: least privilege SELECT, INSERT, UPDATE; no DELETE/DDL.
BEGIN;
CREATE TABLE IF NOT EXISTS public.pq_trust_highwater_v1 (
  authority text PRIMARY KEY NOT NULL,
  revision bigint NOT NULL CHECK (revision > 0),
  digest text NOT NULL CHECK (digest ~ '^[a-f0-9]{64}$'),
  CHECK (length(authority) BETWEEN 1 AND 128)
);
COMMIT;
-- Never truncate, delete, restore from older backup, or split this table
-- across multiple writable primaries in an authorized production design.
-- Acknowledged state must survive failover or consumers must deny messages.
