/**
 * Evercraft post-quantum replay ledger prototype.
 * LOCAL SINGLE-HOST LAB ONLY. SQLite is NOT a multi-host coordination service.
 *
 * Guarantees atomic insert-if-absent on a shared local SQLite database, across
 * independent processes, and persists accepted nonces over process restarts.
 * Never fall back to an in-memory ledger if the file or DB is unavailable.
 */
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import path from 'node:path';

const MAX_ENTRIES = 1000000;
const MAX_FUTURE_MS = 10 * 60 * 1000;
const REPLAY_SCHEMA = 'systemia.crypto.replay-ledger.local.v1';
const FIELD_LIMITS = [128,64,128,64];

function validInput({senderId,senderKeyId,context,nonce,expiresAtMs,nowMs}) {
  const fields=[senderId,senderKeyId,context,nonce];
  if (fields.some((v,i)=>typeof v !== 'string' || !v.length || v.length>FIELD_LIMITS[i])) return false;
  if (!Number.isSafeInteger(nowMs) || nowMs<0 ||
      !Number.isSafeInteger(expiresAtMs) || expiresAtMs<=nowMs ||
      expiresAtMs-nowMs>MAX_FUTURE_MS) return false;
  return true;
}

function digestTuple({senderId,senderKeyId,context,nonce}) {
  // Hash avoids storing raw sender names and route IDs in the replay DB.
  const tuple=JSON.stringify([REPLAY_SCHEMA,senderId,senderKeyId,context,nonce]);
  return createHash('sha256').update(tuple).digest('hex');
}

/**
 * Caller must supply a PRIVATE local absolute path on one host, inside a directory
 * whose permissions and backups are managed by the operator.
 * Use separate DBs for isolated test runs. The returned handle must be closed.
 */
export function createLocalSqliteReplayGuard({filePath, maxEntries=100000, timeoutMs=5000}={}) {
  if (typeof filePath!=='string' || !path.isAbsolute(filePath) || filePath === ':memory:')
    throw new TypeError('An absolute path to a persistent local SQLite file is required');
  if (!Number.isSafeInteger(maxEntries) || maxEntries<1 || maxEntries>MAX_ENTRIES)
    throw new RangeError('Invalid replay capacity');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs<1 || timeoutMs>30000)
    throw new RangeError('Invalid busy timeout');
  const db=new DatabaseSync(filePath,{timeout:timeoutMs});
  try {
    // FULL durability, WAL coordination for independent processes on the same host.
    db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA trusted_schema=OFF;');
    db.exec('CREATE TABLE IF NOT EXISTS pq_replay_nonces ('+
      'token_digest TEXT PRIMARY KEY NOT NULL, '+
      'expires_at_ms INTEGER NOT NULL) WITHOUT ROWID;');
    db.exec('CREATE INDEX IF NOT EXISTS pq_replay_expiry ON pq_replay_nonces(expires_at_ms)');
    const cleanup=db.prepare('DELETE FROM pq_replay_nonces WHERE expires_at_ms <= ?');
    const count=db.prepare('SELECT COUNT(*) AS n FROM pq_replay_nonces');
    const insert=db.prepare('INSERT OR IGNORE INTO pq_replay_nonces(token_digest, expires_at_ms) VALUES (?, ?)');
    let closed=false;
    const consume=(input)=>{
      if (closed || !validInput(input||{})) return false;
      const tuple=digestTuple(input);
      let transaction=false;
      try {
        // Serialize admission/clean-up/capacity with BEGIN IMMEDIATE across processes.
        db.exec('BEGIN IMMEDIATE');
        transaction=true;
        cleanup.run(input.nowMs);
        if (Number(count.get().n)>=maxEntries) {
          db.exec('COMMIT'); transaction=false;
          return false;
        }
        const result=insert.run(tuple,input.expiresAtMs);
        db.exec('COMMIT'); transaction=false;
        return result.changes===1;
      } catch {
        if(transaction) {
          try {db.exec('ROLLBACK');} catch {}
        }
        return false; // Fail closed on SQLITE_BUSY, disk full, corruption, etc.
      }
    };
    return Object.freeze({
      schema:REPLAY_SCHEMA,
      durability:'local-single-host-sqlite',
      consume,
      size() {
        if (closed) throw new Error('Replay ledger closed');
        return Number(count.get().n);
      },
      close() { if(!closed) {closed=true;db.close();} }
    });
  } catch (error) {
    db.close();
    throw error;
  }
}
