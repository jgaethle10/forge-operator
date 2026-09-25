import { setTimeout as sleep } from 'node:timers/promises';
import { startOutboundNodeAgent } from '../network/outbound-node-agent.mjs';

export class RemoteAdmissionKeeper {
  constructor({
    brokerUrl,
    localCapacityEndpoint,
    localAllocatorToken,
    retryBaseMs = 5_000,
    retryMaxMs = 60_000,
    clock = () => new Date(),
  } = {}) {
    if (!brokerUrl) throw new Error('brokerUrl is required');
    if (!localCapacityEndpoint) throw new Error('localCapacityEndpoint is required');
    if (!localAllocatorToken) throw new Error('localAllocatorToken is required');

    this.brokerUrl = String(brokerUrl);
    this.localCapacityEndpoint = String(localCapacityEndpoint);
    this.localAllocatorToken = String(localAllocatorToken);
    this.retryBaseMs = Math.max(250, Number(retryBaseMs || 5_000));
    this.retryMaxMs = Math.max(this.retryBaseMs, Number(retryMaxMs || 60_000));
    this.clock = clock;

    this.running = false;
    this.agent = null;
    this.retryTimer = null;
    this.attempts = 0;
    this.connectedAt = null;
    this.lastAttemptAt = null;
    this.lastError = null;
  }

  #schedule(delayMs) {
    if (!this.running || this.retryTimer || this.agent) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.#attempt().catch(() => {});
    }, delayMs);
  }

  async #attempt() {
    if (!this.running || this.agent) return;
    this.attempts += 1;
    this.lastAttemptAt = this.clock().toISOString();

    try {
      const agent = await startOutboundNodeAgent({
        brokerUrl: this.brokerUrl,
        localCapacityEndpoint: this.localCapacityEndpoint,
        localAllocatorToken: this.localAllocatorToken,
        pollBackoffMs: 250,
      });
      if (!this.running) {
        await agent.close();
        return;
      }
      this.agent = agent;
      this.connectedAt = this.clock().toISOString();
      this.lastError = null;
    } catch (error) {
      this.lastError = String(error?.message || error);
      const exponent = Math.min(6, Math.max(0, this.attempts - 1));
      const delay = Math.min(this.retryMaxMs, this.retryBaseMs * (2 ** exponent));
      this.#schedule(delay);
    }
  }

  start() {
    if (this.running) return this.status();
    this.running = true;
    this.#attempt().catch(() => {});
    return this.status();
  }

  status() {
    const agentStatus = this.agent?.status?.() || null;
    const healthyAgent =
      agentStatus &&
      agentStatus.running === true &&
      !agentStatus.last_error;

    return {
      schema: 'evercraft.local-organism.remote-admission-status.v1',
      configured: true,
      running: this.running,
      connected: Boolean(healthyAgent),
      node_id: agentStatus?.node_id || null,
      device_fingerprint: agentStatus?.device_fingerprint || null,
      public_ingress: false,
      local_compute_scope: 'loopback_only',
      secure_envelope_schema: agentStatus?.secure_envelope_schema || 'evercraft.secure-envelope.v1',
      attempts: this.attempts,
      connected_at: this.connectedAt,
      last_attempt_at: this.lastAttemptAt,
      last_error: agentStatus?.last_error || this.lastError,
    };
  }

  async waitForConnected({ timeoutMs = 10_000, pollMs = 50 } = {}) {
    const deadline = Date.now() + Math.max(100, Number(timeoutMs || 10_000));
    while (Date.now() < deadline) {
      const status = this.status();
      if (status.connected) return status;
      await sleep(Math.max(10, Number(pollMs || 50)));
    }
    throw new Error('remote_admission_connect_timeout');
  }

  async close() {
    this.running = false;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    if (this.agent) {
      const agent = this.agent;
      this.agent = null;
      try { await agent.close(); } catch {}
    }
  }
}
