import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const RESERVED = new Set(['id', 'created_date', 'updated_date', 'created_by_id']);

function clean(value, max = 4000) {
  return String(value ?? '').trim().slice(0, max);
}

function entityName(value) {
  const name = clean(value, 80);
  if (!/^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(name)) throw new Error('entity_name_invalid');
  return name;
}

function clampLimit(value, fallback = 50) {
  const n = Number(value ?? fallback);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(500, Math.trunc(n)));
}

function stripReserved(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('entity_data_invalid');
  return Object.fromEntries(Object.entries(input).filter(([key]) => !RESERVED.has(key)));
}

function getPath(value, dotted) {
  const parts = String(dotted).split('.');
  let current = value;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = current[part];
  }
  return current;
}

function comparable(value) {
  if (typeof value === 'number') return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string') {
    const date = Date.parse(value);
    if (!Number.isNaN(date) && /^\d{4}-\d{2}-\d{2}/.test(value)) return date;
  }
  return value;
}

function operatorMatch(actual, op, expected) {
  if (op === '$in') return Array.isArray(expected) && expected.some((item) => Object.is(actual, item));
  if (op === '$nin') return Array.isArray(expected) && !expected.some((item) => Object.is(actual, item));
  if (op === '$ne') return !Object.is(actual, expected);
  if (op === '$exists') return Boolean(expected) ? actual !== undefined : actual === undefined;
  if (op === '$contains') {
    if (Array.isArray(actual)) return actual.includes(expected);
    return String(actual ?? '').includes(String(expected ?? ''));
  }
  if (op === '$regex') {
    const pattern = expected && typeof expected === 'object' ? expected.pattern : expected;
    const flags = expected && typeof expected === 'object' ? expected.flags : '';
    return new RegExp(String(pattern ?? ''), String(flags ?? '')).test(String(actual ?? ''));
  }
  const a = comparable(actual);
  const b = comparable(expected);
  if (op === '$gt') return a > b;
  if (op === '$gte') return a >= b;
  if (op === '$lt') return a < b;
  if (op === '$lte') return a <= b;
  return false;
}

function fieldMatch(actual, condition) {
  if (!condition || typeof condition !== 'object' || Array.isArray(condition)) {
    return Object.is(actual, condition);
  }
  const entries = Object.entries(condition);
  if (!entries.some(([key]) => key.startsWith('$'))) {
    return JSON.stringify(actual) === JSON.stringify(condition);
  }
  return entries.every(([op, expected]) => operatorMatch(actual, op, expected));
}

function queryMatch(record, query = {}) {
  if (!query || typeof query !== 'object' || Array.isArray(query)) throw new Error('entity_query_invalid');
  if (Array.isArray(query.$and) && !query.$and.every((item) => queryMatch(record, item))) return false;
  if (Array.isArray(query.$or) && !query.$or.some((item) => queryMatch(record, item))) return false;
  return Object.entries(query).every(([field, condition]) => {
    if (field === '$and' || field === '$or') return true;
    return fieldMatch(getPath(record, field), condition);
  });
}

function sortRecords(records, sort = '-created_date') {
  const raw = clean(sort || '-created_date', 120);
  const desc = raw.startsWith('-');
  const field = raw.replace(/^-/, '') || 'created_date';
  return [...records].sort((a, b) => {
    const av = comparable(getPath(a, field));
    const bv = comparable(getPath(b, field));
    if (av === bv) return String(a.id).localeCompare(String(b.id));
    if (av === undefined || av === null) return desc ? 1 : -1;
    if (bv === undefined || bv === null) return desc ? -1 : 1;
    if (av < bv) return desc ? 1 : -1;
    return desc ? -1 : 1;
  });
}

