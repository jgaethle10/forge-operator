/**
 * Immutable, private, local source for MicroSeed device-signed execution receipts.
 *
 * The agent writes a signed receipt after it completes work and before returning
 * HTTP 200. This journal is separate from the existing unsigned idempotency store.
 * It is NOT independent effect verification, a delivery ledger or an authority.
 */
import { createHash } from 'node:crypto';
import { mkdir, open, lstat, readFile, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const SHA = /^sha256:[a-f0-9]{64}$/;
const RECEIPT = 'evercraft.microseed.execution-receipt.v1';
const SIGNATURE = 'evercraft.microseed.device-signature.v1';
const MAX_BYTES = 256 * 1024;
const MAX_KEY = 240;
function need(yes, label) { if (!yes) throw Error('microseed_signed_store_' + label); }
function digest(x) { return createHash('sha256').update(x).digest('hex'); }
function name(x) {
  need(typeof x === 'string' && x.length > 0 && x.length <= MAX_KEY, 'key_invalid');
  return digest(x);
}
function base(root) {
  need(typeof root === 'string' && root.trim().length > 0, 'state_dir_required');
  return join(resolve(root), 'signed-receipts', 'v1');
}
function destination({stateDir, device_id, idempotency_key}) {
  return join(base(stateDir), name(device_id), name(idempotency_key) + '.json');
}
function inspect(receipt) {
  need(receipt && typeof receipt === 'object' && !Array.isArray(receipt), 'receipt_shape_invalid');
  need(receipt.schema === RECEIPT, 'receipt_schema_invalid');
  need(receipt.device_signature?.schema === SIGNATURE &&
    receipt.device_signature.algorithm === 'Ed25519' &&
    typeof receipt.device_signature.signature_base64 === 'string', 'signature_required');
  need(typeof receipt.device_id === 'string' && typeof receipt.idempotency_key === 'string', 'identity_required');
  need(typeof receipt.receipt_hash === 'string' && SHA.test(receipt.receipt_hash), 'receipt_hash_invalid');
  need(typeof receipt.request_hash === 'string' && SHA.test(receipt.request_hash), 'request_hash_invalid');
  const data = JSON.stringify(receipt) + '\n';
  need(Buffer.byteLength(data) <= MAX_BYTES, 'receipt_too_large');
  return data;
}
async function readAt(path, expect) {
  const st = await lstat(path);
  need(st.isFile() && !st.isSymbolicLink() && st.size > 0 && st.size <= MAX_BYTES, 'unsafe_record');
  const raw = await readFile(path, 'utf8');
  need(Buffer.byteLength(raw) <= MAX_BYTES, 'unsafe_record');
  const saved = JSON.parse(raw);
  inspect(saved);
  need(saved.device_id === expect.device_id &&
    saved.idempotency_key === expect.idempotency_key, 'record_identity_mismatch');
  return saved;
}

/**
 * Immutable first accepted signed receipt per (device,attempt). Existing
 * replay must agree on identity, request hash and unsigned receipt hash.
 * Never rewrite a signed history record; key rotations require old trust anchors.
 */
export async function persistSignedMicroSeedReceipt({stateDir, signedReceipt} = {}) {
  const data = inspect(signedReceipt);
  const file = destination({
    stateDir, device_id:signedReceipt.device_id,
    idempotency_key:signedReceipt.idempotency_key,
  });
  const folder=join(base(stateDir), name(signedReceipt.device_id));
  await mkdir(folder, {recursive:true,mode:0o700});
  // A local path redirection must never send signed evidence elsewhere.
  need(await realpath(base(stateDir)) === resolve(base(stateDir)), 'unsafe_root');
  need(await realpath(folder) === folder, 'unsafe_directory');
  let handle;
  try {
    handle = await open(file, 'wx', 0o600);
    await handle.writeFile(data);
    await handle.sync();
    await handle.close();
    return {state:'stored', existing:false, receipt_hash:signedReceipt.receipt_hash};
  } catch (error) {
    if (handle) await handle.close().catch(()=>{});
    if (error.code !== 'EEXIST') {
      // A partial first record must not be treated as success. An operator
      // must repair it before retrying; existing file is never auto-replaced.
      throw new Error('microseed_signed_receipt_persistence_failed');
    }
  }
  const existing = await readAt(file, signedReceipt);
  need(existing.receipt_hash === signedReceipt.receipt_hash &&
    existing.request_hash === signedReceipt.request_hash &&
    existing.device_id === signedReceipt.device_id &&
    existing.workload_class === signedReceipt.workload_class, 'idempotency_conflict');
  return {state:'existing',existing:true,receipt_hash:existing.receipt_hash};
}

/** Explicit single-attempt read. No directory listing or browser access. */
export async function readSignedMicroSeedReceipt({
  stateDir,device_id,idempotency_key
} = {}) {
  const root = base(stateDir);
  const folder = join(root, name(device_id));
  const expectedRoot = resolve(root);
  // Reject redirecting state directory roots and device directories.
  need(await realpath(root) === expectedRoot, 'unsafe_root');
  need(await realpath(folder) === folder, 'unsafe_directory');
  const file = destination({stateDir,device_id,idempotency_key});
  return readAt(file, {device_id,idempotency_key});
}
