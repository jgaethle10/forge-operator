import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  LineageControlRoomHomeBridge,
  lineageHomeBridgePolicy,
} from './lineage-adapter.mjs';
import { startEvercraftHomeServer } from './server.mjs';

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function computeBridgeResponse(res, value, status = 200) {
  const payload = Buffer.from(JSON.stringify({
    ok: true,
    status,
    headers: { 'content-type': 'application/json' },
    body_base64: Buffer.from(JSON.stringify(value)).toString('base64'),
    receipt: { receipt_hash: 'compute-bridge-receipt' },
  }));
  res.writeHead(200, {
    'content-type': 'application/json',
    'content-length': payload.length,
  });
  res.end(payload);
}

test('Home Lineage adapter permits only known read paths over loopback Compute bridge', async () => {
  assert.throws(
    () => new LineageControlRoomHomeBridge({
      bridgeUrl: 'https://example.com/v1/services/svc/http-bridge',
      bridgeToken: 'x'.repeat(64),
    }),
    /must_use_loopback_http/
  );

  assert.throws(
    () => new LineageControlRoomHomeBridge({
      bridgeUrl: 'http://127.0.0.1:4310/arbitrary',
      bridgeToken: 'x'.repeat(64),
    }),
    /bridge_path_invalid/
  );

  assert.match(
    lineageHomeBridgePolicy.read_path_pattern,
    /snapshot/
  );
  assert.doesNotMatch(
    lineageHomeBridgePolicy.read_path_pattern,
    /object/
  );
  assert.doesNotMatch(
    lineageHomeBridgePolicy.read_path_pattern,
    /ref\\\/cas/
  );
});

