import { createHash } from 'node:crypto';
import { BEAST_SCHEMA, transitionCargo, verifyDestination, buildDeliveryReceipt } from './manifest.mjs';
import { sealFootball, openFootball } from './football.mjs';

function clean(value) { return String(value ?? '').trim(); }
function bytes(value) {
  if (Buffer.isBuffer(value)) return Buffer.from(value);
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (value instanceof ArrayBuffer) return Buffer.from(new Uint8Array(value));
  throw new Error('football_engine_binary_required');
}
function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
function quarantine(manifest, reason, detail, at) {
  return transitionCargo(manifest, 'QUARANTINED', {
    at, reason, detail, actor: 'beast-mode-football-engine'
  });
}
function adapterId(adapter, fallback) { return clean(adapter?.adapter_id) || fallback; }

export async function shipFootballCargo({
  manifest,
  sourceAdapter,
  carrierAdapter,
  destinationAdapter,
  now = () => new Date().toISOString(),
  onTransition = null
}) {
  if (manifest?.schema !== BEAST_SCHEMA) throw new Error('beast_manifest_schema_invalid');
  if (!['ADMITTED', 'PACKING'].includes(manifest.state)) {
    throw new Error(`football_engine_requires_admitted_or_packing:${manifest.state}`);
  }
  if (typeof sourceAdapter?.read !== 'function') throw new Error('football_source_read_required');
  if (typeof carrierAdapter?.write !== 'function' || typeof carrierAdapter?.readBack !== 'function') {
    throw new Error('football_carrier_write_and_readback_required');
  }
  if (typeof destinationAdapter?.write !== 'function' ||
      typeof destinationAdapter?.readBack !== 'function' ||
      typeof destinationAdapter?.verifyMetadata !== 'function') {
    throw new Error('football_destination_adapter_incomplete');
  }

  let cargo = manifest;
  const events = [];
  const transition = (state, reason) => {
    cargo = transitionCargo(cargo, state, { at: now(), reason, actor: 'beast-mode-football-engine' });
    const event = { state, reason, at: cargo.updated_at };
    events.push(event);
    if (typeof onTransition === 'function') onTransition(cargo, event);
  };

  if (cargo.state === 'ADMITTED') transition('PACKING', 'football_pack_started');

  let sealed;
  try {
    const records = new Map();
    for (const artifact of cargo.artifacts) {
      records.set(artifact.artifact_id, bytes(await sourceAdapter.read({ manifest: cargo, artifact })));
    }
    sealed = sealFootball(cargo, records);
  } catch (error) {
    cargo = quarantine(cargo, 'football_pack_failed', error instanceof Error ? error.message : String(error), now());
    return { schema: 'evercraft.beast-mode.football-engine-result.v1', status: 'quarantined', manifest: cargo, receipt: null, events };
  }

  transition('IN_TRANSIT', 'football_throw_started');

  let carrierResult;
  let caught;
  try {
    carrierResult = await carrierAdapter.write({
      manifest: cargo,
      football_id: sealed.football_id,
      bytes: sealed.buffer
    });
    if (!clean(carrierResult?.object_ref)) throw new Error('football_carrier_object_ref_missing');

    caught = bytes(await carrierAdapter.readBack({
      manifest: cargo,
      football_id: sealed.football_id,
      object_ref: carrierResult.object_ref,
      adapter_result: carrierResult
    }));
    if (sha256(caught) !== sha256(sealed.buffer)) throw new Error('football_carrier_hash_mismatch');
  } catch (error) {
    cargo = quarantine(cargo, 'football_transit_failed', error instanceof Error ? error.message : String(error), now());
    return {
      schema: 'evercraft.beast-mode.football-engine-result.v1',
      status: 'quarantined',
      manifest: cargo,
      receipt: null,
      football_id: sealed.football_id,
      carrier_object_ref: clean(carrierResult?.object_ref) || null,
      events
    };
  }

  transition('RECEIVED', 'football_caught_and_hash_verified');

  let opened;
  const objects = [];
  try {
    opened = openFootball(caught);
    if (opened.cargo_id !== cargo.cargo_id) throw new Error('football_cargo_id_mismatch');

    for (const artifact of cargo.artifacts) {
      const artifactBytes = opened.artifacts.get(artifact.artifact_id);
      if (!artifactBytes) throw new Error(`football_artifact_missing:${artifact.artifact_id}`);
      const result = await destinationAdapter.write({ manifest: cargo, artifact, bytes: artifactBytes });
      if (!clean(result?.object_ref)) throw new Error(`destination_object_ref_missing:${artifact.artifact_id}`);
      objects.push({ artifact_id: artifact.artifact_id, object_ref: clean(result.object_ref), adapter_result: result });
    }
  } catch (error) {
    cargo = quarantine(cargo, 'football_unpack_failed', error instanceof Error ? error.message : String(error), now());
    return {
      schema: 'evercraft.beast-mode.football-engine-result.v1',
      status: 'quarantined',
      manifest: cargo,
      receipt: null,
      football_id: sealed.football_id,
      carrier_object_ref: clean(carrierResult?.object_ref) || null,
      objects,
      events
    };
  }

  const observations = [];
  try {
    for (const object of objects) {
      const artifact = cargo.artifacts.find((row) => row.artifact_id === object.artifact_id);
      const readBack = bytes(await destinationAdapter.readBack({
        manifest: cargo,
        artifact,
        object_ref: object.object_ref,
        adapter_result: object.adapter_result
      }));
      const metadata = await destinationAdapter.verifyMetadata({
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
    cargo = quarantine(cargo, 'football_destination_readback_failed', error instanceof Error ? error.message : String(error), now());
    return {
      schema: 'evercraft.beast-mode.football-engine-result.v1',
      status: 'quarantined',
      manifest: cargo,
      receipt: null,
      football_id: sealed.football_id,
      objects,
      observations,
      events
    };
  }

  const verification = verifyDestination(cargo, observations);
  if (!verification.ok) {
    cargo = quarantine(cargo, 'football_destination_verification_failed', JSON.stringify(verification.artifact_results), now());
    return {
      schema: 'evercraft.beast-mode.football-engine-result.v1',
      status: 'quarantined',
      manifest: cargo,
      receipt: null,
      football_id: sealed.football_id,
      objects,
      observations,
      verification,
      events
    };
  }

  transition('VERIFIED', 'football_unpacked_destination_verified');
  const delivered = buildDeliveryReceipt(cargo, verification, { now: now() });
  cargo = delivered.manifest;
  events.push({ state: 'DELIVERED', reason: 'football_receipt_written', at: cargo.updated_at });

  return {
    schema: 'evercraft.beast-mode.football-engine-result.v1',
    status: 'delivered',
    manifest: cargo,
    receipt: delivered.receipt,
    football_id: sealed.football_id,
    carrier_object_ref: clean(carrierResult.object_ref),
    objects,
    observations,
    verification,
    events,
    source_adapter: adapterId(sourceAdapter, 'source'),
    carrier_adapter: adapterId(carrierAdapter, 'carrier'),
    destination_adapter: adapterId(destinationAdapter, 'destination')
  };
}
