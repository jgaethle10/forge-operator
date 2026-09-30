import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes, randomUUID } from 'node:crypto';

function clean(value) { return String(value ?? '').trim(); }
function safeKey(value, field) {
  const key = clean(value);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(key)) throw new Error(`${field}_invalid`);
  return key;
}
function shaBuffer(value) { return createHash('sha256').update(value).digest('hex'); }
function sha(value) { return 'sha256:' + shaBuffer(Buffer.isBuffer(value) ? value : Buffer.from(typeof value === 'string' ? value : JSON.stringify(value))); }
function appHash(appKey) { return createHash('sha256').update(appKey).digest('hex').slice(0, 32); }
function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, file);
}
function atomicBuffer(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  if (fs.existsSync(file)) return false;
  const tmp = `${file}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(tmp, value, { mode: 0o600, flag: 'wx' });
  try { fs.renameSync(tmp, file); } catch (error) {
    fs.rmSync(tmp, { force: true });
    if (!fs.existsSync(file)) throw error;
  }
  return true;
}

export class EvercraftObjectStore {
  constructor({ stateDir, maxObjectBytes = 256 * 1024 * 1024 } = {}) {
    if (!stateDir) throw new Error('object_store_state_dir_required');
    this.stateDir = path.resolve(stateDir);
    this.maxObjectBytes = Math.max(1, Number(maxObjectBytes));
    this.blobsDir = path.join(this.stateDir, 'blobs');
    this.refsDir = path.join(this.stateDir, 'refs');
    this.receiptsFile = path.join(this.stateDir, 'receipts.jsonl');
  }

  #blobPath(hashHex) {
    return path.join(this.blobsDir, hashHex.slice(0, 2), hashHex.slice(2, 4), hashHex);
  }

  #refPath(appKeyInput, objectRefInput) {
    const appKey = safeKey(appKeyInput, 'app_key');
    const objectRef = safeKey(objectRefInput, 'object_ref');
    return { appKey, objectRef, file: path.join(this.refsDir, appHash(appKey), `${objectRef}.json`) };
  }

  #appendReceipt(body) {
    const receipt = { ...body, receipt_hash: sha(body) };
    fs.mkdirSync(this.stateDir, { recursive: true, mode: 0o700 });
    fs.appendFileSync(this.receiptsFile, JSON.stringify(receipt) + '\n', { mode: 0o600 });
    return receipt;
  }

  put(appKeyInput, value, {
    name = null,
    contentType = 'application/octet-stream',
    metadata = {},
    now = new Date()
  } = {}) {
    const appKey = safeKey(appKeyInput, 'app_key');
    const data = Buffer.isBuffer(value) ? Buffer.from(value) : Buffer.from(value ?? '');
    if (data.length > this.maxObjectBytes) throw new Error('object_too_large');
    const hashHex = shaBuffer(data);
    const blobPath = this.#blobPath(hashHex);
    const blobCreated = atomicBuffer(blobPath, data);
    const objectRef = `obj_${randomUUID()}`;
    const at = new Date(now).toISOString();
    const ref = {
      schema: 'evercraft.object-store.reference.v1',
      object_ref: objectRef,
      app_key_hash: sha(appKey),
      blob_sha256: `sha256:${hashHex}`,
      size_bytes: data.length,
      content_type: clean(contentType) || 'application/octet-stream',
      name: name == null ? null : String(name),
      metadata: metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {},
      created_at: at
    };
    atomicJson(this.#refPath(appKey, objectRef).file, ref);
    const receipt = this.#appendReceipt({
      schema: 'evercraft.object-store.mutation-receipt.v1',
      receipt_id: `object_mutation_${randomUUID()}`,
      operation: 'put',
      object_ref: objectRef,
      app_key_hash: ref.app_key_hash,
      blob_sha256: ref.blob_sha256,
      size_bytes: ref.size_bytes,
      blob_created: blobCreated,
      mutated_at: at
    });
    return { reference: structuredClone(ref), receipt };
  }

  #readRef(appKey, objectRef) {
    const location = this.#refPath(appKey, objectRef);
    if (!fs.existsSync(location.file)) throw new Error('object_reference_not_found');
    const ref = JSON.parse(fs.readFileSync(location.file, 'utf8'));
    if (ref?.schema !== 'evercraft.object-store.reference.v1') throw new Error('object_reference_schema_invalid');
    if (ref.app_key_hash !== sha(location.appKey)) throw new Error('object_reference_app_mismatch');
    return { location, ref };
  }

  get(appKey, objectRef) {
    const { ref } = this.#readRef(appKey, objectRef);
    const hashHex = String(ref.blob_sha256 || '').replace(/^sha256:/, '');
    const file = this.#blobPath(hashHex);
    if (!fs.existsSync(file)) throw new Error('object_blob_missing');
    const data = fs.readFileSync(file);
    if (`sha256:${shaBuffer(data)}` !== ref.blob_sha256) throw new Error('object_blob_hash_mismatch');
    if (data.length !== ref.size_bytes) throw new Error('object_blob_size_mismatch');
    return { data, reference: structuredClone(ref) };
  }

  metadata(appKey, objectRef) {
    return structuredClone(this.#readRef(appKey, objectRef).ref);
  }

  list(appKeyInput, { limit = 1000 } = {}) {
    const appKey = safeKey(appKeyInput, 'app_key');
    const dir = path.join(this.refsDir, appHash(appKey));
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
      .filter((name) => name.endsWith('.json'))
      .slice(0, Math.max(0, Math.min(10000, Number(limit))))
      .map((name) => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')))
      .filter((ref) => ref.app_key_hash === sha(appKey))
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  }

  deleteReference(appKey, objectRef, { now = new Date() } = {}) {
    const { location, ref } = this.#readRef(appKey, objectRef);
    fs.rmSync(location.file, { force: true });
    return this.#appendReceipt({
      schema: 'evercraft.object-store.mutation-receipt.v1',
      receipt_id: `object_mutation_${randomUUID()}`,
      operation: 'delete_reference',
      object_ref: ref.object_ref,
      app_key_hash: ref.app_key_hash,
      blob_sha256: ref.blob_sha256,
      blob_deleted: false,
      mutated_at: new Date(now).toISOString()
    });
  }

  garbageCollect({ dryRun = true, now = new Date() } = {}) {
    const referenced = new Set();
    if (fs.existsSync(this.refsDir)) {
      for (const appDir of fs.readdirSync(this.refsDir)) {
        const full = path.join(this.refsDir, appDir);
        if (!fs.statSync(full).isDirectory()) continue;
        for (const name of fs.readdirSync(full)) {
          if (!name.endsWith('.json')) continue;
          const ref = JSON.parse(fs.readFileSync(path.join(full, name), 'utf8'));
          if (typeof ref.blob_sha256 === 'string') referenced.add(ref.blob_sha256.replace(/^sha256:/, ''));
        }
      }
    }

    const orphaned = [];
    if (fs.existsSync(this.blobsDir)) {
      const walk = (dir) => {
        for (const name of fs.readdirSync(dir)) {
          const full = path.join(dir, name);
          const stat = fs.statSync(full);
          if (stat.isDirectory()) walk(full);
          else if (/^[a-f0-9]{64}$/i.test(name) && !referenced.has(name)) orphaned.push(full);
        }
      };
      walk(this.blobsDir);
    }

    let deleted = 0;
    if (!dryRun) {
      for (const file of orphaned) { fs.rmSync(file, { force: true }); deleted += 1; }
    }
    const receipt = this.#appendReceipt({
      schema: 'evercraft.object-store.gc-receipt.v1',
      receipt_id: `object_gc_${randomUUID()}`,
      dry_run: Boolean(dryRun),
      referenced_blob_count: referenced.size,
      orphaned_blob_count: orphaned.length,
      deleted_blob_count: deleted,
      observed_at: new Date(now).toISOString()
    });
    return { orphaned_blob_count: orphaned.length, deleted_blob_count: deleted, receipt };
  }

  health() {
    fs.mkdirSync(this.stateDir, { recursive: true, mode: 0o700 });
    const probe = path.join(this.stateDir, `.health-${process.pid}-${randomBytes(4).toString('hex')}`);
    fs.writeFileSync(probe, 'ok', { mode: 0o600 });
    fs.unlinkSync(probe);
    return {
      schema: 'evercraft.object-store.health.v1',
      state: 'healthy',
      content_addressed_blobs: true,
      app_scoped_references: true,
      integrity_verification_on_read: true
    };
  }
}
