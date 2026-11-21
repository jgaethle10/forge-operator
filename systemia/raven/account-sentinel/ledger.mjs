import { createHash } from 'node:crypto';

const GENESIS = '0'.repeat(64);
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const kinds = new Set(['denied', 'preauthorized', 'read_completed', 'read_failed', 'read_withheld']);
const operations = new Set(['account.read', 'balance.read', 'transactions.read',
  'transfer.create', 'payee.create', 'invalid']);
const safe = (s, length = 64) => typeof s === 'string' ? s.slice(0, length) : 'invalid';

/** Volatile, privacy-minimized hash-chain for the local demonstration only. */
export function createDemoAuditLedger() {
  const entries = [];
  return Object.freeze({
    async append(event) {
      if (!kinds.has(event?.kind)) throw new Error('invalid_audit_event');
      const entry = {
        sequence: entries.length + 1,
        prev_hash: entries.length ? entries.at(-1).hash : GENESIS,
        event: {
          kind: event.kind,
          operation: operations.has(event.operation) ? event.operation : 'invalid',
          reason: safe(event.reason),
        },
      };
      entry.hash = hash(entry);
      entries.push(Object.freeze(entry));
      return Object.freeze({ sequence: entry.sequence, hash: entry.hash });
    },
    verify() {
      let prev = GENESIS;
      return entries.every((entry, i) => {
        const { hash: digest, ...unsigned } = entry;
        const ok = entry.sequence === i + 1 && entry.prev_hash === prev && hash(unsigned) === digest;
        prev = digest;
        return ok;
      });
    },
    entries() { return entries.map(e => ({ ...e, event: { ...e.event } })); },
  });
}
