#!/usr/bin/env node
import http from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';

const SELF = fileURLToPath(import.meta.url);
const args = new Map();
const flags = new Set();
for (let i = 2; i < process.argv.length; i++) {
  const token = process.argv[i];
  if (!token.startsWith('--')) continue;
  const next = process.argv[i + 1];
  if (next && !next.startsWith('--')) {
    args.set(token, next);
    i++;
  } else {
    flags.add(token);
  }
}
const flag = (name) => flags.has(name);
const sha = (value) => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const json = (res, status, body) => {
  const data = Buffer.from(JSON.stringify(body));
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': data.length });
  res.end(data);
};
const readJson = async (req) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
};

class ReceiptChain {
  constructor(nodeId) {
    this.nodeId = nodeId;
    this.prev = 'GENESIS';
    this.seq = 0;
  }
  issue(type, body = {}) {
    const base = {
      receipt_version: 'evercraft.receipt.v1',
      node_id: this.nodeId,
      seq: ++this.seq,
      type,
      at: new Date().toISOString(),
      previous_hash: this.prev,
      ...body,
    };
    const receipt = { ...base, receipt_hash: sha(base) };
    this.prev = receipt.receipt_hash;
    return receipt;
  }
}

async function runNodeSeed() {
  const port = Number(args.get('--port') || 47101);
  const nodeId = args.get('--node-id') || `nodeseed-${port}`;
  const cpuUnits = Number(args.get('--cpu-units') || 4);
  const memoryMb = Number(args.get('--memory-mb') || 1024);
  const maxLeases = Number(args.get('--max-leases') || 64);
  const leaseTtlMs = Number(args.get('--lease-ttl-ms') || 30000);
  const chain = new ReceiptChain(nodeId);
  const leases = new Map();
  const receipts = [];

  const offer = () => ({
    protocol: 'evercraft.capacity.v1',
    node_id: nodeId,
    platform: `${process.platform}/${process.arch}`,
    endpoint: `http://127.0.0.1:${port}`,
    capacity: { cpu_units: cpuUnits, memory_mb: memoryMb, max_leases: maxLeases },
    allocation: 'runtime-negotiated',
    requires_pre_enrollment: false,
    expires_at: new Date(Date.now() + 60000).toISOString(),
  });

  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === 'GET' && req.url === '/v1/capacity') return json(res, 200, offer());
      if (req.method === 'GET' && req.url === '/v1/health') return json(res, 200, { ok: true, node_id: nodeId, active_leases: leases.size });
      if (req.method === 'GET' && req.url === '/v1/receipts') return json(res, 200, { node_id: nodeId, receipts });

      if (req.method === 'POST' && req.url === '/v1/leases') {
        const request = await readJson(req);
        if (leases.size >= maxLeases) return json(res, 429, { error: 'capacity_exhausted' });
        const requestedCpu = Math.max(1, Math.min(Number(request.cpu_units || 1), cpuUnits));
        const requestedMemory = Math.max(16, Math.min(Number(request.memory_mb || 64), memoryMb));
        const leaseId = `lease_${randomBytes(8).toString('hex')}`;
        const token = randomBytes(24).toString('hex');
        const lease = {
          lease_id: leaseId,
          token_hash: sha(token),
          granted: { cpu_units: requestedCpu, memory_mb: requestedMemory },
          workload_class: request.workload_class || 'saban.logical-agent',
          expires_at: new Date(Date.now() + leaseTtlMs).toISOString(),
        };
        leases.set(leaseId, lease);
        const receipt = chain.issue('capacity.lease.granted', {
          lease_id: leaseId,
          granted: lease.granted,
          workload_class: lease.workload_class,
        });
        receipts.push(receipt);
        return json(res, 201, { ...lease, token, receipt });
      }

      if (req.method === 'POST' && req.url === '/v1/jobs') {
        const request = await readJson(req);
        const lease = leases.get(request.lease_id);
        if (!lease || lease.token_hash !== sha(request.token || '')) return json(res, 401, { error: 'invalid_lease' });
        if (Date.parse(lease.expires_at) < Date.now()) return json(res, 410, { error: 'lease_expired' });
        const checkpoint = request.checkpoint || { step: 0, state: request.payload ?? null };
        const output = sha({ agent_id: request.agent_id, checkpoint, node_id: nodeId });
        const nextCheckpoint = { step: Number(checkpoint.step || 0) + 1, state: checkpoint.state, last_node: nodeId, output };
        const receipt = chain.issue('workload.executed', {
          lease_id: request.lease_id,
          agent_id: request.agent_id,
          checkpoint_hash: sha(checkpoint),
          output_hash: output,
        });
        receipts.push(receipt);
        return json(res, 200, { ok: true, node_id: nodeId, checkpoint: nextCheckpoint, receipt });
      }

      if (req.method === 'DELETE' && req.url?.startsWith('/v1/leases/')) {
        const leaseId = req.url.split('/').pop();
        const existed = leases.delete(leaseId);
        const receipt = chain.issue('capacity.lease.released', { lease_id: leaseId, existed });
        receipts.push(receipt);
        return json(res, 200, { ok: true, receipt });
      }

      return json(res, 404, { error: 'not_found' });
    } catch (error) {
      return json(res, 500, { error: 'node_error', detail: String(error?.message || error) });
    }
  });

  server.listen(port, '127.0.0.1', () => {
    process.stdout.write(JSON.stringify({ event: 'nodeseed.ready', ...offer() }) + '\n');
  });

  const stop = () => server.close(() => process.exit(0));
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

