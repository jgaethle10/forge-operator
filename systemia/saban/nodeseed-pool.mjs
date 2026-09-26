import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { once } from 'node:events';
import { discoverCapacityBeacons } from '../compute/capacity-beacon.mjs';
import { verifyNodeAttestation } from '../compute/device-identity.mjs';

class NodeSeedRequestError extends Error {
  constructor(status, code, url) {
    super(`${status}:${code || 'request_failed'}`);
    this.name = 'NodeSeedRequestError';
    this.status = Number(status);
    this.code = String(code || 'request_failed');
    this.url = String(url || '');
  }
}

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
      throw new NodeSeedRequestError(
        response.status,
        body.error || 'request_failed',
        url
      );
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

function classifyAssignmentFailure(error) {
  const reason = error instanceof Error ? error.message : String(error);
  const integrityCodes = new Set([
    'saban_idempotency_record_integrity_failed',
    'saban_idempotency_record_schema_invalid',
    'saban_artifact_store_integrity_failed',
    'saban_artifact_replay_integrity_failed',
    'artifact_integrity_failed'
  ]);

  if (
    error?.name === 'AbortError' ||
    error?.name === 'TimeoutError' ||
    (
      error?.name === 'TypeError' &&
      /fetch|network|socket|connect/i.test(reason)
    )
  ) {
    return {
      failure_class: 'transport_failure',
      retryable: true,
      quarantine_node: true,
      disable_for_run: true,
      reason
    };
  }

  const status = Number(error?.status || 0);
  const code = String(error?.code || '').trim();
  if (integrityCodes.has(code)) {
    return {
      failure_class: 'integrity_failure',
      retryable: false,
      quarantine_node: true,
      disable_for_run: true,
      reason
    };
  }

  if (status === 409 && code === 'idempotency_key_conflict') {
    return {
      failure_class: 'workload_conflict',
      retryable: false,
      quarantine_node: false,
      disable_for_run: false,
      reason
    };
  }

  if (status === 401 || status === 410) {
    return {
      failure_class: 'lease_or_auth_failure',
      retryable: true,
      quarantine_node: false,
      disable_for_run: true,
      reason
    };
  }

  if ([408, 425, 429].includes(status)) {
    return {
      failure_class: 'transient_request_failure',
      retryable: true,
      quarantine_node: false,
      disable_for_run: false,
      reason
    };
  }

  if (status >= 500) {
    return {
      failure_class: 'node_service_failure',
      retryable: true,
      quarantine_node: true,
      disable_for_run: true,
      reason
    };
  }

  if (status >= 400 && status < 500) {
    return {
      failure_class: 'workload_rejected',
      retryable: false,
      quarantine_node: false,
      disable_for_run: false,
      reason
    };
  }

  return {
    failure_class: 'local_or_unknown_failure',
    retryable: false,
    quarantine_node: false,
    disable_for_run: false,
    reason
  };
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

  const placementLabels = Array.isArray(capacity.placement_labels)
    ? capacity.placement_labels.map((value) => String(value).trim().toLowerCase())
    : [];

  let attestation = null;
  if (options.requireAttestation === true) {
    const nonce = crypto.randomBytes(18).toString('hex');
    const allocatorToken = tokenFor(endpoint, options);
    const headers = allocatorToken
      ? { authorization: `Bearer ${allocatorToken}` }
      : {};
    const body = await requestJson(
      `${endpoint}/v1/attest`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ nonce })
      },
      options.timeoutMs || 3000
    );
    const verified = verifyNodeAttestation({
      attestation: body.attestation,
      expectedNonce: nonce,
      expectedNodeId: capacity.node_id
    });
    if (!verified.ok) {
      throw new Error(`node_attestation_failed:${verified.reason}`);
    }
    const signedLabels = [...(verified.placement_labels || [])]
      .map((value) => String(value).trim().toLowerCase())
      .sort();
    const advertisedLabels = [...placementLabels].sort();
    if (JSON.stringify(signedLabels) !== JSON.stringify(advertisedLabels)) {
      throw new Error('placement_label_attestation_mismatch');
    }
    attestation = {
      verified: true,
      device_fingerprint: verified.device_fingerprint,
      placement_labels: signedLabels,
      observed_at: verified.observed_at,
      field_claim: verified.field_claim
    };
  }

  return {
    endpoint,
    node_id: capacity.node_id,
    capacity_hint: capacity.capacity_hint || null,
    placement_labels: placementLabels,
    attestation,
    allocation_auth: capacity.allocation_auth || null,
    lease_renewal_supported: capacity.lease_renewal_supported === true,
    supported_workloads: capacity.supported_workloads
  };
}

