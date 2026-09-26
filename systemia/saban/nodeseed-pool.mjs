import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { discoverCapacityBeacons } from '../compute/capacity-beacon.mjs';

async function requestJson(url, options = {}, timeoutMs = 5000) {
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
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(`${response.status}:${body.error || 'request_failed'}`);
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

function hashFile(file) {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(file, 'r');
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    while (true) {
      const bytes = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (!bytes) break;
      hash.update(buffer.subarray(0, bytes));
    }
  } finally {
    fs.closeSync(fd);
  }
  return `sha256:${hash.digest('hex')}`;
}

export async function stageFileOnNode(
  node,
  filePath,
  options = {},
  {
    expectedHash = null,
    extension = null
  } = {}
) {
  const resolved = path.resolve(String(filePath));
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    throw new Error('source_staging_file_missing');
  }

  const observedHash = hashFile(resolved);
  if (expectedHash && expectedHash !== observedHash) {
    throw new Error('source_staging_hash_mismatch');
  }

  const digest = observedHash.replace(/^sha256:/, '');
  node.staged_digests ||= new Set();
  if (!node.staged_digests.has(digest)) {
    const safeExtension = String(
      extension || path.extname(resolved).toLowerCase() || '.bin'
    ).toLowerCase();
    await requestJson(
      `${node.endpoint}/v1/leases/${node.lease_id}/blobs/${digest}`,
      {
        method: 'PUT',
        headers: {
          authorization: `Bearer ${node.lease_token}`,
          'content-type': 'application/octet-stream',
          'x-evercraft-blob-extension': safeExtension
        },
        body: fs.createReadStream(resolved),
        duplex: 'half'
      },
      options.assignmentTimeoutMs || 120000
    );
    node.staged_digests.add(digest);
  }

  return {
    blob_sha256: observedHash,
    size_bytes: fs.statSync(resolved).size
  };
}

async function stageSourceOnNode(node, assignment, options, hashCache) {
  const raw = assignment?.item?.raw || {};
  const source = raw.source || raw.authorized_source;
  if (!source?.path) return assignment;
  if (raw.authorization?.confirmed !== true) {
    throw new Error('source_staging_requires_explicit_authorization');
  }

  const sourcePath = path.resolve(String(source.path));
  let observedHash = hashCache.get(sourcePath);
  if (!observedHash) {
    observedHash = hashFile(sourcePath);
    hashCache.set(sourcePath, observedHash);
  }
  if (source.sha256 && source.sha256 !== observedHash) {
    throw new Error('source_staging_hash_mismatch');
  }

  const staged = await stageFileOnNode(node, sourcePath, options, {
    expectedHash: observedHash
  });

  const prepared = structuredClone(assignment);
  prepared.item.raw.source = {
    ...source,
    path: null,
    sha256: staged.blob_sha256,
    blob_sha256: staged.blob_sha256,
    original_path_redacted: true
  };
  return prepared;
}

function normalizeEndpoint(value) {
  return String(value || '').trim().replace(/\/$/, '');
}

function tokenFor(endpoint, options = {}) {
  return (
    options.allocatorTokens?.[endpoint] ||
    options.allocatorToken ||
    ''
  );
}

async function inspectNode(endpoint, options = {}) {
  const capacity = await requestJson(
    `${endpoint}/v1/capacity`,
    {},
    options.timeoutMs || 3000
  );

  if (!Array.isArray(capacity.supported_workloads) ||
      !capacity.supported_workloads.includes('saban.multiplier-assignment.v1')) {
    throw new Error('node_does_not_support_registered_saban_assignments');
  }

  return {
    endpoint,
    node_id: capacity.node_id,
    capacity_hint: capacity.capacity_hint || null,
    placement_labels: Array.isArray(capacity.placement_labels)
      ? capacity.placement_labels.map(String)
      : [],
    allocation_auth: capacity.allocation_auth || null,
    supported_workloads: capacity.supported_workloads
  };
}

