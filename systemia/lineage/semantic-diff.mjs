import { extname } from 'node:path';

function lines(text) {
  return String(text ?? '').replace(/\r\n/g, '\n').split('\n');
}

function commonPrefix(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  return i;
}

function commonSuffix(a, b, prefix) {
  let i = 0;
  while (
    i < a.length - prefix &&
    i < b.length - prefix &&
    a[a.length - 1 - i] === b[b.length - 1 - i]
  ) i += 1;
  return i;
}

function textSummary(before, after) {
  const a = lines(before);
  const b = lines(after);
  const prefix = commonPrefix(a, b);
  const suffix = commonSuffix(a, b, prefix);
  const removed = a.slice(prefix, a.length - suffix);
  const added = b.slice(prefix, b.length - suffix);
  return {
    adapter: 'text',
    before_lines: a.length,
    after_lines: b.length,
    changed_from_line: prefix + 1,
    removed_lines: removed.length,
    added_lines: added.length,
    before_excerpt: removed.slice(0, 8),
    after_excerpt: added.slice(0, 8),
    truncated: removed.length > 8 || added.length > 8
  };
}

function walkJson(value, prefix = '', out = new Map()) {
  if (Array.isArray(value)) {
    out.set(prefix || '$', { type: 'array', length: value.length });
    value.forEach((item, index) => walkJson(item, `${prefix}[${index}]`, out));
    return out;
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    out.set(prefix || '$', { type: 'object', keys });
    for (const key of keys) {
      walkJson(value[key], prefix ? `${prefix}.${key}` : key, out);
    }
    return out;
  }
  out.set(prefix || '$', { type: value === null ? 'null' : typeof value, value });
  return out;
}

function sameJsonLeaf(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function jsonSummary(before, after) {
  let a;
  let b;
  try {
    a = JSON.parse(before);
    b = JSON.parse(after);
  } catch {
    return { adapter: 'json', parseable: false, fallback: textSummary(before, after) };
  }
  const am = walkJson(a);
  const bm = walkJson(b);
  const paths = [...new Set([...am.keys(), ...bm.keys()])].sort();
  const changed = [];
  for (const path of paths) {
    if (!am.has(path)) changed.push({ path, status: 'added', after: bm.get(path) });
    else if (!bm.has(path)) changed.push({ path, status: 'deleted', before: am.get(path) });
    else if (!sameJsonLeaf(am.get(path), bm.get(path))) changed.push({ path, status: 'modified', before: am.get(path), after: bm.get(path) });
  }
  return {
    adapter: 'json',
    parseable: true,
    changed_paths: changed.slice(0, 100),
    change_count: changed.length,
    truncated: changed.length > 100
  };
}

function splitCsvLine(line) {
  const out = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        field += '"';
        i += 1;
      } else quoted = !quoted;
    } else if (char === ',' && !quoted) {
      out.push(field);
      field = '';
    } else field += char;
  }
  out.push(field);
  return out;
}

function csvSummary(before, after) {
  const a = lines(before).filter((line) => line.length > 0);
  const b = lines(after).filter((line) => line.length > 0);
  const ah = a[0] ? splitCsvLine(a[0]) : [];
  const bh = b[0] ? splitCsvLine(b[0]) : [];
  return {
    adapter: 'csv',
    before_rows: Math.max(0, a.length - 1),
    after_rows: Math.max(0, b.length - 1),
    before_columns: ah,
    after_columns: bh,
    added_columns: bh.filter((x) => !ah.includes(x)),
    removed_columns: ah.filter((x) => !bh.includes(x)),
    row_delta: Math.max(0, b.length - 1) - Math.max(0, a.length - 1)
  };
}

function worldSummary(before, after) {
  let a;
  let b;
  try {
    a = JSON.parse(before);
    b = JSON.parse(after);
  } catch {
    return { adapter: 'world', parseable: false, fallback: textSummary(before, after) };
  }
  const count = (obj, key) => Array.isArray(obj?.[key]) ? obj[key].length : 0;
  const keys = ['scenes','nodes','meshes','materials','textures','animations','cameras','lights'];
  const counts = Object.fromEntries(keys.map((key) => [key, {
    before: count(a, key),
    after: count(b, key),
    delta: count(b, key) - count(a, key)
  }]));
  const named = (obj, key) => (Array.isArray(obj?.[key]) ? obj[key] : [])
    .map((item, index) => item?.name || `${key}[${index}]`);
  const namedChanges = {};
  for (const key of ['scenes','nodes','meshes','materials','animations','cameras']) {
    const aa = named(a, key);
    const bb = named(b, key);
    namedChanges[key] = {
      added: bb.filter((name) => !aa.includes(name)),
      removed: aa.filter((name) => !bb.includes(name))
    };
  }
  return { adapter: 'world', parseable: true, counts, named_changes: namedChanges };
}

export function selectSemanticAdapter(path, kind) {
  const ext = extname(path).toLowerCase();
  if (kind === 'world_asset' && ['.gltf','.json'].includes(ext)) return 'world';
  if (['.json','.jsonl','.geojson'].includes(ext)) return 'json';
  if (['.csv','.tsv'].includes(ext)) return ext === '.csv' ? 'csv' : 'text';
  if (['code','document'].includes(kind)) return 'text';
  return 'binary';
}

export function semanticSummary({ path, kind, before = null, after = null }) {
  const adapter = selectSemanticAdapter(path, kind);
  if (before === null || after === null) {
    return {
      adapter,
      state_change: before === null ? 'created' : 'deleted',
      semantic_comparison_available: false
    };
  }
  if (adapter === 'json') return jsonSummary(before, after);
  if (adapter === 'csv') return csvSummary(before, after);
  if (adapter === 'world') return worldSummary(before, after);
  if (adapter === 'text') return textSummary(before, after);
  return { adapter: 'binary', semantic_comparison_available: false };
}

async function blobText(store, entry) {
  if (!entry) return null;
  const object = await store.readObject(entry.object_id);
  if (object.type !== 'blob') throw new Error(`Expected blob for ${entry.path}`);
  const bytes = Buffer.from(object.payload.data, object.payload.encoding);
  const adapter = selectSemanticAdapter(entry.path, entry.kind);
  if (adapter === 'binary') return null;
  return bytes.toString('utf8');
}

export async function semanticDiff(store, from = 'HEAD', to = null) {
  const raw = await store.diff(from, to);
  const changes = [];
  for (const change of raw.changes) {
    const beforeText = await blobText(store, change.before);
    const afterText = await blobText(store, change.after);
    changes.push({
      ...change,
      semantic: semanticSummary({
        path: change.path,
        kind: change.after?.kind || change.before?.kind || 'artifact',
        before: beforeText,
        after: afterText
      })
    });
  }
  return { ...raw, semantic: true, changes };
}
