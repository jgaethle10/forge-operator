import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { verifyNodeAttestation } from '../compute/device-identity.mjs';
import { ReplayGuard, openEnvelope, sealEnvelope } from './secure-envelope.mjs';

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

function safeDeviceFingerprint(value) {
  const fingerprint = String(value || '').trim().toLowerCase();
  if (!/^sha256:[a-f0-9]{64}$/.test(fingerprint)) {
    throw new Error('remote_device_fingerprint_invalid');
  }
  return fingerprint;
}

function safeApprovalRef(value) {
  const ref = String(value || '').trim();
  if (!ref || ref.length > 512) {
    throw new Error('remote_device_approval_ref_required');
  }
  return ref;
}

function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, file);
}

function commandIrreversible(method, route) {
  const verb = String(method || 'GET').toUpperCase();
  const path = String(route || '');
  if (verb === 'GET') return false;
  if (path === '/v1/attest') return false;
  if (/^\/v1\/leases\/[^/]+\/renew$/.test(path)) return false;
  if (/^\/v1\/services\/[^/]+\/checkpoint$/.test(path)) return false;
  if (/^\/v1\/services\/[^/]+\/deployment-receipt$/.test(path)) return false;
  if (/^\/v1\/services\/[^/]+\/missions\/[^/]+$/.test(path)) return false;
  return true;
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

  const root = path.resolve(stateDir);
  const grantsFile = path.join(root, 'control-grants.json');
  const authorizationsFile = path.join(root, 'device-authorizations.json');
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });

  const authorizationState = fs.existsSync(authorizationsFile)
    ? JSON.parse(fs.readFileSync(authorizationsFile, 'utf8'))
    : {
        schema: 'evercraft.remote-capacity.device-authorizations.v1',
        decisions: {},
      };
  if (authorizationState.schema !== 'evercraft.remote-capacity.device-authorizations.v1') {
    throw new Error('remote_device_authorizations_invalid');
  }

  for (const decision of Object.values(authorizationState.decisions || {})) {
    const fingerprint = safeDeviceFingerprint(decision.device_fingerprint);
    if (decision.status === 'authorized') {
      authorized.set(fingerprint, safeNodeId(decision.node_id));
    } else if (decision.status === 'revoked') {
      authorized.delete(fingerprint);
    }
  }

  const persisted = fs.existsSync(grantsFile)
    ? JSON.parse(fs.readFileSync(grantsFile, 'utf8'))
    : { schema: 'evercraft.remote-capacity.control-grants.v1', grants: {} };

  if (persisted.schema !== 'evercraft.remote-capacity.control-grants.v1') {
    throw new Error('remote_control_grants_invalid');
  }

  const challenges = new Map();
  const nodes = new Map();
  let shuttingDown = false;
  const instanceId = `remote_broker_${randomBytes(12).toString('hex')}`;
  let deploymentReceiptRef = '';
  let endpoint = '';

  function health() {
    return {
      ok: true,
      schema: 'evercraft.remote-capacity.broker-health.v1',
      service: 'remote-capacity-broker',
      runtime: 'Evercraft Compute',
      instance_id: instanceId,
      deployment_receipt_bound: Boolean(deploymentReceiptRef),
      deployment_receipt_ref: deploymentReceiptRef || null,
      registered_nodes: nodes.size,
      authorized_devices: authorized.size,
      secure_envelope_schema: 'evercraft.secure-envelope.v1',
      recovered_command_policy: 'no_automatic_side_effect_replay',
    };
  }

  function authorizedPair(fingerprint, nodeId) {
    const expected = authorized.get(String(fingerprint || ''));
    return expected === '*' || expected === nodeId;
  }

  function persistAuthorizationDecision(decision) {
    authorizationState.decisions[decision.device_fingerprint] = decision;
    atomicJson(authorizationsFile, authorizationState);
  }

  function authorizationReceipt(action, {
    deviceFingerprint,
    nodeId,
    approvalRef,
  }) {
    const body = {
      schema: 'evercraft.remote-capacity.device-authorization-receipt.v1',
      action,
      device_fingerprint: deviceFingerprint,
      node_id: nodeId,
      approval_ref: approvalRef,
      decided_at: new Date().toISOString(),
    };
    return {
      ...body,
      receipt_hash: `sha256:${sha(JSON.stringify(body))}`,
    };
  }

  function disconnectAuthorizedNode(nodeId, fingerprint, reason) {
    const node = nodes.get(nodeId);
    if (!node || node.device_fingerprint !== fingerprint) return false;

    node.session_expires_at = 0;
    for (const pending of node.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error(reason));
    }
    node.pending.clear();
    node.queue.length = 0;
    for (const waiter of node.waiters) {
      clearTimeout(waiter.timer);
      waiter.resolve(null);
    }
    node.waiters.length = 0;
    nodes.delete(nodeId);
    return true;
  }

  function authorizeDevice({
    deviceFingerprint,
    nodeId,
    approvalRef,
  }) {
    const fingerprint = safeDeviceFingerprint(deviceFingerprint);
    const id = safeNodeId(nodeId);
    const approval = safeApprovalRef(approvalRef);

    for (const [otherFingerprint, expectedNode] of authorized.entries()) {
      if (
        otherFingerprint !== fingerprint &&
        expectedNode !== '*' &&
        expectedNode === id
      ) {
        throw new Error('remote_node_id_already_authorized');
      }
    }

    authorized.set(fingerprint, id);
    const receipt = authorizationReceipt('authorize', {
      deviceFingerprint: fingerprint,
      nodeId: id,
      approvalRef: approval,
    });
    persistAuthorizationDecision({
      device_fingerprint: fingerprint,
      node_id: id,
      status: 'authorized',
      approval_ref: approval,
      decided_at: receipt.decided_at,
      decision_receipt_hash: receipt.receipt_hash,
    });
    return receipt;
  }

  function revokeDevice({
    deviceFingerprint,
    nodeId,
    approvalRef,
  }) {
    const fingerprint = safeDeviceFingerprint(deviceFingerprint);
    const id = safeNodeId(nodeId);
    const approval = safeApprovalRef(approvalRef);
    const expected = authorized.get(fingerprint);
    if (!(expected === '*' || expected === id)) {
      throw new Error('remote_device_authorization_not_found');
    }

    authorized.delete(fingerprint);
    const disconnected = disconnectAuthorizedNode(
      id,
      fingerprint,
      'remote_device_authorization_revoked'
    );
    const grant = persisted.grants[id];
    if (grant?.device_fingerprint === fingerprint) {
      delete persisted.grants[id];
      atomicJson(grantsFile, persisted);
    }

    const receipt = authorizationReceipt('revoke', {
      deviceFingerprint: fingerprint,
      nodeId: id,
      approvalRef: approval,
    });
    persistAuthorizationDecision({
      device_fingerprint: fingerprint,
      node_id: id,
      status: 'revoked',
      approval_ref: approval,
      decided_at: receipt.decided_at,
      decision_receipt_hash: receipt.receipt_hash,
    });
    return {
      ...receipt,
      live_session_disconnected: disconnected,
    };
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
      secure_envelope_schema: 'evercraft.secure-envelope.v1',
      command_envelopes_issued: node.command_envelopes_issued,
      result_envelopes_accepted: node.result_envelopes_accepted,
      duplicate_results_acknowledged: node.duplicate_results_acknowledged,
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
      irreversible: commandIrreversible(method, route),
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
        if (shuttingDown) {
          return send(res, 503, {
            ...health(),
            ok: false,
            state: 'shutting_down',
          });
        }
        return send(res, 200, health());
      }

      if (shuttingDown) {
        res.setHeader('connection', 'close');
        return send(res, 503, { error: 'remote_broker_shutting_down' });
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
        const transportKey = randomBytes(32).toString('hex');
        const node = {
          node_id: verification.node_id,
          device_fingerprint: verification.device_fingerprint,
          session_token_hash: sha(sessionToken),
          session_expires_at: Date.now() + sessionTtlMs,
          transport_key: transportKey,
          result_replay_guard: new ReplayGuard(),
          control_token: controlToken,
          control_token_hash: sha(controlToken),
          control_token_created_at: controlTokenCreatedAt,
          capacity: body.capacity,
          last_seen_at: Date.now(),
          queue: [],
          waiters: [],
          pending: new Map(),
          command_envelopes_issued: 0,
          result_envelopes_accepted: 0,
          duplicate_results_acknowledged: 0,
        };
        nodes.set(node.node_id, node);
        persistGrant(node);

        return send(res, 200, {
          schema: 'evercraft.remote-capacity.session.v1',
          node_id: node.node_id,
          device_fingerprint: node.device_fingerprint,
          session_token: sessionToken,
          transport_key: transportKey,
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
        const envelope = sealEnvelope({
          key: node.transport_key,
          key_id: 'remote-capacity-session',
          source: 'systemia-remote-capacity-broker',
          destination: node.node_id,
          kind: 'remote.capacity.command',
          message_id: command.command_id,
          expires_at: new Date(
            Date.now() + Math.max(30_000, commandTimeoutMs * 2)
          ).toISOString(),
          irreversible: command.irreversible === true,
          payload: command,
        });
        node.command_envelopes_issued += 1;
        return send(res, 200, {
          schema: 'evercraft.remote-capacity.delivery.v1',
          envelope,
        });
      }

      if (req.method === 'POST' && url.pathname === '/v1/remote/agent/result') {
        const node = findSession(bearer(req));
        if (!node) return send(res, 401, { error: 'remote_session_invalid' });
        const body = await readJson(req);
        let opened;
        try {
          opened = openEnvelope({
            envelope: body.envelope,
            key: node.transport_key,
            expected_destination: 'systemia-remote-capacity-broker',
          });
        } catch (error) {
          return send(res, 401, {
            error: 'result_envelope_rejected',
            reason: String(error?.code || error?.message || error),
          });
        }
        if (
          opened.header.source !== node.node_id ||
          opened.header.kind !== 'remote.capacity.result'
        ) {
          return send(res, 401, { error: 'result_envelope_identity_mismatch' });
        }

        const messageId = String(opened.header.message_id || '');
        if (node.result_replay_guard.has(messageId)) {
          node.duplicate_results_acknowledged += 1;
          node.last_seen_at = Date.now();
          return send(res, 200, { ok: true, duplicate: true });
        }

        const result = opened.payload || {};
        const commandId = String(result.command_id || '');
        const pending = node.pending.get(commandId);
        if (!pending) return send(res, 404, { error: 'remote_command_not_pending' });

        node.result_replay_guard.mark(messageId);
        node.pending.delete(commandId);
        clearTimeout(pending.timer);
        node.last_seen_at = Date.now();
        node.result_envelopes_accepted += 1;
        pending.resolve({
          status: Number(result.status || 500),
          body: result.body ?? {},
        });
        return send(res, 200, { ok: true, duplicate: false });
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
    instance_id: instanceId,
    health,
    setDeploymentReceipt(receiptRef) {
      const value = String(receiptRef || '').trim();
      if (!value) throw new Error('deployment receipt is required');
      deploymentReceiptRef = value;
      return health();
    },
    authorizeDevice,
    revokeDevice,
    authorizedDevices() {
      return [...authorized.entries()].map(([device_fingerprint, node_id]) => ({
        device_fingerprint,
        node_id,
      }));
    },
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
      if (shuttingDown) return;
      shuttingDown = true;
      challenges.clear();

      for (const node of nodes.values()) {
        node.session_expires_at = 0;
        for (const pending of node.pending.values()) {
          clearTimeout(pending.timer);
          pending.reject(new Error('remote_broker_shutdown'));
        }
        node.pending.clear();
        node.queue.length = 0;
        for (const waiter of node.waiters) {
          clearTimeout(waiter.timer);
          waiter.resolve(null);
        }
        node.waiters.length = 0;
      }

      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          try { server.closeAllConnections?.(); } catch {}
        }, 250);
        server.close((error) => {
          clearTimeout(timeout);
          if (error) reject(error);
          else resolve();
        });
        try { server.closeIdleConnections?.(); } catch {}
      });
    },
  };
}
