import http from 'node:http';
import { Buffer } from 'node:buffer';
import { LocalLineageRemote } from './remote-protocol.mjs';
import { LargeObjectStore, largeObject } from './large-object.mjs';

const JSON_LIMIT = 24 * 1024 * 1024;

async function readJson(req, maxBytes = JSON_LIMIT) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > maxBytes) throw new Error('lineage_remote_request_too_large');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function send(res, status, body) {
  const encoded = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': encoded.length,
    'cache-control': 'no-store',
  });
  res.end(encoded);
}

function assertObjectId(id) {
  const value = String(id || '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error('lineage_object_id_invalid');
  return value;
}

function normalizeRef(name) {
  const value = String(name || '').trim();
  if (!value) throw new Error('lineage_ref_required');
  return value;
}

export async function startLineageRemoteRuntime({
  stateDir,
  host = '127.0.0.1',
  port = 0,
  maxObjectBytes = 16 * 1024 * 1024,
  maxChunkBytes = 2 * 1024 * 1024,
} = {}) {
  if (!stateDir) throw new Error('lineage_remote_state_dir_required');
  if (!['127.0.0.1', 'localhost', '::1'].includes(String(host))) {
    throw new Error('lineage_remote_runtime_must_bind_loopback');
  }

  const remote = new LocalLineageRemote(stateDir);
  const large = new LargeObjectStore(stateDir);
  await Promise.all([remote.init(), large.init()]);

  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === 'GET' && req.url === '/health') {
        const refs = await remote.advertiseRefs();
        return send(res, 200, {
          schema: 'evercraft.lineage.remote-runtime-health.v1',
          ok: true,
          state: 'healthy',
          protocol: 'evercraft.lineage.remote.v1',
          ref_count: Object.keys(refs.refs || {}).length,
          mutation_authority: 'cas_refs_and_verified_immutable_objects_only',
          publication_authority: false,
          deployment_authority: false,
          payment_authority: false,
          large_object_transport: true,
        });
      }

      if (req.method === 'GET' && req.url === '/v1/refs') {
        return send(res, 200, await remote.advertiseRefs());
      }

      if (req.method === 'POST' && req.url === '/v1/ref/read') {
        const body = await readJson(req);
        const name = normalizeRef(body.name);
        return send(res, 200, {
          schema: 'evercraft.lineage.remote-ref.v1',
          name,
          head: await remote.readRef(name),
        });
      }

      if (req.method === 'POST' && req.url === '/v1/ref/cas') {
        const body = await readJson(req);
        const name = normalizeRef(body.name);
        try {
          const receipt = await remote.compareAndSwapRef(
            name,
            body.expected || null,
            body.next || null
          );
          return send(res, 200, receipt);
        } catch (error) {
          if (error?.code === 'STALE_REF') {
            return send(res, 409, {
              error: 'STALE_REF',
              ref: error.ref,
              expected: error.expected,
              current: error.current,
              next: error.next,
            });
          }
          throw error;
        }
      }

      if (req.method === 'POST' && req.url === '/v1/object/has') {
        const body = await readJson(req);
        const id = assertObjectId(body.id);
        return send(res, 200, {
          schema: 'evercraft.lineage.remote-object-presence.v1',
          id,
          present: await remote.hasObject(id),
        });
      }

      if (req.method === 'POST' && req.url === '/v1/object/get') {
        const body = await readJson(req);
        const id = assertObjectId(body.id);
        try {
          const bytes = await remote.getObject(id);
          return send(res, 200, {
            schema: 'evercraft.lineage.remote-object.v1',
            id,
            bytes: bytes.length,
            bytes_base64: bytes.toString('base64'),
          });
        } catch (error) {
          if (error?.code === 'ENOENT') {
            return send(res, 404, { error: 'lineage_object_not_found', id });
          }
          throw error;
        }
      }

      if (req.method === 'POST' && req.url === '/v1/chunk/has') {
        const body = await readJson(req);
        const id = assertObjectId(body.id);
        return send(res, 200, {
          schema: 'evercraft.lineage.remote-chunk-presence.v1',
          id,
          present: await large.hasChunk(id),
        });
      }

      if (req.method === 'POST' && req.url === '/v1/chunk/get') {
        const body = await readJson(req);
        const id = assertObjectId(body.id);
        try {
          const bytes = await large.getChunk(id);
          return send(res, 200, {
            schema: 'evercraft.lineage.remote-chunk.v1',
            id,
            bytes: bytes.length,
            bytes_base64: bytes.toString('base64'),
          });
        } catch (error) {
          if (error?.code === 'ENOENT') {
            return send(res, 404, { error: 'lineage_chunk_not_found', id });
          }
          throw error;
        }
      }

      if (req.method === 'POST' && req.url === '/v1/chunk/put') {
        const body = await readJson(req, Math.max(JSON_LIMIT, maxChunkBytes * 3));
        const id = assertObjectId(body.id);
        const encoded = String(body.bytes_base64 || '');
        if (!encoded) return send(res, 422, { error: 'lineage_chunk_bytes_required' });
        const bytes = Buffer.from(encoded, 'base64');
        if (bytes.length > maxChunkBytes) {
          return send(res, 413, {
            error: 'lineage_chunk_too_large',
            max_chunk_bytes: maxChunkBytes,
          });
        }
        const actual = largeObject.sha256(bytes);
        if (actual !== id) {
          return send(res, 422, {
            error: 'lineage_chunk_digest_mismatch',
            expected: id,
            actual,
          });
        }
        const stored = await large.putChunk(bytes);
        return send(res, 200, {
          schema: 'evercraft.lineage.remote-chunk-put.v1',
          id: stored.id,
          bytes: stored.bytes,
          reused: stored.reused,
        });
      }

      if (req.method === 'POST' && req.url === '/v1/large/manifest/has') {
        const body = await readJson(req);
        const id = assertObjectId(body.id);
        return send(res, 200, {
          schema: 'evercraft.lineage.remote-large-manifest-presence.v1',
          id,
          present: await large.hasManifest(id),
        });
      }

      if (req.method === 'POST' && req.url === '/v1/large/manifest/get') {
        const body = await readJson(req);
        const id = assertObjectId(body.id);
        try {
          const manifest = await large.readManifest(id);
          return send(res, 200, {
            schema: 'evercraft.lineage.remote-large-manifest.v1',
            id,
            manifest,
          });
        } catch (error) {
          if (error?.code === 'ENOENT') {
            return send(res, 404, { error: 'lineage_large_manifest_not_found', id });
          }
          throw error;
        }
      }

      if (req.method === 'POST' && req.url === '/v1/large/manifest/put') {
        const body = await readJson(req);
        const id = assertObjectId(body.id);
        try {
          const stored = await large.putManifest(body.manifest, { expectedId: id });
          return send(res, 200, {
            schema: 'evercraft.lineage.remote-large-manifest-put.v1',
            id: stored.id,
            reused: stored.reused,
            bytes: stored.bytes,
            chunk_count: stored.chunk_count,
          });
        } catch (error) {
          if (error?.code === 'LARGE_OBJECT_MANIFEST_DIGEST_MISMATCH') {
            return send(res, 422, { error: error.code });
          }
          throw error;
        }
      }

      if (req.method === 'POST' && req.url === '/v1/object/put') {
        const body = await readJson(req, Math.max(JSON_LIMIT, maxObjectBytes * 2));
        const id = assertObjectId(body.id);
        const encoded = String(body.bytes_base64 || '');
        if (!encoded) return send(res, 422, { error: 'lineage_object_bytes_required' });
        const bytes = Buffer.from(encoded, 'base64');
        if (bytes.length > maxObjectBytes) {
          return send(res, 413, {
            error: 'lineage_object_too_large',
            max_object_bytes: maxObjectBytes,
          });
        }
        try {
          const receipt = await remote.putObject(id, bytes);
          return send(res, 200, {
            schema: 'evercraft.lineage.remote-object-put.v1',
            ...receipt,
          });
        } catch (error) {
          if (error?.code === 'INVALID_LINEAGE_OBJECT') {
            return send(res, 422, { error: error.code });
          }
          if (/digest mismatch/i.test(String(error?.message || ''))) {
            return send(res, 422, { error: 'lineage_object_digest_mismatch' });
          }
          throw error;
        }
      }

      return send(res, 404, { error: 'lineage_remote_route_not_found' });
    } catch (error) {
      return send(res, 422, {
        error: error?.code || String(error?.message || error),
      });
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });

  const address = server.address();
  const boundHost = typeof address === 'object' && address
    ? (address.address === '::1' ? '[::1]' : address.address)
    : host;
  const boundPort = typeof address === 'object' && address ? address.port : port;
  const serviceUrl = `http://${boundHost}:${boundPort}`;

  const runtime = {
    schema: 'evercraft.lineage.remote-runtime.v1',
    service_url: serviceUrl,
    state_dir: stateDir,
    remote,
    large_object_store: large,
    async health() {
      const refs = await remote.advertiseRefs();
      return {
        schema: 'evercraft.lineage.remote-runtime-health.v1',
        ok: true,
        state: 'healthy',
        protocol: 'evercraft.lineage.remote.v1',
        ref_count: Object.keys(refs.refs || {}).length,
        publication_authority: false,
        deployment_authority: false,
        payment_authority: false,
        large_object_transport: true,
      };
    },
    async close() {
      await new Promise((resolve) => server.close(resolve));
    },
  };

  return runtime;
}
