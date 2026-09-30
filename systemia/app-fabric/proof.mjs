#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DurableEntityStore } from './entity-store.mjs';
import { createEvercraftAppClient } from './client.mjs';
import { startAppFabricGateway } from './gateway.mjs';

const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-app-fabric-proof-'));
const store = new DurableEntityStore({ stateDir });

const gateway = await startAppFabricGateway({
  store,
  authorize: async ({ subjectRef, serviceRole }) =>
    serviceRole || subjectRef === 'evercraft:subject:proof-user',
  identityResolver: async ({ token }) =>
    token === 'proof-user-token'
      ? { subject_ref: 'evercraft:subject:proof-user', display_name: 'Proof User' }
      : null,
  serviceAuthorizer: async ({ permit }) => permit === 'proof-service-permit',
  functionInvoker: async ({ functionName, body, subjectRef, serviceRole }) => {
    if (functionName !== 'echo') throw new Error('function_not_found');
    return { echoed: body, subject_ref: subjectRef, service_role: serviceRole };
  },
  integrationInvoker: async ({ provider, operation, body }) => ({
    provider,
    operation,
    input: body
  }),
  authHandlers: {
    me: async ({ subjectRef }) => ({
      id: subjectRef,
      subject_ref: subjectRef,
      email: 'proof@example.invalid'
    }),
    updateMe: async ({ subjectRef, body }) => ({
      id: subjectRef,
      subject_ref: subjectRef,
      ...body
    })
  }
});

try {
  const client = createEvercraftAppClient({
    appId: 'proof-app',
    baseUrl: gateway.origin,
    token: 'proof-user-token'
  });

  const created = await client.entities.Widget.create({ name: 'alpha', score: 1, group: 'a' });
  assert.equal(created.name, 'alpha');
  assert.ok(created.id);

  const bulk = await client.entities.Widget.bulkCreate([
    { name: 'beta', score: 2, group: 'a' },
    { name: 'gamma', score: 3, group: 'b' }
  ]);
  assert.equal(bulk.length, 2);

  const filtered = await client.entities.Widget.filter(
    { score: { $gte: 2 } },
    '-score',
    10
  );
  assert.deepEqual(filtered.map((row) => row.name), ['gamma', 'beta']);

  assert.equal(await client.entities.Widget.count({ group: 'a' }), 2);

  const updated = await client.entities.Widget.update(created.id, { score: 4 });
  assert.equal(updated.score, 4);

  const many = await client.entities.Widget.updateMany({ group: 'a' }, { reviewed: true });
  assert.equal(many.length, 2);
  assert.ok(many.every((row) => row.reviewed === true));

  const upserted = await client.entities.Widget.upsert(
    [
      { name: 'gamma', score: 5, group: 'b' },
      { name: 'delta', score: 6, group: 'c' }
    ],
    { key: 'name' }
  );
  assert.equal(upserted.length, 2);
  assert.equal((await client.entities.Widget.filter({ name: 'gamma' }))[0].score, 5);

  const aggregate = await client.entities.Widget.aggregate({
    group_by: 'group',
    metrics: [{ op: 'sum', field: 'score', as: 'score_sum' }]
  });
  assert.ok(Array.isArray(aggregate));
  assert.ok(aggregate.some((row) => row.key === 'b' && row.metrics.score_sum === 5));

  const functionResult = await client.functions.invoke('echo', { value: 42 });
  assert.equal(functionResult.data.echoed.value, 42);
  assert.equal(functionResult.data.subject_ref, 'evercraft:subject:proof-user');

  const integration = await client.integrations.Core.ProofOperation({ hello: 'world' });
  assert.equal(integration.provider, 'Core');
  assert.equal(integration.operation, 'ProofOperation');

  const me = await client.auth.me();
  assert.equal(me.subject_ref, 'evercraft:subject:proof-user');

  const service = createEvercraftAppClient({
    appId: 'proof-app',
    baseUrl: gateway.origin,
    servicePermit: 'proof-service-permit'
  });
  const serviceCreated = await service.entities.Widget.create({ name: 'service-row', score: 7, group: 's' });
  assert.equal(serviceCreated.name, 'service-row');

  const denied = createEvercraftAppClient({
    appId: 'proof-app',
    baseUrl: gateway.origin
  });
  await assert.rejects(
    () => denied.entities.Widget.list(),
    (error) => error?.status === 403
  );

  const beforeRestart = await client.entities.Widget.count();
  const reopened = new DurableEntityStore({ stateDir });
  assert.equal(reopened.count('proof-app', 'Widget', {}), beforeRestart);
  assert.equal(reopened.health().state, 'healthy');

  const receipts = fs.readFileSync(path.join(stateDir, 'mutation-receipts.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  assert.ok(receipts.length >= 5);
  assert.ok(receipts.every((row) => /^sha256:[a-f0-9]{64}$/i.test(row.receipt_hash)));

  console.log(JSON.stringify({
    schema: 'evercraft.app-fabric.proof.v1',
    status: 'pass',
    entity_crud: true,
    bulk_ops: true,
    query_filter_sort: true,
    aggregate: true,
    function_invoke: true,
    integration_invoke: true,
    user_identity_boundary: true,
    service_role_boundary: true,
    unauthorized_default_denied: true,
    durable_restart: true,
    mutation_receipts: true
  }));
} finally {
  await new Promise((resolve) => gateway.server.close(resolve));
  fs.rmSync(stateDir, { recursive: true, force: true });
}