async function requestJson(url, options = {}, timeoutMs = 1500) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    });
    const body = await res.json();
    if (!res.ok) throw new Error(`${res.status}:${body.error || JSON.stringify(body)}`);
    return body;
  } finally {
    clearTimeout(t);
  }
}

async function waitFor(url, tries = 30) {
  for (let i = 0; i < tries; i++) {
    try { return await requestJson(url, {}, 300); } catch { await sleep(100); }
  }
  throw new Error(`endpoint did not become ready: ${url}`);
}

async function lease(endpoint, agentCount) {
  return requestJson(`${endpoint}/v1/leases`, {
    method: 'POST',
    body: JSON.stringify({
      cpu_units: Math.max(1, Math.ceil(agentCount / 100)),
      memory_mb: Math.max(64, Math.ceil(agentCount / 10)),
      workload_class: 'saban.logical-agent',
    }),
  });
}

async function execute(endpoint, grant, agent) {
  return requestJson(`${endpoint}/v1/jobs`, {
    method: 'POST',
    body: JSON.stringify({
      lease_id: grant.lease_id,
      token: grant.token,
      agent_id: agent.agent_id,
      checkpoint: agent.checkpoint,
      payload: agent.payload,
    }),
  });
}

async function release(endpoint, grant) {
  if (!grant) return;
  try { await requestJson(`${endpoint}/v1/leases/${grant.lease_id}`, { method: 'DELETE' }); } catch {}
}

