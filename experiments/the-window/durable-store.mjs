import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createWorld, advanceWorld, REAL_TICK_MS } from './engine.mjs';

const FORMAT = 'evercraft.window.commit.v1';
const MAX_HISTORY_IN_RAM = 3000;
const MAX_HISTORY_PUBLIC = 1000;
const MAX_BOOT_LOG_BYTES = 256 * 1024 * 1024;
const ROTATE_AFTER_TICKS = 192;

function atomicWrite(file, data) {
  const tmp = file + '.tmp-' + process.pid;
  const fd = fs.openSync(tmp, 'w', 0o600);
  try {
    fs.writeFileSync(fd, data);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, file);
}

function appendDurable(file, record) {
  const fd = fs.openSync(file, 'a', 0o600);
  try {
    fs.writeFileSync(fd, JSON.stringify(record) + '\n');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function verifyCommit(record, previous) {
  if (record?.schema !== FORMAT || !Number.isSafeInteger(record.tick) ||
      record.tick < 0 || !record.world || record.world.tick !== record.tick ||
      !Number.isSafeInteger(record.world.next_event_id) ||
      !Array.isArray(record.events)) throw new Error('Invalid world commit');
  if (previous && record.tick !== previous.tick + 1) {
    throw new Error('Non-contiguous world commit: ' + previous.tick + ' -> ' + record.tick);
  }
  for (const event of record.events) {
    if (typeof event.id !== 'string' || !/^e\d+$/.test(event.id)) throw new Error('Invalid event id');
  }
  return record;
}

export class DurableWorldStore {
  constructor(root, options = {}) {
    this.root = root;
    this.file = path.join(root, 'snapshot.json');
    this.journalFile = path.join(root, 'commits.jsonl');
    this.listeners = new Set();
    this.now = options.now || Date.now;
    this.recoveredSnapshot = false;
    this.tornTailTruncated = false;
    this.journalStartTick = null;
    this.pendingTicks = 0;
    this.recentEvents = [];
    fs.mkdirSync(root, { recursive: true, mode: 0o700 });
    this.load();
  }

  load() {
    if (!fs.existsSync(this.journalFile)) {
      let world = fs.existsSync(this.file)
        ? JSON.parse(fs.readFileSync(this.file, 'utf8'))
        : createWorld(this.now());
      if (world.version !== 1) throw new Error('Unsupported world version');
      if (!Number.isSafeInteger(world.next_event_id)) world.next_event_id = world.tick * 32 + 1;
      if (!world.recovery) world.recovery = { missed_ticks: 0 };
      this.world = world;
      this.journalStartTick = world.tick;
      const events = [...world.events].reverse();
      appendDurable(this.journalFile, { schema: FORMAT, tick: world.tick, world, events });
      atomicWrite(this.file, JSON.stringify(world));
      this.recentEvents = events.slice(-MAX_HISTORY_IN_RAM);
      return;
    }

    const size = fs.statSync(this.journalFile).size;
    if (size > MAX_BOOT_LOG_BYTES) {
      throw new Error('Commit log exceeds 256MiB boot cap; archive and checkpoint before restarting');
    }

    const bytes = fs.readFileSync(this.journalFile);
    let text = bytes.toString('utf8');
    const finalNewline = text.lastIndexOf('\n');
    if (finalNewline < text.length - 1) {
      if (finalNewline < 0) throw new Error('No complete commit in journal');
      const cleanBytes = Buffer.byteLength(text.slice(0, finalNewline + 1));
      fs.truncateSync(this.journalFile, cleanBytes);
      text = text.slice(0, finalNewline + 1);
      this.tornTailTruncated = true;
    }
    let last = null;
    const events = [];
    for (const line of text.split('\n')) {
      if (!line) continue;
      const record = verifyCommit(JSON.parse(line), last);
      if (this.journalStartTick === null) this.journalStartTick = record.tick;
      last = record;
      events.push(...record.events);
      if (events.length > MAX_HISTORY_IN_RAM) events.splice(0, events.length - MAX_HISTORY_IN_RAM);
    }
    if (!last) throw new Error('No valid commits');
    this.world = last.world;
    this.recentEvents = events;
    const snapshot = fs.existsSync(this.file) ? JSON.parse(fs.readFileSync(this.file, 'utf8')) : null;
    if (snapshot && snapshot.tick > this.world.tick) {
      throw new Error('Snapshot ahead of committed journal; refusing ambiguous recovery');
    }
    if (!snapshot || JSON.stringify(snapshot) !== JSON.stringify(this.world)) {
      atomicWrite(this.file, JSON.stringify(this.world));
      this.recoveredSnapshot = true;
    }
  }

  tick(at = this.now()) {
    if (!Number.isFinite(at) || at <= this.world.last_tick_at) throw new Error('Non-monotonic tick time');
    const next = structuredClone(this.world);
    const priorId = next.next_event_id;
    advanceWorld(next, at);
    const events = next.events.filter(e => Number(e.id.slice(1)) >= priorId).reverse();
    appendDurable(this.journalFile, { schema: FORMAT, tick: next.tick, world: next, events });
    this.world = next;
    this.recentEvents.push(...events);
    if (this.recentEvents.length > MAX_HISTORY_IN_RAM) {
      this.recentEvents.splice(0, this.recentEvents.length - MAX_HISTORY_IN_RAM);
    }
    try {
      atomicWrite(this.file, JSON.stringify(this.world));
      this.rotateIfNeeded();
    } catch (err) {
      // Journal is committed; next boot will repair the snapshot. Do not roll back.
      console.error('Snapshot cache write failed; durable journal remains authoritative', err);
    }
    for (const listener of this.listeners) listener(this.world, events);
    return events;
  }

  rotateIfNeeded() {
    if (this.world.tick - this.journalStartTick < ROTATE_AFTER_TICKS) return;
    const archiveDir = path.join(this.root, 'archive');
    fs.mkdirSync(archiveDir, { recursive: true, mode: 0o700 });
    const archive = path.join(archiveDir,
      'commits-' + this.journalStartTick + '-' + this.world.tick + '.jsonl.gz');
    const compressed = zlib.gzipSync(fs.readFileSync(this.journalFile), { level: 6 });
    atomicWrite(archive, compressed);
    // Archive is durable before replacing the active log with its checkpoint.
    const checkpoint = {
      schema: FORMAT, tick: this.world.tick, world: this.world,
      events: [...this.world.events].reverse()
    };
    atomicWrite(this.journalFile, JSON.stringify(checkpoint) + '\n');
    this.journalStartTick = this.world.tick;
  }

  catchUp(maxSteps = 480) {
    const missed = Math.max(0, Math.floor((this.now() - this.world.last_tick_at) / REAL_TICK_MS));
    const steps = Math.min(missed, Math.max(0, Math.floor(maxSteps)));
    for (let i = 0; i < steps; i++) this.tick(this.world.last_tick_at + REAL_TICK_MS);
    const pending = Math.max(0, missed - steps);
    this.pendingTicks = pending;
    // Pending time belongs to operational health, not immutable committed game state.
    return { processed: steps, unprocessed: pending };
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  history(limit = 100) {
    const n = Number.isFinite(Number(limit))
      ? Math.floor(Number(limit)) : 100;
    return this.recentEvents.slice(-Math.min(Math.max(1, n), MAX_HISTORY_PUBLIC)).reverse();
  }

  status() {
    return {
      tick: this.world.tick,
      last_tick_at: this.world.last_tick_at,
      journaled: true,
      snapshot_recovered: this.recoveredSnapshot,
      torn_tail_truncated: this.tornTailTruncated,
      history_in_memory: this.recentEvents.length,
      recovery: { missed_ticks: this.pendingTicks },
      journal_start_tick: this.journalStartTick
    };
  }
}
