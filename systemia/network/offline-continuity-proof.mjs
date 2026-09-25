#!/usr/bin/env node
import http from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';

const SELF = fileURLToPath(import.meta.url);
const argv = process.argv.slice(2);
const val = (key, fallback = '') => {
  const i = argv.indexOf(key);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const has = (key) => argv.includes(key);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sha = (value) => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const jsonBody = async (req) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString() || '{}');
};
const send = (res, status, payload) => {
  const body = Buffer.from(JSON.stringify(payload));
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': body.length,
    'cache-control': 'no-store'
  });
  res.end(body);
};

class ReceiptChain {
  constructor(nodeId) {
    this.nodeId = nodeId;
    this.seq = 0;
    this.previous = 'GENESIS';
  }
  issue(type, data = {}) {
    const base = {
      schema: 'evercraft.receipt.v1',
      node_id: this.nodeId,
      seq: ++this.seq,
      type,
      at: new Date().toISOString(),
      previous_hash: this.previous,
      ...data
    };
    const receipt = { ...base, receipt_hash: sha(base) };
    this.previous = receipt.receipt_hash;
    return receipt;
  }
}

function fingerprint(nodeId) {
  return sha(`evercraft.offline-node.v1:${nodeId}`);
}

function rolesFromArg() {
  return val('--roles', 'team').split(',').map((x) => x.trim()).filter(Boolean);
}

function capabilitiesForRoles(roles) {
  const caps = new Set(['continuity.health', 'continuity.message']);
  if (roles.includes('nexus')) {
    caps.add('capacity.compute');
    caps.add('saban.worker');
  }
  if (roles.includes('guardian')) {
    caps.add('guardian.continuity');
    caps.add('resource.cache');
  }
  if (roles.includes('hearth')) {
    caps.add('checkpoint.store');
    caps.add('message.store_forward');
    caps.add('reference.cache');
  }
  if (roles.includes('team')) {
    caps.add('team.agent_runtime');
    caps.add('saban.worker');
  }
  if (roles.includes('gateway')) caps.add('gateway.external');
  return [...caps];
}