async function leaseNode(node, options = {}) {
  const token = tokenFor(node.endpoint, options);
  const headers = token ? { authorization: `Bearer ${token}` } : {};
  const lease = await requestJson(
    `${node.endpoint}/v1/leases`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        workload_class: 'saban.multiplier-assignment.v1',
        requested_ttl_ms: Number(options.requestedTtlMs || 300000)
      })
    },
    options.timeoutMs || 5000
  );

  return {
    ...node,
    lease_id: lease.lease_id,
    lease_token: lease.token,
    expires_at: lease.expires_at,
    staged_digests: new Set()
  };
}

async function releaseNode(node, options = {}) {
  if (!node.lease_id || !node.lease_token) return null;
  try {
    return await requestJson(
      `${node.endpoint}/v1/leases/${node.lease_id}/release`,
      {
        method: 'POST',
        body: JSON.stringify({ token: node.lease_token })
      },
      options.timeoutMs || 3000
    );
  } catch {
    return null;
  }
}

async function executeAssignment(node, software, assignment, checkpoint, options = {}) {
  return requestJson(
    `${node.endpoint}/v1/jobs`,
    {
      method: 'POST',
      body: JSON.stringify({
        lease_id: node.lease_id,
        token: node.lease_token,
        workload_class: 'saban.multiplier-assignment.v1',
        agent_id: assignment.agent_id,
        checkpoint: checkpoint || { step: 0, state: null },
        input: {
          software,
          assignment
        }
      })
    },
    options.assignmentTimeoutMs || 120000
  );
}

