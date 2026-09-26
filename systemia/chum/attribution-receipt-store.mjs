import fs from 'node:fs';
import path from 'node:path';

function clean(value) {
  return String(value ?? '').trim();
}

function parseLine(line) {
  try { return JSON.parse(line); } catch { return null; }
}

export function createAttributionReceiptStore({
  persistPath,
  maxEvents = 50000,
  maxBytes = 10 * 1024 * 1024,
} = {}) {
  const file = clean(persistPath);
  const enabled = Boolean(file);
  const seen = new Set();

  function ensureParent() {
    if (!enabled) return;
    fs.mkdirSync(path.dirname(file), { recursive: true });
  }

  function loadSeen() {
    if (!enabled || !fs.existsSync(file)) return;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      if (!line.trim()) continue;
      const event = parseLine(line);
      if (event?.event_id) seen.add(event.event_id);
    }
  }

  function compactIfNeeded() {
    if (!enabled || !fs.existsSync(file)) return;
    const stat = fs.statSync(file);
    if (stat.size <= maxBytes) return;

    const events = read({ limit: maxEvents });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, events.map((event) => JSON.stringify(event)).join('\n') + (events.length ? '\n' : ''));
    fs.renameSync(tmp, file);

    seen.clear();
    for (const event of events) if (event?.event_id) seen.add(event.event_id);
  }

  function append(event) {
    if (!enabled) return { persisted: false, state: 'receipt_store_disabled' };
    if (!event || event.schema !== 'evercraft.chum.attribution-event.v1' || !event.event_id) {
      throw new Error('Receipt store accepts only CHUM attribution events with event_id.');
    }
    if (seen.has(event.event_id)) {
      return { persisted: true, state: 'duplicate_ignored', event_id: event.event_id };
    }

    ensureParent();
    fs.appendFileSync(file, JSON.stringify(event) + '\n');
    seen.add(event.event_id);
    compactIfNeeded();
    return { persisted: true, state: 'receipt_stored', event_id: event.event_id };
  }

  function read({ since = '', limit = 5000 } = {}) {
    if (!enabled || !fs.existsSync(file)) return [];
    const bounded = Math.max(1, Math.min(Number(limit) || 5000, maxEvents));
    const threshold = clean(since);
    const events = fs.readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .flatMap((line) => {
        const parsed = parseLine(line);
        return parsed ? [parsed] : [];
      })
      .filter((event) => !threshold || clean(event.occurred_at) > threshold);

    return events.slice(-bounded);
  }

  function status() {
    const exists = enabled && fs.existsSync(file);
    return {
      enabled,
      exists,
      event_count: exists ? read({ limit: maxEvents }).length : 0,
      bytes: exists ? fs.statSync(file).size : 0,
      max_events: maxEvents,
      max_bytes: maxBytes,
      durability: enabled ? 'filesystem_path_configured' : 'disabled',
    };
  }

  loadSeen();

  return { append, read, status };
}
