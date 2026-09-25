import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { allocatorTokenForOffer, discoverEligibleCapacity } from './capacity-resolver.mjs';
import { verifyNodeAttestation } from '../compute/device-identity.mjs';
import { buildKaidancePulse } from '../collider/pulse.mjs';
import { createFieldEnrollment, evaluateFieldAttestation } from './field-attestation.mjs';

const sha = (value) => createHash('sha256').update(
  typeof value === 'string' ? value : JSON.stringify(value)
).digest('hex');

function immutableRelease(ref) {
  const value = String(ref || '').trim();
  return /^[a-f0-9]{40,64}$/i.test(value) ||
    /^sha256:[a-f0-9]{64}$/i.test(value) ||
    /@sha256:[a-f0-9]{64}$/i.test(value);
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
  });
  const body = await response.json();
  if (!response.ok) {
    const error = new Error(body?.error || `HTTP ${response.status}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

export class YardOperator {
  constructor({ stateDir } = {}) {
    if (!stateDir) throw new Error('stateDir is required');
    this.stateDir = path.resolve(stateDir);
    this.deployments = new Map();
    this.leaseKeepers = new Map();
    this.checkpointKeepers = new Map();
    fs.mkdirSync(this.stateDir, { recursive: true, mode: 0o750 });
    fs.mkdirSync(path.join(this.stateDir, '.lease-secrets'), { recursive: true, mode: 0o700 });
    fs.mkdirSync(path.join(this.stateDir, '.checkpoints'), { recursive: true, mode: 0o700 });
    fs.mkdirSync(path.join(this.stateDir, '.field-enrollments'), { recursive: true, mode: 0o700 });
    fs.mkdirSync(path.join(this.stateDir, '.field-attestations'), { recursive: true, mode: 0o700 });
  }

  #safeId(deploymentId) {
    return String(deploymentId || '').replace(/[^a-zA-Z0-9._-]/g, '_');
  }

  #persist(record) {
    fs.writeFileSync(
      path.join(this.stateDir, `${this.#safeId(record.deployment_id)}.json`),
      JSON.stringify(record, null, 2) + '\n',
      { mode: 0o600 }
    );
  }

  #secretFile(deploymentId) {
    return path.join(this.stateDir, '.lease-secrets', `${this.#safeId(deploymentId)}.json`);
  }

  #saveLeaseSecret(deploymentId, value) {
    fs.writeFileSync(
      this.#secretFile(deploymentId),
      JSON.stringify(value) + '\n',
      { mode: 0o600 }
    );
  }

  #loadLeaseSecret(deploymentId) {
    const file = this.#secretFile(deploymentId);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  }

  #fingerprintFileName(fingerprint) {
    return String(fingerprint || '').replace(/[^a-zA-Z0-9._-]/g, '_');
  }

  #fieldEnrollmentFile(fingerprint) {
    return path.join(
      this.stateDir,
      '.field-enrollments',
      `${this.#fingerprintFileName(fingerprint)}.json`
    );
  }

  #loadFieldEnrollment(fingerprint) {
    const file = this.#fieldEnrollmentFile(fingerprint);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  }

  #fieldAttestationFile(deploymentId) {
    return path.join(
      this.stateDir,
      '.field-attestations',
      `${this.#safeId(deploymentId)}.json`
    );
  }

  #checkpointFile(deploymentId) {
    return path.join(this.stateDir, '.checkpoints', `${this.#safeId(deploymentId)}.json`);
  }

  #saveCheckpoint(deploymentId, checkpointRecord) {
    fs.writeFileSync(
      this.#checkpointFile(deploymentId),
      JSON.stringify(checkpointRecord, null, 2) + '\n',
      { mode: 0o600 }
    );
  }

  #loadCheckpoint(deploymentId) {
    const file = this.#checkpointFile(deploymentId);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  }

  enrollFieldDevice({
    deviceFingerprint,
    nodeId,
    evidence,
  } = {}) {
    const enrollment = createFieldEnrollment({
      deviceFingerprint,
      nodeId,
      evidence,
    });
    fs.writeFileSync(
      this.#fieldEnrollmentFile(enrollment.device_fingerprint),
      JSON.stringify(enrollment, null, 2) + '\n',
      { mode: 0o600 }
    );
    return enrollment;
  }

  async attestDeployment(deploymentId, { maxAgeMs = 60_000 } = {}) {
    const record = this.deploymentStatus(deploymentId);
    const secret = this.#loadLeaseSecret(deploymentId);
    if (!record || !secret) throw new Error('deployment lease authority unavailable');
    if (record.receipt?.attestation_supported !== true) {
      return {
        schema: 'evercraft.yard.field-attestation.v1',
        deployment_id: deploymentId,
        verified: false,
        identity_verified: false,
        field_verified: false,
        reason: 'compute_attestation_not_supported',
        observed_at: new Date().toISOString(),
      };
    }

    const nonce = randomBytes(24).toString('hex');
    let issued;
    try {
      issued = await request(`${secret.capacity_endpoint}/v1/attest`, {
        method: 'POST',
        headers: secret.allocator_token
          ? { authorization: `Bearer ${secret.allocator_token}` }
          : {},
        body: JSON.stringify({ nonce }),
      });
    } catch (error) {
      return {
        schema: 'evercraft.yard.field-attestation.v1',
        deployment_id: deploymentId,
        verified: false,
        identity_verified: false,
        field_verified: false,
        reason: 'node_attestation_request_failed',
        detail: String(error?.message || error),
        observed_at: new Date().toISOString(),
      };
    }

    const identityVerification = verifyNodeAttestation({
      attestation: issued.attestation,
      expectedNonce: nonce,
      expectedNodeId: record.receipt?.capacity_node_id,
      maxAgeMs,
    });

    if (identityVerification.ok &&
        record.receipt?.capacity_device_fingerprint &&
        record.receipt.capacity_device_fingerprint !== identityVerification.device_fingerprint) {
      identityVerification.ok = false;
      identityVerification.reason = 'deployment_device_fingerprint_mismatch';
    }
    if (identityVerification.ok &&
        record.receipt?.capacity_runtime_release_ref &&
        record.receipt.capacity_runtime_release_ref !== identityVerification.runtime_release_ref) {
      identityVerification.ok = false;
      identityVerification.reason = 'deployment_runtime_release_mismatch';
    }
    if (identityVerification.ok &&
        record.receipt?.capacity_runtime_payload_digest &&
        record.receipt.capacity_runtime_payload_digest !== identityVerification.runtime_payload_digest) {
      identityVerification.ok = false;
      identityVerification.reason = 'deployment_runtime_payload_mismatch';
    }

    const enrollment = identityVerification.ok
      ? this.#loadFieldEnrollment(identityVerification.device_fingerprint)
      : null;
    const field = evaluateFieldAttestation({
      identityVerification,
      enrollment,
    });

    const body = {
      schema: 'evercraft.yard.field-attestation.v1',
      deployment_id: deploymentId,
      node_id: identityVerification.node_id || record.receipt?.capacity_node_id || null,
      device_fingerprint: identityVerification.device_fingerprint || null,
      runtime_release_ref: identityVerification.runtime_release_ref || null,
      runtime_payload_digest: identityVerification.runtime_payload_digest || null,
      identity_verified: Boolean(identityVerification.ok),
      field_verified: Boolean(field.verified),
      verified: Boolean(field.verified),
      reason: field.reason || identityVerification.reason || null,
      enrollment_receipt: field.enrollment_receipt || null,
      compute_attestation_receipt: issued.receipt?.receipt_hash || null,
      deployment_receipt: record.receipt?.receipt_hash || null,
      observed_at: new Date().toISOString(),
      verified_at: field.verified ? new Date().toISOString() : null,
    };
    const result = {
      ...body,
      receipt_hash: sha(body),
    };
    fs.writeFileSync(
      this.#fieldAttestationFile(deploymentId),
      JSON.stringify(result, null, 2) + '\n',
      { mode: 0o600 }
    );
    return result;
  }

  async getKaidancePulse(deploymentId, { continuity = null } = {}) {
    const record = this.deploymentStatus(deploymentId);
    if (!record) throw new Error('deployment not found');
    if (record.receipt?.workload_class !== 'systemia.kaidance-collider.v1') {
      throw new Error('deployment is not KAIDANCE');
    }

    const route = await this.verifyRoute(deploymentId);
    if (!route.ok || !route.health) {
      throw new Error(`KAIDANCE route is not healthy: ${route.state}`);
    }
    const fieldAttestation = await this.attestDeployment(deploymentId);
    return buildKaidancePulse({
      health: route.health,
      deployment: record,
      continuity,
      fieldAttestation,
    });
  }

  async deployRelease({
    deploymentId,
    releaseRef,
    workloadClass,
    capacityEndpoint,
    input = {},
    rollbackTarget,
    leaseTtlMs = 30_000,
    allocatorToken = '',
  } = {}) {
    if (!deploymentId) throw new Error('deploymentId is required');
    if (!immutableRelease(releaseRef)) throw new Error('releaseRef must be immutable');
    if (!workloadClass) throw new Error('workloadClass is required');
    if (!capacityEndpoint) throw new Error('capacityEndpoint is required');
    if (!rollbackTarget) throw new Error('rollbackTarget is required');

    const capacity = await request(`${capacityEndpoint}/v1/capacity`);
    if (capacity.protocol !== 'evercraft.capacity.v1') {
      throw new Error('capacity endpoint does not speak evercraft.capacity.v1');
    }
    if (!Array.isArray(capacity.supported_workloads) ||
        !capacity.supported_workloads.includes(workloadClass)) {
      throw new Error('requested workload is not supported by capacity offer');
    }

    const lease = await request(`${capacityEndpoint}/v1/leases`, {
      method: 'POST',
      headers: allocatorToken ? { authorization: `Bearer ${allocatorToken}` } : {},
      body: JSON.stringify({
        workload_class: workloadClass,
        requested_ttl_ms: leaseTtlMs,
      }),
    });

    let job;
    try {
      job = await request(`${capacityEndpoint}/v1/jobs`, {
        method: 'POST',
        body: JSON.stringify({
          lease_id: lease.lease_id,
          token: lease.token,
          workload_class: workloadClass,
          input,
        }),
      });
    } catch (error) {
      try {
        await request(`${capacityEndpoint}/v1/leases/${lease.lease_id}/release`, {
          method: 'POST',
          body: JSON.stringify({ token: lease.token }),
        });
      } catch {}
      throw error;
    }

    let healthState = 'workload_completed';
    let routeVerification = workloadClass === 'systemia.private-core-origin.v1'
      ? 'private_origin_not_publicly_routed'
      : 'not_verified';

    const managementHealthPath = String(job.result?.health_path || '');
    if (managementHealthPath) {
      const health = await request(new URL(managementHealthPath, capacityEndpoint).toString());
      if (workloadClass === 'systemia.kaidance-collider.v1') {
        if (health.state !== 'healthy' || health.coverage_receipt_valid !== true) {
          try {
            await request(`${capacityEndpoint}/v1/services/${job.result.service_id}/stop`, {
              method: 'POST',
              body: JSON.stringify({ token: lease.token }),
            });
          } catch {}
          throw new Error('KAIDANCE resident service failed initial health verification');
        }
        healthState = 'healthy';
        routeVerification = 'private_health_verified';
      }
    }

    const receiptBody = {
      schema: 'evercraft.yard.deployment-receipt.v1',
      deployment_id: deploymentId,
      release_ref: releaseRef,
      workload_class: workloadClass,
      runtime_fabric: 'Evercraft Compute',
      capacity_protocol: capacity.protocol,
      capacity_node_id: capacity.node_id,
      capacity_device_fingerprint: capacity.device_fingerprint || null,
      attestation_supported: Boolean(capacity.attestation_supported),
      capacity_runtime_release_ref: capacity.runtime_release_ref || null,
      capacity_runtime_payload_digest: capacity.runtime_payload_digest || null,
      lease_receipt_hash: lease.receipt?.receipt_hash || null,
      workload_receipt_hash: job.receipt?.receipt_hash || null,
      result_schema: job.result?.schema || null,
      live_url: job.result?.service_url || null,
      health_verification: healthState,
      route_verification: routeVerification,
      rollback_target: rollbackTarget,
      deployed_at: new Date().toISOString(),
    };
    const receipt = { ...receiptBody, receipt_hash: sha(receiptBody) };

    let receiptBinding = null;
    if (job.result?.service_id) {
      try {
        receiptBinding = await request(
          `${capacityEndpoint}/v1/services/${job.result.service_id}/deployment-receipt`,
          {
            method: 'POST',
            body: JSON.stringify({
              token: lease.token,
              receipt_ref: receipt.receipt_hash,
            }),
          }
        );
      } catch (error) {
        try {
          await request(
            `${capacityEndpoint}/v1/services/${job.result.service_id}/stop`,
            {
              method: 'POST',
              body: JSON.stringify({ token: lease.token }),
            }
          );
        } catch {}
        throw new Error(`resident service receipt binding failed: ${error?.message || error}`);
      }
    }

    const record = {
      deployment_id: deploymentId,
      state: 'ready',
      receipt,
      result: job.result,
      management: {
        health_path: managementHealthPath || null,
        receipt_binding_hash: receiptBinding?.receipt?.receipt_hash || null,
      },
      lease: {
        lease_id: lease.lease_id,
        capacity_endpoint: capacityEndpoint,
        expires_at: lease.expires_at || null,
        token_persisted_privately: true,
      },
      updated_at: new Date().toISOString(),
    };
    this.#saveLeaseSecret(deploymentId, {
      lease_id: lease.lease_id,
      token: lease.token,
      capacity_endpoint: capacityEndpoint,
      allocator_token: allocatorToken || null,
    });
    this.deployments.set(deploymentId, record);
    this.#persist(record);
    return record;
  }

  async deployDiscoveredRelease({
    deploymentId,
    releaseRef,
    workloadClass,
    input = {},
    rollbackTarget,
    leaseTtlMs = 30_000,
    allocatorToken = '',
    allocatorTokens = {},
    discovery = {},
    endpointTimeoutMs = 750,
  } = {}) {
    const resolution = await discoverEligibleCapacity({
      workloadClass,
      discovery,
      endpointTimeoutMs,
    });
    if (!resolution.selected) {
      const error = new Error('no eligible Evercraft capacity discovered');
      error.resolution = resolution;
      throw error;
    }

    const selected = resolution.selected;
    const selectedToken = allocatorTokenForOffer(selected, {
      allocatorToken,
      allocatorTokens,
    });
    if (selected.allocation_auth === 'bearer' && !selectedToken) {
      const error = new Error('allocator authority unavailable for selected capacity');
      error.resolution = resolution;
      throw error;
    }

    const record = await this.deployRelease({
      deploymentId,
      releaseRef,
      workloadClass,
      capacityEndpoint: selected.endpoint,
      input,
      rollbackTarget,
      leaseTtlMs,
      allocatorToken: selectedToken,
    });
    record.discovery = {
      schema: resolution.schema,
      receipt_hash: resolution.receipt_hash,
      selected_node_id: selected.node_id,
      selected_endpoint: selected.endpoint,
      discovered_count: resolution.discovered_count,
      eligible_count: resolution.eligible_count,
    };
    record.updated_at = new Date().toISOString();
    this.#persist(record);
    return record;
  }

  async checkpointDeployment(deploymentId) {
    const record = this.deploymentStatus(deploymentId);
    const secret = this.#loadLeaseSecret(deploymentId);
    if (!record || !secret) throw new Error('deployment lease authority unavailable');
    if (!record.result?.service_id) throw new Error('deployment is not a resident service');

    const captured = await request(
      `${secret.capacity_endpoint}/v1/services/${record.result.service_id}/checkpoint`,
      {
        method: 'POST',
        body: JSON.stringify({ token: secret.token }),
      }
    );
    if (captured.checkpoint?.schema !== 'evercraft.kaidance.checkpoint.v1') {
      throw new Error('resident checkpoint schema invalid');
    }

    const checkpointRecord = {
      schema: 'evercraft.yard.continuity-checkpoint.v1',
      deployment_id: deploymentId,
      source_node_id: record.receipt?.capacity_node_id || null,
      source_deployment_receipt: record.receipt?.receipt_hash || null,
      compute_checkpoint_receipt: captured.receipt?.receipt_hash || null,
      captured_at: new Date().toISOString(),
      checkpoint: captured.checkpoint,
    };
    checkpointRecord.receipt_hash = sha(checkpointRecord);
    this.#saveCheckpoint(deploymentId, checkpointRecord);

    record.continuity = {
      ...(record.continuity || {}),
      last_checkpoint_receipt: checkpointRecord.receipt_hash,
      last_checkpoint_state_hash: captured.checkpoint.state_hash,
      last_checkpoint_at: checkpointRecord.captured_at,
    };
    record.updated_at = new Date().toISOString();
    this.#persist(record);
    return checkpointRecord;
  }

  startCheckpointKeeper(deploymentId, { everyMs = 60_000 } = {}) {
    if (this.checkpointKeepers.has(deploymentId)) return;
    const timer = setInterval(() => {
      this.checkpointDeployment(deploymentId).catch(() => {});
    }, Math.max(30_000, everyMs));
    timer.unref?.();
    this.checkpointKeepers.set(deploymentId, timer);
  }

  stopCheckpointKeeper(deploymentId) {
    const timer = this.checkpointKeepers.get(deploymentId);
    if (timer) clearInterval(timer);
    this.checkpointKeepers.delete(deploymentId);
  }

  async rebindDiscoveredRelease({
    deploymentId,
    allocatorToken = '',
    allocatorTokens = {},
    discovery = {},
    endpointTimeoutMs = 750,
    leaseTtlMs = 30_000,
    input = {},
    inputByNode = {},
  } = {}) {
    const previous = this.deploymentStatus(deploymentId);
    if (!previous) throw new Error('deployment not found');
    if (previous.receipt?.workload_class !== 'systemia.kaidance-collider.v1') {
      throw new Error('automatic rebind currently supports KAIDANCE resident deployments only');
    }

    const saved = this.#loadCheckpoint(deploymentId);
    if (!saved?.checkpoint) throw new Error('continuity checkpoint unavailable');

    const failedNodeId = String(previous.receipt?.capacity_node_id || '');
    const resolution = await discoverEligibleCapacity({
      workloadClass: previous.receipt.workload_class,
      discovery,
      endpointTimeoutMs,
      excludeNodeIds: failedNodeId ? [failedNodeId] : [],
    });
    if (!resolution.selected) {
      const error = new Error('no alternate Evercraft capacity discovered');
      error.resolution = resolution;
      throw error;
    }

    const selected = resolution.selected;
    const selectedToken = allocatorTokenForOffer(selected, {
      allocatorToken,
      allocatorTokens,
    });
    if (selected.allocation_auth === 'bearer' && !selectedToken) {
      const error = new Error('allocator authority unavailable for rebound capacity');
      error.resolution = resolution;
      throw error;
    }

    const nodeInput = inputByNode?.[selected.node_id] || input;
    const next = await this.deployRelease({
      deploymentId,
      releaseRef: previous.receipt.release_ref,
      workloadClass: previous.receipt.workload_class,
      capacityEndpoint: selected.endpoint,
      input: {
        ...nodeInput,
        initial_checkpoint: saved.checkpoint,
      },
      rollbackTarget: previous.receipt.rollback_target,
      leaseTtlMs,
      allocatorToken: selectedToken,
    });

    next.discovery = {
      schema: resolution.schema,
      receipt_hash: resolution.receipt_hash,
      selected_node_id: selected.node_id,
      selected_endpoint: selected.endpoint,
      discovered_count: resolution.discovered_count,
      eligible_count: resolution.eligible_count,
    };
    next.continuity = {
      previous_node_id: failedNodeId || null,
      previous_deployment_receipt: previous.receipt.receipt_hash,
      checkpoint_receipt: saved.receipt_hash,
      checkpoint_state_hash: saved.checkpoint.state_hash,
      rebound_at: new Date().toISOString(),
    };
    next.updated_at = new Date().toISOString();
    this.#persist(next);
    return next;
  }

  deploymentStatus(deploymentId) {
    if (this.deployments.has(deploymentId)) return this.deployments.get(deploymentId);
    const file = path.join(this.stateDir, `${this.#safeId(deploymentId)}.json`);
    if (!fs.existsSync(file)) return null;
    const record = JSON.parse(fs.readFileSync(file, 'utf8'));
    this.deployments.set(deploymentId, record);
    return record;
  }

  verifyDeployment(deploymentId) {
    const record = this.deploymentStatus(deploymentId);
    if (!record) return { ok: false, state: 'missing' };
    const receipt = record.receipt || {};
    const ok = record.state === 'ready' &&
      receipt.runtime_fabric === 'Evercraft Compute' &&
      receipt.capacity_protocol === 'evercraft.capacity.v1' &&
      Boolean(receipt.lease_receipt_hash) &&
      Boolean(receipt.workload_receipt_hash) &&
      Boolean(receipt.rollback_target);
    return {
      ok,
      state: ok ? 'verified' : 'degraded',
      deployment_id: deploymentId,
      receipt_hash: receipt.receipt_hash || null,
    };
  }

  async verifyRoute(deploymentId) {
    const record = this.deploymentStatus(deploymentId);
    if (!record) return { ok: false, state: 'missing' };
    if (!record.management?.health_path) {
      return {
        ok: record.receipt?.route_verification === 'private_origin_not_publicly_routed',
        state: record.receipt?.route_verification || 'not_verified',
      };
    }
    try {
      const health = await request(new URL(
        record.management.health_path,
        record.lease.capacity_endpoint
      ).toString());
      const ok = health.state === 'healthy' && health.coverage_receipt_valid === true;
      return { ok, state: ok ? 'healthy' : 'degraded', health };
    } catch (error) {
      return { ok: false, state: 'unreachable', error: String(error?.message || error) };
    }
  }

  async renewDeploymentLease(deploymentId, { ttlMs = 3_600_000 } = {}) {
    const record = this.deploymentStatus(deploymentId);
    const secret = this.#loadLeaseSecret(deploymentId);
    if (!record || !secret) throw new Error('deployment lease authority unavailable');

    const renewed = await request(
      `${secret.capacity_endpoint}/v1/leases/${secret.lease_id}/renew`,
      {
        method: 'POST',
        body: JSON.stringify({
          token: secret.token,
          requested_ttl_ms: ttlMs,
        }),
      }
    );
    record.lease.expires_at = renewed.expires_at;
    record.lease.last_renewal_receipt_hash = renewed.receipt?.receipt_hash || null;
    record.updated_at = new Date().toISOString();
    this.#persist(record);
    return {
      ok: true,
      deployment_id: deploymentId,
      expires_at: renewed.expires_at,
      receipt_hash: renewed.receipt?.receipt_hash || null,
    };
  }

  startLeaseKeeper(deploymentId, {
    ttlMs = 3_600_000,
    renewEveryMs = 1_800_000,
  } = {}) {
    if (this.leaseKeepers.has(deploymentId)) return;
    const timer = setInterval(() => {
      this.renewDeploymentLease(deploymentId, { ttlMs }).catch(() => {});
    }, Math.max(30_000, renewEveryMs));
    timer.unref?.();
    this.leaseKeepers.set(deploymentId, timer);
  }

  stopLeaseKeeper(deploymentId) {
    const timer = this.leaseKeepers.get(deploymentId);
    if (timer) clearInterval(timer);
    this.leaseKeepers.delete(deploymentId);
  }

  startContinuityKeeper(deploymentId, {
    leaseTtlMs = 3_600_000,
    renewEveryMs = 1_800_000,
    checkpointEveryMs = 60_000,
  } = {}) {
    this.startLeaseKeeper(deploymentId, {
      ttlMs: leaseTtlMs,
      renewEveryMs,
    });
    this.startCheckpointKeeper(deploymentId, {
      everyMs: checkpointEveryMs,
    });
  }

  stopContinuityKeeper(deploymentId) {
    this.stopLeaseKeeper(deploymentId);
    this.stopCheckpointKeeper(deploymentId);
  }

  getLiveUrl(deploymentId) {
    return this.deploymentStatus(deploymentId)?.receipt?.live_url || null;
  }

  async stopDeployment(deploymentId, { reason = 'operator_requested' } = {}) {
    const record = this.deploymentStatus(deploymentId);
    const secret = this.#loadLeaseSecret(deploymentId);
    if (!record || !secret) throw new Error('deployment lease authority unavailable');
    this.stopContinuityKeeper(deploymentId);

    if (record.result?.service_id) {
      await request(
        `${secret.capacity_endpoint}/v1/services/${record.result.service_id}/stop`,
        {
          method: 'POST',
          body: JSON.stringify({ token: secret.token }),
        }
      );
    }

    await request(
      `${secret.capacity_endpoint}/v1/leases/${secret.lease_id}/release`,
      {
        method: 'POST',
        body: JSON.stringify({ token: secret.token }),
      }
    );

    record.state = 'stopped';
    record.stop_reason = reason;
    record.updated_at = new Date().toISOString();
    this.#persist(record);
    return { ok: true, deployment_id: deploymentId, state: 'stopped' };
  }

  async rollbackRelease(deploymentId, { reason = 'operator_requested' } = {}) {
    const record = this.deploymentStatus(deploymentId);
    if (!record) throw new Error('deployment not found');
    if (!record.receipt?.rollback_target) throw new Error('rollback target missing');

    const rollback = {
      schema: 'evercraft.yard.rollback-receipt.v1',
      deployment_id: deploymentId,
      from_release_ref: record.receipt.release_ref,
      rollback_target: record.receipt.rollback_target,
      reason,
      state: 'handoff_required',
      note: 'Yard records rollback authority; the target adapter performs restoration for its own system.',
      at: new Date().toISOString(),
    };
    rollback.receipt_hash = sha(rollback);
    record.state = 'rollback_handoff';
    record.rollback = rollback;
    record.updated_at = new Date().toISOString();
    this.#persist(record);
    return rollback;
  }
}
