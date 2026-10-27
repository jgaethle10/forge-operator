import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';

const path = new URL('../scripts/repair-stale-fabric-upnp.py', import.meta.url);
const script = fs.readFileSync(path, 'utf8');

test('guarded UPnP surgical repair is valid Python', () => {
  execFileSync('python3', ['-m', 'py_compile', path.pathname], {stdio: 'pipe'});
});

test('only previously verified Evercraft Fabric web ports and exact descriptions are touched', () => {
  assert.match(script, /EXPECTED = \(\(80, 18080, "Evercraft Fabric HTTP"\), \(443, 8443, "Evercraft Fabric HTTPS"\)\)/);
  assert.match(script, /actual\["desc"\] != desc/);
  assert.match(script, /actual\["port"\] != str\(internal\)/);
  assert.match(script, /actual\["host"\] != OLD/);
  assert.match(script, /parsed\.hostname != config\.get\("EVERCRAFT_ROUTER_GATEWAY"\)/);
  assert.doesNotMatch(script, /NewExternalPort['"]?: 53|NewExternalPort['"]?: 53053/);
});

test('UPnP repair preflights both routes, confirms action, readbacks, and attempts restore on failure', () => {
  const indexOfPreflight = script.indexOf('planned = []');
  const indexOfConfirmation = script.indexOf('if input(');
  const indexOfDeletion = script.indexOf('soap("DeletePortMapping"');
  assert.ok(indexOfPreflight > 0 && indexOfConfirmation > indexOfPreflight && indexOfDeletion > indexOfConfirmation);
  assert.match(script, /Type FIX to replace/);
  assert.match(script, /observed = lookup\(port\)/);
  assert.match(script, /add\(port, internal, desc, OLD, lease\)/);
  assert.match(script, /remaining mappings untouched/);
});