export async function resolveNodeSeedPool({
  endpoints = [],
  discover = false,
  discoveryOptions = {},
  allocatorToken = '',
  allocatorTokens = {},
  timeoutMs = 3000
} = {}) {
  let resolved = endpoints.map(normalizeEndpoint).filter(Boolean);

  if (!resolved.length && discover) {
    const beacons = await discoverCapacityBeacons(discoveryOptions);
    resolved = beacons.map((beacon) => normalizeEndpoint(beacon.endpoint));
  }

  resolved = [...new Set(resolved)];
  const nodes = [];
  const rejected = [];

  for (const endpoint of resolved) {
    try {
      const node = await inspectNode(endpoint, { timeoutMs });
      nodes.push(node);
    } catch (error) {
      rejected.push({
        endpoint,
        reason: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return {
    nodes,
    rejected,
    auth: { allocatorToken, allocatorTokens }
  };
}

function pickNode(nodes, cursor) {
  const healthy = nodes.filter((node) => node.healthy !== false);
  if (!healthy.length) return null;
  return healthy[cursor % healthy.length];
}

function meetsResourceProfile(node, profile = null) {
  if (!profile) return { eligible: true, reason: null };
  const hint = node.capacity_hint;
  if (!hint) {
    return profile.require_capacity_hint === true
      ? { eligible: false, reason: 'capacity_hint_required' }
      : { eligible: true, reason: null };
  }

  const minCpu = Number(profile.minimum_node_cpu_units || 0);
  const minMemory = Number(profile.minimum_node_memory_mb || 0);
  if (minCpu && Number(hint.cpu_units || 0) < minCpu) {
    return { eligible: false, reason: 'insufficient_cpu_capacity' };
  }
  if (minMemory && Number(hint.memory_mb || 0) < minMemory) {
    return { eligible: false, reason: 'insufficient_memory_capacity' };
  }

  for (const executable of profile.required_executables || []) {
    if (hint.executables?.[executable] !== true) {
      return {
        eligible: false,
        reason: `missing_required_executable:${executable}`
      };
    }
  }

  for (const service of profile.required_services || []) {
    if (hint.services?.[service] !== true) {
      return {
        eligible: false,
        reason: `missing_required_service:${service}`
      };
    }
  }

  const labels = new Set((node.placement_labels || []).map(String));
  for (const label of profile.required_node_labels || []) {
    if (!labels.has(String(label))) {
      return {
        eligible: false,
        reason: `missing_required_node_label:${label}`
      };
    }
  }
  for (const label of profile.forbidden_node_labels || []) {
    if (labels.has(String(label))) {
      return {
        eligible: false,
        reason: `forbidden_node_label:${label}`
      };
    }
  }

  return { eligible: true, reason: null };
}

function placementSlots(node, profile, maxConcurrencyPerNode) {
  const maxSlots = Math.max(1, Number(maxConcurrencyPerNode || 1));
  const hint = node.capacity_hint;
  if (!hint || !profile) return Math.min(1, maxSlots);

  const cpuPerWorker = Math.max(1, Number(profile.cpu_units_per_worker || 1));
  const memoryPerWorker = Math.max(1, Number(profile.memory_mb_per_worker || 64));
  const cpuSlots = Math.max(1, Math.floor(Number(hint.cpu_units || 1) / cpuPerWorker));
  const memorySlots = Math.max(1, Math.floor(Number(hint.memory_mb || 64) / memoryPerWorker));
  return Math.max(1, Math.min(maxSlots, cpuSlots, memorySlots));
}

export async function runNodeSeedAssignmentPool({
  software,
  assignments,
  endpoints = [],
  discover = false,
  discoveryOptions = {},
  allocatorToken = '',
  allocatorTokens = {},
  maxAttempts = 3,
  maxConcurrencyPerNode = 2,
  timeoutMs = 3000,
  assignmentTimeoutMs = 120000,
  requestedTtlMs = 300000,
  resourceProfile = null,
  stageAuthorizedSources = false,
  prepareAssignment = null,
  onEvent = null
}) {
  if (!software) throw new Error('software is required');
  if (!Array.isArray(assignments) || assignments.length === 0) {
    throw new Error('assignments are required');
  }

  const resolved = await resolveNodeSeedPool({
    endpoints,
    discover,
    discoveryOptions,
    allocatorToken,
    allocatorTokens,
    timeoutMs
  });

  if (!resolved.nodes.length) {
    throw new Error('no_eligible_nodeseed_capacity');
  }

  const resourceRejected = [];
  const eligibleNodes = resolved.nodes.filter((node) => {
    const decision = meetsResourceProfile(node, resourceProfile);
    if (!decision.eligible) {
      resourceRejected.push({
        endpoint: node.endpoint,
        node_id: node.node_id,
        reason: decision.reason
      });
    }
    return decision.eligible;
  });

  if (!eligibleNodes.length) {
    throw new Error('no_nodeseed_capacity_meets_resource_profile');
  }

  const leaseOptions = {
    allocatorToken,
    allocatorTokens,
    timeoutMs,
    assignmentTimeoutMs,
    requestedTtlMs
  };

  const leased = [];
  const leaseFailures = [];
  for (const node of eligibleNodes) {
    try {
      leased.push(await leaseNode(node, leaseOptions));
    } catch (error) {
      leaseFailures.push({
        endpoint: node.endpoint,
        node_id: node.node_id,
        reason: error instanceof Error ? error.message : String(error)
      });
    }
  }

  if (!leased.length) throw new Error('no_nodeseed_leases_granted');

  const queue = assignments.map((assignment, index) => ({
    assignment,
    index,
    attempts: 0,
    checkpoint: null,
    last_node_id: null,
    total_duration_ms: 0
  }));
  const results = new Array(assignments.length);
  const failures = [];
  const sourceHashCache = new Map();
  const events = [];
  const emit = async (event) => {
    events.push(event);
    if (typeof onEvent === 'function') await onEvent(event);
  };
  let cursor = 0;

  async function worker(workerIndex) {
    while (true) {
      const job = queue.shift();
      if (!job) return;

      const node = pickNode(leased, cursor++);
      if (!node) {
        queue.unshift(job);
        return;
      }

      job.attempts += 1;
      const attemptStartedAt = Date.now();
      try {
        const preparedAssignment = typeof prepareAssignment === 'function'
          ? await prepareAssignment({
              node,
              assignment: job.assignment,
              leaseOptions,
              stageFileOnNode
            })
          : stageAuthorizedSources
            ? await stageSourceOnNode(
                node,
                job.assignment,
                leaseOptions,
                sourceHashCache
              )
            : job.assignment;

        const response = await executeAssignment(
          node,
          software,
          preparedAssignment,
          job.checkpoint,
          leaseOptions
        );
        job.checkpoint = response.checkpoint || job.checkpoint;
        const failover = Boolean(
          job.last_node_id && job.last_node_id !== response.node_id
        );

        job.total_duration_ms += Math.max(0, Date.now() - attemptStartedAt);
        results[job.index] = {
          status: 'completed',
          assignment: job.assignment,
          idempotency_key: job.assignment.idempotency_key || null,
          node_id: response.node_id,
          attempts: job.attempts,
          duration_ms: job.total_duration_ms,
          failover,
          checkpoint: response.checkpoint || null,
          result: response.result,
          compute_receipt: response.receipt || null
        };

        await emit({
          type: failover ? 'assignment.failover.completed' : 'assignment.completed',
          agent_id: job.assignment.agent_id,
          node_id: response.node_id,
          attempts: job.attempts,
          duration_ms: job.total_duration_ms
        });
      } catch (error) {
        job.total_duration_ms += Math.max(0, Date.now() - attemptStartedAt);
        const reason = error instanceof Error ? error.message : String(error);
        job.last_node_id = node.node_id;
        node.healthy = false;

        await emit({
          type: 'node.assignment.failed',
          agent_id: job.assignment.agent_id,
          node_id: node.node_id,
          endpoint: node.endpoint,
          attempt: job.attempts,
          reason
        });

        if (job.attempts < maxAttempts && leased.some((candidate) => candidate.healthy !== false)) {
          queue.push(job);
        } else {
          failures.push({
            assignment: job.assignment,
            attempts: job.attempts,
            last_node_id: node.node_id,
            reason
          });
          results[job.index] = {
            status: 'failed',
            assignment: job.assignment,
            idempotency_key: job.assignment.idempotency_key || null,
            attempts: job.attempts,
            duration_ms: job.total_duration_ms,
            last_node_id: node.node_id,
            reason
          };
        }
      }
    }
  }

  const placementRing = leased.flatMap((node) =>
    Array.from(
      { length: placementSlots(node, resourceProfile, maxConcurrencyPerNode) },
      () => node
    )
  );

  const workerCount = Math.max(
    1,
    Math.min(assignments.length, placementRing.length)
  );

  const originalLeased = leased.splice(0, leased.length, ...placementRing);

  await Promise.all(
    Array.from({ length: workerCount }, (_, index) => worker(index))
  );

  leased.splice(0, leased.length, ...[...new Map(originalLeased.map((node) => [node.endpoint, node])).values()]);

  await Promise.allSettled(
    leased.map((node) => releaseNode(node, leaseOptions))
  );

  const completed = results.filter((row) => row?.status === 'completed');
  const failovers = completed.filter((row) => row.failover);

  return {
    schema: 'evercraft.saban.nodeseed-pool-receipt.v1',
    generated_at: new Date().toISOString(),
    software,
    requested_assignments: assignments.length,
    completed_assignments: completed.length,
    failed_assignments: failures.length,
    failover_assignments: failovers.length,
    nodes: leased.map((node) => ({
      node_id: node.node_id,
      endpoint: node.endpoint,
      capacity_hint: node.capacity_hint,
      placement_labels: node.placement_labels || [],
      healthy_at_end: node.healthy !== false
    })),
    rejected_nodes: [...resolved.rejected, ...resourceRejected],
    lease_failures: leaseFailures,
    events,
    results,
    failures
  };
}
