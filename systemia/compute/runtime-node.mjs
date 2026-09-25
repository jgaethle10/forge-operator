import http from 'node:http';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { bootstrapPrivateOrigin } from '../core/bootstrap/private-origin.mjs';
import { KaidanceRuntime, startKaidanceHealthService } from '../collider/runtime.mjs';

const sha = (value) => createHash('sha256').update(
  typeof value === 'string' ? value : JSON.stringify(value)
).digest('hex');

class ReceiptChain {
  constructor(nodeId) {
    this.nodeId = nodeId;
    this.seq = 0;
    this.previous = 'GENESIS';
  }
  issue(type, data = {}) {
    const body = {
      schema: 'evercraft.compute.receipt.v1',
      node_id: this.nodeId,
      seq: ++this.seq,
      type,
      at: new Date().toISOString(),
      previous_hash: this.previous,
      ...data,
    };
    const receipt = { ...body, receipt_hash: sha(body) };
    this.previous = receipt.receipt_hash;
    return receipt;
  }
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function send(res, status, body) {
  const data = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': data.length,
  });
  res.end(data);
}

function isWithin(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function boundedLeaseTtl(value, fallback) {
  const requested = Number(value || fallback);
  if (!Number.isFinite(requested)) return fallback;
  return Math.max(30_000, Math.min(86_400_000, Math.floor(requested)));
}

export async function startEvercraftComputeNode({
  nodeId = 'evercraft-compute-local',
  root,
  host = '127.0.0.1',
  port = 0,
  leaseTtlMs = 30_000,
  allocatorToken = '',
} = {}) {
  if (!root) throw new Error('root is required');
  const loopbackHost = host === '127.0.0.1' || host === '::1' || host === 'localhost';
  const allocatorTokenHash = allocatorToken ? sha(String(allocatorToken)) : null;
  if (!loopbackHost && !allocatorTokenHash) {
    throw new Error('allocatorToken is required when Evercraft Compute listens beyond loopback');
  }
  const allowedRoot = path.resolve(root);
  const chain = new ReceiptChain(nodeId);
  const leases = new Map();
  const services = new Map();
  const supported = new Set([
    'systemia.private-core-origin.v1',
    'systemia.kaidance-collider.v1',
    'saban.logical-agent',
  ]);

  async function stopService(serviceId, reason = 'operator_requested') {
    const entry = services.get(serviceId);
    if (!entry) return null;
    await entry.service.close();
    services.delete(serviceId);
    return chain.issue('service.stopped', {
      service_id: serviceId,
      lease_id: entry.lease_id,
      workload_class: entry.workload_class,
      reason,
    });
  }

  const leaseMonitor = setInterval(() => {
    const now = Date.now();
    for (const [serviceId, entry] of services.entries()) {
      const lease = leases.get(entry.lease_id);
      if (!lease || lease.expires_at < now) {
        stopService(serviceId, 'lease_expired').catch(() => {});
      }
    }
  }, 1_000);
  leaseMonitor.unref?.();

  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === 'GET' && req.url === '/v1/health') {
        return send(res, 200, {
          ok: true,
          node_id: nodeId,
          runtime: 'Evercraft Compute',
          supported_workloads: [...supported],
          resident_services: services.size,
        });
      }

      if (req.method === 'GET' && req.url === '/v1/capacity') {
        return send(res, 200, {
          protocol: 'evercraft.capacity.v1',
          node_id: nodeId,
          runtime: 'Evercraft Compute',
          platform: `${process.platform}/${process.arch}`,
          supported_workloads: [...supported],
          allocation: 'explicit_lease',
          allocation_auth: allocatorTokenHash ? 'bearer' : 'loopback_only',
          resident_services_supported: true,
          lease_renewal_supported: true,
          expires_at: new Date(Date.now() + 60_000).toISOString(),
        });
      }

      if (req.method === 'POST' && req.url === '/v1/leases') {
        if (allocatorTokenHash) {
          const authorization = String(req.headers.authorization || '');
          const presented = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
          if (!presented || sha(presented) !== allocatorTokenHash) {
            return send(res, 401, { error: 'allocator_auth_required' });
          }
        }
        const body = await readJson(req);
        const workloadClass = String(body.workload_class || '');
        if (!supported.has(workloadClass)) {
          return send(res, 422, { error: 'unsupported_workload' });
        }
        const ttlMs = boundedLeaseTtl(body.requested_ttl_ms, leaseTtlMs);
        const leaseId = `lease_${randomBytes(8).toString('hex')}`;
        const token = randomBytes(24).toString('hex');
        const expiresAt = Date.now() + ttlMs;
        leases.set(leaseId, {
          token_hash: sha(token),
          workload_class: workloadClass,
          expires_at: expiresAt,
        });
        return send(res, 201, {
          lease_id: leaseId,
          token,
          workload_class: workloadClass,
          expires_at: new Date(expiresAt).toISOString(),
          receipt: chain.issue('capacity.lease.granted', {
            lease_id: leaseId,
            workload_class: workloadClass,
            expires_at: new Date(expiresAt).toISOString(),
          }),
        });
      }

      const renew = req.url?.match(/^\/v1\/leases\/([^/]+)\/renew$/);
      if (req.method === 'POST' && renew) {
        const leaseId = renew[1];
        const body = await readJson(req);
        const lease = leases.get(leaseId);
        if (!lease || lease.token_hash !== sha(body.token || '')) {
          return send(res, 401, { error: 'invalid_lease' });
        }
        const ttlMs = boundedLeaseTtl(body.requested_ttl_ms, leaseTtlMs);
        lease.expires_at = Date.now() + ttlMs;
        return send(res, 200, {
          ok: true,
          lease_id: leaseId,
          expires_at: new Date(lease.expires_at).toISOString(),
          receipt: chain.issue('capacity.lease.renewed', {
            lease_id: leaseId,
            workload_class: lease.workload_class,
            expires_at: new Date(lease.expires_at).toISOString(),
          }),
        });
      }

      if (req.method === 'POST' && req.url === '/v1/jobs') {
        const body = await readJson(req);
        const lease = leases.get(body.lease_id);
        if (!lease || lease.token_hash !== sha(body.token || '')) {
          return send(res, 401, { error: 'invalid_lease' });
        }
        if (lease.expires_at < Date.now()) {
          return send(res, 410, { error: 'expired_lease' });
        }
        const workloadClass = String(body.workload_class || lease.workload_class || '');
        if (workloadClass !== lease.workload_class || !supported.has(workloadClass)) {
          return send(res, 422, { error: 'workload_not_admitted' });
        }

        if (workloadClass === 'saban.logical-agent') {
          const checkpoint = {
            step: Number(body.checkpoint?.step || 0) + 1,
            state: body.checkpoint?.state ?? body.payload ?? null,
            last_node: nodeId,
          };
          const receipt = chain.issue('workload.executed', {
            lease_id: body.lease_id,
            workload_class: body.workload_class,
            agent_id: String(body.agent_id || ''),
          });
          return send(res, 200, {
            ok: true,
            node_id: nodeId,
            checkpoint,
            receipt,
          });
        }

        if (workloadClass === 'systemia.private-core-origin.v1') {
          const target = path.resolve(String(body.input?.target_path || ''));
          if (!target || !isWithin(allowedRoot, target)) {
            return send(res, 403, { error: 'target_outside_admitted_root' });
          }
          const result = bootstrapPrivateOrigin({
            target,
            allowExisting: Boolean(body.input?.allow_existing),
          });
          const receipt = chain.issue('workload.completed', {
            lease_id: body.lease_id,
            workload_class: body.workload_class,
            result_schema: result.schema,
          });
          return send(res, 200, {
            ok: true,
            node_id: nodeId,
            workload_class: body.workload_class,
            result,
            receipt,
          });
        }

        if (workloadClass === 'systemia.kaidance-collider.v1') {
          const stateRoot = path.resolve(String(body.input?.state_root || ''));
          const snapshotPath = path.resolve(String(
            body.input?.snapshot_path || path.join(stateRoot, 'mission-snapshot.json')
          ));
          if (!stateRoot || !isWithin(allowedRoot, stateRoot) || !isWithin(allowedRoot, snapshotPath)) {
            return send(res, 403, { error: 'kaidance_path_outside_admitted_root' });
          }

          const runtime = new KaidanceRuntime({
            root: stateRoot,
            colliderKey: String(body.input?.collider_key || 'systemia-collider'),
            heartbeatTargetSeconds: Number(body.input?.heartbeat_target_seconds || 300),
            graceSeconds: Number(body.input?.grace_seconds || 90),
            deploymentReceipt: String(body.input?.deployment_receipt || ''),
            snapshotPath,
            initialCheckpoint: body.input?.initial_checkpoint || null,
          });
          const service = await startKaidanceHealthService({
            runtime,
            host: '127.0.0.1',
            port: 0,
          });
          const serviceId = `svc_${randomBytes(8).toString('hex')}`;
          services.set(serviceId, {
            lease_id: body.lease_id,
            workload_class: body.workload_class,
            runtime,
            service,
          });
          const result = {
            schema: 'evercraft.compute.resident-service.v1',
            service_id: serviceId,
            workload_class: body.workload_class,
            service_url: null,
            health_path: `/v1/services/${serviceId}/health`,
            heartbeat_target_seconds: runtime.state.heartbeat_target_seconds,
          };
          const receipt = chain.issue('service.started', {
            lease_id: body.lease_id,
            service_id: serviceId,
            workload_class: body.workload_class,
            result_schema: result.schema,
          });
          return send(res, 200, {
            ok: true,
            node_id: nodeId,
            workload_class: body.workload_class,
            result,
            receipt,
          });
        }
      }

      const serviceHealth = req.url?.match(/^\/v1\/services\/([^/]+)\/health$/);
      if (req.method === 'GET' && serviceHealth) {
        const entry = services.get(serviceHealth[1]);
        if (!entry) return send(res, 404, { error: 'service_not_found' });
        return send(res, 200, entry.runtime.health());
      }

      const serviceCheckpoint = req.url?.match(/^\/v1\/services\/([^/]+)\/checkpoint$/);
      if (req.method === 'POST' && serviceCheckpoint) {
        const entry = services.get(serviceCheckpoint[1]);
        if (!entry) return send(res, 404, { error: 'service_not_found' });
        const body = await readJson(req);
        const lease = leases.get(entry.lease_id);
        if (!lease || lease.token_hash !== sha(body.token || '')) {
          return send(res, 401, { error: 'invalid_lease' });
        }
        if (entry.workload_class !== 'systemia.kaidance-collider.v1') {
          return send(res, 422, { error: 'checkpoint_not_supported' });
        }
        const checkpoint = entry.runtime.checkpoint();
        return send(res, 200, {
          ok: true,
          service_id: serviceCheckpoint[1],
          checkpoint,
          receipt: chain.issue('service.checkpoint.captured', {
            service_id: serviceCheckpoint[1],
            lease_id: entry.lease_id,
            workload_class: entry.workload_class,
            state_hash: checkpoint.state_hash,
          }),
        });
      }

      const serviceDeploymentReceipt = req.url?.match(/^\/v1\/services\/([^/]+)\/deployment-receipt$/);
      if (req.method === 'POST' && serviceDeploymentReceipt) {
        const entry = services.get(serviceDeploymentReceipt[1]);
        if (!entry) return send(res, 404, { error: 'service_not_found' });
        const body = await readJson(req);
        const lease = leases.get(entry.lease_id);
        if (!lease || lease.token_hash !== sha(body.token || '')) {
          return send(res, 401, { error: 'invalid_lease' });
        }
        const health = entry.runtime.setDeploymentReceipt(String(body.receipt_ref || ''));
        return send(res, 200, {
          ok: true,
          service_id: serviceDeploymentReceipt[1],
          health,
          receipt: chain.issue('service.deployment-receipt.bound', {
            service_id: serviceDeploymentReceipt[1],
            lease_id: entry.lease_id,
            workload_class: entry.workload_class,
            deployment_receipt_ref: String(body.receipt_ref || ''),
          }),
        });
      }

      const serviceStop = req.url?.match(/^\/v1\/services\/([^/]+)\/stop$/);
      if (req.method === 'POST' && serviceStop) {
        const entry = services.get(serviceStop[1]);
        if (!entry) return send(res, 404, { error: 'service_not_found' });
        const body = await readJson(req);
        const lease = leases.get(entry.lease_id);
        if (!lease || lease.token_hash !== sha(body.token || '')) {
          return send(res, 401, { error: 'invalid_lease' });
        }
        const receipt = await stopService(serviceStop[1], 'operator_requested');
        return send(res, 200, { ok: true, receipt });
      }

      const release = req.url?.match(/^\/v1\/leases\/([^/]+)\/release$/);
      if (req.method === 'POST' && release) {
        const leaseId = release[1];
        const body = await readJson(req);
        const lease = leases.get(leaseId);
        if (!lease || lease.token_hash !== sha(body.token || '')) {
          return send(res, 401, { error: 'invalid_lease' });
        }
        for (const [serviceId, entry] of services.entries()) {
          if (entry.lease_id === leaseId) await stopService(serviceId, 'lease_released');
        }
        leases.delete(leaseId);
        return send(res, 200, {
          ok: true,
          receipt: chain.issue('capacity.lease.released', {
            lease_id: leaseId,
            workload_class: lease.workload_class,
          }),
        });
      }

      if (req.method === 'DELETE' && req.url?.startsWith('/v1/leases/')) {
        return send(res, 405, {
          error: 'authenticated_release_required',
          release_method: 'POST /v1/leases/:id/release',
        });
      }

      return send(res, 404, { error: 'not_found' });
    } catch (error) {
      return send(res, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });

  const address = server.address();
  const actualPort = typeof address === 'object' && address ? address.port : port;
  const endpoint = `http://${host}:${actualPort}`;

  return {
    node_id: nodeId,
    endpoint,
    allowed_root: allowedRoot,
    close: async () => {
      clearInterval(leaseMonitor);
      for (const serviceId of [...services.keys()]) {
        await stopService(serviceId, 'compute_node_shutdown');
      }
      await new Promise((resolve, reject) =>
        server.close((error) => error ? reject(error) : resolve())
      );
    },
  };
}
