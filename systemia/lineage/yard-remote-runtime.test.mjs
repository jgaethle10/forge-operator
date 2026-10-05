import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lineage } from './core.mjs';
import { startLineageRemoteRuntime } from './yard-remote-runtime.mjs';

async function json(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const body = await response.json();
  return { response, body };
}

test('Lineage Yard runtime stores verified immutable objects and CAS refs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lineage-yard-runtime-'));
  const runtime = await startLineageRemoteRuntime({ stateDir: root });
  try {
    const object = {
      type: 'receipt',
      payload: {
        schema: 'evercraft.lineage.test-receipt.v1',
        ok: true,
      },
    };
    const bytes = Buffer.from(JSON.stringify(object) + '\n');
    const id = lineage.sha256(lineage.stable(object));

    const health = await json(runtime.service_url + '/health');
    assert.equal(health.response.status, 200);
    assert.equal(health.body.protocol, 'evercraft.lineage.remote.v1');
    assert.equal(health.body.publication_authority, false);

    const put = await json(runtime.service_url + '/v1/object/put', {
      method: 'POST',
      body: JSON.stringify({ id, bytes_base64: bytes.toString('base64') }),
    });
    assert.equal(put.response.status, 200);
    assert.equal(put.body.id, id);

    const has = await json(runtime.service_url + '/v1/object/has', {
      method: 'POST',
      body: JSON.stringify({ id }),
    });
    assert.equal(has.body.present, true);

    const get = await json(runtime.service_url + '/v1/object/get', {
      method: 'POST',
      body: JSON.stringify({ id }),
    });
    assert.equal(Buffer.from(get.body.bytes_base64, 'base64').toString('utf8'), bytes.toString('utf8'));

    const first = await json(runtime.service_url + '/v1/ref/cas', {
      method: 'POST',
      body: JSON.stringify({ name: 'main', expected: null, next: id }),
    });
    assert.equal(first.response.status, 200);
    assert.equal(first.body.current, id);

    const stale = await json(runtime.service_url + '/v1/ref/cas', {
      method: 'POST',
      body: JSON.stringify({ name: 'main', expected: null, next: '1'.repeat(64) }),
    });
    assert.equal(stale.response.status, 409);
    assert.equal(stale.body.error, 'STALE_REF');
    assert.equal(stale.body.current, id);

    const refs = await json(runtime.service_url + '/v1/refs');
    assert.deepEqual(refs.body.refs, { main: id });
  } finally {
    await runtime.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('Lineage Yard runtime rejects malformed and falsely identified objects', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lineage-yard-invalid-'));
  const runtime = await startLineageRemoteRuntime({ stateDir: root });
  try {
    const invalid = await json(runtime.service_url + '/v1/object/put', {
      method: 'POST',
      body: JSON.stringify({
        id: '0'.repeat(64),
        bytes_base64: Buffer.from('not json').toString('base64'),
      }),
    });
    assert.equal(invalid.response.status, 422);
    assert.equal(invalid.body.error, 'INVALID_LINEAGE_OBJECT');

    const object = { type: 'receipt', payload: { ok: true } };
    const mismatch = await json(runtime.service_url + '/v1/object/put', {
      method: 'POST',
      body: JSON.stringify({
        id: '0'.repeat(64),
        bytes_base64: Buffer.from(JSON.stringify(object)).toString('base64'),
      }),
    });
    assert.equal(mismatch.response.status, 422);
    assert.equal(mismatch.body.error, 'lineage_object_digest_mismatch');
  } finally {
    await runtime.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('Lineage Yard runtime refuses non-loopback binding', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lineage-yard-bind-'));
  try {
    await assert.rejects(
      () => startLineageRemoteRuntime({ stateDir: root, host: '0.0.0.0' }),
      /must_bind_loopback/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
