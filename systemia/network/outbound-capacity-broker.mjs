import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { verifyNodeAttestation } from '../compute/device-identity.mjs';

const sha = (value) => createHash('sha256').update(String(value)).digest('hex');

function send(res, status, body = null) {
  if (body === null) {
    res.writeHead(status);
    res.end();
    return;
  }
  const data = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': data.length,
  });
  res.end(data);
}

async function readJson(req, maxBytes = 2 * 1024 * 1024) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) throw new Error('request_body_too_large');
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function bearer(req) {
  const value = String(req.headers.authorization || '');
  return value.startsWith('Bearer ') ? value.slice(7) : '';
}

function normalizeAuthorizedDevices(input) {
  if (input instanceof Map) return new Map(input);
  return new Map(Object.entries(input || {}));
}

function safeNodeId(value) {
  const nodeId = String(value || '').trim();
  if (!/^[a-zA-Z0-9._-]{1,128}$/.test(nodeId)) {
    throw new Error('remote_node_id_invalid');
  }
  return nodeId;
}

function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, file);
}

function validCapacity(capacity, nodeId, fingerprint) {
  return Boolean(
    capacity &&
    capacity.protocol === 'evercraft.capacity.v1' &&
    String(capacity.node_id || '') === nodeId &&
    String(capacity.device_fingerprint || '') === fingerprint &&
    Array.isArray(capacity.supported_workloads)
  );
}

