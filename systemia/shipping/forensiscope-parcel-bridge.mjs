// Source format: ForensiScope Ship local parcel v0.2.
// Shipping admission only. No provider send, recipient authority, or delivery receipt.
import { createHash, timingSafeEqual } from 'node:crypto';
import { constants } from 'node:fs';
import * as fs from 'node:fs/promises';
import path from 'node:path';

const MiB = 1024 * 1024;
const MAX_BYTES = 512 * MiB;
const MAX_MANIFEST = 100000;
const SIZES = new Set([8 * MiB, 16 * MiB]);
const SHA = /^[a-f0-9]{64}$/;
const ID = /^[a-f0-9]{16}$/;

function fail(reason) { throw new Error('forensiscope_parcel:' + reason); }
function safeName(name) {
  return typeof name === 'string' && name.length > 0 && name.length <= 180 &&
    name !== '.' && name !== '..' && !/[\\/\x00-\x1f\x7f<>:"|?*]/.test(name);
}
function sameHash(a, b) {
  if (!SHA.test(a || '') || !SHA.test(b || '')) return false;
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

export function validateForensiScopeParcelManifest(manifest) {
  const m = manifest;
  if (!m || m.format !== 'evercraft-parcel-large-v0.2' ||
      !safeName(m.original_name) || !Number.isSafeInteger(m.original_size) ||
      m.original_size < 0 || m.original_size > MAX_BYTES ||
      !SHA.test(m.original_sha256 || '') || !ID.test(m.parcel_id || '') ||
      m.parcel_id !== m.original_sha256.slice(0,16) ||
      !SIZES.has(m.max_part_bytes) || !Array.isArray(m.parts)) fail('unsupported_manifest');
  const count = Math.ceil(m.original_size / m.max_part_bytes);
  if (count > 64 || m.parts.length !== count) fail('invalid_part_count');
  for (let i=0; i<count; i++) {
    const p=m.parts[i];
    const name='ec-' + m.parcel_id + '-part-' + String(i+1).padStart(5,'0') + '.bin';
    const expectedSize=Math.min(m.max_part_bytes,m.original_size-i*m.max_part_bytes);
    if (!p || p.name !== name || p.size !== expectedSize ||
        !SHA.test(p.sha256 || '')) fail('invalid_part_metadata');
  }
  return {
    format:m.format, parcel_id:m.parcel_id, original_name:m.original_name,
    original_size:m.original_size, original_sha256:m.original_sha256,
    max_part_bytes:m.max_part_bytes,
    parts:m.parts.map(({name,size,sha256})=>({name,size,sha256}))
  };
}

async function openedRegularFile(root, name) {
  if (!safeName(name)) fail('unsafe_filename');
  const file=path.join(root,name);
  const entry=await fs.lstat(file).catch(()=>fail('file_missing'));
  if (!entry.isFile() || entry.isSymbolicLink()) fail('file_not_regular');
  const handle=await fs.open(file,constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try {
    const actual=await handle.stat();
    if (!actual.isFile() || actual.size !== entry.size || actual.ino !== entry.ino ||
        actual.dev !== entry.dev) fail('file_changed_during_open');
    return {handle,size:actual.size};
  } catch (e) {await handle.close();throw e;}
}

export async function inspectForensiScopeParcel({
  directory, manifest_filename, trusted_source_sha256 = null
}={}) {
  if (typeof directory !== 'string' || !directory.trim()) fail('directory_required');
  if (!safeName(manifest_filename) || !/^ec-[a-f0-9]{16}-manifest\.json$/.test(manifest_filename))
    fail('invalid_manifest_filename');
  const root=path.resolve(directory);
  const rootStat=await fs.lstat(root).catch(()=>fail('directory_missing'));
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) fail('unsafe_directory');
  const opened=await openedRegularFile(root,manifest_filename);
  let manifestText;
  try {
    if (opened.size > MAX_MANIFEST) fail('manifest_too_large');
    manifestText=await opened.handle.readFile({encoding:'utf8'});
  } finally {await opened.handle.close();}
  let parsed;
  try {parsed=JSON.parse(manifestText);} catch {fail('manifest_invalid_json');}
  const m=validateForensiScopeParcelManifest(parsed);
  if (manifest_filename !== 'ec-' + m.parcel_id + '-manifest.json')
    fail('manifest_filename_mismatch');
  const allowed=new Set([manifest_filename,'HOW-TO-RECOVER.txt',...m.parts.map(p=>p.name)]);
  const present=await fs.readdir(root);
  if (present.some(name=>!allowed.has(name))) fail('unexpected_directory_entry');
  if (trusted_source_sha256 !== null && !sameHash(trusted_source_sha256,m.original_sha256))
    fail('trusted_source_hash_mismatch');

  const whole=createHash('sha256'),verified=[];
  let readBytes=0;
  for (const part of m.parts) {
    const {handle,size}=await openedRegularFile(root,part.name);
    try {
      if (size !== part.size) fail('part_size_mismatch');
      const h=createHash('sha256');
      let count=0;
      const stream=handle.createReadStream({autoClose:false,highWaterMark:MiB});
      for await (const bytes of stream) {h.update(bytes);whole.update(bytes);count+=bytes.length;}
      if (count !== part.size || !sameHash(h.digest('hex'),part.sha256))
        fail('part_digest_mismatch');
      verified.push({name:part.name,size_bytes:count,sha256:'sha256:'+part.sha256});
      readBytes+=count;
    } finally {await handle.close();}
  }
  const reconstructed=whole.digest('hex');
  if (readBytes !== m.original_size || !sameHash(reconstructed,m.original_sha256))
    fail('original_digest_mismatch');
  return {
    schema:'evercraft.shipping.forensiscope-parcel-inspection.v1',
    source_format:m.format,
    parcel_id:m.parcel_id,
    original_name:m.original_name,
    original_size_bytes:m.original_size,
    original_sha256:'sha256:'+reconstructed,
    part_count:verified.length,
    verified_parts:verified,
    state:'local_parcel_bytes_verified',
    trusted_source_anchor_verified:trusted_source_sha256 !== null,
    delivery_state:'not_verified',
    provider_send_performed:false,
    recipient_open_verified:false,
    dispatch_authorized:false,
    reason:'Parcel bytes are locally verified. The separate Shipping authority, provider acceptance, sent-copy readback and recipient-access gates have not run.'
  };
}