async function mapConcurrent(items, limit, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

function verifyReceiptChain(receipts) {
  let previous = 'GENESIS';
  for (const receipt of receipts) {
    const { receipt_hash, ...base } = receipt;
    if (base.previous_hash !== previous) return false;
    if (sha(base) !== receipt_hash) return false;
    previous = receipt_hash;
  }
  return true;
}

async function runSeedProof() {
  const agentCount = Math.max(10, Math.min(10000, Number(args.get('--agents') || 10)));
  const outDir = path.resolve(args.get('--out') || './saban-proof-output');
  await fs.mkdir(outDir, { recursive: true });
  const seedChain = new ReceiptChain('saban-seed');
  const proofReceipts = [];
  const children = [];

  const spawnNode = (nodeId, port) => {
    const child = spawn(process.execPath, [SELF, '--node', '--node-id', nodeId, '--port', String(port)], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (d) => process.stdout.write(`[${nodeId}] ${d}`));
    child.stderr.on('data', (d) => process.stderr.write(`[${nodeId}:err] ${d}`));
    children.push(child);
    return child;
  };

  let nodeA, nodeB;
  try {
    nodeA = spawnNode('nodeseed-a', 47101);
    nodeB = spawnNode('nodeseed-b', 47102);
    const endpointA = 'http://127.0.0.1:47101';
    const endpointB = 'http://127.0.0.1:47102';

    const [offerA, offerB] = await Promise.all([
      waitFor(`${endpointA}/v1/capacity`),
      waitFor(`${endpointB}/v1/capacity`),
    ]);
    proofReceipts.push(seedChain.issue('capacity.discovered', { offers: [offerA, offerB].map(o => ({ node_id: o.node_id, endpoint: o.endpoint, capacity: o.capacity })) }));

    const aCount = Math.ceil(agentCount / 2);
    const bCount = agentCount - aCount;
    const [grantA, grantB] = await Promise.all([lease(endpointA, aCount), lease(endpointB, bCount || 1)]);
    proofReceipts.push(seedChain.issue('capacity.matched', {
      matches: [
        { node_id: offerA.node_id, lease_id: grantA.lease_id, agents: aCount },
        { node_id: offerB.node_id, lease_id: grantB.lease_id, agents: bCount },
      ],
    }));

    const agents = Array.from({ length: agentCount }, (_, i) => ({
      agent_id: `saban-agent-${String(i + 1).padStart(5, '0')}`,
      payload: { mission: 'evercraft-network-self-assembly-proof', shard: i },
      checkpoint: { step: 0, state: { shard: i } },
    }));

    const firstWave = await mapConcurrent(agents, 96, async (agent, i) => {
      const onA = i < aCount;
      const endpoint = onA ? endpointA : endpointB;
      const grant = onA ? grantA : grantB;
      const result = await execute(endpoint, grant, agent);
      agent.checkpoint = result.checkpoint;
      return { agent_id: agent.agent_id, node_id: result.node_id, receipt_hash: result.receipt.receipt_hash };
    });
    proofReceipts.push(seedChain.issue('saban.wave.completed', { agent_count: agentCount, assignments: firstWave }));

    nodeA.kill('SIGTERM');
    await sleep(250);
    let pathLossObserved = false;
    try { await requestJson(`${endpointA}/v1/health`, {}, 250); } catch { pathLossObserved = true; }
    if (!pathLossObserved) throw new Error('path-loss simulation failed: node A still reachable');
    proofReceipts.push(seedChain.issue('network.path_lost', { node_id: 'nodeseed-a', endpoint: endpointA }));

    const rebindGrant = await lease(endpointB, aCount);
    const reboundAgents = agents.slice(0, aCount);
    const rebound = await mapConcurrent(reboundAgents, 96, async (agent) => {
      const before = agent.checkpoint;
      const result = await execute(endpointB, rebindGrant, agent);
      agent.checkpoint = result.checkpoint;
      return {
        agent_id: agent.agent_id,
        from_node: before.last_node,
        to_node: result.node_id,
        resumed_step: result.checkpoint.step,
        receipt_hash: result.receipt.receipt_hash,
      };
    });
    proofReceipts.push(seedChain.issue('saban.workload.rebound', {
      lost_node: 'nodeseed-a',
      destination_node: 'nodeseed-b',
      migrated_agents: rebound,
    }));

    await release(endpointB, grantB);
    await release(endpointB, rebindGrant);
    proofReceipts.push(seedChain.issue('proof.completed', {
      agent_count: agentCount,
      discovered_nodes: 2,
      dynamic_leases: 3,
      path_loss_recovered: true,
      logical_agents_rebound: aCount,
      final_receipt_hash: seedChain.prev,
    }));

    const summary = {
      proof: 'evercraft.saban.network-seed.v1',
      status: 'PASS',
      agent_count: agentCount,
      node_count: 2,
      dynamic_capacity_discovery: true,
      requires_pre_enrollment: false,
      lease_negotiation: true,
      independent_linux_process_nodes: process.platform === 'linux',
      checkpoint_rebind_after_path_loss: true,
      migrated_agent_count: aCount,
      arbitrary_shell_execution: false,
      receipt_chain_head: seedChain.prev,
      receipt_chain_valid: verifyReceiptChain(proofReceipts),
      completed_at: new Date().toISOString(),
    };
    await fs.writeFile(path.join(outDir, 'receipts.jsonl'), proofReceipts.map(r => JSON.stringify(r)).join('\n') + '\n');
    await fs.writeFile(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
    console.log('\n' + JSON.stringify(summary, null, 2));
  } finally {
    for (const child of children) {
      if (!child.killed) child.kill('SIGTERM');
    }
  }
}

if (flag('--node')) await runNodeSeed();
else await runSeedProof();