export class SqliteEntityStore {
  constructor({ filename = './runtime/evercraft-app.sqlite' } = {}) {
    this.filename = path.resolve(filename);
    fs.mkdirSync(path.dirname(this.filename), { recursive: true, mode: 0o750 });
    this.db = new DatabaseSync(this.filename);
    this.db.exec('PRAGMA journal_mode=WAL;');
    this.db.exec('PRAGMA busy_timeout=5000;');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS evercraft_records (
        entity TEXT NOT NULL,
        id TEXT NOT NULL,
        created_date TEXT NOT NULL,
        updated_date TEXT NOT NULL,
        created_by_id TEXT,
        data_json TEXT NOT NULL,
        PRIMARY KEY(entity, id)
      );
      CREATE INDEX IF NOT EXISTS idx_evercraft_records_entity_updated
        ON evercraft_records(entity, updated_date DESC);
    `);
    this.selectEntity = this.db.prepare(`
      SELECT entity, id, created_date, updated_date, created_by_id, data_json
      FROM evercraft_records
      WHERE entity = ?
      ORDER BY updated_date DESC
      LIMIT 10000
    `);
    this.selectOne = this.db.prepare(`
      SELECT entity, id, created_date, updated_date, created_by_id, data_json
      FROM evercraft_records
      WHERE entity = ? AND id = ?
    `);
    this.insert = this.db.prepare(`
      INSERT INTO evercraft_records(entity, id, created_date, updated_date, created_by_id, data_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    this.updateStatement = this.db.prepare(`
      UPDATE evercraft_records
      SET updated_date = ?, data_json = ?
      WHERE entity = ? AND id = ?
    `);
    this.deleteStatement = this.db.prepare(`
      DELETE FROM evercraft_records WHERE entity = ? AND id = ?
    `);
  }

  decode(row) {
    if (!row) return null;
    const data = JSON.parse(row.data_json || '{}');
    return {
      id: row.id,
      created_date: row.created_date,
      updated_date: row.updated_date,
      created_by_id: row.created_by_id || undefined,
      ...data,
    };
  }

  list(entity, { sort = '-created_date', limit = 50, skip = 0 } = {}) {
    const name = entityName(entity);
    const rows = this.selectEntity.all(name).map((row) => this.decode(row));
    const start = Math.max(0, Math.trunc(Number(skip || 0)));
    return sortRecords(rows, sort).slice(start, start + clampLimit(limit));
  }

  filter(entity, query = {}, { sort = '-created_date', limit = 50, skip = 0 } = {}) {
    const name = entityName(entity);
    const rows = this.selectEntity.all(name).map((row) => this.decode(row)).filter((row) => queryMatch(row, query));
    const start = Math.max(0, Math.trunc(Number(skip || 0)));
    return sortRecords(rows, sort).slice(start, start + clampLimit(limit));
  }

  get(entity, id) {
    const name = entityName(entity);
    return this.decode(this.selectOne.get(name, clean(id, 200)));
  }

  create(entity, data = {}, { actorId = '' } = {}) {
    const name = entityName(entity);
    const now = new Date().toISOString();
    const id = clean(data.id, 200) || crypto.randomUUID();
    const body = stripReserved(data);
    this.insert.run(name, id, now, now, clean(actorId, 200) || null, JSON.stringify(body));
    return this.get(name, id);
  }

  update(entity, id, patch = {}) {
    const name = entityName(entity);
    const current = this.get(name, id);
    if (!current) throw new Error('entity_record_not_found');
    const body = {
      ...stripReserved(current),
      ...stripReserved(patch),
    };
    const now = new Date().toISOString();
    this.updateStatement.run(now, JSON.stringify(body), name, clean(id, 200));
    return this.get(name, id);
  }

  delete(entity, id) {
    const name = entityName(entity);
    const current = this.get(name, id);
    if (!current) return { id: clean(id, 200), deleted: false };
    this.deleteStatement.run(name, clean(id, 200));
    return { id: current.id, deleted: true };
  }

  import(entity, records = [], { actorId = '' } = {}) {
    if (!Array.isArray(records)) throw new Error('import_records_must_be_array');
    const name = entityName(entity);
    const imported = [];
    this.db.exec('BEGIN');
    try {
      for (const record of records) {
        const existing = record?.id ? this.get(name, record.id) : null;
        imported.push(existing
          ? this.update(name, record.id, record)
          : this.create(name, record, { actorId })
        );
      }
      this.db.exec('COMMIT');
      return imported;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  close() {
    this.db.close();
  }
}

export const entityQueryMatch = queryMatch;
