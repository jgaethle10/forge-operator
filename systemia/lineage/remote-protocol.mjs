import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { lineage } from './core.mjs';

const SCHEMA = 'evercraft.lineage.remote.v1';


function lineageObjectId(bytes) {
  const parsed = JSON.parse(Buffer.from(bytes).toString('utf8'));
  return lineage.sha256(lineage.stable(parsed));
}

function assertRefName(name) {
  if (!name || !/^[A-Za-z0-9._/-]+$/.test(name) || name.includes('..') || name.startsWith('/') || name.endsWith('/')) {
    throw new Error(`Invalid ref name: ${name}`);
  }
}

export class LocalLineageRemote {
  constructor(root) {
    this.root = resolve(root);
    this.objects = join(this.root, 'objects');
    this.refs = join(this.root, 'refs', 'heads');
  }

  async init() {
    await Promise.all([
      mkdir(this.objects, { recursive: true }),
      mkdir(this.refs, { recursive: true })
    ]);
    return { schema: SCHEMA, root: this.root };
  }

  objectPath(id) {
    return join(this.objects, id.slice(0, 2), `${id.slice(2)}.json`);
  }

  refPath(name) {
    assertRefName(name);
    return join(this.refs, name);
  }

  async hasObject(id) {
    try {
      const s = await stat(this.objectPath(id));
      return s.isFile();
    } catch {
      return false;
    }
  }

  async putObject(id, bytes) {
    if (!Buffer.isBuffer(bytes)) bytes = Buffer.from(bytes);
    const actual = lineageObjectId(bytes);
    if (actual !== id) {
      throw new Error(`Remote object digest mismatch: expected ${id}, got ${actual}`);
    }
    const path = this.objectPath(id);
    await mkdir(dirname(path), { recursive: true });
    if (!(await this.hasObject(id))) await writeFile(path, bytes);
    return { id, bytes: bytes.length, stored: true };
  }

  async getObject(id) {
    const bytes = await readFile(this.objectPath(id));
    const actual = lineageObjectId(bytes);
    if (actual !== id) {
      throw new Error(`Remote object corrupt: expected ${id}, got ${actual}`);
    }
    return bytes;
  }

  async readRef(name) {
    try {
      return (await readFile(this.refPath(name), 'utf8')).trim() || null;
    } catch {
      return null;
    }
  }

  async compareAndSwapRef(name, expected, next) {
    assertRefName(name);
    const current = await this.readRef(name);
    const expectedNormalized = expected || null;
    if (current !== expectedNormalized) {
      const error = new Error(`Stale ref update for ${name}: expected ${expectedNormalized ?? '<empty>'}, current ${current ?? '<empty>'}`);
      error.code = 'STALE_REF';
      error.ref = name;
      error.expected = expectedNormalized;
      error.current = current;
      error.next = next;
      throw error;
    }
    if (next && !/^[a-f0-9]{64}$/.test(next)) throw new Error(`Invalid commit/object id: ${next}`);
    const path = this.refPath(name);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, next ? `${next}\n` : '', 'utf8');
    return {
      schema: SCHEMA,
      ref: name,
      previous: current,
      current: next || null,
      compare_and_swap: true
    };
  }

  async advertiseRefs() {
    const out = {};
    const walk = async (dir, prefix = '') => {
      let entries = [];
      try {
        const { readdir } = await import('node:fs/promises');
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const nextPrefix = prefix ? `${prefix}/${entry.name}` : entry.name;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) await walk(full, nextPrefix);
        else if (entry.isFile()) out[nextPrefix] = (await readFile(full, 'utf8')).trim() || null;
      }
    };
    await walk(this.refs);
    return { schema: SCHEMA, refs: out };
  }
}