test('Evercraft Home authenticates Lineage reads without exposing Compute authority material', async () => {
  const root = await mkdtemp(join(tmpdir(), 'evercraft-home-lineage-'));
  const tokenFile = join(root, 'compute-bridge.token');
  const token = 'lineage-compute-private-token-' + 'x'.repeat(40);
  const seen = [];
  let bridge = null;
  let home = null;

  const bridgeServer = http.createServer(async (req, res) => {
    assert.equal(
      req.url,
      '/v1/services/svc-lineage/http-bridge'
    );
    assert.equal(req.method, 'POST');
    assert.equal(req.headers.authorization, `Bearer ${token}`);

    const envelope = await readJson(req);
    seen.push(envelope);
    assert.equal(envelope.method, 'GET');
    assert.equal(envelope.body_base64, '');

    if (envelope.path === '/health') {
      return computeBridgeResponse(res, {
        schema: 'evercraft.lineage.control-room.health.v1',
        ok: true,
        mode: 'read_only',
        mutation_authority: false,
        publication_authority: false,
        payment_authority: false,
      });
    }

    if (String(envelope.path).startsWith('/v1/snapshot?')) {
      return computeBridgeResponse(res, {
        schema: 'evercraft.lineage.control-room.snapshot.v1',
        mode: 'read_only',
        ref: 'main',
        head: 'a'.repeat(64),
        current_branch: 'main',
        branches: [{
          name: 'main',
          head: 'a'.repeat(64),
          short_head: 'a'.repeat(12),
        }],
        releases: [],
        graph: {
          schema: 'evercraft.lineage.history-graph.v1',
          ref: 'main',
          head: 'a'.repeat(64),
          nodes: [],
          edges: [],
          truncated: false,
        },
        storage: {
          state: 'available',
          destructive: false,
          inventory: {
            objects: { count: 1, bytes: 100 },
            manifests: { count: 0, bytes: 0 },
            chunks: { count: 0, bytes: 0 },
          },
          reclaimable: { total_bytes: 0 },
        },
        capabilities: {
          mutation: false,
          publication: false,
          deployment: false,
          payment: false,
          private_data_authority: false,
        },
      });
    }

    if (String(envelope.path).startsWith('/v1/integrity?')) {
      return computeBridgeResponse(res, {
        schema: 'evercraft.lineage.fsck.v1',
        ok: true,
        issue_count: 0,
      });
    }

    return computeBridgeResponse(
      res,
      { error: 'not_found' },
      404
    );
  });

  try {
    const bridgeOrigin = await listen(bridgeServer);
    const bridgeUrl =
      bridgeOrigin + '/v1/services/svc-lineage/http-bridge';

    await writeFile(tokenFile, token + '\n', { mode: 0o600 });
    await chmod(tokenFile, 0o600);

    home = await startEvercraftHomeServer({
      host: '127.0.0.1',
      port: 0,
      authMode: 'local',
      serviceOrigins: {
        LINEAGE_CONTROL_ROOM_BRIDGE_URL: bridgeUrl,
        LINEAGE_CONTROL_ROOM_BRIDGE_TOKEN_FILE: tokenFile,
      },
    });

    const healthResponse = await fetch(home.url + '/api/health');
    const health = await healthResponse.json();
    assert.equal(healthResponse.status, 200);
    assert.equal(health.lineage_control_room_configured, true);
    assert.equal(health.lineage_control_room_read_only, true);
    assert.equal(
      health.lineage_control_room_secret_material_exposed,
      false
    );
    const serializedHealth = JSON.stringify(health);
    assert.doesNotMatch(serializedHealth, new RegExp(token));
    assert.doesNotMatch(serializedHealth, /svc-lineage/);
    assert.doesNotMatch(serializedHealth, /http-bridge/);

    const homePageResponse = await fetch(home.url + '/');
    const homePage = await homePageResponse.text();
    assert.equal(homePageResponse.status, 200);
    assert.match(
      homePage,
      /id="lineage-link" href="\/lineage">Lineage<\/a>/
    );
    assert.match(
      homePage,
      /getElementById\("lineage-link"\)\.classList\.add\("visible"\)/
    );
    assert.match(
      homePage,
      /getElementById\("lineage-link"\)\.classList\.remove\("visible"\)/
    );
    assert.doesNotMatch(homePage, new RegExp(token));
    assert.doesNotMatch(homePage, /svc-lineage/);
    assert.doesNotMatch(homePage, /http-bridge/);

    const pageResponse = await fetch(home.url + '/lineage');
    const page = await pageResponse.text();
    assert.equal(pageResponse.status, 200);
    assert.match(page, /Evercraft <b>Lineage<\/b> Control Room/);
    assert.match(page, /API_PREFIX="\/api\/lineage"/);
    assert.doesNotMatch(page, new RegExp(token));
    assert.doesNotMatch(page, /svc-lineage/);
    assert.doesNotMatch(page, /http-bridge/);

    const snapshotResponse = await fetch(
      home.url + '/api/lineage/snapshot?ref=main&limit=25'
    );
    const snapshot = await snapshotResponse.json();
    assert.equal(snapshotResponse.status, 200);
    assert.equal(snapshot.mode, 'read_only');
    assert.equal(snapshot.head, 'a'.repeat(64));
    assert.deepEqual(snapshot.home_handoff, {
      authenticated: true,
      scope: 'home.systemia.read',
      read_only: true,
      mutation_authority: false,
      profile_persisted: false,
      secret_text_returned: false,
      compute_origin_exposed: false,
    });

    const integrityResponse = await fetch(
      home.url + '/api/lineage/integrity?fast=1'
    );
    const integrity = await integrityResponse.json();
    assert.equal(integrityResponse.status, 200);
    assert.equal(integrity.ok, true);
    assert.equal(integrity.home_handoff.mutation_authority, false);

    const denied = await fetch(home.url + '/api/lineage/snapshot', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    const deniedBody = await denied.json();
    assert.equal(denied.status, 405);
    assert.equal(deniedBody.error, 'method_not_allowed');

    assert.equal(seen.length, 2);
    for (const envelope of seen) {
      assert.equal(envelope.method, 'GET');
      assert.match(
        envelope.path,
        /^\/(?:v1\/(?:snapshot|integrity)|health)/
      );
    }

    const allBrowserVisible = [
      JSON.stringify(health),
      homePage,
      page,
      JSON.stringify(snapshot),
      JSON.stringify(integrity),
      JSON.stringify(deniedBody),
    ].join('\n');
    assert.doesNotMatch(allBrowserVisible, new RegExp(token));
    assert.doesNotMatch(allBrowserVisible, /svc-lineage/);
    assert.doesNotMatch(allBrowserVisible, /http-bridge/);
  } finally {
    if (home) await home.close();
    await new Promise((resolve) => bridgeServer.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});
