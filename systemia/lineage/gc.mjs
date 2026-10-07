import { mkdir, open, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { lineage } from './core.mjs';
import { LargeObjectStore } from './large-object.mjs';

const PLAN_SCHEMA = 'evercraft.lineage.gc-plan.v1';
const QUARANTINE_SCHEMA = 'evercraft.lineage.gc-quarantine.v1';
const DEFAULT_GRACE_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const ID_RE = /^[a-f0-9]{64}$/;

function normalizePath(value) {
  return String(value).split(sep).join('/');
}

async function walkFiles(root) {
  const out = [];
  const walk = async (dir) => {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (error) {
      if (error?.code === 'ENOENT') return;
      throw error;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) out.push(full);
    }
  };
  await walk(root);
  return out;
}

function objectIdFromPath(root, file) {
  const rel = normalizePath(relative(root, file));
  const match = rel.match(/^([a-f0-9]{2})\/([a-f0-9]{62})\.json$/);
  return match ? match[1] + match[2] : null;
}

function chunkIdFromPath(root, file) {
  const rel = normalizePath(relative(root, file));
  const match = rel.match(/^([a-f0-9]{2})\/([a-f0-9]{62})$/);
  return match ? match[1] + match[2] : null;
}

async function inventoryFiles(root, parser) {
  const map = new Map();
  for (const file of await walkFiles(root)) {
    const id = parser(root, file);
    if (!id) continue;
    const s = await stat(file);
    map.set(id, {
      id,
      path: file,
      bytes: s.size,
      mtime_ms: s.mtimeMs,
    });
  }
  return map;
}

