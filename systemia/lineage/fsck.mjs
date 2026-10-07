import { readdir, readFile } from 'node:fs/promises';
import { basename, dirname, join, relative } from 'node:path';
import { LargeObjectStore } from './large-object.mjs';

const HEX64 = /^[a-f0-9]{64}$/;

async function walkFiles(root) {
  const out = [];
  async function walk(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (error) {
      if (error?.code === 'ENOENT') return;
      throw error;
    }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) out.push(path);
    }
  }
  await walk(root);
  return out.sort();
}

function idFromShardPath(root, path, { extension = '' } = {}) {
  const rel = relative(root, path).split(/[/\\]/);
  if (rel.length !== 2) return null;
  const prefix = rel[0];
  let tail = rel[1];
  if (extension) {
    if (!tail.endsWith(extension)) return null;
    tail = tail.slice(0, -extension.length);
  }
  const id = `${prefix}${tail}`;
  return HEX64.test(id) ? id : null;
}

function pushError(errors, code, detail = {}) {
  errors.push({ code, ...detail });
}

function collectObjectReferences(object, knownObjects) {
  const refs = new Set();
  const add = (value) => {
    if (
      typeof value === 'string' &&
      HEX64.test(value) &&
      knownObjects.has(value)
    ) {
      refs.add(value);
    }
  };

  const payload = object?.payload || {};
  if (object?.type === 'commit') {
    add(payload.tree_id);
    for (const id of payload.parents || []) add(id);
    for (const id of payload.transactions || []) add(id);
  } else if (object?.type === 'tree') {
    for (const entry of payload.entries || []) add(entry?.object_id);
  } else if (object?.type === 'release') {
    add(payload.commit_id);
  }

  const visit = (value, depth = 0) => {
    if (depth > 8 || value == null) return;
    if (typeof value === 'string') {
      add(value);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
      return;
    }
    if (typeof value === 'object') {
      for (const item of Object.values(value)) visit(item, depth + 1);
    }
  };

  if (['transaction', 'receipt', 'release'].includes(object?.type)) {
    visit(payload);
  }
  return refs;
}

