import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { validateCheckpoint } from './reconciliation.mjs';

function sha(value) {
  return createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
}

function ensurePrivateDir(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
}

function appendDurable(file, line) {
  ensurePrivateDir(path.dirname(file));
  const fd = fs.openSync(file, 'a', 0o600);
  try {
    fs.writeSync(fd, line);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function readJournal(file, schema) {
  if (!fs.existsSync(file)) {
    return { records: [], tail_recovered: false, head_hash: 'GENESIS' };
  }

  const raw = fs.readFileSync(file, 'utf8');
  const endsWithNewline = raw.endsWith('\n');
  const parts = raw.split('\n');
  if (endsWithNewline) parts.pop();

  let tailRecovered = false;
  if (!endsWithNewline && parts.length) {
    const last = parts[parts.length - 1];
    try {
      JSON.parse(last);
    } catch {
      parts.pop();
      tailRecovered = true;
    }
  }

  const records = [];
  let previous = 'GENESIS';
  let expectedSeq = 1;

  for (const line of parts) {
    if (!line.trim()) continue;
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      const error = new Error('durable_journal_corrupt_json');
      error.code = 'durable_journal_corrupt_json';
      throw error;
    }

    if (record.schema !== schema) {
      const error = new Error('durable_journal_schema_mismatch');
      error.code = 'durable_journal_schema_mismatch';
      throw error;
    }
    if (record.seq !== expectedSeq) {
      const error = new Error('durable_journal_sequence_gap');
      error.code = 'durable_journal_sequence_gap';
      throw error;
    }
    if (record.previous_hash !== previous) {
      const error = new Error('durable_journal_chain_break');
      error.code = 'durable_journal_chain_break';
      throw error;
    }

    const body = { ...record };
    delete body.record_hash;
    const expectedHash = sha(body);
    if (record.record_hash !== expectedHash) {
      const error = new Error('durable_journal_hash_mismatch');
      error.code = 'durable_journal_hash_mismatch';
      throw error;
    }

    records.push(record);
    previous = record.record_hash;
    expectedSeq += 1;
  }

  return { records, tail_recovered: tailRecovered, head_hash: previous };
}

function appendRecord({ file, schema, state, type, payload }) {
  const body = {
    schema,
    seq: state.records.length + 1,
    type,
    at: new Date().toISOString(),
    previous_hash: state.head_hash,
    ...payload
  };
  const record = { ...body, record_hash: sha(body) };
  appendDurable(file, JSON.stringify(record) + '\n');
  state.records.push(record);
  state.head_hash = record.record_hash;
  return record;
}

export class DurableReplayLedger {
  constructor({ root, fileName = 'replay-ledger.jsonl' }) {
    if (!root) throw new Error('durable_state_root_required');
    this.root = path.resolve(root);
    ensurePrivateDir(this.root);
    this.file = path.join(this.root, fileName);
    this.state = readJournal(this.file, 'evercraft.replay-ledger.record.v1');
    this.executed = new Map();

    for (const record of this.state.records) {
      if (record.type === 'message.executed') this.executed.set(record.message_id, record);
    }
  }

  hasExecuted(messageId) {
    return this.executed.has(String(messageId));
  }

  has(messageId) {
    return this.hasExecuted(messageId);
  }

  mark(messageId) {
    return this.markExecuted({ message_id: String(messageId) });
  }

  markExecuted({
    message_id,
    mission_id = null,
    kind = null,
    irreversible = false,
    execution_receipt_hash = null
  }) {
    const id = String(message_id || '');
    if (!id) throw new Error('message_id_required');
    if (this.executed.has(id)) {
      const error = new Error('replay_detected');
      error.code = 'replay_detected';
      throw error;
    }

    const record = appendRecord({
      file: this.file,
      schema: 'evercraft.replay-ledger.record.v1',
      state: this.state,
      type: 'message.executed',
      payload: {
        message_id: id,
        mission_id,
        kind,
        irreversible: Boolean(irreversible),
        execution_receipt_hash
      }
    });
    this.executed.set(id, record);
    return record;
  }

  summary() {
    return {
      schema: 'evercraft.replay-ledger.summary.v1',
      executed_count: this.executed.size,
      journal_records: this.state.records.length,
      head_hash: this.state.head_hash,
      tail_recovered: this.state.tail_recovered
    };
  }
}

export class DurableCheckpointJournal {
  constructor({ root, fileName = 'checkpoint-journal.jsonl' }) {
    if (!root) throw new Error('durable_state_root_required');
    this.root = path.resolve(root);
    ensurePrivateDir(this.root);
    this.file = path.join(this.root, fileName);
    this.state = readJournal(this.file, 'evercraft.checkpoint-journal.record.v1');
    this.byMission = new Map();

    for (const record of this.state.records) {
      if (record.type !== 'checkpoint.committed') continue;
      const check = validateCheckpoint(record.checkpoint);
      if (!check.valid) {
        const error = new Error('persisted_checkpoint_invalid');
        error.code = 'persisted_checkpoint_invalid';
        throw error;
      }
      const list = this.byMission.get(record.checkpoint.mission_id) || [];
      list.push(record.checkpoint);
      this.byMission.set(record.checkpoint.mission_id, list);
    }
  }

  commit(checkpoint) {
    const check = validateCheckpoint(checkpoint);
    if (!check.valid) {
      const error = new Error(`checkpoint_invalid:${check.reason}`);
      error.code = 'checkpoint_invalid';
      throw error;
    }

    const history = this.byMission.get(checkpoint.mission_id) || [];
    const latest = history[history.length - 1] || null;
    if (latest) {
      if (checkpoint.generation !== latest.generation + 1) {
        const error = new Error('checkpoint_generation_not_monotonic');
        error.code = 'checkpoint_generation_not_monotonic';
        throw error;
      }
      if (checkpoint.parent_hash !== latest.checkpoint_hash) {
        const error = new Error('checkpoint_parent_mismatch');
        error.code = 'checkpoint_parent_mismatch';
        throw error;
      }
    } else if (checkpoint.parent_hash !== 'GENESIS') {
      const error = new Error('checkpoint_missing_genesis_parent');
      error.code = 'checkpoint_missing_genesis_parent';
      throw error;
    }

    const record = appendRecord({
      file: this.file,
      schema: 'evercraft.checkpoint-journal.record.v1',
      state: this.state,
      type: 'checkpoint.committed',
      payload: { checkpoint }
    });
    history.push(checkpoint);
    this.byMission.set(checkpoint.mission_id, history);
    return record;
  }

  latest(missionId) {
    const history = this.byMission.get(String(missionId)) || [];
    return history[history.length - 1] || null;
  }

  replica(missionId, nodeId = 'local-durable-state') {
    const history = this.byMission.get(String(missionId)) || [];
    if (!history.length) return null;
    return {
      node_id: nodeId,
      checkpoint: history[history.length - 1],
      history: history.slice(0, -1)
    };
  }

  summary() {
    return {
      schema: 'evercraft.checkpoint-journal.summary.v1',
      mission_count: this.byMission.size,
      journal_records: this.state.records.length,
      head_hash: this.state.head_hash,
      tail_recovered: this.state.tail_recovered
    };
  }
}