export async function pushCommitGraph({ store, remote, branch = 'main', expectedRemoteHead = null, localHead = 'HEAD' }) {
  await remote.init();
  const target = await store.resolveRef(localHead);
  if (!target) throw new Error(`Cannot push empty ref: ${localHead}`);

  const queue = [target];
  const seen = new Set();
  let transferred = 0;
  let reused = 0;

  while (queue.length) {
    const id = queue.shift();
    if (!id || seen.has(id)) continue;
    seen.add(id);

    const path = store.objectPath(id);
    const bytes = await readFile(path);
    if (await remote.hasObject(id)) {
      reused += 1;
    } else {
      await remote.putObject(id, bytes);
      transferred += 1;
    }

    const object = JSON.parse(bytes.toString('utf8'));
    if (object.type === 'commit') {
      queue.push(object.payload.tree_id, ...(object.payload.parents || []), ...(object.payload.transactions || []));
    } else if (object.type === 'tree') {
      queue.push(...(object.payload.entries || []).map((entry) => entry.object_id));
    }
  }

  const refReceipt = await remote.compareAndSwapRef(branch, expectedRemoteHead, target);
  return {
    schema: 'evercraft.lineage.push-receipt.v1',
    branch,
    head: target,
    object_count: seen.size,
    transferred_objects: transferred,
    reused_objects: reused,
    ref: refReceipt
  };
}


async function localHasObject(store, id) {
  try {
    const bytes = await readFile(store.objectPath(id));
    return lineageObjectId(bytes) === id;
  } catch {
    return false;
  }
}

export async function fetchCommitGraph({
  store,
  remote,
  remoteBranch = 'main',
  localBranch = remoteBranch,
  updateLocalRef = true
}) {
  await remote.init();
  const remoteHead = await remote.readRef(remoteBranch);
  if (!remoteHead) {
    return {
      schema: 'evercraft.lineage.fetch-receipt.v1',
      remote_branch: remoteBranch,
      local_branch: localBranch,
      remote_head: null,
      object_count: 0,
      transferred_objects: 0,
      reused_objects: 0,
      ref_updated: false,
      state: 'remote_empty'
    };
  }

  const queue = [remoteHead];
  const seen = new Set();
  let transferred = 0;
  let reused = 0;

  while (queue.length) {
    const id = queue.shift();
    if (!id || seen.has(id)) continue;
    seen.add(id);

    const bytes = await remote.getObject(id);
    const object = JSON.parse(bytes.toString('utf8'));

    if (await localHasObject(store, id)) {
      reused += 1;
    } else {
      const path = store.objectPath(id);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, bytes);
      transferred += 1;
    }

    if (object.type === 'commit') {
      queue.push(object.payload.tree_id, ...(object.payload.parents || []), ...(object.payload.transactions || []));
    } else if (object.type === 'tree') {
      queue.push(...(object.payload.entries || []).map((entry) => entry.object_id));
    }
  }

  let localHead = null;
  try {
    localHead = await store.resolveRef(localBranch);
  } catch {
    localHead = null;
  }

  const ancestors = await store.ancestors(remoteHead);
  const canFastForward = !localHead || localHead === remoteHead || ancestors.has(localHead);

  if (!updateLocalRef) {
    return {
      schema: 'evercraft.lineage.fetch-receipt.v1',
      remote_branch: remoteBranch,
      local_branch: localBranch,
      remote_head: remoteHead,
      local_head_before: localHead,
      object_count: seen.size,
      transferred_objects: transferred,
      reused_objects: reused,
      ref_updated: false,
      fast_forward_possible: canFastForward,
      state: 'objects_fetched'
    };
  }

  if (!canFastForward) {
    return {
      schema: 'evercraft.lineage.fetch-receipt.v1',
      remote_branch: remoteBranch,
      local_branch: localBranch,
      remote_head: remoteHead,
      local_head_before: localHead,
      object_count: seen.size,
      transferred_objects: transferred,
      reused_objects: reused,
      ref_updated: false,
      fast_forward_possible: false,
      state: 'diverged_requires_reconciliation'
    };
  }

  await store.writeRef(localBranch, remoteHead);
  return {
    schema: 'evercraft.lineage.fetch-receipt.v1',
    remote_branch: remoteBranch,
    local_branch: localBranch,
    remote_head: remoteHead,
    local_head_before: localHead,
    local_head_after: remoteHead,
    object_count: seen.size,
    transferred_objects: transferred,
    reused_objects: reused,
    ref_updated: true,
    fast_forward_possible: true,
    state: localHead === remoteHead ? 'already_current' : 'fast_forwarded'
  };
}