async function readPointerRoots(root, {
  parser,
  expectedType,
  label,
  store,
  validObjects,
  errors,
}) {
  for (const [id, object] of validObjects.entries()) {
    if (object.type === 'blob') {
      try {
        const bytes = Buffer.from(
          String(object.payload?.data || ''),
          object.payload?.encoding || 'base64'
        );
        const actualSha = store.constructor
          ? null
          : null;
        const expectedSize = Number(object.payload?.size);
        if (!Number.isInteger(expectedSize) || expectedSize !== bytes.length) {
          pushError(errors, 'blob_size_mismatch', {
            object_id: id,
            expected_size: object.payload?.size ?? null,
            actual_size: bytes.length,
          });
        }
        const { createHash } = await import('node:crypto');
        const actualContent = createHash('sha256').update(bytes).digest('hex');
        if (
          object.payload?.content_sha256 &&
          actualContent !== object.payload.content_sha256
        ) {
          pushError(errors, 'blob_content_digest_mismatch', {
            object_id: id,
            expected: object.payload.content_sha256,
            actual: actualContent,
          });
        }
      } catch (error) {
        pushError(errors, 'blob_payload_invalid', {
          object_id: id,
          error: String(error?.message || error),
        });
      }
    }

    if (object.type === 'commit') {
      const treeId = String(object.payload?.tree_id || '');
      const tree = validObjects.get(treeId);
      if (!tree || tree.type !== 'tree') {
        pushError(errors, 'commit_tree_invalid', {
          commit_id: id,
          tree_id: treeId || null,
          actual_type: tree?.type || null,
        });
      }
    }

    if (object.type === 'tree') {
      const seenPaths = new Set();
      for (const entry of object.payload?.entries || []) {
        const entryPath = String(entry?.path || '');
        if (!entryPath) {
          pushError(errors, 'tree_entry_path_missing', { tree_id: id });
        } else if (seenPaths.has(entryPath)) {
          pushError(errors, 'tree_entry_path_duplicate', {
            tree_id: id,
            path: entryPath,
          });
        } else {
          seenPaths.add(entryPath);
        }

        const childId = String(entry?.object_id || '');
        const child = validObjects.get(childId);
        if (!child) continue;

        if (!['blob', 'large_blob_ref'].includes(child.type)) {
          pushError(errors, 'tree_entry_object_wrong_type', {
            tree_id: id,
            path: entryPath || null,
            object_id: childId,
            actual_type: child.type,
          });
          continue;
        }

        if (child.type === 'blob') {
          if (
            entry?.content_sha256 &&
            child.payload?.content_sha256 &&
            entry.content_sha256 !== child.payload.content_sha256
          ) {
            pushError(errors, 'tree_entry_content_digest_mismatch', {
              tree_id: id,
              path: entryPath || null,
              object_id: childId,
            });
          }
          if (
            Number.isInteger(Number(entry?.bytes)) &&
            Number.isInteger(Number(child.payload?.size)) &&
            Number(entry.bytes) !== Number(child.payload.size)
          ) {
            pushError(errors, 'tree_entry_size_mismatch', {
              tree_id: id,
              path: entryPath || null,
              object_id: childId,
              tree_bytes: Number(entry.bytes),
              object_bytes: Number(child.payload.size),
            });
          }
        }

        if (child.type === 'large_blob_ref') {
          if (
            entry?.manifest_id &&
            entry.manifest_id !== child.payload?.manifest_id
          ) {
            pushError(errors, 'tree_entry_manifest_mismatch', {
              tree_id: id,
              path: entryPath || null,
              object_id: childId,
            });
          }
          if (
            entry?.content_sha256 &&
            child.payload?.content_sha256 &&
            entry.content_sha256 !== child.payload.content_sha256
          ) {
            pushError(errors, 'tree_entry_content_digest_mismatch', {
              tree_id: id,
              path: entryPath || null,
              object_id: childId,
            });
          }
          if (
            Number.isInteger(Number(entry?.bytes)) &&
            Number.isInteger(Number(child.payload?.size)) &&
            Number(entry.bytes) !== Number(child.payload.size)
          ) {
            pushError(errors, 'tree_entry_size_mismatch', {
              tree_id: id,
              path: entryPath || null,
              object_id: childId,
              tree_bytes: Number(entry.bytes),
              object_bytes: Number(child.payload.size),
            });
          }
        }
      }
    }

    if (object.type === 'release') {
      const commitId = String(object.payload?.commit_id || '');
      const commit = validObjects.get(commitId);
      if (!commit || commit.type !== 'commit') {
        pushError(errors, 'release_commit_invalid', {
          release_id: id,
          commit_id: commitId || null,
          actual_type: commit?.type || null,
        });
      }
    }
  }

  const roots = new Set();
  for (const path of await walkFiles(root)) {
    try {
      const value = await parser(path);
      if (!value) continue;
      if (!HEX64.test(value)) {
        pushError(errors, `${label}_pointer_invalid`, { path, value });
        continue;
      }
      const object = validObjects.get(value);
      if (!object) {
        pushError(errors, `${label}_pointer_missing_object`, {
          path,
          object_id: value,
        });
        continue;
      }
      if (expectedType && object.type !== expectedType) {
        pushError(errors, `${label}_pointer_wrong_type`, {
          path,
          object_id: value,
          expected_type: expectedType,
          actual_type: object.type,
        });
        continue;
      }
      roots.add(value);
    } catch (error) {
      pushError(errors, `${label}_pointer_unreadable`, {
        path,
        error: String(error?.message || error),
      });
    }
  }
  return roots;
}

