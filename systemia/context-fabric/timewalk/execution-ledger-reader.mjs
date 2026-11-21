import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

// The only ledger currently wired here. No arbitrary file names or URLs.
const SCHEMA = 'evercraft.execution-gate.lease-event.v1';
const BASENAME = 'execution-lease-events.jsonl';
const HASH = /^sha256:[a-f0-9]{64}$/;
const HARD_MAX_BYTES = 16 * 1024 * 1024;
const HARD_MAX_EVENTS = 20000;

function receiptHash(receipt) {
  const { receipt_hash: _unused, ...body } = receipt;
  return 'sha256:' + createHash('sha256')
    .update(JSON.stringify(body), 'utf8').digest('hex');
}
function bound(value, maximum, field) {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new Error('timewalk_' + field + '_invalid');
  }
  return value;
}

/**
 * Operator-bound, read-only ledger adapter for *persisted* Execution Gate
 * lease events. It reads the existing source-of-record JSONL file.
 *
 * This is NOT a signature verifier. A locally rewritten file whose receipt
 * hash was also rewritten can still appear self-consistent. Use separately
 * pinned origin attestations for independently authenticated issuer keys.
 *
 * No network, writes, path parameters supplied by callers, or raw records
 * returned in a public response. Give this adapter only to an internal,
 * Passport-authenticated Timewalk reconciler.
 */
export function createExecutionGateLedgerReceiptReader({
  state_dir,
  max_bytes = HARD_MAX_BYTES,
  max_events = HARD_MAX_EVENTS,
} = {}) {
  if (typeof state_dir !== 'string' || !path.isAbsolute(state_dir) ||
      !state_dir.trim()) {
    throw new Error('timewalk_execution_ledger_absolute_state_dir_required');
  }
  const root = path.resolve(state_dir);
  bound(max_bytes, HARD_MAX_BYTES, 'execution_ledger_max_bytes');
  bound(max_events, HARD_MAX_EVENTS, 'execution_ledger_max_events');
  let index = null;

  function load() {
    if (index) return index;
    // The repository cannot prove how an operator provisions this directory.
    // Reject symlinks and group/world-readable source on POSIX as a baseline.
    const dirStat = fs.lstatSync(root);
    if (!dirStat.isDirectory() || dirStat.isSymbolicLink() ||
        fs.realpathSync(root) !== root) {
      throw new Error('timewalk_execution_ledger_directory_not_regular');
    }
    const file = path.join(root, BASENAME);
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() ||
        stat.size > max_bytes || stat.size === 0 ||
        (process.platform !== 'win32' && (stat.mode & 0o077) !== 0)) {
      throw new Error('timewalk_execution_ledger_untrusted_file');
    }
    const fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
    let data;
    try {
      const before = fs.fstatSync(fd);
      if (!before.isFile() || before.ino !== stat.ino ||
          before.size !== stat.size || before.size > max_bytes) {
        throw new Error('timewalk_execution_ledger_changed_before_read');
      }
      data = fs.readFileSync(fd, { encoding: 'utf8' });
      const after = fs.fstatSync(fd);
      if (after.size !== before.size ||
          Buffer.byteLength(data, 'utf8') !== before.size ||
          after.mtimeMs !== before.mtimeMs ||
          !data.endsWith('\n')) {
        throw new Error('timewalk_execution_ledger_inconsistent_snapshot');
      }
    } finally {
      fs.closeSync(fd);
    }
    const rows = data.slice(0, -1).split('\n');
    if (rows.length > max_events || rows.some((row) => !row)) {
      throw new Error('timewalk_execution_ledger_event_limit_or_blank_line');
    }
    const entries = new Map();
    for (const line of rows) {
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        throw new Error('timewalk_execution_ledger_invalid_json');
      }
      if (!event || Array.isArray(event) ||
          typeof event !== 'object' ||
          event.schema !== SCHEMA ||
          !HASH.test(event.receipt_hash || '') ||
          receiptHash(event) !== event.receipt_hash) {
        throw new Error('timewalk_execution_ledger_receipt_integrity_failure');
      }
      if (entries.has(event.receipt_hash)) {
        throw new Error('timewalk_execution_ledger_duplicate_receipt_hash');
      }
      entries.set(event.receipt_hash, event);
    }
    index = entries;
    return index;
  }

  return function readExecutionGateSourceReceipt({
    source_receipt_schema, source_receipt_hash,
  } = {}) {
    // Unsupported schemas and bad hashes must not open a private ledger.
    if (source_receipt_schema !== SCHEMA ||
        !HASH.test(String(source_receipt_hash || ''))) return null;
    return load().get(source_receipt_hash) || null;
  };
}
