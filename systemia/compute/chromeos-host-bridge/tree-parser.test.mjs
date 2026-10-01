import assert from 'node:assert/strict';
import test from 'node:test';
import {
  extractPortForwardingState,
  locatePortForwardingSurface,
  normalizeChecked,
} from './tree-parser.js';

function node(role, name, extra = {}, children = []) {
  const item = { role, name, ...extra, children };
  return item;
}

test('normalizes automation checked states', () => {
  assert.equal(normalizeChecked({ checked: true }), true);
  assert.equal(normalizeChecked({ checked: 'false' }), false);
  assert.equal(normalizeChecked({ state: { checkedState: 'checked' } }), true);
  assert.equal(normalizeChecked({}), null);
});

test('extracts only admitted port toggles from accessibility context', () => {
  const root = node('rootWebArea', 'Settings', {}, [
    node('heading', 'Port forwarding'),
    node('genericContainer', '', {}, [
      node('staticText', '18080 TCP'),
      node('staticText', 'Fabric HTTP edge'),
      node('switch', 'Activate port', { checked: true }),
    ]),
    node('genericContainer', '', {}, [
      node('staticText', '8443 TCP'),
      node('staticText', 'Fabric TLS edge'),
      node('switch', 'Activate port', { checked: false }),
    ]),
    node('genericContainer', '', {}, [
      node('staticText', '9999 TCP'),
      node('switch', 'Activate port', { checked: true }),
    ]),
  ]);

  const result = extractPortForwardingState(root);
  assert.equal(result.settings_surface_observed, true);
  assert.equal(result.ports.length, 2);
  assert.equal(result.ports.find((row) => row.port === 18080)?.enabled, true);
  assert.equal(result.ports.find((row) => row.port === 8443)?.enabled, false);
  assert.equal(result.ports.some((row) => row.port === 9999), false);
});

test('fails to unknown rather than inventing state when the settings surface is absent', () => {
  const result = extractPortForwardingState(node('rootWebArea', 'Unrelated page'));
  assert.equal(result.settings_surface_observed, false);
  for (const row of result.ports) {
    assert.equal(row.present, false);
    assert.equal(row.enabled, null);
  }
});


test('does not depend on English accessibility labels when the settings route is verified', () => {
  const root = node('rootWebArea', 'Configuración', {}, [
    node('heading', 'Reenvío de puertos'),
    node('genericContainer', '', {}, [
      node('staticText', '18080 TCP'),
      node('staticText', 'Borde HTTP'),
      node('switch', 'Activar puerto', { checked: true }),
    ]),
    node('genericContainer', '', {}, [
      node('staticText', '8443 TCP'),
      node('staticText', 'Borde TLS'),
      node('switch', 'Activar puerto', { checked: false }),
    ]),
  ]);

  const result = extractPortForwardingState(
    root,
    undefined,
    { expectedSurface: true },
  );
  assert.equal(result.settings_surface_observed, true);
  assert.equal(result.diagnostics.language_hint_observed, false);
  assert.equal(result.diagnostics.surface_asserted_by_caller, true);
  assert.equal(result.ports.find((row) => row.port === 18080)?.enabled, true);
  assert.equal(result.ports.find((row) => row.port === 8443)?.enabled, false);
});


test('isolates the smallest desktop subtree containing both admitted port controls', () => {
  const target = node('genericContainer', 'Linux development environment', {}, [
    node('genericContainer', '', {}, [
      node('staticText', '18080 TCP'),
      node('switch', 'Activar puerto', { checked: true }),
    ]),
    node('genericContainer', '', {}, [
      node('staticText', '8443 TCP'),
      node('switch', 'Activar puerto', { checked: false }),
    ]),
  ]);
  const desktop = node('desktop', 'ChromeOS desktop', {}, [
    node('window', 'Unrelated app', {}, [
      node('staticText', 'service listening on 8443'),
      node('switch', 'Unrelated switch', { checked: true }),
    ]),
    node('window', 'Settings', {}, [target]),
    node('window', 'Terminal', {}, [
      node('staticText', 'curl localhost:18080'),
    ]),
  ]);

  const located = locatePortForwardingSurface(desktop);
  assert.equal(located.ok, true);
  assert.equal(located.reason, 'smallest_structural_surface');
  assert.equal(located.root, target);

  const result = extractPortForwardingState(
    located.root,
    undefined,
    { expectedSurface: true },
  );
  assert.equal(result.ports.find((row) => row.port === 18080)?.enabled, true);
  assert.equal(result.ports.find((row) => row.port === 8443)?.enabled, false);
});

test('desktop surface isolation fails closed when two equally specific surfaces match', () => {
  const portSurface = (label) => node('genericContainer', label, {}, [
    node('genericContainer', '', {}, [
      node('staticText', '18080 TCP'),
      node('switch', 'toggle', { checked: true }),
    ]),
    node('genericContainer', '', {}, [
      node('staticText', '8443 TCP'),
      node('switch', 'toggle', { checked: true }),
    ]),
  ]);
  const desktop = node('desktop', 'ChromeOS desktop', {}, [
    portSurface('candidate one'),
    portSurface('candidate two'),
  ]);

  const located = locatePortForwardingSurface(desktop);
  assert.equal(located.ok, false);
  assert.equal(located.reason, 'ambiguous_structural_candidates');
  assert.equal(located.root, null);
});

test('matching target settings URL wins over unrelated structural candidates', () => {
  const target = node(
    'rootWebArea',
    'Settings',
    { url: 'chrome://os-settings/crostini/portForwarding' },
    [
      node('genericContainer', '', {}, [
        node('staticText', '18080 TCP'),
        node('switch', 'toggle', { checked: true }),
      ]),
      node('genericContainer', '', {}, [
        node('staticText', '8443 TCP'),
        node('switch', 'toggle', { checked: true }),
      ]),
    ],
  );
  const unrelated = node('genericContainer', 'dashboard', {}, [
    node('staticText', '18080 TCP'),
    node('switch', 'toggle', { checked: false }),
    node('staticText', '8443 TCP'),
    node('switch', 'toggle', { checked: false }),
  ]);
  const desktop = node('desktop', 'ChromeOS desktop', {}, [unrelated, target]);

  const located = locatePortForwardingSurface(desktop);
  assert.equal(located.ok, true);
  assert.equal(located.reason, 'target_url');
  assert.equal(located.root, target);
});
