import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';

const SCHEMA = 'evercraft.lineage.v1';
const DEFAULT_EXCLUDES = new Set(['.lineage', '.git', 'node_modules']);

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function now() {
  return new Date().toISOString();
}

function normalizePath(path) {
  return path.split(sep).join('/');
}

function classifyAsset(path) {
  const ext = extname(path).toLowerCase();
  if (['.js','.mjs','.cjs','.ts','.tsx','.jsx','.py','.go','.rs','.java','.kt','.swift','.c','.cc','.cpp','.h','.hpp','.sh','.sql','.css','.html'].includes(ext)) return 'code';
  if (['.md','.mdx','.txt','.rtf','.doc','.docx','.pdf'].includes(ext)) return 'document';
  if (['.json','.jsonl','.csv','.tsv','.parquet','.arrow','.geojson','.ndjson'].includes(ext)) return 'dataset';
  if (['.png','.jpg','.jpeg','.webp','.gif','.tiff','.bmp','.svg'].includes(ext)) return 'image';
  if (['.mp4','.mov','.mkv','.webm','.avi','.m4v'].includes(ext)) return 'video';
  if (['.wav','.mp3','.flac','.aac','.m4a','.ogg'].includes(ext)) return 'audio';
  if (['.blend','.fbx','.obj','.gltf','.glb','.usd','.usda','.usdc','.abc'].includes(ext)) return 'world_asset';
  return 'artifact';
}

function assertBranchName(name) {
  if (!name || !/^[A-Za-z0-9._/-]+$/.test(name) || name.includes('..') || name.startsWith('/') || name.endsWith('/')) {
    throw new Error(`Invalid branch name: ${name}`);
  }
}

export class LineageStore {
  constructor(root = process.cwd()) {
    this.root = resolve(root);
    this.dir = join(this.root, '.lineage');
  }

  async init({ branch = 'main' } = {}) {
    assertBranchName(branch);
    await Promise.all([
      mkdir(join(this.dir, 'objects'), { recursive: true }),
      mkdir(join(this.dir, 'refs', 'heads'), { recursive: true }),
      mkdir(join(this.dir, 'operations'), { recursive: true }),
    ]);
    await writeFile(join(this.dir, 'HEAD'), `ref: refs/heads/${branch}\n`, 'utf8');
    const ref = join(this.dir, 'refs', 'heads', branch);
    try { await readFile(ref, 'utf8'); } catch { await writeFile(ref, '', 'utf8'); }
    return { schema: SCHEMA, root: this.root, branch };
  }

  async ensureInitialized() {
    try { await readFile(join(this.dir, 'HEAD'), 'utf8'); }
    catch { throw new Error(`Lineage is not initialized at ${this.root}`); }
  }

  async currentBranch() {
    await this.ensureInitialized();
    const head = (await readFile(join(this.dir, 'HEAD'), 'utf8')).trim();
    if (!head.startsWith('ref: refs/heads/')) throw new Error(`Unsupported HEAD: ${head}`);
    return head.slice('ref: refs/heads/'.length);
  }

  objectPath(id) {
    return join(this.dir, 'objects', id.slice(0, 2), `${id.slice(2)}.json`);
  }

  async putObject(type, payload) {
    const envelope = { schema: SCHEMA, type, payload };
    const encoded = stable(envelope);
    const id = sha256(encoded);
    const path = this.objectPath(id);
    await mkdir(dirname(path), { recursive: true });
    try { await readFile(path); }
    catch { await writeFile(path, `${encoded}\n`, 'utf8'); }
    return id;
  }

  async readObject(id) {
    const parsed = JSON.parse(await readFile(this.objectPath(id), 'utf8'));
    if (parsed.schema !== SCHEMA) throw new Error(`Unsupported object schema for ${id}`);
    return parsed;
  }

