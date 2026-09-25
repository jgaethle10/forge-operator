import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { bootstrapPrivateOrigin } from '../core/bootstrap/private-origin.mjs';
import { KaidanceRuntime, startKaidanceHealthService } from '../collider/runtime.mjs';
import { createNodeAttestation } from './device-identity.mjs';
import { SystemiaCoreResidentSupervisor } from '../core/resident-supervisor.mjs';
import { runRegisteredAssignment } from '../saban/registered-worker.mjs';
import { startChumPublicOrigin } from '../chum/public-origin-runtime.mjs';
import { startOutboundCapacityBroker } from '../network/outbound-capacity-broker.mjs';

const CODE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

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

function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o750 });
  const tmp = `${file}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, file);
}

function safeMissionSourceKey(value) {
  const key = String(value || '').trim();
  if (!/^[a-zA-Z0-9._-]{1,96}$/.test(key)) {
    throw new Error('mission_source_key_invalid');
  }
  return key;
}

function validateMissionIngressSnapshot(snapshot) {
  if (!snapshot || snapshot.schema !== 'evercraft.kaidance.mission-snapshot.v1') {
    throw new Error('mission_snapshot_schema_invalid');
  }
  const counts = snapshot.counts || {};
  const scanned = Math.max(0, Number(counts.scanned || 0));
  const changed = Math.max(0, Number(counts.changed || 0));
  const admitted = Math.max(0, Number(counts.admitted || 0));
  const held = Math.max(0, Number(counts.held || 0));
  if (changed > scanned) throw new Error('mission_snapshot_changed_exceeds_scanned');
  if (admitted + held > changed) {
    throw new Error('mission_snapshot_disposition_exceeds_changed');
  }
  return {
    ...snapshot,
    counts: { scanned, changed, admitted, held },
    snapshot_ref: String(snapshot.snapshot_ref || ''),
    observed_at: String(snapshot.observed_at || ''),
    evidence_refs: Array.isArray(snapshot.evidence_refs)
      ? snapshot.evidence_refs.map(String).slice(0, 500)
      : [],
  };
}

function bootIdHash() {
  try {
    const file = '/proc/sys/kernel/random/boot_id';
    if (!fs.existsSync(file)) return null;
    return `sha256:${sha(fs.readFileSync(file, 'utf8').trim())}`;
  } catch {
    return null;
  }
}

function executableAvailable(command) {
  const result = spawnSync(command, ['-version'], {
    stdio: 'ignore'
  });
  return result.status === 0;
}

async function writeHashedRequest(req, target, maxBytes) {
  const hash = createHash('sha256');
  let bytes = 0;
  const stream = fs.createWriteStream(target, { mode: 0o600 });

  try {
    for await (const chunk of req) {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        throw new Error('staged_blob_too_large');
      }
      hash.update(chunk);
      if (!stream.write(chunk)) await once(stream, 'drain');
    }
    stream.end();
    await once(stream, 'finish');
    return {
      bytes,
      digest: hash.digest('hex')
    };
  } catch (error) {
    stream.destroy();
    fs.rmSync(target, { force: true });
    throw error;
  }
}

function configuredExecutableAvailable({
  enabled,
  executable
}) {
  if (String(enabled || '').toLowerCase() !== 'true') return false;
  const command = String(executable || '').trim();
  if (!command) return false;
  if (path.isAbsolute(command)) return fs.existsSync(command);
  return executableAvailable(command);
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
  deviceIdentity = null,
  maxStagedBlobBytes = Number(process.env.EVERCRAFT_MAX_STAGED_BLOB_BYTES || 2147483648),
} = {}) {
  if (!root) throw new Error('root is required');
  const loopbackHost = host === '127.0.0.1' || host === '::1' || host === 'localhost';
  const allocatorTokenHash = allocatorToken ? sha(String(allocatorToken)) : null;
  if (!loopbackHost && !allocatorTokenHash) {
    throw new Error('allocatorToken is required when Evercraft Compute listens beyond loopback');
  }
  if (deviceIdentity && String(deviceIdentity.node_id || '') !== String(nodeId)) {
    throw new Error('deviceIdentity node_id must match Compute nodeId');
  }
  const allowedRoot = path.resolve(root);
  const processStartedAt = new Date(Date.now() - process.uptime() * 1000).toISOString();
  const hostBootIdHash = bootIdHash();
  const chain = new ReceiptChain(nodeId);
  const executableCapabilities = {
    ffmpeg: executableAvailable('ffmpeg'),
    ffprobe: executableAvailable('ffprobe')
  };
  const serviceCapabilities = {
    forensiscope_transcription: configuredExecutableAvailable({
      enabled: process.env.FORENSISCOPE_TRANSCRIBE_ENABLED,
      executable: process.env.FORENSISCOPE_TRANSCRIBE_EXECUTABLE
    })
  };
  const leases = new Map();
  const services = new Map();
  const stagedBlobs = new Map();

  const stagedLeaseDir = (leaseId) =>
    path.join(allowedRoot, '.evercraft', 'staged', String(leaseId));

  const cleanupStagedLease = (leaseId) => {
    stagedBlobs.delete(leaseId);
    fs.rmSync(stagedLeaseDir(leaseId), { recursive: true, force: true });
  };

  const stagedBlobFor = (leaseId, digest) =>
    stagedBlobs.get(leaseId)?.get(digest) || null;
  const supported = new Set([
    'systemia.private-core-origin.v1',
    'systemia.core-supervisor.v1',
    'systemia.kaidance-collider.v1',
    'systemia.chum-public-origin.v1',
    'systemia.remote-capacity-broker.v1',
    'saban.logical-agent',
    'saban.multiplier-assignment.v1',
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
    for (const [leaseId, lease] of leases.entries()) {
      if (lease.expires_at < now) {
        cleanupStagedLease(leaseId);
        leases.delete(leaseId);
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
          device_fingerprint: deviceIdentity?.fingerprint || null,
          attestation_supported: Boolean(deviceIdentity),
          capacity_hint: {
            cpu_units: Math.max(1, os.cpus()?.length || 1),
            memory_mb: Math.max(64, Math.floor(os.totalmem() / 1024 / 1024)),
            executables: executableCapabilities,
            services: serviceCapabilities
          },
          expires_at: new Date(Date.now() + 60_000).toISOString(),
        });
      }

      if (req.method === 'POST' && req.url === '/v1/attest') {
        if (!deviceIdentity) {
          return send(res, 503, { error: 'device_identity_unavailable' });
        }
        if (allocatorTokenHash) {
          const authorization = String(req.headers.authorization || '');
          const presented = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
          if (!presented || sha(presented) !== allocatorTokenHash) {
            return send(res, 401, { error: 'allocator_auth_required' });
          }
        }
        const body = await readJson(req);
        const attestation = createNodeAttestation({
          identity: deviceIdentity,
          nonce: body.nonce,
          supportedWorkloads: [...supported],
          processStartedAt,
          bootIdHash: hostBootIdHash,
        });
        return send(res, 200, {
          ok: true,
          attestation,
          receipt: chain.issue('node.attestation.issued', {
            device_fingerprint: deviceIdentity.fingerprint,
            nonce_hash: sha(String(body.nonce || '')),
          }),
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

      const blobUpload = req.url?.match(/^\/v1\/leases\/([^/]+)\/blobs\/([a-f0-9]{64})$/i);
      if (req.method === 'PUT' && blobUpload) {
        const leaseId = blobUpload[1];
        const digest = blobUpload[2].toLowerCase();
        const lease = leases.get(leaseId);
        const authorization = String(req.headers.authorization || '');
        const presented = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';

        if (!lease || !presented || lease.token_hash !== sha(presented)) {
          return send(res, 401, { error: 'invalid_lease' });
        }
        if (lease.expires_at < Date.now()) {
          return send(res, 410, { error: 'expired_lease' });
        }
        if (lease.workload_class !== 'saban.multiplier-assignment.v1') {
          return send(res, 422, { error: 'blob_staging_not_allowed_for_workload' });
        }

        const extension = String(req.headers['x-evercraft-blob-extension'] || '.bin').toLowerCase();
        if (!/^\.[a-z0-9]{1,8}$/.test(extension)) {
          return send(res, 422, { error: 'invalid_blob_extension' });
        }

        const existing = stagedBlobFor(leaseId, digest);
        if (existing) {
          return send(res, 200, {
            ok: true,
            blob_ref: `sha256:${digest}`,
            size_bytes: existing.size_bytes,
            extension: existing.extension,
            deduplicated: true,
            receipt: chain.issue('blob.stage.reused', {
              lease_id: leaseId,
              sha256: `sha256:${digest}`,
              size_bytes: existing.size_bytes
            })
          });
        }

        const dir = stagedLeaseDir(leaseId);
        fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
        const temp = path.join(dir, `.${digest}.${randomBytes(4).toString('hex')}.partial`);
        const target = path.join(dir, `${digest}${extension}`);
        const written = await writeHashedRequest(req, temp, maxStagedBlobBytes);

        if (written.digest !== digest) {
          fs.rmSync(temp, { force: true });
          return send(res, 422, {
            error: 'staged_blob_hash_mismatch',
            expected: `sha256:${digest}`,
            observed: `sha256:${written.digest}`
          });
        }

        fs.renameSync(temp, target);
        if (!stagedBlobs.has(leaseId)) stagedBlobs.set(leaseId, new Map());
        stagedBlobs.get(leaseId).set(digest, {
          path: target,
          size_bytes: written.bytes,
          extension
        });

        return send(res, 201, {
          ok: true,
          blob_ref: `sha256:${digest}`,
          size_bytes: written.bytes,
          extension,
          deduplicated: false,
          receipt: chain.issue('blob.staged', {
            lease_id: leaseId,
            sha256: `sha256:${digest}`,
            size_bytes: written.bytes
          })
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

        if (workloadClass === 'saban.multiplier-assignment.v1') {
          const software = String(body.input?.software || '');
          let assignment = body.input?.assignment;
          if (!software || !assignment) {
            return send(res, 422, { error: 'registered_assignment_required' });
          }

          const blobDigestRaw = assignment?.item?.raw?.source?.blob_sha256;
          if (blobDigestRaw) {
            const digest = String(blobDigestRaw).replace(/^sha256:/, '').toLowerCase();
            if (!/^[a-f0-9]{64}$/.test(digest)) {
              return send(res, 422, { error: 'invalid_staged_blob_reference' });
            }
            const staged = stagedBlobFor(body.lease_id, digest);
            if (!staged) {
              return send(res, 422, { error: 'staged_blob_not_found' });
            }
            assignment = structuredClone(assignment);
            assignment.item.raw.source = {
              ...assignment.item.raw.source,
              path: staged.path,
              sha256: `sha256:${digest}`
            };
          }

          const workerResult = await runRegisteredAssignment({
            software,
            assignment,
            rootDir: CODE_ROOT,
            executionContext: {
              media_roots: [stagedLeaseDir(body.lease_id)]
            }
          });
          const checkpoint = {
            step: Number(body.checkpoint?.step || 0) + 1,
            state: {
              software_id: workerResult.software_id,
              agent_id: workerResult.agent_id,
              idempotency_key: workerResult.idempotency_key || null,
              work: workerResult.work,
              result: workerResult.result,
            },
            last_node: nodeId,
          };
          const receipt = chain.issue('saban.assignment.executed', {
            lease_id: body.lease_id,
            workload_class: body.workload_class,
            software_id: workerResult.software_id,
            agent_id: workerResult.agent_id,
            idempotency_key: workerResult.idempotency_key || null,
          });
          return send(res, 200, {
            ok: true,
            node_id: nodeId,
            workload_class: body.workload_class,
            result: workerResult,
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

        if (workloadClass === 'systemia.chum-public-origin.v1') {
          const defaultPublicRoot = path.join(CODE_ROOT, 'public');
          const requestedPublicRoot = body.input?.public_root
            ? path.resolve(String(body.input.public_root))
            : defaultPublicRoot;
          const admittedPublicRoot =
            isWithin(allowedRoot, requestedPublicRoot) ||
            isWithin(defaultPublicRoot, requestedPublicRoot);

          if (!admittedPublicRoot) {
            return send(res, 403, { error: 'chum_public_root_outside_admitted_roots' });
          }

          const serviceHost = String(body.input?.host || '127.0.0.1');
          const loopbackService =
            serviceHost === '127.0.0.1' ||
            serviceHost === '::1' ||
            serviceHost === 'localhost';
          if (!loopbackService && body.input?.allow_public_bind !== true) {
            return send(res, 403, { error: 'explicit_public_bind_authority_required' });
          }

          const runtime = await startChumPublicOrigin({
            publicRoot: requestedPublicRoot,
            host: serviceHost,
            port: Number(body.input?.port || 0),
            publicOrigin: String(body.input?.public_origin || ''),
          });
          const serviceId = `svc_${randomBytes(8).toString('hex')}`;
          services.set(serviceId, {
            lease_id: body.lease_id,
            workload_class: body.workload_class,
            runtime,
            service: runtime,
          });

          const result = {
            schema: 'evercraft.compute.resident-service.v1',
            service_id: serviceId,
            workload_class: body.workload_class,
            service_url: null,
            local_url: runtime.url,
            health_path: `/v1/services/${serviceId}/health`,
            public_origin_candidate: runtime.publicOrigin || null,
            instance_id: runtime.instanceId,
            read_only_public_origin: true,
          };
          const receipt = chain.issue('service.started', {
            lease_id: body.lease_id,
            service_id: serviceId,
            workload_class: body.workload_class,
            result_schema: result.schema,
            instance_id: runtime.instanceId,
          });
          return send(res, 200, {
            ok: true,
            node_id: nodeId,
            workload_class: body.workload_class,
            result,
            receipt,
          });
        }

        if (workloadClass === 'systemia.remote-capacity-broker.v1') {
          const stateRoot = path.resolve(String(body.input?.state_root || ''));
          if (!stateRoot || !isWithin(allowedRoot, stateRoot)) {
            return send(res, 403, { error: 'remote_broker_state_outside_admitted_root' });
          }

          const authorizedDevices =
            body.input?.authorized_devices &&
            typeof body.input.authorized_devices === 'object' &&
            !Array.isArray(body.input.authorized_devices)
              ? body.input.authorized_devices
              : {};
          const entries = Object.entries(authorizedDevices);
          for (const [fingerprint, expectedNode] of entries) {
            if (!/^sha256:[a-f0-9]{64}$/i.test(String(fingerprint))) {
              return send(res, 422, { error: 'remote_broker_device_fingerprint_invalid' });
            }
            if (
              String(expectedNode) !== '*' &&
              !/^[a-zA-Z0-9._-]{1,128}$/.test(String(expectedNode))
            ) {
              return send(res, 422, { error: 'remote_broker_node_id_invalid' });
            }
          }

          const broker = await startOutboundCapacityBroker({
            host: '127.0.0.1',
            port: Number(body.input?.port || 0),
            stateDir: stateRoot,
            authorizedDevices,
            challengeTtlMs: Number(body.input?.challenge_ttl_ms || 60_000),
            sessionTtlMs: Number(body.input?.session_ttl_ms || 30 * 60_000),
            commandTimeoutMs: Number(body.input?.command_timeout_ms || 15_000),
            pollWaitMs: Number(body.input?.poll_wait_ms || 5_000),
            capacityFreshMs: Number(body.input?.capacity_fresh_ms || 15_000),
          });
          const serviceId = `svc_${randomBytes(8).toString('hex')}`;
          services.set(serviceId, {
            lease_id: body.lease_id,
            workload_class: body.workload_class,
            runtime: broker,
            service: broker,
          });

          const result = {
            schema: 'evercraft.compute.resident-service.v1',
            service_id: serviceId,
            workload_class: body.workload_class,
            service_url: null,
            local_url: broker.endpoint,
            health_path: `/v1/services/${serviceId}/health`,
            public_route_required: true,
            public_health_path: '/v1/remote/health',
            instance_id: broker.instance_id,
            secure_envelope_schema: 'evercraft.secure-envelope.v1',
          };
          const receipt = chain.issue('service.started', {
            lease_id: body.lease_id,
            service_id: serviceId,
            workload_class: body.workload_class,
            result_schema: result.schema,
            instance_id: broker.instance_id,
          });
          return send(res, 200, {
            ok: true,
            node_id: nodeId,
            workload_class: body.workload_class,
            result,
            receipt,
          });
        }

        if (workloadClass === 'systemia.core-supervisor.v1') {
          const stateRoot = path.resolve(String(body.input?.state_root || ''));
          const yardStateDir = path.resolve(String(body.input?.yard_state_dir || ''));
          const kaidanceDeploymentId = String(body.input?.kaidance_deployment_id || '').trim();

          if (!stateRoot || !yardStateDir || !kaidanceDeploymentId) {
            return send(res, 422, { error: 'core_supervisor_runtime_bindings_required' });
          }
          if (!isWithin(allowedRoot, stateRoot) || !isWithin(allowedRoot, yardStateDir)) {
            return send(res, 403, { error: 'core_supervisor_path_outside_admitted_root' });
          }

          const workspaceRoot = path.join(stateRoot, 'workspace');
          const legacyOut = path.join(workspaceRoot, 'legacy-rescue-watch');
          const node001Field = path.join(workspaceRoot, 'node001-field', 'megatron');
          const node001Status = path.join(workspaceRoot, 'node001-field', 'megatron-status');
          const publisherLedger = path.join(workspaceRoot, 'mission-publisher', 'ledger.json');
          const missionSourcesConfig = path.join(workspaceRoot, 'mission-sources.json');
          fs.mkdirSync(workspaceRoot, { recursive: true, mode: 0o750 });
          atomicJson(missionSourcesConfig, {
            schema: 'evercraft.kaidance.mission-fabric-config.v1',
            sources: [
              {
                source_key: 'legacy-rescue-opportunity-watch',
                path: 'legacy-rescue-watch/mission-snapshot.json',
                required: false,
                stale_after_seconds: 900,
              },
              {
                source_key: 'node001-megatron-field-certification',
                path: 'node001-field/megatron-status/mission-snapshot.json',
                required: true,
                stale_after_seconds: 900,
              },
            ],
          });

          const serviceEnv = {
            NODE_ENV: String(process.env.NODE_ENV || 'production'),
            SYSTEMIA_YARD_STATE_DIR: yardStateDir,
            KAIDANCE_DEPLOYMENT_ID: kaidanceDeploymentId,
            SYSTEMIA_WORKSPACE_ROOT: workspaceRoot,
            SYSTEMIA_LEGACY_RESCUE_SIGNALS_FILE: path.join(
              workspaceRoot,
              'legacy-rescue-watch',
              'signals.json'
            ),
            SYSTEMIA_LEGACY_RESCUE_OUT_DIR: legacyOut,
            SYSTEMIA_NODE001_FIELD_DIR: node001Field,
            SYSTEMIA_NODE001_STATUS_DIR: node001Status,
            SYSTEMIA_MISSION_SOURCES_CONFIG: missionSourcesConfig,
            SYSTEMIA_MISSION_PUBLISHER_LEDGER: publisherLedger,
          };

          const supervisor = new SystemiaCoreResidentSupervisor({
            repoRoot: CODE_ROOT,
            configPath: path.join(CODE_ROOT, 'systemia', 'core', 'resident-services.json'),
            stateDir: path.join(stateRoot, 'supervisor'),
            env: serviceEnv,
          });
          const health = supervisor.start({ immediateCycles: true });
          const serviceId = `svc_${randomBytes(8).toString('hex')}`;
          const service = {
            close: async () => supervisor.stop(),
          };
          services.set(serviceId, {
            lease_id: body.lease_id,
            workload_class: body.workload_class,
            runtime: supervisor,
            service,
          });
          const result = {
            schema: 'evercraft.compute.resident-service.v1',
            service_id: serviceId,
            workload_class: body.workload_class,
            service_url: null,
            health_path: `/v1/services/${serviceId}/health`,
            supervised_service_count: health.service_count,
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

        if (workloadClass === 'systemia.kaidance-collider.v1') {
          const stateRoot = path.resolve(String(body.input?.state_root || ''));
          const snapshotPath = path.resolve(String(
            body.input?.snapshot_path || path.join(stateRoot, 'mission-snapshot.json')
          ));
          if (!stateRoot || !isWithin(allowedRoot, stateRoot) || !isWithin(allowedRoot, snapshotPath)) {
            return send(res, 403, { error: 'kaidance_path_outside_admitted_root' });
          }

          const managedPolicies = Array.isArray(body.input?.mission_source_policies)
            ? body.input.mission_source_policies
            : null;
          let missionFabricRoot = '';
          let missionFabricConfigPath = body.input?.mission_fabric_config_path
            ? path.resolve(String(body.input.mission_fabric_config_path))
            : '';
          let missionFabricAllowedRoot = body.input?.mission_fabric_allowed_root
            ? path.resolve(String(body.input.mission_fabric_allowed_root))
            : (missionFabricConfigPath ? path.dirname(missionFabricConfigPath) : '');

          if (managedPolicies) {
            if (missionFabricConfigPath) {
              return send(res, 422, { error: 'managed_and_external_mission_fabric_conflict' });
            }
            missionFabricRoot = path.join(stateRoot, 'mission-fabric');
            const providersDir = path.join(missionFabricRoot, 'providers');
            fs.mkdirSync(providersDir, { recursive: true, mode: 0o750 });
            const seen = new Set();
            const sources = managedPolicies.map((policy) => {
              const sourceKey = safeMissionSourceKey(policy?.source_key);
              if (seen.has(sourceKey)) throw new Error('mission_source_key_duplicate');
              seen.add(sourceKey);
              return {
                source_key: sourceKey,
                path: `providers/${sourceKey}.json`,
                required: policy?.required === true,
                stale_after_seconds: Math.max(30, Number(policy?.stale_after_seconds || 900)),
              };
            });
            missionFabricConfigPath = path.join(missionFabricRoot, 'mission-sources.json');
            missionFabricAllowedRoot = missionFabricRoot;
            atomicJson(missionFabricConfigPath, {
              schema: 'evercraft.kaidance.mission-fabric-config.v1',
              sources,
            });
          }

          if (missionFabricConfigPath && (
            !isWithin(allowedRoot, missionFabricConfigPath) ||
            !isWithin(allowedRoot, missionFabricAllowedRoot)
          )) {
            return send(res, 403, { error: 'kaidance_mission_fabric_outside_admitted_root' });
          }

          const runtime = new KaidanceRuntime({
            root: stateRoot,
            colliderKey: String(body.input?.collider_key || 'systemia-collider'),
            heartbeatTargetSeconds: Number(body.input?.heartbeat_target_seconds || 300),
            graceSeconds: Number(body.input?.grace_seconds || 90),
            deploymentReceipt: String(body.input?.deployment_receipt || ''),
            snapshotPath,
            missionFabricConfigPath,
            missionFabricAllowedRoot,
            initialCheckpoint: body.input?.initial_checkpoint || null,
          });
          const serviceId = `svc_${randomBytes(8).toString('hex')}`;
          const service = await startKaidanceHealthService({
            runtime,
            host: '127.0.0.1',
            port: 0,
          });
          services.set(serviceId, {
            lease_id: body.lease_id,
            workload_class: body.workload_class,
            runtime,
            service,
            mission_fabric_root: missionFabricRoot || null,
            mission_fabric_config_path: missionFabricConfigPath || null,
          });
          const result = {
            schema: 'evercraft.compute.resident-service.v1',
            service_id: serviceId,
            workload_class: body.workload_class,
            service_url: null,
            health_path: `/v1/services/${serviceId}/health`,
            mission_ingress_supported: Boolean(missionFabricRoot),
            mission_ingress_path: missionFabricRoot
              ? `/v1/services/${serviceId}/missions`
              : null,
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

      const remoteControlGrant = req.url?.match(
        /^\/v1\/services\/([^/]+)\/remote-control-grant$/
      );
      if (req.method === 'POST' && remoteControlGrant) {
        const entry = services.get(remoteControlGrant[1]);
        if (!entry) return send(res, 404, { error: 'service_not_found' });
        const body = await readJson(req);
        const lease = leases.get(entry.lease_id);
        if (!lease || lease.token_hash !== sha(body.token || '')) {
          return send(res, 401, { error: 'invalid_lease' });
        }
        if (entry.workload_class !== 'systemia.remote-capacity-broker.v1') {
          return send(res, 422, { error: 'remote_control_grant_not_supported' });
        }
        const grant = entry.runtime.controlGrant(String(body.node_id || ''));
        if (!grant) return send(res, 404, { error: 'remote_node_control_grant_unavailable' });
        return send(res, 200, {
          ok: true,
          node_id: grant.node_id,
          device_fingerprint: grant.device_fingerprint,
          control_token: grant.allocator_token,
          receipt: chain.issue('remote-capacity.control-grant.read', {
            service_id: remoteControlGrant[1],
            lease_id: entry.lease_id,
            workload_class: entry.workload_class,
            remote_node_id: grant.node_id,
            device_fingerprint: grant.device_fingerprint,
          }),
        });
      }

      const remotePendingEnrollment = req.url?.match(
        /^\/v1\/services\/([^/]+)\/remote-pending-enrollments$/
      );
      if (req.method === 'POST' && remotePendingEnrollment) {
        const entry = services.get(remotePendingEnrollment[1]);
        if (!entry) return send(res, 404, { error: 'service_not_found' });
        const body = await readJson(req);
        const lease = leases.get(entry.lease_id);
        if (!lease || lease.token_hash !== sha(body.token || '')) {
          return send(res, 401, { error: 'invalid_lease' });
        }
        if (entry.workload_class !== 'systemia.remote-capacity-broker.v1') {
          return send(res, 422, { error: 'remote_pending_enrollments_not_supported' });
        }
        const pending = entry.runtime.pendingEnrollmentRequests();
        return send(res, 200, {
          ok: true,
          pending,
          count: pending.length,
          receipt: chain.issue('remote-capacity.pending-enrollments.read', {
            service_id: remotePendingEnrollment[1],
            lease_id: entry.lease_id,
            workload_class: entry.workload_class,
            pending_count: pending.length,
          }),
        });
      }

      const remoteDeviceAuthorization = req.url?.match(
        /^\/v1\/services\/([^/]+)\/remote-device-(authorize|revoke)$/
      );
      if (req.method === 'POST' && remoteDeviceAuthorization) {
        const entry = services.get(remoteDeviceAuthorization[1]);
        if (!entry) return send(res, 404, { error: 'service_not_found' });
        const body = await readJson(req);
        const lease = leases.get(entry.lease_id);
        if (!lease || lease.token_hash !== sha(body.token || '')) {
          return send(res, 401, { error: 'invalid_lease' });
        }
        if (entry.workload_class !== 'systemia.remote-capacity-broker.v1') {
          return send(res, 422, { error: 'remote_device_authorization_not_supported' });
        }

        const action = remoteDeviceAuthorization[2];
        let decision;
        try {
          const args = {
            deviceFingerprint: body.device_fingerprint,
            nodeId: body.node_id,
            approvalRef: body.approval_ref,
          };
          decision = action === 'authorize'
            ? entry.runtime.authorizeDevice(args)
            : entry.runtime.revokeDevice(args);
        } catch (error) {
          return send(res, 422, {
            error: String(error?.message || error),
          });
        }

        return send(res, 200, {
          ok: true,
          action,
          node_id: decision.node_id,
          device_fingerprint: decision.device_fingerprint,
          approval_ref: decision.approval_ref,
          decision_receipt_hash: decision.receipt_hash,
          live_session_disconnected:
            decision.live_session_disconnected ?? null,
          receipt: chain.issue(`remote-capacity.device.${action}`, {
            service_id: remoteDeviceAuthorization[1],
            lease_id: entry.lease_id,
            workload_class: entry.workload_class,
            remote_node_id: decision.node_id,
            device_fingerprint: decision.device_fingerprint,
            decision_receipt_hash: decision.receipt_hash,
            approval_ref: decision.approval_ref,
          }),
        });
      }

      const missionIngress = req.url?.match(/^\/v1\/services\/([^/]+)\/missions\/([^/]+)$/);
      if (req.method === 'POST' && missionIngress) {
        const entry = services.get(missionIngress[1]);
        if (!entry) return send(res, 404, { error: 'service_not_found' });
        const body = await readJson(req);
        const lease = leases.get(entry.lease_id);
        if (!lease || lease.token_hash !== sha(body.token || '')) {
          return send(res, 401, { error: 'invalid_lease' });
        }
        if (entry.workload_class !== 'systemia.kaidance-collider.v1' ||
            !entry.mission_fabric_root ||
            !entry.mission_fabric_config_path) {
          return send(res, 422, { error: 'mission_ingress_not_supported' });
        }

        let sourceKey;
        try {
          sourceKey = safeMissionSourceKey(missionIngress[2]);
        } catch (error) {
          return send(res, 422, { error: String(error?.message || error) });
        }
        const config = JSON.parse(fs.readFileSync(entry.mission_fabric_config_path, 'utf8'));
        const source = (config.sources || []).find((row) => row.source_key === sourceKey);
        if (!source) return send(res, 404, { error: 'mission_source_not_declared' });

        let snapshot;
        try {
          snapshot = validateMissionIngressSnapshot(body.snapshot);
        } catch (error) {
          return send(res, 422, { error: String(error?.message || error) });
        }
        const destination = path.resolve(
          path.dirname(entry.mission_fabric_config_path),
          String(source.path || '')
        );
        if (!isWithin(entry.mission_fabric_root, destination)) {
          return send(res, 403, { error: 'mission_source_path_outside_fabric_root' });
        }
        atomicJson(destination, snapshot);

        const receipt = chain.issue('mission.snapshot.accepted', {
          service_id: missionIngress[1],
          lease_id: entry.lease_id,
          workload_class: entry.workload_class,
          source_key: sourceKey,
          snapshot_ref: snapshot.snapshot_ref || null,
          snapshot_hash: `sha256:${sha(JSON.stringify(snapshot))}`,
        });
        return send(res, 200, {
          ok: true,
          source_key: sourceKey,
          snapshot_ref: snapshot.snapshot_ref || null,
          receipt,
        });
      }

      const serviceCycle = req.url?.match(/^\/v1\/services\/([^/]+)\/cycle$/);
      if (req.method === 'POST' && serviceCycle) {
        const entry = services.get(serviceCycle[1]);
        if (!entry) return send(res, 404, { error: 'service_not_found' });
        const body = await readJson(req);
        const lease = leases.get(entry.lease_id);
        if (!lease || lease.token_hash !== sha(body.token || '')) {
          return send(res, 401, { error: 'invalid_lease' });
        }
        if (entry.workload_class !== 'systemia.kaidance-collider.v1') {
          return send(res, 422, { error: 'cycle_trigger_not_supported' });
        }
        const result = await entry.runtime.runOnce(new Date());
        return send(res, 200, {
          ok: true,
          service_id: serviceCycle[1],
          cycle_result: result,
          receipt: chain.issue('service.cycle.attempted', {
            service_id: serviceCycle[1],
            lease_id: entry.lease_id,
            workload_class: entry.workload_class,
            result: result.ok === true ? 'completed' : `held:${result.hold || 'unknown'}`,
          }),
        });
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
        cleanupStagedLease(leaseId);
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