function desiredLeaseTtlMs(options = {}) {
  const requested = Number(options.requestedTtlMs || 300000);
  const assignmentWindow = Math.max(
    30000,
    Number(options.assignmentTimeoutMs || 120000)
  );
  return Math.max(requested, assignmentWindow * 2 + 30000);
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
        requested_ttl_ms: desiredLeaseTtlMs(options)
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

async function renewNode(node, options = {}) {
  if (!node.lease_id || !node.lease_token || node.lease_renewal_supported !== true) {
    return null;
  }
  const renewed = await requestJson(
    `${node.endpoint}/v1/leases/${node.lease_id}/renew`,
    {
      method: 'POST',
      body: JSON.stringify({
        token: node.lease_token,
        requested_ttl_ms: desiredLeaseTtlMs(options)
      })
    },
    options.timeoutMs || 3000
  );
  node.expires_at = renewed.expires_at;
  return renewed;
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

async function fetchPortableArtifact(node, artifact, options = {}) {
  const root = options.artifactReturnRoot
    ? path.resolve(String(options.artifactReturnRoot))
    : null;
  if (!root) return null;

  const expectedHash = String(artifact?.sha256 || '');
  const digest = expectedHash.replace(/^sha256:/, '').toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(digest)) {
    throw new Error('portable_artifact_digest_invalid');
  }
  const extension = /^\.[a-z0-9]{1,8}$/.test(
    String(artifact.extension || '.bin').toLowerCase()
  )
    ? String(artifact.extension || '.bin').toLowerCase()
    : '.bin';
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  const target = path.join(root, `${digest}${extension}`);

  if (
    fs.existsSync(target) &&
    fs.statSync(target).isFile() &&
    hashFile(target) === expectedHash &&
    (
      artifact.size_bytes == null ||
      Number(fs.statSync(target).size) === Number(artifact.size_bytes)
    )
  ) {
    return {
      ...artifact,
      path: target,
      returned_from_nodeseed: true,
      deduplicated_download: true
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    options.assignmentTimeoutMs || 120000
  );
  const temp = `${target}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.partial`;

  try {
    const response = await fetch(
      `${node.endpoint}/v1/leases/${node.lease_id}/artifacts/${digest}`,
      {
        signal: controller.signal,
        headers: {
          authorization: `Bearer ${node.lease_token}`
        }
      }
    );
    if (!response.ok) {
      throw new Error(`${response.status}:portable_artifact_download_failed`);
    }

    const advertisedHash = String(response.headers.get('x-evercraft-sha256') || '');
    if (advertisedHash && advertisedHash !== expectedHash) {
      throw new Error('portable_artifact_header_hash_mismatch');
    }

    const hash = crypto.createHash('sha256');
    let bytes = 0;
    const stream = fs.createWriteStream(temp, { mode: 0o600 });
    try {
      for await (const chunk of response.body || []) {
        const buffer = Buffer.from(chunk);
        bytes += buffer.length;
        if (
          artifact.size_bytes != null &&
          bytes > Number(artifact.size_bytes)
        ) {
          throw new Error('portable_artifact_size_exceeded');
        }
        hash.update(buffer);
        if (!stream.write(buffer)) await once(stream, 'drain');
      }
      stream.end();
      await once(stream, 'finish');
    } catch (error) {
      stream.destroy();
      fs.rmSync(temp, { force: true });
      throw error;
    }

    const observedHash = `sha256:${hash.digest('hex')}`;
    if (observedHash !== expectedHash) {
      fs.rmSync(temp, { force: true });
      throw new Error('portable_artifact_hash_mismatch');
    }
    if (
      artifact.size_bytes != null &&
      bytes !== Number(artifact.size_bytes)
    ) {
      fs.rmSync(temp, { force: true });
      throw new Error('portable_artifact_size_mismatch');
    }

    fs.rmSync(target, { force: true });
    fs.renameSync(temp, target);
    return {
      ...artifact,
      path: target,
      returned_from_nodeseed: true,
      deduplicated_download: false
    };
  } finally {
    clearTimeout(timer);
    fs.rmSync(temp, { force: true });
  }
}

function rehydrateArtifactRefs(value, byId) {
  if (Array.isArray(value)) {
    return value.map((entry) => rehydrateArtifactRefs(entry, byId));
  }
  if (!value || typeof value !== 'object') return value;

  const next = {};
  for (const [key, entry] of Object.entries(value)) {
    next[key] = rehydrateArtifactRefs(entry, byId);
  }
  const artifact = next.artifact_id ? byId.get(String(next.artifact_id)) : null;
  if (artifact) {
    next.path = artifact.path;
    next.artifact_sha256 = artifact.sha256;
    next.portable = true;
    next.returned_from_nodeseed = true;
  }
  return next;
}

async function executeAssignment(node, software, assignment, checkpoint, options = {}) {
  const response = await requestJson(
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

  const returnedArtifacts = [];
  for (const artifact of response.artifacts || []) {
    const returned = await fetchPortableArtifact(node, artifact, options);
    if (returned) returnedArtifacts.push(returned);
  }

  if (returnedArtifacts.length) {
    const byId = new Map(
      returnedArtifacts.map((artifact) => [String(artifact.artifact_id), artifact])
    );
    response.result = rehydrateArtifactRefs(response.result, byId);
  }
  response.artifacts = returnedArtifacts;
  return response;
}

export async function resolveNodeSeedPool({
  endpoints = [],
  discover = false,
  discoveryOptions = {},
  allocatorToken = '',
  allocatorTokens = {},
  timeoutMs = 3000,
  requireAttestation = false
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
      const node = await inspectNode(endpoint, {
        timeoutMs,
        allocatorToken,
        allocatorTokens,
        requireAttestation
      });
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
  const eligible = nodes.filter(
    (node) => node.healthy !== false && node.available !== false
  );
  if (!eligible.length) return null;
  return eligible[cursor % eligible.length];
}

function meetsResourceProfile(node, profile = null) {
  if (!profile) return { eligible: true, reason: null };
  const hint = node.capacity_hint;
  if (!hint && profile.require_capacity_hint === true) {
    return { eligible: false, reason: 'capacity_hint_required' };
  }

  if (hint) {
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
  }

  const labels = new Set((node.placement_labels || []).map(String));
  for (const label of profile.required_node_labels || []) {
    const normalized = String(label || '').trim().toLowerCase();
    if (!labels.has(normalized)) {
      return {
        eligible: false,
        reason: `missing_required_node_label:${label}`
      };
    }
  }
  for (const label of profile.forbidden_node_labels || []) {
    const normalized = String(label || '').trim().toLowerCase();
    if (labels.has(normalized)) {
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
  leaseRenewalIntervalMs = null,
  artifactReturnRoot = null,
  resourceProfile = null,
  stageAuthorizedSources = false,
  prepareAssignment = null,
  onEvent = null
}) {
  if (!software) throw new Error('software is required');
  if (!Array.isArray(assignments) || assignments.length === 0) {
    throw new Error('assignments are required');
  }

  const placementSensitive = Boolean(
    resourceProfile?.require_node_attestation === true ||
    (resourceProfile?.required_node_labels || []).length ||
    (resourceProfile?.forbidden_node_labels || []).length
  );

  const resolved = await resolveNodeSeedPool({
    endpoints,
    discover,
    discoveryOptions,
    allocatorToken,
    allocatorTokens,
    timeoutMs,
    requireAttestation: placementSensitive
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
    requestedTtlMs,
    leaseRenewalIntervalMs,
    artifactReturnRoot
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

  const renewalEvents = [];
  const renewalTimers = [];
  let renewalsStopped = false;

  async function renewLeaseWithReceipt(node, phase = 'heartbeat') {
    if (node.lease_renewal_supported !== true || renewalsStopped) return;
    try {
      const renewed = await renewNode(node, leaseOptions);
      if (renewed) {
        renewalEvents.push({
          type: 'lease.renewed',
          phase,
          node_id: node.node_id,
          endpoint: node.endpoint,
          expires_at: node.expires_at
        });
      }
    } catch (error) {
      renewalEvents.push({
        type: 'lease.renewal.failed',
        phase,
        node_id: node.node_id,
        endpoint: node.endpoint,
        reason: error instanceof Error ? error.message : String(error)
      });
      if (Date.parse(node.expires_at || 0) <= Date.now()) {
        node.healthy = false;
      }
    }
  }

  for (const node of leased) {
    if (node.lease_renewal_supported !== true) continue;
    await renewLeaseWithReceipt(node, 'initial');
    const remaining = Math.max(30000, Date.parse(node.expires_at || 0) - Date.now());
    const intervalMs = Math.max(
      5000,
      Math.min(
        60000,
        Number(leaseOptions.leaseRenewalIntervalMs || Math.floor(remaining / 3))
      )
    );
    const timer = setInterval(() => {
      renewLeaseWithReceipt(node, 'heartbeat').catch(() => {});
    }, intervalMs);
    timer.unref?.();
    renewalTimers.push(timer);
  }

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

  async function worker(workerIndex, pickExecutionNode) {
    while (true) {
      const job = queue.shift();
      if (!job) return;

      const node = pickExecutionNode(cursor++);
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
          compute_receipt: response.receipt || null,
          deduplicated: response.deduplicated === true,
          artifacts: response.artifacts || []
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
        const failure = classifyAssignmentFailure(error);
        const reason = failure.reason;
        job.last_node_id = node.node_id;

        if (failure.quarantine_node) {
          node.healthy = false;
        }
        if (failure.disable_for_run) {
          node.available = false;
        }

        await emit({
          type: 'node.assignment.failed',
          agent_id: job.assignment.agent_id,
          node_id: node.node_id,
          endpoint: node.endpoint,
          attempt: job.attempts,
          reason,
          failure_class: failure.failure_class,
          retryable: failure.retryable,
          node_quarantined: failure.quarantine_node,
          node_disabled_for_run: failure.disable_for_run
        });

        const alternateCapacity = leased.some(
          (candidate) =>
            candidate.healthy !== false &&
            candidate.available !== false
        );

        if (
          failure.retryable &&
          job.attempts < maxAttempts &&
          alternateCapacity
        ) {
          queue.push(job);
        } else {
          failures.push({
            assignment: job.assignment,
            attempts: job.attempts,
            last_node_id: node.node_id,
            reason,
            failure_class: failure.failure_class,
            retryable: failure.retryable,
            node_quarantined: failure.quarantine_node,
            node_disabled_for_run: failure.disable_for_run
          });
          results[job.index] = {
            status: 'failed',
            assignment: job.assignment,
            idempotency_key: job.assignment.idempotency_key || null,
            attempts: job.attempts,
            duration_ms: job.total_duration_ms,
            last_node_id: node.node_id,
            reason,
            failure_class: failure.failure_class,
            retryable: failure.retryable,
            node_quarantined: failure.quarantine_node,
            node_disabled_for_run: failure.disable_for_run
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

  const executionNodes = placementRing;
  const pickExecutionNode = (cursorValue) => pickNode(executionNodes, cursorValue);

  try {
    await Promise.all(
      Array.from({ length: workerCount }, (_, index) => worker(index, pickExecutionNode))
    );
  } finally {
    renewalsStopped = true;
    for (const timer of renewalTimers) clearInterval(timer);

    await Promise.allSettled(
      leased.map((node) => releaseNode(node, leaseOptions))
    );
  }

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
      node_attestation_verified: node.attestation?.verified === true,
      device_fingerprint: node.attestation?.device_fingerprint || null,
      field_claim: node.attestation?.field_claim ?? null,
      healthy_at_end: node.healthy !== false,
      available_at_end: node.available !== false
    })),
    rejected_nodes: [...resolved.rejected, ...resourceRejected],
    lease_failures: leaseFailures,
    events: [...renewalEvents, ...events],
    lease_renewals: {
      supported_nodes: leased.filter((node) => node.lease_renewal_supported === true).length,
      renewed: renewalEvents.filter((event) => event.type === 'lease.renewed').length,
      failed: renewalEvents.filter((event) => event.type === 'lease.renewal.failed').length
    },
    portable_artifacts: results.reduce(
      (count, row) => count + Number(row?.artifacts?.length || 0),
      0
    ),
    results,
    failures
  };
}
