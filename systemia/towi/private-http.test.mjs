import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { registerTowiPrivateRoutes } from './private-http.mjs';

const TOKEN = 'very-long-owner-only-systemia-token-20261120-abc';
const NOW = '2026-11-20T12:00:00.000Z';
function setup(t, overrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'towi-http-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const routes = new Map();
  const app = {
    get: (name, ...handlers) => routes.set('GET ' + name, handlers),
    post: (name, ...handlers) => routes.set('POST ' + name, handlers)
  };
  const resident = registerTowiPrivateRoutes(app, {
    stateDir: dir,
    residentEnabled: false,
    internalToken: TOKEN,
    clock: () => new Date(NOW),
    ...overrides
  });
  async function invoke(method, route, {
    token = TOKEN,
    body = undefined
  } = {}) {
    const handlers = routes.get(method + ' ' + route);
    assert.ok(handlers, 'registered route required');
    return await new Promise((resolve, reject) => {
      const headers = token === null ? {} : { authorization: 'Bearer ' + token };
      const req = { headers, body };
      const res = {
        code: 200,
        headers: {},
        setHeader(k, v) { this.headers[k] = v; return this; },
        status(c) { this.code = c; return this; },
        json(value) { resolve({ code: this.code, body: value, headers: this.headers }); return this; }
      };
      try {
        const next = () => {
          Promise.resolve(handlers.at(-1)(req, res)).catch(reject);
        };
        handlers[0](req, res, next);
      } catch (err) { reject(err); }
    });
  }
  return { routes, resident, invoke, dir };
}

test('all TOWI endpoints are explicitly private, no public dossier leak', async (t) => {
  const { routes, invoke } = setup(t);
  assert.deepEqual([...routes.keys()].sort(), [
    'GET /api/internal/towi/dossiers',
    'GET /api/internal/towi/health',
    'GET /api/internal/towi/production-candidates',
    'POST /api/internal/towi/run'
  ]);
  const missing = await invoke('GET', '/api/internal/towi/health', { token: null });
  assert.equal(missing.code, 401);
  const wrong = await invoke('GET', '/api/internal/towi/dossiers', { token: 'wrong' });
  assert.equal(wrong.code, 401);
  const healthy = await invoke('GET', '/api/internal/towi/health');
  assert.equal(healthy.code, 200);
  assert.equal(healthy.body.access_scope, 'owner_private_only');
  assert.equal(healthy.body.external_publication_authority, false);
  assert.equal(healthy.headers['Cache-Control'], 'no-store');
});

test('inbound caller cannot inject a fabricated Radar edition; read-only source owned by Radar resident', async (t) => {
  const { invoke, resident } = setup(t, {
    radarResident: { internalLatest: () => null }
  });
  const result = await invoke('POST', '/api/internal/towi/run', {
    body: { radar_edition: {
      edition_id: 'untrusted', signals: [{ summary: 'fabricated' }]
    } }
  });
  assert.equal(result.code, 200);
  assert.equal(result.body.ingest_status, 'quiet');
  assert.equal(resident.queue().length, 0);
  const list = await invoke('GET', '/api/internal/towi/dossiers');
  assert.equal(list.body.dossiers.length, 0);
  assert.equal(list.body.publication_authority, false);
});

test('unconfigured or weak token holds every owner endpoint and never starts resident', async (t) => {
  const { invoke, resident } = setup(t, {
    internalToken: 'weak',
    residentEnabled: true,
    radarResident: { internalLatest: () => null }
  });
  const health = await invoke('GET', '/api/internal/towi/health', { token: 'weak' });
  assert.equal(health.code, 503);
  assert.equal(resident.health().resident, false);
});

test('an authorized internal Radar edition creates a private research dossier, not a published article', async (t) => {
  const edition = {
    edition_id: 'trusted-radar-one',
    signals: [{
      signal_id: 'river-source',
      subject_key: 'yakima-water',
      observation_id: 'official-water-1',
      observed_at: NOW,
      last_verified_at: NOW,
      summary: 'One official source recorded a water measurement.',
      truth_state: 'OBSERVED',
      change_state: 'NEW',
      materiality_score: 0.81,
      reliability: 0.95,
      domains: ['water'],
      region_keys: ['yakima'],
      source_family: 'usgs-water',
      provenance_refs: ['https://waterdata.usgs.gov/'],
      review: {
        status: 'pass',
        independent_source_families: 1,
        freshness: { state: 'fresh' }
      }
    }],
    rolled_off_signals: []
  };
  const { invoke } = setup(t, { radarResident: { internalLatest: () => edition } });
  const run = await invoke('POST', '/api/internal/towi/run');
  assert.equal(run.code, 200);
  assert.equal(run.body.dossier_count, 1);
  assert.equal(run.body.publication_authority, false);
  const queue = await invoke('GET', '/api/internal/towi/dossiers');
  assert.equal(queue.body.dossiers.length, 1);
  assert.equal(queue.body.dossiers[0].readiness.status, 'research_required');
  const production = await invoke('GET', '/api/internal/towi/production-candidates');
  assert.equal(production.body.publication_authority, false);
});