export async function verifyLineageIntegrity(store, {
  verifyLargeContent = true,
} = {}) {
  await store.ensureInitialized();

  const errors = [];
  const warnings = [];
  const objectRoot = join(store.dir, 'objects');
  const manifestRoot = join(store.dir, 'large-objects');
  const chunkRoot = join(store.dir, 'chunks');
  const refRoot = join(store.dir, 'refs', 'heads');
  const releaseRoot = join(store.dir, 'releases');
  const operationRoot = join(store.dir, 'operations');

  const validObjects = new Map();
  const objectFiles = await walkFiles(objectRoot);

  for (const path of objectFiles) {
    const id = idFromShardPath(objectRoot, path, { extension: '.json' });
    if (!id) {
      pushError(errors, 'object_path_invalid', { path });
      continue;
    }
    try {
      validObjects.set(id, await store.readObject(id));
    } catch (error) {
      pushError(errors, 'object_invalid', {
        object_id: id,
        path,
        error: String(error?.message || error),
        error_code: error?.code || null,
      });
    }
  }

  const roots = new Set();

  for (const path of await walkFiles(refRoot)) {
    const name = relative(refRoot, path).split(/[/\\]/).join('/');
    let id;
    try {
      id = (await readFile(path, 'utf8')).trim();
    } catch (error) {
      pushError(errors, 'ref_unreadable', {
        ref: name,
        error: String(error?.message || error),
      });
      continue;
    }
    if (!id) continue;
    if (!HEX64.test(id)) {
      pushError(errors, 'ref_invalid_target', { ref: name, target: id });
      continue;
    }
    const object = validObjects.get(id);
    if (!object) {
      pushError(errors, 'ref_missing_target', { ref: name, target: id });
      continue;
    }
    if (object.type !== 'commit') {
      pushError(errors, 'ref_target_not_commit', {
        ref: name,
        target: id,
        actual_type: object.type,
      });
      continue;
    }
    roots.add(id);
  }

  const releaseRoots = await readPointerRoots(releaseRoot, {
    parser: async (path) => (await readFile(path, 'utf8')).trim(),
    expectedType: 'release',
    label: 'release',
    store,
    validObjects,
    errors,
  });
  for (const id of releaseRoots) roots.add(id);

  const operationRoots = await readPointerRoots(operationRoot, {
    parser: async (path) => {
      const parsed = JSON.parse(await readFile(path, 'utf8'));
      return String(parsed?.receipt_id || '').trim();
    },
    expectedType: 'receipt',
    label: 'operation',
    store,
    validObjects,
    errors,
  });
  for (const id of operationRoots) roots.add(id);

  const reachableObjects = new Set();
  const reachableManifests = new Set();
  const reachableLargeRefs = new Map();
  const queue = [...roots];

  while (queue.length) {
    const id = queue.shift();
    if (!id || reachableObjects.has(id)) continue;
    const object = validObjects.get(id);
    if (!object) {
      pushError(errors, 'reachable_object_missing_or_invalid', { object_id: id });
      continue;
    }
    reachableObjects.add(id);

    if (object.type === 'large_blob_ref') {
      const manifestId = String(object.payload?.manifest_id || '');
      if (!HEX64.test(manifestId)) {
        pushError(errors, 'large_blob_ref_manifest_invalid', {
          object_id: id,
          manifest_id: manifestId || null,
        });
      } else {
        reachableManifests.add(manifestId);
        reachableLargeRefs.set(id, {
          manifest_id: manifestId,
          content_sha256: object.payload?.content_sha256 || null,
          size: Number(object.payload?.size),
          chunk_count: Number(object.payload?.chunk_count),
          media_type: object.payload?.media_type || null,
        });
      }
    }

    for (const ref of collectObjectReferences(object, validObjects)) {
      if (!reachableObjects.has(ref)) queue.push(ref);
    }

    if (object.type === 'commit') {
      const required = [
        object.payload?.tree_id,
        ...(object.payload?.parents || []),
        ...(object.payload?.transactions || []),
      ].filter(Boolean);
      for (const child of required) {
        if (!HEX64.test(String(child)) || !validObjects.has(String(child))) {
          pushError(errors, 'commit_reference_missing', {
            commit_id: id,
            referenced_id: child,
          });
        }
      }
    }

    if (object.type === 'tree') {
      for (const entry of object.payload?.entries || []) {
        const child = String(entry?.object_id || '');
        if (!HEX64.test(child) || !validObjects.has(child)) {
          pushError(errors, 'tree_entry_object_missing', {
            tree_id: id,
            path: entry?.path || null,
            object_id: child || null,
          });
        }
      }
    }
  }

  const large = new LargeObjectStore(store.dir);
  const validManifests = new Map();
  const manifestFiles = await walkFiles(manifestRoot);

  for (const path of manifestFiles) {
    const id = idFromShardPath(manifestRoot, path, { extension: '.json' });
    if (!id) {
      pushError(errors, 'large_manifest_path_invalid', { path });
      continue;
    }
    try {
      validManifests.set(id, await large.readManifest(id));
    } catch (error) {
      pushError(errors, 'large_manifest_invalid', {
        manifest_id: id,
        path,
        error: String(error?.message || error),
      });
    }
  }

  for (const [manifestId, manifest] of validManifests.entries()) {
    if (!HEX64.test(String(manifest?.content_sha256 || ''))) {
      pushError(errors, 'large_manifest_content_digest_invalid', {
        manifest_id: manifestId,
        content_sha256: manifest?.content_sha256 || null,
      });
    }
    const declaredBytes = Number(manifest?.bytes);
    const summedBytes = (manifest?.chunks || []).reduce(
      (sum, chunk) => sum + Number(chunk?.bytes || 0),
      0
    );
    if (!Number.isInteger(declaredBytes) || declaredBytes !== summedBytes) {
      pushError(errors, 'large_manifest_size_mismatch', {
        manifest_id: manifestId,
        declared_bytes: manifest?.bytes ?? null,
        chunk_bytes: summedBytes,
      });
    }
  }

  for (const [objectId, ref] of reachableLargeRefs.entries()) {
    const manifest = validManifests.get(ref.manifest_id);
    if (!manifest) continue;

    if (
      ref.content_sha256 &&
      manifest.content_sha256 !== ref.content_sha256
    ) {
      pushError(errors, 'large_blob_ref_content_digest_mismatch', {
        object_id: objectId,
        manifest_id: ref.manifest_id,
      });
    }
    if (
      Number.isInteger(ref.size) &&
      Number(manifest.bytes) !== ref.size
    ) {
      pushError(errors, 'large_blob_ref_size_mismatch', {
        object_id: objectId,
        manifest_id: ref.manifest_id,
        ref_bytes: ref.size,
        manifest_bytes: Number(manifest.bytes),
      });
    }
    if (
      Number.isInteger(ref.chunk_count) &&
      Number(manifest.chunks?.length || 0) !== ref.chunk_count
    ) {
      pushError(errors, 'large_blob_ref_chunk_count_mismatch', {
        object_id: objectId,
        manifest_id: ref.manifest_id,
        ref_chunk_count: ref.chunk_count,
        manifest_chunk_count: Number(manifest.chunks?.length || 0),
      });
    }
    if (
      ref.media_type &&
      manifest.media_type &&
      ref.media_type !== manifest.media_type
    ) {
      pushError(errors, 'large_blob_ref_media_type_mismatch', {
        object_id: objectId,
        manifest_id: ref.manifest_id,
        ref_media_type: ref.media_type,
        manifest_media_type: manifest.media_type,
      });
    }
  }

  const validChunks = new Set();
  const chunkFiles = await walkFiles(chunkRoot);

  for (const path of chunkFiles) {
    const id = idFromShardPath(chunkRoot, path);
    if (!id) {
      pushError(errors, 'chunk_path_invalid', { path });
      continue;
    }
    try {
      await large.getChunk(id);
      validChunks.add(id);
    } catch (error) {
      pushError(errors, 'chunk_invalid', {
        chunk_id: id,
        path,
        error: String(error?.message || error),
      });
    }
  }

  const reachableChunks = new Set();

  for (const manifestId of reachableManifests) {
    const manifest = validManifests.get(manifestId);
    if (!manifest) {
      pushError(errors, 'reachable_large_manifest_missing_or_invalid', {
        manifest_id: manifestId,
      });
      continue;
    }

    for (const chunk of manifest.chunks || []) {
      const chunkId = String(chunk?.id || '');
      if (!HEX64.test(chunkId) || !validChunks.has(chunkId)) {
        pushError(errors, 'reachable_chunk_missing_or_invalid', {
          manifest_id: manifestId,
          chunk_id: chunkId || null,
        });
      } else {
        reachableChunks.add(chunkId);
      }
    }

    if (verifyLargeContent) {
      try {
        await large.verify(manifestId);
      } catch (error) {
        pushError(errors, 'reachable_large_content_invalid', {
          manifest_id: manifestId,
          error: String(error?.message || error),
        });
      }
    }
  }

  const danglingObjects = [...validObjects.keys()]
    .filter((id) => !reachableObjects.has(id))
    .sort();
  const danglingManifests = [...validManifests.keys()]
    .filter((id) => !reachableManifests.has(id))
    .sort();
  const danglingChunks = [...validChunks]
    .filter((id) => !reachableChunks.has(id))
    .sort();

  if (danglingObjects.length) {
    warnings.push({
      code: 'dangling_objects_present',
      count: danglingObjects.length,
    });
  }
  if (danglingManifests.length) {
    warnings.push({
      code: 'dangling_large_manifests_present',
      count: danglingManifests.length,
    });
  }
  if (danglingChunks.length) {
    warnings.push({
      code: 'dangling_chunks_present',
      count: danglingChunks.length,
    });
  }

  return {
    schema: 'evercraft.lineage.fsck.v1',
    ok: errors.length === 0,
    verification: {
      local_object_digests: true,
      refs: true,
      releases: true,
      operation_receipts: true,
      large_manifest_digests: true,
      chunk_digests: true,
      large_content_digest: Boolean(verifyLargeContent),
    },
    roots: roots.size,
    objects: {
      stored: validObjects.size,
      reachable: reachableObjects.size,
      dangling: danglingObjects,
    },
    large_objects: {
      manifests_stored: validManifests.size,
      manifests_reachable: reachableManifests.size,
      dangling_manifests: danglingManifests,
      chunks_stored: validChunks.size,
      chunks_reachable: reachableChunks.size,
      dangling_chunks: danglingChunks,
    },
    errors,
    warnings,
    mutation_performed: false,
  };
}