  async resolveRef(ref = 'HEAD') {
    await this.ensureInitialized();
    if (/^[a-f0-9]{64}$/.test(ref)) return ref;
    let branch = ref;
    if (ref === 'HEAD') branch = await this.currentBranch();
    const path = join(this.dir, 'refs', 'heads', branch);
    try {
      const id = (await readFile(path, 'utf8')).trim();
      return id || null;
    } catch {
      throw new Error(`Unknown ref: ${ref}`);
    }
  }

  async writeRef(branch, id) {
    assertBranchName(branch);
    if (id) {
      const object = await this.readObject(id);
      if (object.type !== 'commit') throw new Error(`Ref target is not a commit: ${id}`);
    }
    const path = join(this.dir, 'refs', 'heads', branch);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, id ? `${id}\n` : '', 'utf8');
  }

  async listWorkspaceFiles(dir = this.root, excludes = DEFAULT_EXCLUDES) {
    const output = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (excludes.has(entry.name)) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) output.push(...await this.listWorkspaceFiles(full, excludes));
      else if (entry.isFile()) output.push(full);
    }
    return output.sort();
  }

  async snapshotWorkspace({ excludes = DEFAULT_EXCLUDES } = {}) {
    await this.ensureInitialized();
    const files = await this.listWorkspaceFiles(this.root, excludes);
    const entries = [];
    for (const full of files) {
      const bytes = await readFile(full);
      const path = normalizePath(relative(this.root, full));
      const contentSha256 = sha256(bytes);
      const objectId = await this.putObject('blob', {
        encoding: 'base64',
        size: bytes.length,
        content_sha256: contentSha256,
        data: bytes.toString('base64'),
      });
      entries.push({ path, kind: classifyAsset(path), mode: '100644', object_id: objectId, content_sha256: contentSha256, bytes: bytes.length });
    }
    const treeId = await this.putObject('tree', { entries });
    return { tree_id: treeId, entries };
  }

  async getTree(commitish = 'HEAD') {
    const commitId = await this.resolveRef(commitish);
    if (!commitId) return { commit_id: null, tree_id: null, entries: [] };
    const commit = await this.readObject(commitId);
    if (commit.type !== 'commit') throw new Error(`${commitish} does not resolve to a commit`);
    const tree = await this.readObject(commit.payload.tree_id);
    return { commit_id: commitId, tree_id: commit.payload.tree_id, entries: tree.payload.entries };
  }

  async _recordOperation(payload) {
    const receiptId = await this.putObject('receipt', { schema: 'evercraft.lineage.receipt.v1', ...payload });
    const filename = `${Date.now()}-${randomUUID()}-${receiptId.slice(0, 12)}.json`;
    await writeFile(join(this.dir, 'operations', filename), `${JSON.stringify({ receipt_id: receiptId })}\n`, 'utf8');
    return receiptId;
  }

  async _createCommitFromTree(treeId, parents, meta = {}) {
    const branch = await this.currentBranch();
    const previousHead = await this.resolveRef(branch);
    const payload = {
      tree_id: treeId,
      parents: parents.filter(Boolean),
      message: meta.message ?? 'checkpoint',
      actor: meta.actor ?? { type: 'human', id: 'unknown' },
      rationale: meta.rationale ?? null,
      created_at: meta.created_at ?? now(),
      provenance: meta.provenance ?? { sources: [], evidence: [], rights: [] },
      authority: meta.authority ?? { mutation: true, publish: false, payment: false },
      transactions: meta.transactions ?? [],
      metadata: meta.metadata ?? {},
    };
    const commitId = await this.putObject('commit', payload);
    await this.writeRef(branch, commitId);
    const receiptId = await this._recordOperation({
      operation: 'commit', branch, commit_id: commitId, tree_id: treeId,
      previous_head: previousHead, parents: payload.parents, actor: payload.actor,
      created_at: now(), reversible_by: previousHead ? { operation: 'move_ref', branch, commit_id: previousHead } : null,
    });
    return { commit_id: commitId, tree_id: treeId, receipt_id: receiptId, branch };
  }

  async commit(meta = {}) {
    const branch = await this.currentBranch();
    const parent = await this.resolveRef(branch);
    const snapshot = await this.snapshotWorkspace(meta.snapshot ?? {});
    return this._createCommitFromTree(snapshot.tree_id, parent ? [parent] : [], meta);
  }

  async createBranch(name, from = 'HEAD') {
    assertBranchName(name);
    const id = await this.resolveRef(from);
    await this.writeRef(name, id);
    const receiptId = await this._recordOperation({ operation: 'create_branch', branch: name, from, commit_id: id, created_at: now() });
    return { branch: name, commit_id: id, receipt_id: receiptId };
  }

  async switchBranch(name) {
    assertBranchName(name);
    await this.resolveRef(name);
    const previous = await this.currentBranch();
    await writeFile(join(this.dir, 'HEAD'), `ref: refs/heads/${name}\n`, 'utf8');
    const receiptId = await this._recordOperation({ operation: 'switch_branch', from: previous, to: name, created_at: now() });
    return { branch: name, receipt_id: receiptId };
  }

  async diff(a = 'HEAD', b = null) {
    const aTree = await this.getTree(a);
    let bEntries;
    let bId;
    if (b) {
      const bTree = await this.getTree(b);
      bEntries = bTree.entries;
      bId = bTree.commit_id;
    } else {
      const snapshot = await this.snapshotWorkspace();
      bEntries = snapshot.entries;
      bId = 'WORKSPACE';
    }
    const left = new Map(aTree.entries.map((x) => [x.path, x]));
    const right = new Map(bEntries.map((x) => [x.path, x]));
    const paths = [...new Set([...left.keys(), ...right.keys()])].sort();
    const changes = [];
    for (const path of paths) {
      const before = left.get(path) ?? null;
      const after = right.get(path) ?? null;
      if (!before) changes.push({ path, status: 'added', before, after });
      else if (!after) changes.push({ path, status: 'deleted', before, after });
      else if (before.object_id !== after.object_id) changes.push({ path, status: 'modified', before, after });
    }
    return { from: aTree.commit_id, to: bId, changes };
  }

  async log(from = 'HEAD', limit = 20) {
    let id = await this.resolveRef(from);
    const commits = [];
    while (id && commits.length < limit) {
      const object = await this.readObject(id);
      if (object.type !== 'commit') break;
      commits.push({ id, ...object.payload });
      id = object.payload.parents?.[0] ?? null;
    }
    return commits;
  }

  async restore(commitish, targetDir = this.root, { clean = false } = {}) {
    const tree = await this.getTree(commitish);
    if (!tree.commit_id) throw new Error(`Cannot restore empty ref: ${commitish}`);
    const target = resolve(targetDir);
    if (clean && target !== this.root) await rm(target, { recursive: true, force: true });
    await mkdir(target, { recursive: true });
    for (const entry of tree.entries) {
      const blob = await this.readObject(entry.object_id);
      const bytes = Buffer.from(blob.payload.data, blob.payload.encoding);
      const out = join(target, entry.path);
      await mkdir(dirname(out), { recursive: true });
      await writeFile(out, bytes);
    }
    const receiptId = await this._recordOperation({ operation: 'restore', commit_id: tree.commit_id, target, created_at: now(), destructive: false });
    return { commit_id: tree.commit_id, files: tree.entries.length, target, receipt_id: receiptId };
  }

  async rollback(commitish, meta = {}) {
    const branch = await this.currentBranch();
    const from = await this.resolveRef(branch);
    const to = await this.resolveRef(commitish);
    await this.writeRef(branch, to);
    const receiptId = await this._recordOperation({
      operation: 'rollback', branch, from, to, actor: meta.actor ?? { type: 'human', id: 'unknown' },
      rationale: meta.rationale ?? null, created_at: now(), reversible_by: from ? { operation: 'move_ref', branch, commit_id: from } : null,
    });
    return { branch, from, to, receipt_id: receiptId };
  }

  async ancestors(start) {
    const found = new Set();
    const queue = [start];
    while (queue.length) {
      const id = queue.shift();
      if (!id || found.has(id)) continue;
      found.add(id);
      const object = await this.readObject(id);
      if (object.type === 'commit') queue.push(...(object.payload.parents ?? []));
    }
    return found;
  }

  async findMergeBase(a, b) {
    const aAncestors = await this.ancestors(a);
    const queue = [b];
    const seen = new Set();
    while (queue.length) {
      const id = queue.shift();
      if (!id || seen.has(id)) continue;
      if (aAncestors.has(id)) return id;
      seen.add(id);
      const object = await this.readObject(id);
      if (object.type === 'commit') queue.push(...(object.payload.parents ?? []));
    }
    return null;
  }

  async mergePreview(sourceRef) {
    const oursId = await this.resolveRef('HEAD');
    const theirsId = await this.resolveRef(sourceRef);
    if (!oursId || !theirsId) throw new Error('Both branches must have commits before merge');
    const baseId = await this.findMergeBase(oursId, theirsId);
    if (!baseId) throw new Error('No common ancestor found');
    const [base, ours, theirs] = await Promise.all([this.getTree(baseId), this.getTree(oursId), this.getTree(theirsId)]);
    const bm = new Map(base.entries.map((x) => [x.path, x]));
    const om = new Map(ours.entries.map((x) => [x.path, x]));
    const tm = new Map(theirs.entries.map((x) => [x.path, x]));
    const paths = [...new Set([...bm.keys(), ...om.keys(), ...tm.keys()])].sort();
    const merged = [];
    const conflicts = [];
    const same = (x, y) => (x?.object_id ?? null) === (y?.object_id ?? null);
    for (const path of paths) {
      const baseEntry = bm.get(path) ?? null;
      const oursEntry = om.get(path) ?? null;
      const theirsEntry = tm.get(path) ?? null;
      let chosen;
      if (same(oursEntry, theirsEntry)) chosen = oursEntry;
      else if (same(oursEntry, baseEntry)) chosen = theirsEntry;
      else if (same(theirsEntry, baseEntry)) chosen = oursEntry;
      else {
        conflicts.push({ path, base: baseEntry, ours: oursEntry, theirs: theirsEntry });
        continue;
      }
      if (chosen) merged.push(chosen);
    }
    return { base: baseId, ours: oursId, theirs: theirsId, entries: merged.sort((a,b) => a.path.localeCompare(b.path)), conflicts };
  }

  async merge(sourceRef, meta = {}) {
    const preview = await this.mergePreview(sourceRef);
    if (preview.conflicts.length) {
      const error = new Error(`Merge has ${preview.conflicts.length} conflict(s)`);
      error.conflicts = preview.conflicts;
      throw error;
    }
    const treeId = await this.putObject('tree', { entries: preview.entries });
    return this._createCommitFromTree(treeId, [preview.ours, preview.theirs], {
      ...meta,
      message: meta.message ?? `merge ${sourceRef}`,
      metadata: { ...(meta.metadata ?? {}), merge_base: preview.base, merged_ref: sourceRef },
    });
  }

  async recordTransaction(transaction) {
    if (!transaction?.kind) throw new Error('transaction.kind is required');
    const payload = {
      schema: 'evercraft.lineage.transaction.v1',
      id: transaction.id ?? randomUUID(),
      kind: transaction.kind,
      actor: transaction.actor ?? { type: 'agent', id: 'unknown' },
      scope: transaction.scope ?? null,
      inputs: transaction.inputs ?? [],
      outputs: transaction.outputs ?? [],
      rationale: transaction.rationale ?? null,
      evidence: transaction.evidence ?? [],
      authority: transaction.authority ?? { mutation: false, publish: false, payment: false },
      reversible_by: transaction.reversible_by ?? null,
      created_at: transaction.created_at ?? now(),
    };
    const transactionId = await this.putObject('transaction', payload);
    const receiptId = await this._recordOperation({ operation: 'transaction', transaction_id: transactionId, actor: payload.actor, created_at: now(), reversible_by: payload.reversible_by });
    return { transaction_id: transactionId, receipt_id: receiptId };
  }
}

export const lineage = { schema: SCHEMA, classifyAsset, stable, sha256 };
