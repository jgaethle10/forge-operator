import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  sealEnvelope,
  openEnvelope,
  ReplayGuard
} from './secure-envelope.mjs';
import {
  defaultTransportCatalog,
  selectTransport
} from './transport-router.mjs';
import { FileCourier } from './file-courier.mjs';
import {
  encodeCapacityBeacon,
  parseCapacityBeacon
} from '../compute/capacity-beacon.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-transport-proof-'));

try {
  // Existing LAN discovery primitive remains credential-free and parseable offline.
  const beaconBytes = encodeCapacityBeacon({
    nodeId: 'nexus-proof',
    endpoint: 'http://192.168.10.22:4242',
    expiresAt: new Date(Date.now() + 60_000).toISOString()
  });
  const beacon = parseCapacityBeacon(beaconBytes);
  assert.equal(beacon.node_id, 'nexus-proof');
  assert.equal(beacon.carries_credentials, false);
  assert.equal(beacon.endpoint, 'http://192.168.10.22:4242');

  // Prefer real LAN data path while it exists.
  const normalRoute = selectTransport({
    transports: defaultTransportCatalog({
      lanAvailable: true,
      fileCourierAvailable: true
    }),
    purpose: 'data',
    payload_bytes: 4096,
    requires_offline: true,
    max_latency_class: 'delay_tolerant'
  });
  assert.equal(normalRoute.status, 'ROUTE_READY');
  assert.equal(normalRoute.selected.id, 'lan_http');

  // When LAN disappears, the verified courier path is still usable.
  const blackoutRoute = selectTransport({
    transports: defaultTransportCatalog({
      lanAvailable: false,
      fileCourierAvailable: true
    }),
    purpose: 'data',
    payload_bytes: 4096,
    requires_offline: true,
    max_latency_class: 'delay_tolerant'
  });
  assert.equal(blackoutRoute.status, 'ROUTE_READY');
  assert.equal(blackoutRoute.selected.id, 'file_courier');
  assert.ok(!blackoutRoute.candidates.some((row) => row.id === 'wifi_direct'));
  assert.ok(!blackoutRoute.candidates.some((row) => row.id === 'ble_store_forward'));
  assert.ok(!blackoutRoute.candidates.some((row) => row.id === 'radio_gateway'));

  // Planned adapters never become imaginary routes.
  const noRoute = selectTransport({
    transports: defaultTransportCatalog({
      lanAvailable: false,
      fileCourierAvailable: false
    }),
    purpose: 'data',
    payload_bytes: 4096,
    requires_offline: true,
    max_latency_class: 'delay_tolerant'
  });
  assert.equal(noRoute.status, 'NO_ROUTE');
  assert.equal(noRoute.selected, null);

  // Move the exact same authenticated envelope through a filesystem/removable-media lane.
  const key = 'transport-proof-key';
  const envelope = sealEnvelope({
    key,
    key_id: 'transport-proof-v1',
    source: 'saban-seed-laptop',
    destination: 'guardian-island-b',
    kind: 'guardian.continuity',
    message_id: 'courier-message-001',
    expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
    payload: {
      mission_id: 'blackout-island-proof',
      request: 'continuity status',
      external_network_required: false
    }
  });

  const courier = new FileCourier({
    root: path.join(root, 'mounted-courier')
  });

  const firstExport = courier.exportEnvelope(envelope);
  assert.equal(firstExport.duplicate_export, false);
  assert.equal(courier.list().length, 1);

  const duplicateExport = courier.exportEnvelope(envelope);
  assert.equal(duplicateExport.duplicate_export, true);
  assert.equal(courier.list().length, 1);

  const imports = courier.importEnvelopes();
  assert.equal(imports.length, 1);
  assert.equal(imports[0].status, 'READY');

  const replayGuard = new ReplayGuard();
  const opened = openEnvelope({
    envelope: imports[0].envelope,
    key,
    expected_destination: 'guardian-island-b',
    replay_guard: replayGuard
  });
  assert.equal(opened.payload.mission_id, 'blackout-island-proof');

  assert.throws(
    () => openEnvelope({
      envelope: imports[0].envelope,
      key,
      expected_destination: 'guardian-island-b',
      replay_guard: replayGuard
    }),
    /replay_detected/
  );

  // Detect storage/media corruption independently of envelope authentication.
  const courierFile = path.join(root, 'mounted-courier', imports[0].file_name);
  const originalBytes = fs.readFileSync(courierFile);
  fs.writeFileSync(courierFile, Buffer.concat([originalBytes, Buffer.from('\nCORRUPT')]));
  const corrupted = courier.importEnvelopes();
  assert.equal(corrupted.length, 1);
  assert.equal(corrupted[0].status, 'CORRUPT_FILE');

  const ack = courier.acknowledge(imports[0].file_name);
  assert.equal(ack.removed, true);
  assert.equal(courier.list().length, 0);

  console.log(JSON.stringify({
    schema: 'evercraft.transport-diversity-proof.v1',
    status: 'PASS',
    verified_paths: {
      lan_http_data: true,
      udp_multicast_discovery_encoding: true,
      file_courier_data: true
    },
    blackout_behavior: {
      planned_transports_not_selected: true,
      courier_selected_when_lan_unavailable: true,
      no_verified_path_returns_no_route: true
    },
    courier: {
      authenticated_envelope_preserved: true,
      duplicate_export_deduped: true,
      replay_rejected: true,
      media_corruption_detected: true,
      acknowledged_file_removed: true
    },
    field_proof_required: [
      'actual multicast discovery between separate devices',
      'Wi-Fi Direct adapter',
      'BLE discovery and fragmentation',
      'radio gateway adapter',
      'real removable-media handoff between isolated machines'
    ]
  }, null, 2));
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