async function nodeMode() {
  const port = Number(val('--port', '47301'));
  const nodeId = val('--node-id', `offline-node-${port}`);
  const roles = rolesFromArg();
  const localInference = has('--local-inference');
  const queue = [];
  const queuedMessageIds = new Set();
  const checkpoints = new Map();
  const chain = new ReceiptChain(nodeId);

  const manifest = () => ({
    schema: 'evercraft.offline-node.v1',
    node_id: nodeId,
    display_name: nodeId,
    roles,
    transports: ['lan_http'],
    capabilities: capabilitiesForRoles(roles),
    execution: {
      compute: roles.includes('nexus'),
      agent_runtime: roles.includes('team') || roles.includes('nexus'),
      local_inference: localInference,
      model_ids: localInference ? ['proof-local-runtime'] : []
    },
    continuity: {
      offline_capable: true,
      checkpoint: roles.includes('hearth') || roles.includes('nexus'),
      store_forward: roles.includes('hearth')
    },
    trust: {
      identity_fingerprint: fingerprint(nodeId),
      verified: false
    },
    endpoint: `http://127.0.0.1:${port}`,
    observed_at: new Date().toISOString()
  });

  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === 'GET' && req.url === '/v1/health') {
        return send(res, 200, { ok: true, node_id: nodeId, roles });
      }
      if (req.method === 'GET' && req.url === '/v1/node') {
        return send(res, 200, manifest());
      }
      if (req.method === 'POST' && req.url === '/v1/messages') {
        const body = await jsonBody(req);
        const messageId = body.message_id || `msg_${randomBytes(8).toString('hex')}`;
        const expiresAt = body.expires_at || null;
        if (expiresAt && Date.parse(expiresAt) <= Date.now()) {
          return send(res, 410, {
            error: 'message_expired',
            message_id: messageId
          });
        }
        if (queuedMessageIds.has(messageId)) {
          return send(res, 200, {
            ok: true,
            node_id: nodeId,
            queued: false,
            duplicate: true,
            queue_depth: queue.length,
            message_id: messageId,
            receipt: chain.issue('continuity.message.duplicate_suppressed', { message_id: messageId })
          });
        }
        const envelope = {
          message_id: messageId,
          kind: String(body.kind || 'continuity.message'),
          mission_id: String(body.mission_id || ''),
          payload: body.payload ?? null,
          expires_at: expiresAt,
          received_at: new Date().toISOString()
        };
        queuedMessageIds.add(messageId);
        queue.push(envelope);
        return send(res, 202, {
          ok: true,
          node_id: nodeId,
          queued: true,
          duplicate: false,
          queue_depth: queue.length,
          receipt: chain.issue('continuity.message.accepted', { message_id: messageId, kind: envelope.kind })
        });
      }
      if (req.method === 'GET' && req.url?.startsWith('/v1/checkpoints/')) {
        const checkpointId = decodeURIComponent(req.url.split('/').pop() || '');
        if (!checkpoints.has(checkpointId)) {
          return send(res, 404, { error: 'checkpoint_not_found', checkpoint_id: checkpointId });
        }
        return send(res, 200, {
          ok: true,
          node_id: nodeId,
          checkpoint_id: checkpointId,
          state: checkpoints.get(checkpointId)
        });
      }
      if (req.method === 'POST' && req.url === '/v1/checkpoints') {
        if (!(roles.includes('hearth') || roles.includes('nexus'))) {
          return send(res, 403, { error: 'checkpoint_role_not_available' });
        }
        const body = await jsonBody(req);
        const checkpointId = body.checkpoint_id || `cp_${randomBytes(8).toString('hex')}`;
        checkpoints.set(checkpointId, body.state ?? null);
        return send(res, 201, {
          ok: true,
          node_id: nodeId,
          checkpoint_id: checkpointId,
          receipt: chain.issue('continuity.checkpoint.stored', { checkpoint_id: checkpointId })
        });
      }
      if (req.method === 'POST' && req.url === '/v1/jobs') {
        if (!(roles.includes('nexus') || roles.includes('team'))) {
          return send(res, 403, { error: 'execution_role_not_available' });
        }
        const body = await jsonBody(req);
        const jobId = body.job_id || `job_${randomBytes(8).toString('hex')}`;
        const requestedInference = Boolean(body.requires_local_inference);
        if (requestedInference && !localInference) {
          return send(res, 412, { error: 'local_inference_not_ready' });
        }
        const checkpoint = {
          step: Number(body.checkpoint?.step || 0) + 1,
          state: body.checkpoint?.state ?? body.payload ?? null,
          last_node: nodeId
        };
        return send(res, 200, {
          ok: true,
          node_id: nodeId,
          job_id: jobId,
          execution: requestedInference ? 'local_inference_stub' : 'deterministic_local_runtime',
          checkpoint,
          receipt: chain.issue('continuity.job.executed', { job_id: jobId })
        });
      }
      if (req.method === 'GET' && req.url === '/v1/queue') {
        return send(res, 200, { ok: true, node_id: nodeId, queue });
      }
      return send(res, 404, { error: 'not_found' });
    } catch (error) {
      return send(res, 500, { error: String(error?.message || error) });
    }
  });

  server.listen(port, '127.0.0.1', () => {
    process.stdout.write(JSON.stringify({ event: 'offline.node.ready', ...manifest() }) + '\n');
  });

  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.on(signal, () => server.close(() => process.exit(0)));
  }
}