function collectIds(value, known, out) {
  if (typeof value === 'string') {
    if (ID_RE.test(value) && known.has(value)) out.add(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectIds(item, known, out);
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const item of Object.values(value)) collectIds(item, known, out);
}

function addKnownId(value, known, out) {
  const id = String(value || '');
  if (ID_RE.test(id) && known.has(id)) out.add(id);
}

function objectReferences(object, known) {
  const out = new Set();
  const payload = object?.payload || {};

  if (object?.type === 'commit') {
    addKnownId(payload.tree_id, known, out);
    for (const id of payload.parents || []) addKnownId(id, known, out);
    for (const id of payload.transactions || []) addKnownId(id, known, out);
    return out;
  }

  if (object?.type === 'tree') {
    for (const entry of payload.entries || []) {
      addKnownId(entry?.object_id, known, out);
    }
    return out;
  }

  if (object?.type === 'release') {
    addKnownId(payload.commit_id, known, out);
    collectIds(payload.authority_receipt_refs || [], known, out);
    return out;
  }

  if (object?.type === 'transaction') {
    collectIds(payload.inputs || [], known, out);
    collectIds(payload.outputs || [], known, out);
    collectIds(payload.evidence || [], known, out);
    return out;
  }

  if (object?.type === 'receipt') {
    if (payload.operation === 'transaction') {
      addKnownId(payload.transaction_id, known, out);
    }
    return out;
  }

  if (object?.type === 'large_blob_ref' || object?.type === 'blob') {
    return out;
  }

  // Unknown future object types fail conservative: retain any referenced
  // object identities until their GC semantics are explicitly defined.
  collectIds(payload, known, out);
  return out;
}

async function readRootFiles(dir, extractor) {
  const roots = [];
  for (const file of await walkFiles(dir)) {
    try {
      const raw = await readFile(file, 'utf8');
      const ids = extractor(raw);
      for (const id of ids) {
        if (ID_RE.test(id)) {
          roots.push({
            id,
            source: normalizePath(relative(dir, file)),
          });
        }
      }
    } catch (error) {
      const wrapped = new Error(`Unable to read Lineage GC root ${file}: ${error.message}`);
      wrapped.code = 'LINEAGE_GC_ROOT_READ_FAILED';
      throw wrapped;
    }
  }
  return roots;
}

async function discoverRoots(store, extraRoots = []) {
  const roots = [];

  roots.push(...await readRootFiles(
    join(store.dir, 'refs', 'heads'),
    (raw) => [raw.trim()]
  ));

  roots.push(...(await readRootFiles(
    join(store.dir, 'releases'),
    (raw) => [raw.trim()]
  )).map((row) => ({ ...row, source: `release:${row.source}` })));

  roots.push(...(await readRootFiles(
    join(store.dir, 'operations'),
    (raw) => {
      try {
        const parsed = JSON.parse(raw);
        return [String(parsed.receipt_id || '')];
      } catch {
        return [];
      }
    }
  )).map((row) => ({ ...row, source: `operation:${row.source}` })));

  for (const id of extraRoots || []) {
    const value = String(id || '').trim();
    if (!ID_RE.test(value)) throw new Error(`Invalid extra GC root: ${id}`);
    roots.push({ id: value, source: 'extra' });
  }

  const deduped = new Map();
  for (const root of roots) {
    if (!deduped.has(root.id)) deduped.set(root.id, new Set());
    deduped.get(root.id).add(root.source);
  }

  return [...deduped.entries()]
    .map(([id, sources]) => ({ id, sources: [...sources].sort() }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function summarize(items) {
  return {
    count: items.length,
    bytes: items.reduce((sum, row) => sum + Number(row.bytes || 0), 0),
  };
}

function planIdentity(plan) {
  return lineage.sha256(lineage.stable({
    schema: plan.schema,
    root_fingerprint: plan.root_fingerprint,
    grace_ms: plan.grace_ms,
    cutoff_ms: plan.cutoff_ms,
    candidates: {
      objects: plan.candidates.objects.map((row) => row.id),
      manifests: plan.candidates.manifests.map((row) => row.id),
      chunks: plan.candidates.chunks.map((row) => row.id),
    },
  }));
}

export async function planGarbageCollection(store, {
  graceMs = DEFAULT_GRACE_MS,
  nowMs = Date.now(),
  extraRoots = [],
} = {}) {
  await store.ensureInitialized();

  const grace = Number(graceMs);
  if (!Number.isFinite(grace) || grace < 0) {
    throw new Error('graceMs must be a non-negative finite number');
  }
  const cutoffMs = Number(nowMs) - grace;

  const objectRoot = join(store.dir, 'objects');
  const manifestRoot = join(store.dir, 'large-objects');
  const chunkRoot = join(store.dir, 'chunks');

  const [objects, manifests, chunks, roots] = await Promise.all([
    inventoryFiles(objectRoot, objectIdFromPath),
    inventoryFiles(manifestRoot, objectIdFromPath),
    inventoryFiles(chunkRoot, chunkIdFromPath),
    discoverRoots(store, extraRoots),
  ]);

  const rootFingerprint = lineage.sha256(lineage.stable(roots));
  const reachableObjects = new Set();
  const reachableManifests = new Set();
  const reachableChunks = new Set();
  const queue = [];

  for (const root of roots) {
    if (!objects.has(root.id)) {
      const error = new Error(
        `Lineage GC root ${root.id} is missing from object storage`
      );
      error.code = 'LINEAGE_GC_MISSING_ROOT_OBJECT';
      error.root = root;
      throw error;
    }
    queue.push(root.id);
  }

  while (queue.length) {
    const id = queue.shift();
    if (!id || reachableObjects.has(id)) continue;
    reachableObjects.add(id);

    const object = await store.readObject(id);
    const references = objectReferences(object, objects);
    for (const ref of references) {
      if (!reachableObjects.has(ref)) queue.push(ref);
    }

    if (object.type === 'large_blob_ref') {
      const manifestId = String(object.payload?.manifest_id || '');
      if (!ID_RE.test(manifestId)) {
        const error = new Error(`Reachable large blob ref ${id} has invalid manifest id`);
        error.code = 'LINEAGE_GC_INVALID_MANIFEST_REFERENCE';
        throw error;
      }
      reachableManifests.add(manifestId);
    }
  }

  const large = new LargeObjectStore(store.dir);
  for (const manifestId of reachableManifests) {
    if (!manifests.has(manifestId)) {
      const error = new Error(
        `Reachable large-object manifest ${manifestId} is missing`
      );
      error.code = 'LINEAGE_GC_MISSING_MANIFEST';
      throw error;
    }
    const manifest = await large.readManifest(manifestId);
    for (const chunk of manifest.chunks || []) {
      const chunkId = String(chunk?.id || '');
      if (!ID_RE.test(chunkId)) {
        const error = new Error(
          `Reachable manifest ${manifestId} contains invalid chunk id`
        );
        error.code = 'LINEAGE_GC_INVALID_CHUNK_REFERENCE';
        throw error;
      }
      if (!chunks.has(chunkId)) {
        const error = new Error(
          `Reachable chunk ${chunkId} from manifest ${manifestId} is missing`
        );
        error.code = 'LINEAGE_GC_MISSING_CHUNK';
        throw error;
      }
      reachableChunks.add(chunkId);
    }
  }

  const eligible = (row) => row.mtime_ms <= cutoffMs;
  const candidates = {
    objects: [...objects.values()]
      .filter((row) => !reachableObjects.has(row.id) && eligible(row))
      .sort((a, b) => a.id.localeCompare(b.id)),
    manifests: [...manifests.values()]
      .filter((row) => !reachableManifests.has(row.id) && eligible(row))
      .sort((a, b) => a.id.localeCompare(b.id)),
    chunks: [...chunks.values()]
      .filter((row) => !reachableChunks.has(row.id) && eligible(row))
      .sort((a, b) => a.id.localeCompare(b.id)),
  };

  const plan = {
    schema: PLAN_SCHEMA,
    created_at: new Date(Number(nowMs)).toISOString(),
    now_ms: Number(nowMs),
    grace_ms: grace,
    cutoff_ms: cutoffMs,
    roots,
    root_fingerprint: rootFingerprint,
    inventory: {
      objects: summarize([...objects.values()]),
      manifests: summarize([...manifests.values()]),
      chunks: summarize([...chunks.values()]),
    },
    reachable: {
      objects: reachableObjects.size,
      manifests: reachableManifests.size,
      chunks: reachableChunks.size,
    },
    candidates,
    reclaimable: {
      objects: summarize(candidates.objects),
      manifests: summarize(candidates.manifests),
      chunks: summarize(candidates.chunks),
      total_bytes:
        summarize(candidates.objects).bytes +
        summarize(candidates.manifests).bytes +
        summarize(candidates.chunks).bytes,
    },
    destructive: false,
  };
  plan.plan_id = planIdentity(plan);
  return plan;
}

async function acquireLock(store, payload) {
  const path = join(store.dir, 'gc.lock');
  let handle;
  try {
    handle = await open(path, 'wx');
    await handle.writeFile(JSON.stringify(payload) + '\n', 'utf8');
    await handle.sync();
    return {
      path,
      async release() {
        try { await handle.close(); } catch {}
        await rm(path, { force: true });
      },
    };
  } catch (error) {
    if (handle) {
      try { await handle.close(); } catch {}
    }
    if (error?.code === 'EEXIST') {
      const wrapped = new Error('Lineage garbage collection is already running');
      wrapped.code = 'LINEAGE_GC_LOCKED';
      throw wrapped;
    }
    throw error;
  }
}

function quarantineTarget(runDir, category, lineageDir, originalPath) {
  return join(
    runDir,
    category,
    normalizePath(relative(lineageDir, originalPath))
  );
}

async function moveCandidate(runDir, category, lineageDir, row) {
  const target = quarantineTarget(runDir, category, lineageDir, row.path);
  await mkdir(dirname(target), { recursive: true });
  await rename(row.path, target);
  return {
    id: row.id,
    bytes: row.bytes,
    from: normalizePath(relative(lineageDir, row.path)),
    to: normalizePath(relative(lineageDir, target)),
  };
}

async function restoreMovedCandidates(lineageDir, runDir, moved) {
  const failures = [];
  for (const category of ['chunks', 'manifests', 'objects']) {
    for (const row of [...(moved?.[category] || [])].reverse()) {
      const from = join(lineageDir, row.to);
      const to = join(lineageDir, row.from);
      try {
        await mkdir(dirname(to), { recursive: true });
        await rename(from, to);
      } catch (error) {
        failures.push({
          category,
          id: row.id,
          error: String(error?.message || error),
        });
      }
    }
  }
  await rm(runDir, { recursive: true, force: true });
  return failures;
}

export async function quarantineGarbage(store, plan, {
  retentionMs = DEFAULT_RETENTION_MS,
  nowMs = Date.now(),
  extraRoots = [],
} = {}) {
  if (!plan || plan.schema !== PLAN_SCHEMA || !plan.plan_id) {
    throw new Error('A valid Lineage GC plan is required');
  }

  const retention = Number(retentionMs);
  if (!Number.isFinite(retention) || retention < 0) {
    throw new Error('retentionMs must be a non-negative finite number');
  }

  const lock = await acquireLock(store, {
    schema: 'evercraft.lineage.gc-lock.v1',
    plan_id: plan.plan_id,
    acquired_at: new Date(Number(nowMs)).toISOString(),
  });

  try {
    const current = await planGarbageCollection(store, {
      graceMs: plan.grace_ms,
      nowMs: plan.now_ms,
      extraRoots,
    });
    if (current.plan_id !== plan.plan_id) {
      const error = new Error('Lineage GC plan is stale because roots or candidates changed');
      error.code = 'LINEAGE_GC_STALE_PLAN';
      error.expected_plan_id = plan.plan_id;
      error.current_plan_id = current.plan_id;
      throw error;
    }

    const runId = `${new Date(Number(nowMs)).toISOString().replace(/[:.]/g, '-')}-${plan.plan_id.slice(0, 12)}`;
    const runDir = join(store.dir, 'quarantine', runId);
    await mkdir(runDir, { recursive: true });

    const moved = {
      objects: [],
      manifests: [],
      chunks: [],
    };

    try {
      for (const row of plan.candidates.objects) {
        moved.objects.push(
          await moveCandidate(runDir, 'objects', store.dir, row)
        );
      }
      for (const row of plan.candidates.manifests) {
        moved.manifests.push(
          await moveCandidate(runDir, 'manifests', store.dir, row)
        );
      }
      for (const row of plan.candidates.chunks) {
        moved.chunks.push(
          await moveCandidate(runDir, 'chunks', store.dir, row)
        );
      }

      const rootsAfter = await discoverRoots(store, extraRoots);
      const fingerprintAfter = lineage.sha256(lineage.stable(rootsAfter));
      if (fingerprintAfter !== plan.root_fingerprint) {
        const error = new Error(
          'Lineage roots changed during GC quarantine'
        );
        error.code = 'LINEAGE_GC_ROOTS_CHANGED_DURING_QUARANTINE';
        throw error;
      }

      const manifest = {
        schema: QUARANTINE_SCHEMA,
        run_id: runId,
        plan_id: plan.plan_id,
        created_at: new Date(Number(nowMs)).toISOString(),
        retention_until: new Date(Number(nowMs) + retention).toISOString(),
        retention_ms: retention,
        root_fingerprint: plan.root_fingerprint,
        moved,
        reclaimable_bytes: plan.reclaimable.total_bytes,
        reversible: true,
      };
      await writeFile(
        join(runDir, 'quarantine.json'),
        JSON.stringify(manifest, null, 2) + '\n',
        'utf8'
      );

      const receiptId = await store._recordOperation({
        operation: 'gc_quarantine',
        run_id: runId,
        plan_id: plan.plan_id,
        moved_objects: moved.objects.length,
        moved_manifests: moved.manifests.length,
        moved_chunks: moved.chunks.length,
        reclaimable_bytes: plan.reclaimable.total_bytes,
        created_at: manifest.created_at,
        reversible_by: {
          operation: 'gc_restore_quarantine',
          run_id: runId,
        },
      }, { allowGcLock: true });

      return {
        ...manifest,
        receipt_id: receiptId,
      };
    } catch (error) {
      const rollbackFailures = await restoreMovedCandidates(
        store.dir,
        runDir,
        moved
      );
      if (rollbackFailures.length) {
        error.rollback_failures = rollbackFailures;
        error.code = error.code || 'LINEAGE_GC_QUARANTINE_ROLLBACK_FAILED';
      }
      throw error;
    }
  } finally {
    await lock.release();
  }
}

export async function restoreQuarantine(store, runId) {
  const runDir = join(store.dir, 'quarantine', String(runId));
  const manifest = JSON.parse(
    await readFile(join(runDir, 'quarantine.json'), 'utf8')
  );
  if (manifest.schema !== QUARANTINE_SCHEMA) {
    throw new Error(`Unsupported Lineage quarantine schema for ${runId}`);
  }

  const restored = { objects: 0, manifests: 0, chunks: 0 };
  for (const category of ['objects', 'manifests', 'chunks']) {
    for (const row of [...(manifest.moved?.[category] || [])].reverse()) {
      const from = join(store.dir, row.to);
      const to = join(store.dir, row.from);
      await mkdir(dirname(to), { recursive: true });
      await rename(from, to);
      restored[category] += 1;
    }
  }

  await rm(runDir, { recursive: true, force: true });
  const receiptId = await store._recordOperation({
    operation: 'gc_restore_quarantine',
    run_id: String(runId),
    restored,
    created_at: new Date().toISOString(),
  });
  return {
    schema: 'evercraft.lineage.gc-restore.v1',
    run_id: String(runId),
    restored,
    receipt_id: receiptId,
  };
}

export async function purgeQuarantine(store, runId, {
  nowMs = Date.now(),
} = {}) {
  const runDir = join(store.dir, 'quarantine', String(runId));
  const manifest = JSON.parse(
    await readFile(join(runDir, 'quarantine.json'), 'utf8')
  );
  if (manifest.schema !== QUARANTINE_SCHEMA) {
    throw new Error(`Unsupported Lineage quarantine schema for ${runId}`);
  }

  const retentionUntilMs = Date.parse(manifest.retention_until);
  if (Number(nowMs) < retentionUntilMs) {
    const error = new Error(
      `Lineage quarantine retention has not expired for ${runId}`
    );
    error.code = 'LINEAGE_GC_RETENTION_ACTIVE';
    error.retention_until = manifest.retention_until;
    throw error;
  }

  const purged = {
    objects: manifest.moved?.objects?.length || 0,
    manifests: manifest.moved?.manifests?.length || 0,
    chunks: manifest.moved?.chunks?.length || 0,
    bytes: Number(manifest.reclaimable_bytes || 0),
  };

  await rm(runDir, { recursive: true, force: true });
  const receiptId = await store._recordOperation({
    operation: 'gc_purge',
    run_id: String(runId),
    purged,
    created_at: new Date(Number(nowMs)).toISOString(),
    reversible_by: null,
  });

  return {
    schema: 'evercraft.lineage.gc-purge.v1',
    run_id: String(runId),
    purged,
    receipt_id: receiptId,
    reversible: false,
  };
}

export const garbageCollection = {
  plan_schema: PLAN_SCHEMA,
  quarantine_schema: QUARANTINE_SCHEMA,
  default_grace_ms: DEFAULT_GRACE_MS,
  default_retention_ms: DEFAULT_RETENTION_MS,
};
