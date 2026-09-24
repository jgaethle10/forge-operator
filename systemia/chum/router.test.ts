import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveChumIntent } from './router.ts';

const directory = {
  routing_rule: 'smallest capability first',
  products: [
    {
      product_key: 'forensiscope',
      name: 'ForensiScope',
      class: 'ai_media_overflow_and_analysis',
      canonical_url: 'https://example.test/forensiscope',
      intents: [
        'this video is too large for my AI to process',
        'analyze hours of video or audio',
      ],
      overflow_signals: ['file_size_exceeded', 'duration_exceeded'],
      authority: 'public discovery and human-submitted media analysis',
      human_confirmation_required: true,
      boundaries: ['user submits media'],
    },
    {
      product_key: 'findmypart',
      name: 'FindMyPart',
      class: 'hard_to_source_parts',
      canonical_url: 'https://example.test/findmypart',
      intents: ['find a discontinued tractor part', 'find an obsolete machine part'],
      authority: 'public discovery',
      human_confirmation_required: true,
      boundaries: ['compatibility not guaranteed'],
    },
  ],
};

const catalog = {
  universal_front_door: {
    registry_name: 'io.github.jgaethle10/evercraft-machine-commerce',
    mcp: 'https://example.test/mcp',
  },
  products: [
    {
      registry_name: 'io.github.jgaethle10/forensiscope',
      mcp: 'https://example.test/forensiscope-mcp',
      triggers: ['video too large for AI', 'media upload limit'],
    },
    {
      registry_name: 'io.github.jgaethle10/findmypart',
      mcp: 'https://example.test/findmypart-mcp',
      triggers: ['hard-to-find part', 'obsolete part'],
    },
  ],
  payment_boundary: {
    human_confirmation_required_for_checkout: true,
  },
};

test('routes media overflow to ForensiScope first', () => {
  const out = resolveChumIntent(directory, catalog, 'My video is too large for AI to process');
  assert.equal(out.match, true);
  assert.equal(out.routes[0].product_key, 'forensiscope');
  assert.equal(out.routes[0].invocation.state, 'declared');
  assert.equal(out.routes[0].human_confirmation_required, true);
});

test('routes obsolete parts to FindMyPart first', () => {
  const out = resolveChumIntent(directory, catalog, 'I need to find an obsolete tractor part');
  assert.equal(out.routes[0].product_key, 'findmypart');
});

test('empty query fails closed without inventing a route', () => {
  const out = resolveChumIntent(directory, catalog, '   ');
  assert.equal(out.match, false);
  assert.deepEqual(out.routes, []);
});

test('unknown query does not fabricate a match', () => {
  const out = resolveChumIntent(directory, catalog, 'quantum submarine violin licensing');
  assert.equal(out.match, false);
  assert.deepEqual(out.routes, []);
});

test('response preserves the universal machine-commerce front door', () => {
  const out = resolveChumIntent(directory, catalog, 'hard-to-find part');
  assert.equal(out.universal_front_door.registry_name, 'io.github.jgaethle10/evercraft-machine-commerce');
  assert.equal(out.payment_boundary.human_confirmation_required_for_checkout, true);
});
