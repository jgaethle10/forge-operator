import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseIpNeigh,
  parseBluetoothDevices,
  parseAvahi,
  dedupeObservations,
} from '../systemia/saban/ambient-census.mjs';

test('LAN census hashes identifiers and never persists raw IP or MAC',()=>{
  const rows=parseIpNeigh(
    '192.168.1.20 dev wlan0 lladdr AA:BB:CC:DD:EE:FF REACHABLE\n',
    {salt:'secret'}
  );
  assert.equal(rows.length,1);
  assert.match(rows[0].device_hint_hash,/^sha256:/);
  assert.match(rows[0].address_hint_hash,/^sha256:/);
  assert.equal(JSON.stringify(rows).includes('AA:BB:CC:DD:EE:FF'),false);
  assert.equal(JSON.stringify(rows).includes('192.168.1.20'),false);
  assert.equal(rows[0].raw_identifier_persisted,false);
});

test('Bluetooth census hashes addresses and display names',()=>{
  const rows=parseBluetoothDevices(
    'Device 11:22:33:44:55:66 Kitchen Fridge\n',
    {salt:'secret'}
  );
  assert.equal(rows.length,1);
  assert.equal(JSON.stringify(rows).includes('11:22:33:44:55:66'),false);
  assert.equal(JSON.stringify(rows).includes('Kitchen Fridge'),false);
});

test('mDNS census retains service type but hashes instance identity',()=>{
  const rows=parseAvahi(
    '=;wlan0;IPv4;Kitchen Fridge;_matter._tcp;local\n',
    {salt:'secret'}
  );
  assert.equal(rows.length,1);
  assert.equal(rows[0].service_type,'_matter._tcp');
  assert.equal(JSON.stringify(rows).includes('Kitchen Fridge'),false);
});

test('census dedupes repeated passive observations',()=>{
  const row={source:'x',observation_kind:'lan-neighbor',device_hint_hash:'sha256:abc'};
  assert.equal(dedupeObservations([row,row]).length,1);
});