export async function startOutboundCapacityBroker({
  host = '127.0.0.1',
  port = 0,
  stateDir,
  authorizedDevices = {},
  challengeTtlMs = 60_000,
  sessionTtlMs = 30 * 60_000,
  commandTimeoutMs = 15_000,
  pollWaitMs = 5_000,
  capacityFreshMs = 15_000,
} = {}) {
  if (!stateDir) throw new Error('stateDir is required');
  const authorized = normalizeAuthorizedDevices(authorizedDevices);
  if (authorized.size === 0) {
    throw new Error('at least one authorized device fingerprint is required');
  }

  const root = path.resolve(stateDir);
  const grantsFile = path.join(root, 'control-grants.json');
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });

  const persisted = fs.existsSync(grantsFile)
    ? JSON.parse(fs.readFileSync(grantsFile, 'utf8'))
    : { schema: 'evercraft.remote-capacity.control-grants.v1', grants: {} };

  if (persisted.schema !== 'evercraft.remote-capacity.control-grants.v1') {
    throw new Error('remote_control_grants_invalid');
  }

  const challenges = new Map();
  const nodes = new Map();
  let endpoint = '';

  function authorizedPair(fingerprint, nodeId) {
    const expected = authorized.get(String(fingerprint || ''));
    return expected === '*' || expected === nodeId;
  }

  function persistGrant(node) {
    persisted.grants[node.node_id] = {
      node_id: node.node_id,
      device_fingerprint: node.device_fingerprint,
      control_token: node.control_token,
      created_at: node.control_token_created_at,
    };
    atomicJson(grantsFile, persisted);
  }

  function findSession(token) {
    const tokenHash = sha(token || '');
    for (const node of nodes.values()) {
      if (
        node.session_token_hash === tokenHash &&
        node.session_expires_at > Date.now()
      ) return node;
    }
    return null;
  }

  function safeNodeSnapshot(node) {
    return {
      node_id: node.node_id,
      device_fingerprint: node.device_fingerprint,
      connected: Date.now() - node.last_seen_at <= capacityFreshMs,
      last_seen_at: new Date(node.last_seen_at).toISOString(),
      session_expires_at: new Date(node.session_expires_at).toISOString(),
      capacity: node.capacity ? {
        protocol: node.capacity.protocol,
        runtime: node.capacity.runtime,
        platform: node.capacity.platform,
        supported_workloads: node.capacity.supported_workloads,
        resident_services_supported: node.capacity.resident_services_supported,
        lease_renewal_supported: node.capacity.lease_renewal_supported,
      } : null,
      queued_commands: node.queue.length,
      pending_commands: node.pending.size,
    };
  }

  function nextCommand(node) {
    if (node.queue.length > 0) return Promise.resolve(node.queue.shift());
    return new Promise((resolve) => {
      const waiter = { resolve };
      node.waiters.push(waiter);
      waiter.timer = setTimeout(() => {
        const index = node.waiters.indexOf(waiter);
        if (index >= 0) node.waiters.splice(index, 1);
        resolve(null);
      }, pollWaitMs);
    });
  }

  function deliverCommand(node, command) {
    const waiter = node.waiters.shift();
    if (waiter) {
      clearTimeout(waiter.timer);
      waiter.resolve(command);
    } else {
      node.queue.push(command);
    }
  }

  function virtualizeNodeResponse(nodeId, route, result) {
    if (!result || typeof result !== 'object') return result;
    if (route !== '/v1/jobs' || !result.body || typeof result.body !== 'object') {
      return result;
    }

    const body = structuredClone(result.body);
    if (body.result && typeof body.result === 'object') {
      for (const key of ['health_path', 'mission_ingress_path']) {
        const value = String(body.result[key] || '');
        if (value.startsWith('/v1/')) {
          body.result[key] =
            `/nodes/${encodeURIComponent(nodeId)}${value}`;
        }
      }
    }

    return {
      ...result,
      body,
    };
  }

  function queueCommand(node, {
    method,
    route,
    body,
    injectAllocatorAuth = false,
  }) {
    const commandId = `cmd_${randomBytes(10).toString('hex')}`;
    const command = {
      schema: 'evercraft.remote-capacity.command.v1',
      command_id: commandId,
      method,
      route,
      body: body ?? null,
      inject_allocator_auth: Boolean(injectAllocatorAuth),
      issued_at: new Date().toISOString(),
    };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        node.pending.delete(commandId);
        node.queue = node.queue.filter((item) => item.command_id !== commandId);
        reject(new Error('remote_command_timeout'));
      }, commandTimeoutMs);
      node.pending.set(commandId, { resolve, reject, timer });
      deliverCommand(node, command);
    });
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', 'http://broker.invalid');

      if (req.method === 'GET' && url.pathname === '/v1/remote/health') {
        return send(res, 200, {
          ok: true,
          schema: 'evercraft.remote-capacity.broker-health.v1',
          registered_nodes: nodes.size,
          authorized_devices: authorized.size,
        });
      }

      if (req.method === 'POST' && url.pathname === '/v1/remote/challenge') {
        const body = await readJson(req);
        const nodeId = safeNodeId(body.node_id);
        const fingerprint = String(body.device_fingerprint || '');
        if (!authorizedPair(fingerprint, nodeId)) {
          return send(res, 403, { error: 'device_not_authorized' });
        }

        const challengeId = `challenge_${randomBytes(10).toString('hex')}`;
        const nonce = randomBytes(24).toString('hex');
        challenges.set(challengeId, {
          node_id: nodeId,
          device_fingerprint: fingerprint,
          nonce,
          expires_at: Date.now() + challengeTtlMs,
        });
        return send(res, 200, {
          schema: 'evercraft.remote-capacity.challenge.v1',
          challenge_id: challengeId,
          nonce,
          expires_at: new Date(Date.now() + challengeTtlMs).toISOString(),
        });
      }

      if (req.method === 'POST' && url.pathname === '/v1/remote/register') {
        const body = await readJson(req);
        const challenge = challenges.get(String(body.challenge_id || ''));
        if (!challenge || challenge.expires_at <= Date.now()) {
          return send(res, 401, { error: 'challenge_invalid_or_expired' });
        }
        challenges.delete(String(body.challenge_id || ''));

        const verification = verifyNodeAttestation({
          attestation: body.attestation,
          expectedNonce: challenge.nonce,
          expectedNodeId: challenge.node_id,
          maxAgeMs: challengeTtlMs,
        });
        if (!verification.ok) {
          return send(res, 401, {
            error: 'node_attestation_rejected',
            reason: verification.reason,
          });
        }
        if (
          verification.device_fingerprint !== challenge.device_fingerprint ||
          !authorizedPair(verification.device_fingerprint, verification.node_id)
        ) {
          return send(res, 403, { error: 'device_authorization_mismatch' });
        }
        if (!validCapacity(
          body.capacity,
          verification.node_id,
          verification.device_fingerprint
        )) {
          return send(res, 422, { error: 'capacity_offer_invalid' });
        }

        const existingGrant = persisted.grants[verification.node_id];
        let controlToken = null;
        let controlTokenCreatedAt = null;
        if (
          existingGrant &&
          existingGrant.device_fingerprint === verification.device_fingerprint &&
          authorizedPair(existingGrant.device_fingerprint, existingGrant.node_id)
        ) {
          controlToken = existingGrant.control_token;
          controlTokenCreatedAt = existingGrant.created_at;
        } else {
          controlToken = randomBytes(32).toString('hex');
          controlTokenCreatedAt = new Date().toISOString();
        }

        const previous = nodes.get(verification.node_id);
        if (previous) {
          for (const pending of previous.pending.values()) {
            clearTimeout(pending.timer);
            pending.reject(new Error('remote_session_replaced'));
          }
          for (const waiter of previous.waiters) {
            clearTimeout(waiter.timer);
            waiter.resolve(null);
          }
        }

        const sessionToken = randomBytes(32).toString('hex');
        const node = {
          node_id: verification.node_id,
          device_fingerprint: verification.device_fingerprint,
          session_token_hash: sha(sessionToken),
          session_expires_at: Date.now() + sessionTtlMs,
          control_token: controlToken,
          control_token_hash: sha(controlToken),
          control_token_created_at: controlTokenCreatedAt,
          capacity: body.capacity,
          last_seen_at: Date.now(),
          queue: [],
          waiters: [],
          pending: new Map(),
        };
        nodes.set(node.node_id, node);
        persistGrant(node);

        return send(res, 200, {
          schema: 'evercraft.remote-capacity.session.v1',
          node_id: node.node_id,
          device_fingerprint: node.device_fingerprint,
          session_token: sessionToken,
          session_expires_at: new Date(node.session_expires_at).toISOString(),
          virtual_capacity_endpoint: `${endpoint}/nodes/${encodeURIComponent(node.node_id)}`,
          control_token_exposed_to_agent: false,
        });
      }

      if (req.method === 'POST' && url.pathname === '/v1/remote/agent/poll') {
        const node = findSession(bearer(req));
        if (!node) return send(res, 401, { error: 'remote_session_invalid' });
        const body = await readJson(req);
        if (body.capacity !== undefined) {
          if (!validCapacity(body.capacity, node.node_id, node.device_fingerprint)) {
            return send(res, 422, { error: 'capacity_offer_invalid' });
          }
          node.capacity = body.capacity;
        }
        node.last_seen_at = Date.now();
        node.session_expires_at = Date.now() + sessionTtlMs;
        const command = await nextCommand(node);
        if (!command) return send(res, 204);
        return send(res, 200, command);
      }

      if (req.method === 'POST' && url.pathname === '/v1/remote/agent/result') {
        const node = findSession(bearer(req));
        if (!node) return send(res, 401, { error: 'remote_session_invalid' });
        const body = await readJson(req);
        const pending = node.pending.get(String(body.command_id || ''));
        if (!pending) return send(res, 404, { error: 'remote_command_not_pending' });
        node.pending.delete(String(body.command_id || ''));
        clearTimeout(pending.timer);
        node.last_seen_at = Date.now();
        pending.resolve({
          status: Number(body.status || 500),
          body: body.body ?? {},
        });
        return send(res, 200, { ok: true });
      }

      const remote = url.pathname.match(/^\/nodes\/([^/]+)(\/v1\/.*)$/);
      if (remote) {
        const nodeId = safeNodeId(decodeURIComponent(remote[1]));
        const node = nodes.get(nodeId);
        if (!node || Date.now() - node.last_seen_at > capacityFreshMs) {
          return send(res, 503, { error: 'remote_node_unavailable' });
        }
        const route = remote[2];

        if (req.method === 'GET' && route === '/v1/capacity') {
          return send(res, 200, {
            ...node.capacity,
            remote_transport: 'evercraft.outbound-capacity.v1',
            remote_last_seen_at: new Date(node.last_seen_at).toISOString(),
          });
        }

        const allocatorRoute =
          (req.method === 'POST' && route === '/v1/leases') ||
          (req.method === 'POST' && route === '/v1/attest');
        if (allocatorRoute && sha(bearer(req)) !== node.control_token_hash) {
          return send(res, 401, { error: 'remote_allocator_auth_required' });
        }

        const body = req.method === 'GET' ? null : await readJson(req);
        let result;
        try {
          result = await queueCommand(node, {
            method: req.method || 'GET',
            route,
            body,
            injectAllocatorAuth: allocatorRoute,
          });
        } catch (error) {
          return send(res, 504, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        const virtualized = virtualizeNodeResponse(node.node_id, route, result);
        return send(res, virtualized.status, virtualized.body);
      }

      return send(res, 404, { error: 'not_found' });
    } catch (error) {
      return send(res, 500, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  const address = server.address();
  const actualPort = typeof address === 'object' && address ? address.port : port;
  endpoint = `http://${host}:${actualPort}`;

  return {
    schema: 'evercraft.remote-capacity.broker.v1',
    endpoint,
    controlGrant(nodeId) {
      const id = safeNodeId(nodeId);
      const node = nodes.get(id);
      const grant = node
        ? {
            node_id: node.node_id,
            device_fingerprint: node.device_fingerprint,
            control_token: node.control_token,
          }
        : persisted.grants[id];
      if (!grant) return null;
      return {
        node_id: grant.node_id,
        device_fingerprint: grant.device_fingerprint,
        capacity_endpoint: `${endpoint}/nodes/${encodeURIComponent(id)}`,
        allocator_token: grant.control_token,
      };
    },
    snapshot() {
      return {
        schema: 'evercraft.remote-capacity.broker-snapshot.v1',
        endpoint,
        nodes: [...nodes.values()].map(safeNodeSnapshot),
      };
    },
    close: async () => {
      for (const node of nodes.values()) {
        for (const pending of node.pending.values()) {
          clearTimeout(pending.timer);
          pending.reject(new Error('remote_broker_shutdown'));
        }
        for (const waiter of node.waiters) {
          clearTimeout(waiter.timer);
          waiter.resolve(null);
        }
      }
      await new Promise((resolve, reject) =>
        server.close((error) => error ? reject(error) : resolve())
      );
    },
  };
}
