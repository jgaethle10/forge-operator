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

  // Invalid requests never silently relax payload or latency requirements.
  const catalog=defaultTransportCatalog({lanAvailable:true,fileCourierAvailable:true});
  assert.equal(selectTransport({transports:catalog,payload_bytes:-1}).status,'INVALID_REQUEST');
  assert.equal(selectTransport({transports:catalog,payload_bytes:1.5}).status,'INVALID_REQUEST');
  assert.equal(selectTransport({transports:catalog,payload_bytes:Number.NaN}).status,'INVALID_REQUEST');
  assert.equal(selectTransport({transports:catalog,payload_bytes:Number.MAX_SAFE_INTEGER+1}).status,'INVALID_REQUEST');
  assert.equal(selectTransport({transports:catalog,max_latency_class:'unknown'}).status,'INVALID_REQUEST');
  assert.equal(selectTransport({transports:{not:'an_array'}}).status,'INVALID_REQUEST');

  // A claimed VERIFIED state alone is not a usable transport specification.
  const incomplete=[{
    id:'unbounded_unknown',state:'verified',purposes:['data'],offline_usable:true,
    latency_class:'unknown',max_payload_bytes:'unlimited',power_cost:0,
  }];
  assert.equal(selectTransport({transports:incomplete,payload_bytes:4096}).status,'NO_ROUTE');
  const unknownCeiling=[{...incomplete[0],latency_class:'realtime'}];
  assert.equal(selectTransport({transports:unknownCeiling,payload_bytes:4096}).status,'NO_ROUTE');
  const unknownLatency=[{...incomplete[0],max_payload_bytes:10000}];
  assert.equal(selectTransport({transports:unknownLatency,payload_bytes:4096}).status,'NO_ROUTE');
  const spoofed=[null,{...incomplete[0],id:'too_small',latency_class:'realtime',max_payload_bytes:4}];
  assert.equal(selectTransport({transports:spoofed,payload_bytes:4096}).status,'NO_ROUTE');
  assert.equal(selectTransport({transports:catalog,payload_bytes:0}).status,'ROUTE_READY');
  // String purposes and forged negative power budgets cannot win routing.
  const validShape={id:'valid',state:'verified',purposes:['data'],
    offline_usable:true,bidirectional:true,latency_class:'realtime',
    power_cost:4,max_payload_bytes:10000,requires_external_infrastructure:false};
  const invalidPurposes={...validShape,id:'purposes-string',purposes:'data'};
  const negativePower={...validShape,id:'negative-power',power_cost:-1000000};
  const forgedBidirectionality={...validShape,id:'string-bool',bidirectional:'true'};
  const unknownInfra={...validShape,id:'missing-infra',requires_external_infrastructure:undefined};
  const dishonestScore=selectTransport({
    transports:[invalidPurposes,negativePower,forgedBidirectionality,unknownInfra,validShape],
    purpose:'data',payload_bytes:500,
  });
  assert.equal(dishonestScore.status,'ROUTE_READY');
  assert.equal(dishonestScore.selected.id,'valid');
  assert.equal(dishonestScore.candidates.length,1);
  assert.equal(selectTransport({transports:[negativePower],purpose:'data'}).status,'NO_ROUTE');
  assert.equal(selectTransport({transports:catalog,purpose:''}).status,'INVALID_REQUEST');

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
