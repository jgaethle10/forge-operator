import test from 'node:test';
import assert from 'node:assert/strict';
import {renderWorldsKeeperUnits} from '../scripts/install-worlds-edge-keeper.mjs';
const valid={
 node:'/usr/bin/node',repo:'/srv/evercraft/forge-operator',
 origin:'https://worlds.example.org',control:'http://127.0.0.1:18081',
 vaultOrigin:'http://127.0.0.1:8788',instance:'evercraft-worlds-001',
 receipt:'a'.repeat(64),secretPath:'/home/coach/.config/evercraft/worlds-edge-auth.env'
};
test('resident timer renews only the named Worlds lease at a fixed 15m cadence',()=>{
 const {service,timer}=renderWorldsKeeperUnits(valid);
 assert.match(timer,/OnUnitActiveSec=15min/);
 assert.match(service,/route-worlds-owned-edge\.mjs --reconcile/);
 assert.match(service,/--public-origin https:\/\/worlds.example.org/);
 assert.match(service,/--vault http:\/\/127\.0\.0\.1:8788/);
 assert.match(service,/EnvironmentFile=\/home\/coach\/.config\/evercraft\/worlds-edge-auth.env/);
 assert.ok(!service.includes('EVERCRAFT_EDGE_CONTROL_TOKEN='));
 assert.ok(!timer.includes('caddy')&&!timer.includes('fabric'));
});
test('installer refuses unsafe arguments rather than emitting executable units',()=>{
 for(const input of [
 {...valid,repo:'/srv/evercraft/evil\nExecStart=/bin/true'},
 {...valid,origin:'https://worlds.example.org %n'},
 {...valid,control:'http://127.0.0.1:1\n'},
 {...valid,receipt:'a'.repeat(64)+';rm'}
 ])assert.throws(()=>renderWorldsKeeperUnits(input),/unsafe/);
});
