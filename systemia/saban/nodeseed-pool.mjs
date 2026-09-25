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
    expires_at: lease.expires_at
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
  requestedTtlMs = 300000
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

  const leaseOptions = {
    allocatorToken,
    allocatorTokens,
    timeoutMs,
    assignmentTimeoutMs,
    requestedTtlMs
  };

  const leased = [];
  const leaseFailures = [];
  for (const node of resolved.nodes) {
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
    last_node_id: null
  }));
  const results = new Array(assignments.length);
  const failures = [];
  const events = [];
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
      try {
        const response = await executeAssignment(
          node,
          software,
          job.assignment,
          job.checkpoint,
          leaseOptions
        );
        job.checkpoint = response.checkpoint || job.checkpoint;
        const failover = Boolean(
          job.last_node_id && job.last_node_id !== response.node_id
        );

        results[job.index] = {
          status: 'completed',
          assignment: job.assignment,
          node_id: response.node_id,
          attempts: job.attempts,
          failover,
          checkpoint: response.checkpoint || null,
          result: response.result,
          compute_receipt: response.receipt || null
        };

        events.push({
          type: failover ? 'assignment.failover.completed' : 'assignment.completed',
          agent_id: job.assignment.agent_id,
          node_id: response.node_id,
          attempts: job.attempts
        });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        job.last_node_id = node.node_id;
        node.healthy = false;

        events.push({
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
            attempts: job.attempts,
            last_node_id: node.node_id,
            reason
          };
        }
      }
    }
  }

  const workerCount = Math.max(
    1,
    Math.min(
      assignments.length,
      leased.length * Math.max(1, Number(maxConcurrencyPerNode || 1))
    )
  );

  await Promise.all(
    Array.from({ length: workerCount }, (_, index) => worker(index))
  );

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
      healthy_at_end: node.healthy !== false
    })),
    rejected_nodes: resolved.rejected,
    lease_failures: leaseFailures,
    events,
    results,
    failures
  };
}