async function requestJson(url, options = {}, timeoutMs = 1000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        ...(options.headers || {})
      }
    });
    const payload = await response.json();
    if (!response.ok) {
      const error = new Error(`${response.status}:${payload.error || 'request_failed'}`);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

async function waitForNode(endpoint) {
  for (let i = 0; i < 40; i++) {
    try {
      return await requestJson(`${endpoint}/v1/node`, {}, 250);
    } catch {
      await wait(75);
    }
  }
  throw new Error(`unreachable offline peer: ${endpoint}`);
}

function loadTrustedFingerprints(localManifests) {
  const fromEnv = String(process.env.EVERCRAFT_TRUSTED_FINGERPRINTS || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  const trusted = new Set(fromEnv);
  for (const manifest of localManifests) trusted.add(manifest.trust.identity_fingerprint);
  return trusted;
}

function classifyMode(peers) {
  const hasGateway = peers.some((p) => p.roles.includes('gateway') && p.trust.verified);
  if (hasGateway) return 'C1_DEGRADED_WITH_GATEWAY';
  if (peers.length > 1) return 'C2_ISOLATED_LAN';
  return 'C4_DISCONNECTED_ISLAND';
}

function chooseRole(peers, role, capability = null) {
  return peers.find((peer) =>
    peer.trust.verified &&
    peer.roles.includes(role) &&
    (!capability || peer.capabilities.includes(capability))
  );
}

async function seedMode() {
  const outDir = path.resolve(val('--out', './offline-continuity-output'));
  const noLocal = has('--no-local');
  const requireInference = has('--require-local-inference');
  const chain = new ReceiptChain('saban-offline-seed');
  const receipts = [];
  const children = [];
  let endpoints = String(val('--peers', process.env.EVERCRAFT_OFFLINE_PEERS || ''))
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

  const localSpecs = [
    { id: 'nexus-local', port: 47301, roles: 'nexus,team', inference: true },
    { id: 'guardian-local', port: 47302, roles: 'guardian', inference: false },
    { id: 'hearth-local', port: 47303, roles: 'hearth', inference: false },
    { id: 'team-local', port: 47304, roles: 'team', inference: true }
  ];

  try {
    const locallySpawned = [];
    if (!endpoints.length && !noLocal) {
      for (const spec of localSpecs) {
        const args = [
          SELF,
          '--node',
          '--node-id', spec.id,
          '--port', String(spec.port),
          '--roles', spec.roles
        ];
        if (spec.inference) args.push('--local-inference');
        children.push(spawn(process.execPath, args, { stdio: 'ignore' }));
        endpoints.push(`http://127.0.0.1:${spec.port}`);
        locallySpawned.push({ node_id: spec.id, trust: { identity_fingerprint: fingerprint(spec.id) } });
      }
    }

    if (!endpoints.length) throw new Error('no offline peers configured or discovered');

    const discovered = await Promise.all(endpoints.map(async (endpoint) => {
      const manifest = await waitForNode(endpoint);
      return { ...manifest, endpoint };
    }));

    const trustedFingerprints = loadTrustedFingerprints(locallySpawned);
    const peers = discovered.map((peer) => ({
      ...peer,
      trust: {
        ...peer.trust,
        verified: trustedFingerprints.has(peer.trust?.identity_fingerprint)
      }
    }));

    receipts.push(chain.issue('offline.peers.discovered', {
      count: peers.length,
      nodes: peers.map((p) => ({
        node_id: p.node_id,
        roles: p.roles,
        verified: p.trust.verified
      }))
    }));

    const requiredRoles = ['nexus', 'guardian', 'hearth', 'team'];
    const missingRoles = requiredRoles.filter((role) => !chooseRole(peers, role));
    if (missingRoles.length) {
      throw new Error(`required verified offline roles missing: ${missingRoles.join(',')}`);
    }

    const nexus = chooseRole(peers, 'nexus', 'saban.worker');
    const guardian = chooseRole(peers, 'guardian', 'guardian.continuity');
    const hearth = chooseRole(peers, 'hearth', 'checkpoint.store');
    const team = chooseRole(peers, 'team', 'team.agent_runtime');

    const missionId = `mission_${randomBytes(8).toString('hex')}`;
    const firstJob = await requestJson(`${nexus.endpoint}/v1/jobs`, {
      method: 'POST',
      body: JSON.stringify({
        mission_id: missionId,
        job_id: 'saban-release',
        requires_local_inference: requireInference,
        payload: {
          mission: 'release-saban-offline',
          internet_required: false
        },
        checkpoint: { step: 0, state: { admitted: true } }
      })
    });
    receipts.push(chain.issue('offline.nexus.executed', { node_id: nexus.node_id, job_id: firstJob.job_id }));

    const saved = await requestJson(`${hearth.endpoint}/v1/checkpoints`, {
      method: 'POST',
      body: JSON.stringify({
        checkpoint_id: `${missionId}:nexus`,
        mission_id: missionId,
        state: firstJob.checkpoint
      })
    });
    receipts.push(chain.issue('offline.hearth.checkpointed', {
      node_id: hearth.node_id,
      checkpoint_id: saved.checkpoint_id
    }));

    const guardianMessage = await requestJson(`${guardian.endpoint}/v1/messages`, {
      method: 'POST',
      body: JSON.stringify({
        mission_id: missionId,
        kind: 'guardian.continuity.check',
        payload: {
          request: 'report locally available Guardian continuity capability',
          internet_required: false
        }
      })
    });
    receipts.push(chain.issue('offline.guardian.reached', {
      node_id: guardian.node_id,
      receipt_hash: guardianMessage.receipt.receipt_hash
    }));

    const teamJob = await requestJson(`${team.endpoint}/v1/jobs`, {
      method: 'POST',
      body: JSON.stringify({
        mission_id: missionId,
        job_id: 'team-presence',
        requires_local_inference: requireInference,
        payload: {
          request: 'Evercraft team local runtime presence',
          internet_required: false
        },
        checkpoint: firstJob.checkpoint
      })
    });
    receipts.push(chain.issue('offline.team.reached', {
      node_id: team.node_id,
      job_id: teamJob.job_id
    }));

    const mode = classifyMode(peers);
    const summary = {
      proof: 'evercraft.offline-continuity.v1',
      status: 'PASS',
      continuity_mode: mode,
      internet_required: false,
      external_cloud_used: false,
      control_plane: 'local_http_test_fabric',
      required_roles: requiredRoles,
      verified_roles_present: requiredRoles.every((role) => Boolean(chooseRole(peers, role))),
      local_inference_required: requireInference,
      local_inference_ready: peers.some((p) => p.trust.verified && p.execution?.local_inference),
      reachable_nodes: peers.map((p) => ({
        node_id: p.node_id,
        roles: p.roles,
        capabilities: p.capabilities,
        verified: p.trust.verified,
        endpoint: p.endpoint
      })),
      mission: {
        mission_id: missionId,
        nexus_execution: nexus.node_id,
        hearth_checkpoint: hearth.node_id,
        guardian_reach: guardian.node_id,
        team_runtime: team.node_id
      },
      receipt_chain_head: chain.previous,
      field_proof_required: [
        'multi-device LAN discovery',
        'Wi-Fi Direct adapter',
        'BLE discovery/store-forward adapter',
        'encrypted delayed-delivery envelopes',
        'real local model runtime',
        'power/battery endurance',
        'partition reconciliation across physical nodes'
      ],
      completed_at: new Date().toISOString()
    };

    await fs.mkdir(outDir, { recursive: true });
    await fs.writeFile(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
    await fs.writeFile(path.join(outDir, 'receipts.jsonl'), receipts.map(JSON.stringify).join('\n') + '\n');
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    for (const child of children) {
      if (!child.killed) child.kill('SIGTERM');
    }
  }
}

if (has('--node')) {
  await nodeMode();
} else {
  await seedMode();
}
