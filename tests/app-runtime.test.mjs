import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { SqliteEntityStore } from '../systemia/app-runtime/entity-store.mjs';
import { startAppGateway } from '../systemia/app-runtime/app-gateway.mjs';

test('Evercraft App Runtime replaces entity, auth and function SDK transport', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-app-runtime-'));
  const store = new SqliteEntityStore({ filename: path.join(dir, 'runtime.sqlite') });
  const authCalls = [];
  const functionCalls = [];

  const runtime = await startAppGateway({
    port: 0,
    store,
    config: {
      dataFile: path.join(dir, 'runtime.sqlite'),
      corsOrigin: '',
      allowAnonymousRead: false,
      allowAnonymousWrite: false,
      authAdapterUrl: '',
      authAdapterSecret: '',
      functionRouterUrl: '',
      functionRouterSecret: '',
    },
    adapters: {
      auth: async (operation, payload) => {
        authCalls.push([operation, payload]);
        if (operation === 'authorize') {
          return { allowed: true, user: { id: 'user-proof' } };
        }
        if (operation === 'me') return { id: 'user-proof', email: 'proof@example.test' };
        if (operation === 'isAuthenticated') return true;
        return { ok: true };
      },
      functions: async (name, payload) => {
        functionCalls.push([name, payload]);
        return { function: name, echoed: payload };
      },
    },
  });

  try {
    const health = await fetch(runtime.url + '/api/app/health').then((r) => r.json());
    assert.equal(health.ok, true);
    assert.equal(health.runtime_owner, 'evercraft');
    assert.equal(health.legacy_sdk_transport, false);
    assert.equal(health.data_backend, 'sqlite');

    const create = await fetch(runtime.url + '/api/entities/Job/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer proof-token' },
      body: JSON.stringify({ data: { name: 'Proof job', status: 'open', amount: 125 } }),
    }).then((r) => r.json());
    assert.equal(create.ok, true);
    assert.equal(create.value.name, 'Proof job');
    assert.equal(create.value.created_by_id, 'user-proof');

    const filtered = await fetch(runtime.url + '/api/entities/Job/filter', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer proof-token' },
      body: JSON.stringify({ query: { status: 'open', amount: { '$gte': 100 } }, sort: '-created_date', limit: 10 }),
    }).then((r) => r.json());
    assert.equal(filtered.value.length, 1);
    assert.equal(filtered.value[0].id, create.value.id);

    const updated = await fetch(runtime.url + '/api/entities/Job/update', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer proof-token' },
      body: JSON.stringify({ id: create.value.id, data: { status: 'done' } }),
    }).then((r) => r.json());
    assert.equal(updated.value.status, 'done');
    assert.equal(updated.value.name, 'Proof job');

    const invoked = await fetch(runtime.url + '/api/functions/invoke', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer proof-token' },
      body: JSON.stringify({ name: 'proofFunction', payload: { x: 1 } }),
    }).then((r) => r.json());
    assert.deepEqual(invoked.value, { function: 'proofFunction', echoed: { x: 1 } });
    assert.equal(functionCalls.length, 1);

    const me = await fetch(runtime.url + '/api/auth/me', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer proof-token' },
      body: JSON.stringify({ args: [] }),
    }).then((r) => r.json());
    assert.equal(me.value.id, 'user-proof');
    assert.equal(authCalls.some(([op]) => op === 'authorize'), true);

    const deleted = await fetch(runtime.url + '/api/entities/Job/delete', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer proof-token' },
      body: JSON.stringify({ id: create.value.id }),
    }).then((r) => r.json());
    assert.equal(deleted.value.deleted, true);
  } finally {
    await runtime.close();
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
