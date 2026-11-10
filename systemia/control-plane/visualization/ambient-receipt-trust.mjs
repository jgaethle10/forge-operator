/**
 * Read-only trust anchor extraction from Evercraft's existing Ambient Registry.
 *
 * This is an additional authorization/freshness check, not a remote telemetry
 * fetch or proof of execution. Root and requested device IDs must come from
 * fixed, trusted runtime configuration and an authenticated mission binding.
 */
import { createPublicKey } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { evaluateAmbientTrust } from '../../saban/ambient-device-trust.mjs';
import { normalizeMicroDeviceManifest } from '../../saban/microseed-device-bridge.mjs';

const DEVICE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const MAX_DEVICES = 50;
const MAX_FILE_BYTES = 256 * 1024;
function need(ok, code) { if (!ok) throw new Error('visual_ambient_trust_' + code); }
async function jsonAt(root, section, id) {
  const dir = join(root, section);
  const file = join(dir, id + '.json');
  // Do not follow a symlinked root, registry directory or record.
  need(await realpath(dir) === dir, 'unsafe_directory');
  const stat = await lstat(file);
  need(stat.isFile() && !stat.isSymbolicLink() && stat.size > 0 &&
    stat.size <= MAX_FILE_BYTES && (stat.mode & 0o077) === 0, 'unsafe_record');
  const body = await readFile(file, 'utf8');
  need(Buffer.byteLength(body) <= MAX_FILE_BYTES, 'record_too_large');
  try { return JSON.parse(body); }
  catch { throw new Error('visual_ambient_trust_invalid_json'); }
}

/**
 * Extract pinned Ed25519 verification keys only from currently active,
 * currently approved device manifests with fresh heartbeats.
 *
 * Trust is derived from operator-controlled local registry state. It does
 * NOT independently prove the registry was protected from local tampering.
 */
export async function loadActiveAmbientReceiptKeys({
  ambientRegistryRoot,
  deviceIds,
  now = new Date(),
} = {}) {
  need(typeof ambientRegistryRoot === 'string' && ambientRegistryRoot.trim().length > 0, 'root_required');
  need(Array.isArray(deviceIds) && deviceIds.length > 0 &&
    deviceIds.length <= MAX_DEVICES && new Set(deviceIds).size === deviceIds.length, 'device_selection_invalid');
  const clock = now instanceof Date ? now : new Date(now);
  need(Number.isFinite(clock.getTime()), 'clock_invalid');
  const root = resolve(ambientRegistryRoot);
  need(await realpath(root) === root, 'unsafe_root');
  const keys = Object.create(null);
  for (const device of deviceIds) {
    need(typeof device === 'string' && DEVICE.test(device) && !device.includes('..'), 'device_id_invalid');
    const record = await jsonAt(root, 'devices', device);
    const manifest = await jsonAt(root, 'manifests', device);
    need(record.schema === 'evercraft.saban.ambient-device-trust.v1' &&
      record.device_id === device, 'trust_record_identity_invalid');
    const active = evaluateAmbientTrust(record, { now:clock });
    need(active.eligible === true && active.state === 'active', 'device_not_active');
    const heartbeat = Date.parse(record.last_heartbeat_at);
    need(Number.isFinite(heartbeat) && heartbeat <= clock.getTime() + 120000,
      'device_heartbeat_in_future');
    need(manifest.schema === 'evercraft.microseed.device-manifest.v1' &&
      manifest.device_id === device && manifest.bridge_mode === 'native_agent' &&
      manifest.compute_execution_mode === 'native_device', 'manifest_identity_invalid');
    need(manifest.attestation?.receipt_signing_required === true &&
      typeof manifest.attestation.receipt_public_key_pem === 'string' &&
      typeof manifest.attestation.receipt_key_id === 'string' &&
      manifest.attestation.receipt_key_id.length > 0, 'manifest_signer_invalid');
    need(record.attestation_mode === 'device' &&
      manifest.attestation.mode === 'device' &&
      typeof record.attestation_identity === 'string' &&
      record.attestation_identity.length > 0 &&
      record.attestation_identity === manifest.attestation.device_identity,
      'attestation_binding_invalid');
    need(manifest.manifest_hash === record.capability_manifest_hash, 'manifest_not_authorized');
    // A hash recorded alongside a manifest must still match the canonical
    // normalizer's content; an edited manifest cannot keep an old hash.
    const normalized = normalizeMicroDeviceManifest(manifest);
    need(normalized.manifest_hash === manifest.manifest_hash, 'manifest_hash_invalid');
    const publicKey = createPublicKey(manifest.attestation.receipt_public_key_pem);
    need(publicKey.asymmetricKeyType === 'ed25519', 'signer_key_invalid');
    const keyId = manifest.attestation.receipt_key_id;
    need(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(keyId), 'signer_id_invalid');
    need(!Object.hasOwn(keys, keyId), 'signer_key_collision');
    need(Array.isArray(manifest.supported_workloads) &&
      manifest.supported_workloads.length > 0 &&
      manifest.supported_workloads.length <= 50, 'manifest_workloads_invalid');
    // Public key material is pinned by the authorized manifest hash.
    // No private key or device credentials are ever loaded here.
    const anchor = {
      device_id:device,
      public_key_pem:manifest.attestation.receipt_public_key_pem,
      allowed_workload_classes:manifest.supported_workloads,
    };
    keys[keyId] = anchor;
  }
  return keys;
}
