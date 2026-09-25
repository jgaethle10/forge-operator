import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

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
    fs.mkdirSync(this.stateDir, { recursive: true, mode: 0o750 });
    fs.mkdirSync(path.join(this.stateDir, '.lease-secrets'), { recursive: true, mode: 0o700 });
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

  async deployRelease({
    deploymentId,
    releaseRef,
    workloadClass,
    capacityEndpoint,
    input = {},
    rollbackTarget,
    leaseTtlMs = 30_000,
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
    });
    this.deployments.set(deploymentId, record);
    this.#persist(record);
    return record;
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

  getLiveUrl(deploymentId) {
    return this.deploymentStatus(deploymentId)?.receipt?.live_url || null;
  }

  async stopDeployment(deploymentId, { reason = 'operator_requested' } = {}) {
    const record = this.deploymentStatus(deploymentId);
    const secret = this.#loadLeaseSecret(deploymentId);
    if (!record || !secret) throw new Error('deployment lease authority unavailable');
    this.stopLeaseKeeper(deploymentId);

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
