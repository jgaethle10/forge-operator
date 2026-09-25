import http from 'node:http';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { bootstrapPrivateOrigin } from '../core/bootstrap/private-origin.mjs';

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

export async function startEvercraftComputeNode({
  nodeId = 'evercraft-compute-local',
  root,
  host = '127.0.0.1',
  port = 0,
  leaseTtlMs = 30_000,
} = {}) {
  if (!root) throw new Error('root is required');
  const allowedRoot = path.resolve(root);
  const chain = new ReceiptChain(nodeId);
  const leases = new Map();
  const supported = new Set(['systemia.private-core-origin.v1']);

  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === 'GET' && req.url === '/v1/health') {
        return send(res, 200, {
          ok: true,
          node_id: nodeId,
          runtime: 'Evercraft Compute',
          supported_workloads: [...supported],
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
          expires_at: new Date(Date.now() + 60_000).toISOString(),
        });
      }

      if (req.method === 'POST' && req.url === '/v1/leases') {
        const body = await readJson(req);
        const workloadClass = String(body.workload_class || '');
        if (!supported.has(workloadClass)) {
          return send(res, 422, { error: 'unsupported_workload' });
        }
        const leaseId = `lease_${randomBytes(8).toString('hex')}`;
        const token = randomBytes(24).toString('hex');
        leases.set(leaseId, {
          token_hash: sha(token),
          workload_class: workloadClass,
          expires_at: Date.now() + leaseTtlMs,
        });
        return send(res, 201, {
          lease_id: leaseId,
          token,
          workload_class: workloadClass,
          receipt: chain.issue('capacity.lease.granted', {
            lease_id: leaseId,
            workload_class: workloadClass,
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
        if (body.workload_class !== lease.workload_class || !supported.has(body.workload_class)) {
          return send(res, 422, { error: 'workload_not_admitted' });
        }

        if (body.workload_class === 'systemia.private-core-origin.v1') {
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
      }

      if (req.method === 'DELETE' && req.url?.startsWith('/v1/leases/')) {
        leases.delete(req.url.split('/').pop());
        return send(res, 200, { ok: true });
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
    close: () => new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve())),
  };
}
