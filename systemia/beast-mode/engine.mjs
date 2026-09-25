import { createHash } from 'node:crypto';
import {
  BEAST_SCHEMA,
  transitionCargo,
  verifyDestination,
  buildDeliveryReceipt
} from './manifest.mjs';

function clean(value) {
  return String(value ?? '').trim();
}

function asBytes(value) {
  if (value instanceof Uint8Array) return value;
  if (Buffer.isBuffer(value)) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  throw new Error('beast_adapter_must_return_bytes');
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function adapterId(adapter, fallback) {
  return clean(adapter?.adapter_id) || fallback;
}

function requireAdapter(adapter, role) {
  if (!adapter || typeof adapter !== 'object') throw new Error(`${role}_adapter_required`);
  if (role === 'source' && typeof adapter.read !== 'function') throw new Error('source_adapter_read_required');
  if (role === 'destination' && typeof adapter.write !== 'function') throw new Error('destination_adapter_write_required');
  if (role === 'destination' && typeof adapter.readBack !== 'function') throw new Error('destination_adapter_readback_required');
  if (role === 'destination' && typeof adapter.verifyMetadata !== 'function') throw new Error('destination_adapter_verify_metadata_required');
  return adapter;
}

function quarantine(manifest, reason, detail, now) {
  if (manifest.state === 'QUARANTINED') return manifest;
  return transitionCargo(manifest, 'QUARANTINED', {
    at: now,
    reason,
    detail,
    actor: 'beast-mode-engine'
  });
}

export async function shipCargo({
  manifest,
  sourceAdapter,
  destinationAdapter,
  now = () => new Date().toISOString(),
  onTransition = null
}) {
  if (manifest?.schema !== BEAST_SCHEMA) throw new Error('beast_manifest_schema_invalid');
  if (manifest.state !== 'ADMITTED' && manifest.state !== 'PACKING') {
    throw new Error(`beast_engine_requires_admitted_or_packing:${manifest.state}`);
  }

  const source = requireAdapter(sourceAdapter, 'source');
  const destination = requireAdapter(destinationAdapter, 'destination');
  let cargo = manifest;
  const events = [];
  const transition = (state, reason) => {
    cargo = transitionCargo(cargo, state, {
      at: now(),
      reason,
      actor: 'beast-mode-engine'
    });
    const event = { state, reason, at: cargo.updated_at };
    events.push(event);
    if (typeof onTransition === 'function') onTransition(cargo, event);
  };

  if (cargo.state === 'ADMITTED') transition('PACKING', 'source_read_started');

  const packed = [];
  try {
    for (const artifact of cargo.artifacts) {
      const bytes = asBytes(await source.read({ manifest: cargo, artifact }));
      const actualSha = sha256(bytes);
      if (actualSha !== artifact.sha256) {
        throw new Error(`source_sha256_mismatch:${artifact.artifact_id}`);
      }
      if (bytes.byteLength !== artifact.byte_count) {
        throw new Error(`source_byte_count_mismatch:${artifact.artifact_id}`);
      }
      packed.push({ artifact, bytes });
    }
  } catch (error) {
    cargo = quarantine(cargo, 'packing_failed', error instanceof Error ? error.message : String(error), now());
    return {
      schema: 'evercraft.beast-mode.engine-result.v1',
      status: 'quarantined',
      manifest: cargo,
      receipt: null,
      objects: [],
      events,
      source_adapter: adapterId(source, 'source'),
      destination_adapter: adapterId(destination, 'destination')
    };
  }

  transition('IN_TRANSIT', 'destination_write_started');

  const objects = [];
  try {
    for (const packedArtifact of packed) {
      const object = await destination.write({
        manifest: cargo,
        artifact: packedArtifact.artifact,
        bytes: packedArtifact.bytes
      });
      if (!object || !clean(object.object_ref)) {
        throw new Error(`destination_object_ref_missing:${packedArtifact.artifact.artifact_id}`);
      }
      objects.push({
        artifact_id: packedArtifact.artifact.artifact_id,
        object_ref: clean(object.object_ref),
        adapter_result: object
      });
    }
  } catch (error) {
    cargo = quarantine(cargo, 'transit_failed', error instanceof Error ? error.message : String(error), now());
    return {
      schema: 'evercraft.beast-mode.engine-result.v1',
      status: 'quarantined',
      manifest: cargo,
      receipt: null,
      objects,
      events,
      source_adapter: adapterId(source, 'source'),
      destination_adapter: adapterId(destination, 'destination')
    };
  }

  transition('RECEIVED', 'destination_objects_written');

  const observations = [];
  try {
    for (const object of objects) {
      const artifact = cargo.artifacts.find((row) => row.artifact_id === object.artifact_id);
      if (!artifact) throw new Error(`manifest_artifact_missing:${object.artifact_id}`);
      const readBack = asBytes(await destination.readBack({
        manifest: cargo,
        artifact,
        object_ref: object.object_ref,
        adapter_result: object.adapter_result
      }));
      const metadata = await destination.verifyMetadata({
        manifest: cargo,
        artifact,
        object_ref: object.object_ref,
        adapter_result: object.adapter_result
      });
      observations.push({
        artifact_id: artifact.artifact_id,
        sha256: sha256(readBack),
        byte_count: readBack.byteLength,
        provenance_present: metadata?.provenance_present === true,
        permissions_match: metadata?.permissions_match === true
      });
    }
  } catch (error) {
    cargo = quarantine(cargo, 'destination_readback_failed', error instanceof Error ? error.message : String(error), now());
    return {
      schema: 'evercraft.beast-mode.engine-result.v1',
      status: 'quarantined',
      manifest: cargo,
      receipt: null,
      objects,
      events,
      source_adapter: adapterId(source, 'source'),
      destination_adapter: adapterId(destination, 'destination')
    };
  }

  const verification = verifyDestination(cargo, observations);
  if (!verification.ok) {
    cargo = quarantine(cargo, 'destination_verification_failed', JSON.stringify(verification.artifact_results), now());
    return {
      schema: 'evercraft.beast-mode.engine-result.v1',
      status: 'quarantined',
      manifest: cargo,
      receipt: null,
      objects,
      observations,
      verification,
      events,
      source_adapter: adapterId(source, 'source'),
      destination_adapter: adapterId(destination, 'destination')
    };
  }

  transition('VERIFIED', 'destination_hash_provenance_permissions_verified');
  const delivered = buildDeliveryReceipt(cargo, verification, { now: now() });
  cargo = delivered.manifest;
  events.push({ state: 'DELIVERED', reason: 'receipt_written', at: cargo.updated_at });
  if (typeof onTransition === 'function') onTransition(cargo, events.at(-1));

  return {
    schema: 'evercraft.beast-mode.engine-result.v1',
    status: 'delivered',
    manifest: cargo,
    receipt: delivered.receipt,
    objects,
    observations,
    verification,
    events,
    source_adapter: adapterId(source, 'source'),
    destination_adapter: adapterId(destination, 'destination')
  };
}
