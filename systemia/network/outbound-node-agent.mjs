import { setTimeout as sleep } from 'node:timers/promises';
import { ReplayGuard, openEnvelope, sealEnvelope } from './secure-envelope.mjs';

function isLoopbackUrl(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'http:' &&
      ['127.0.0.1', 'localhost', '::1'].includes(url.hostname)
    );
  } catch {
    return false;
  }
}

function assertBrokerUrl(value) {
  const url = new URL(String(value || ''));
  if (url.protocol !== 'https:' && !isLoopbackUrl(url.toString())) {
    throw new Error('remote broker requires HTTPS unless it is loopback');
  }
  return url.toString().replace(/\/$/, '');
}

async function jsonRequest(url, {
  method = 'GET',
  body,
  bearerToken = '',
  headers = {},
  signal,
} = {}) {
  const requestHeaders = { ...headers };
  if (body !== undefined) requestHeaders['content-type'] = 'application/json';
  if (bearerToken) requestHeaders.authorization = `Bearer ${bearerToken}`;

  const response = await fetch(url, {
    method,
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: signal || AbortSignal.timeout(15_000),
  });

  let payload = null;
  if (response.status !== 204) {
    const text = await response.text();
    payload = text ? JSON.parse(text) : {};
  }
  return {
    status: response.status,
    ok: response.ok,
    body: payload,
  };
}

function routeAllowed(method, route) {
  if (method === 'GET' && route === '/v1/health') return true;
  if (method === 'GET' && route === '/v1/capacity') return true;
  if (method === 'GET' && route === '/v1/operator/status') return true;
  if (
    method === 'POST' &&
    /^\/v1\/operator\/(?:fs\/(?:list|read|write)|exec)$/.test(route)
  ) return true;
  if (method === 'POST' && route === '/v1/attest') return true;
  if (method === 'POST' && route === '/v1/leases') return true;
  if (method === 'POST' && route === '/v1/jobs') return true;
  if (method === 'POST' && route === '/v1/field-enrollment-packet') return true;
  if (
    method === 'GET' &&
    /^\/v1\/services\/[^/]+\/health$/.test(route)
  ) return true;
  if (
    method === 'POST' &&
    /^\/v1\/services\/[^/]+\/(?:cycle|checkpoint|deployment-receipt|stop|specialist-identity-attestation|public-route-capabilities|public-route-leases|http-bridge)$/.test(route)
  ) return true;
  if (
    method === 'POST' &&
    /^\/v1\/services\/[^/]+\/public-route-leases\/[^/]+\/release$/.test(route)
  ) return true;
  if (
    method === 'POST' &&
    /^\/v1\/services\/[^/]+\/missions\/[^/]+$/.test(route)
  ) return true;
  if (
    method === 'POST' &&
    /^\/v1\/leases\/[^/]+\/(?:renew|release)$/.test(route)
  ) return true;
  return false;
}


/**
 * Persistent HP worker admission: only a bounded SHA-256 MicroSeed computation.
 * This is enforced ON THE DEVICE after decrypting the broker command, so a
 * future broker-side policy mistake cannot invoke filesystem/exec/service APIs.
 * Default ephemeral agent behavior is preserved for existing callers.
 */
export function narrowContentHashCommandAllowed(command) {
  const method = String(command?.method || 'GET').toUpperCase();
  const route = String(command?.route || '');
  const body = command?.body;
  if (method === 'GET' && (route === '/v1/health' || route === '/v1/capacity')) {
    return true;
  }
  if (method === 'POST' && route === '/v1/leases') {
    return body && typeof body === 'object' &&
      body.workload_class === 'systemia.content-hash.v1' &&
      Number.isFinite(Number(body.requested_ttl_ms)) &&
      Number(body.requested_ttl_ms) > 0 &&
      Number(body.requested_ttl_ms) <= 120000;
  }
  if (method === 'POST' && route === '/v1/jobs') {
    const input = body?.input;
    const payload = input?.payload;
    const key = String(body?.idempotency_key || '');
    if (body?.workload_class !== 'systemia.content-hash.v1' ||
        !/^[a-zA-Z0-9._-]{8,128}$/.test(key) ||
        String(input?.idempotency_key || '') !== key ||
        !body.lease_id || !body.token ||
        !payload || typeof payload !== 'object' ||
        payload.bytes_base64 !== undefined ||
        payload.value === undefined) return false;
    try {
      const bytes = Buffer.byteLength(JSON.stringify(payload));
      return bytes > 0 && bytes <= 4096;
    } catch { return false; }
  }
  if (method === 'POST' && /^\/v1\/leases\/[a-zA-Z0-9_-]{1,128}\/release$/.test(route)) {
    return typeof body?.token === 'string' && body.token.length > 0;
  }
  return false;
}

export async function submitOutboundEnrollmentRequest({
  brokerUrl,
  localCapacityEndpoint,
  localAllocatorToken,
} = {}) {
  const broker = assertBrokerUrl(brokerUrl);
  const localEndpoint = String(localCapacityEndpoint || '').replace(/\/$/, '');
  if (!localEndpoint) throw new Error('localCapacityEndpoint is required');
  if (!/^http:\/\/(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/i.test(localEndpoint)) {
    throw new Error('outbound enrollment requires a loopback local Compute endpoint');
  }
  if (!String(localAllocatorToken || '')) {
    throw new Error('localAllocatorToken is required');
  }

  const capacity = await jsonRequest(`${localEndpoint}/v1/capacity`);
  if (!capacity.ok) {
    throw new Error(`local_capacity_failed:${capacity.status}`);
  }
  const nodeId = String(capacity.body?.node_id || '');
  const deviceFingerprint = String(capacity.body?.device_fingerprint || '');
  if (!nodeId || !deviceFingerprint) {
    throw new Error('local Compute capacity is missing device identity');
  }

  const challenge = await jsonRequest(
    `${broker}/v1/remote/enrollment/challenge`,
    {
      method: 'POST',
      body: {
        node_id: nodeId,
        device_fingerprint: deviceFingerprint,
      },
    }
  );
  if (!challenge.ok) {
    const error = new Error(`remote_enrollment_challenge_failed:${challenge.status}`);
    error.status = challenge.status;
    error.body = challenge.body;
    throw error;
  }

  const attested = await jsonRequest(`${localEndpoint}/v1/attest`, {
    method: 'POST',
    bearerToken: localAllocatorToken,
    body: { nonce: challenge.body.nonce },
  });
  if (!attested.ok) {
    throw new Error(`local_attestation_failed:${attested.status}`);
  }

  const requested = await jsonRequest(
    `${broker}/v1/remote/enrollment/request`,
    {
      method: 'POST',
      body: {
        challenge_id: challenge.body.challenge_id,
        attestation: attested.body.attestation,
      },
    }
  );
  if (!requested.ok) {
    const error = new Error(`remote_enrollment_request_failed:${requested.status}`);
    error.status = requested.status;
    error.body = requested.body;
    throw error;
  }

  return requested.body;
}

export async function startOutboundNodeAgent({
  brokerUrl,
  localCapacityEndpoint,
  localAllocatorToken,
  pollBackoffMs = 100,
  capacityRefreshEveryPoll = true,
  commandPolicy = 'default',
  expectedNodeId = '',
  preRegisterGuard = null,
  capacityWorkloadAllowlist = null,
} = {}) {
  const broker = assertBrokerUrl(brokerUrl);
  if (!['default', 'content-hash-only'].includes(commandPolicy)) throw new Error('unsupported_worker_command_policy');
  const localEndpoint = String(localCapacityEndpoint || '').replace(/\/$/, '');
  if (!localEndpoint) throw new Error('localCapacityEndpoint is required');
  if (!/^http:\/\/(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/i.test(localEndpoint)) {
    throw new Error('outbound agent requires a loopback local Compute endpoint');
  }
  if (!String(localAllocatorToken || '')) {
    throw new Error('localAllocatorToken is required');
  }

  let running = true;
  let sessionToken = '';
  let transportKey = '';
  let commandReplayGuard = new ReplayGuard();
  let commandResultCache = new Map();
  let secureCommandsOpened = 0;
  let duplicateCommandsSuppressed = 0;
  let resultRetryCount = 0;
  let nodeId = '';
  let deviceFingerprint = '';
  let pollController = null;
  let registeredAt = null;
  let lastCommandAt = null;
  let lastPollAt = null;
  let lastError = null;
  let loopPromise = null;

  function constrainedCapacity(capacity) {
    if (capacityWorkloadAllowlist === null) return capacity;
    if (!Array.isArray(capacityWorkloadAllowlist) ||
        capacityWorkloadAllowlist.length !== 1 ||
        capacityWorkloadAllowlist[0] !== 'systemia.content-hash.v1' ||
        !Array.isArray(capacity?.supported_workloads) ||
        !capacity.supported_workloads.includes('systemia.content-hash.v1')) {
      throw new Error('remote_capacity_allowlist_invalid');
    }
    return {...capacity,supported_workloads:['systemia.content-hash.v1']};
  }

  async function localRequest(route, {
    method = 'GET',
    body,
    injectAllocatorAuth = false,
  } = {}) {
    const headers = {};
    if (injectAllocatorAuth) {
      headers.authorization = `Bearer ${localAllocatorToken}`;
    }
    return jsonRequest(`${localEndpoint}${route}`, {
      method,
      body,
      headers,
    });
  }

  async function register() {
    if (typeof preRegisterGuard === 'function') await preRegisterGuard();
    const capacityResponse = await localRequest('/v1/capacity');
    if (!capacityResponse.ok) {
      throw new Error(`local_capacity_failed:${capacityResponse.status}`);
    }
    const capacity = constrainedCapacity(capacityResponse.body);
    nodeId = String(capacity.node_id || '');
    deviceFingerprint = String(capacity.device_fingerprint || '');
    if (!nodeId || !deviceFingerprint) {
      throw new Error('local Compute capacity is missing device identity');
    }
    if (expectedNodeId && nodeId !== expectedNodeId) {
      throw new Error('remote_agent_physical_node_identity_mismatch');
    }

    const challenge = await jsonRequest(`${broker}/v1/remote/challenge`, {
      method: 'POST',
      body: {
        node_id: nodeId,
        device_fingerprint: deviceFingerprint,
      },
    });
    if (!challenge.ok) {
      throw new Error(`remote_challenge_failed:${challenge.status}`);
    }

    const attested = await localRequest('/v1/attest', {
      method: 'POST',
      body: { nonce: challenge.body.nonce },
      injectAllocatorAuth: true,
    });
    if (!attested.ok) {
      throw new Error(`local_attestation_failed:${attested.status}`);
    }

    const registration = await jsonRequest(`${broker}/v1/remote/register`, {
      method: 'POST',
      body: {
        challenge_id: challenge.body.challenge_id,
        attestation: attested.body.attestation,
        capacity,
      },
    });
    if (!registration.ok) {
      throw new Error(`remote_registration_failed:${registration.status}`);
    }

    sessionToken = String(registration.body.session_token || '');
    transportKey = String(registration.body.transport_key || '');
    if (!sessionToken) throw new Error('remote registration returned no session token');
    if (!transportKey) throw new Error('remote registration returned no transport key');
    commandReplayGuard = new ReplayGuard();
    commandResultCache = new Map();
    registeredAt = new Date().toISOString();
    lastError = null;
    return registration.body;
  }

  async function execute(command) {
    const method = String(command.method || 'GET').toUpperCase();
    const route = String(command.route || '');
    if (!routeAllowed(method, route) ||
        (commandPolicy === 'content-hash-only' && !narrowContentHashCommandAllowed(command))) {
      return {
        status: 403,
        body: { error: 'remote_route_not_allowed' },
      };
    }

    return localRequest(route, {
      method,
      body: command.body ?? undefined,
      injectAllocatorAuth: command.inject_allocator_auth === true,
    });
  }

  async function sendResult(commandId, result) {
    const envelope = sealEnvelope({
      key: transportKey,
      key_id: 'remote-capacity-session',
      source: nodeId,
      destination: 'systemia-remote-capacity-broker',
      kind: 'remote.capacity.result',
      message_id: `result_${commandId}`,
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      irreversible: false,
      payload: {
        command_id: commandId,
        status: result.status,
        body: result.body,
      },
    });

    let last = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const acknowledged = await jsonRequest(
        `${broker}/v1/remote/agent/result`,
        {
          method: 'POST',
          bearerToken: sessionToken,
          body: { envelope },
        }
      );
      last = acknowledged;
      if (acknowledged.ok) return acknowledged;
      if (acknowledged.status === 401) break;
      if (attempt < 2) {
        resultRetryCount += 1;
        await sleep(Math.max(25, pollBackoffMs));
      }
    }
    throw new Error(`remote_result_failed:${last?.status || 0}`);
  }

  async function loop() {
    let backoff = pollBackoffMs;
    while (running) {
      try {
        if (!sessionToken) await register();

        let capacity = undefined;
        if (capacityRefreshEveryPoll) {
          const fresh = await localRequest('/v1/capacity');
          if (!fresh.ok) throw new Error(`local_capacity_failed:${fresh.status}`);
          capacity = constrainedCapacity(fresh.body);
        }

        pollController = new AbortController();
        const polled = await jsonRequest(`${broker}/v1/remote/agent/poll`, {
          method: 'POST',
          body: capacity === undefined ? {} : { capacity },
          bearerToken: sessionToken,
          signal: pollController.signal,
        });
        pollController = null;
        lastPollAt = new Date().toISOString();

        if (!running) break;

        if (polled.status === 401) {
          sessionToken = '';
          continue;
        }
        if (polled.status === 204) {
          // A successful empty poll is proof of recovery after a transient
          // broker/network error. Leaving lastError set makes the persistent
          // supervisor restart an otherwise healthy outbound session.
          lastError = null;
          backoff = pollBackoffMs;
          continue;
        }
        if (!polled.ok) {
          throw new Error(`remote_poll_failed:${polled.status}`);
        }

        const delivery = polled.body;
        if (
          delivery?.schema !== 'evercraft.remote-capacity.delivery.v1' ||
          !delivery.envelope
        ) {
          throw new Error('remote_delivery_schema_invalid');
        }

        let opened;
        try {
          opened = openEnvelope({
            envelope: delivery.envelope,
            key: transportKey,
            expected_destination: nodeId,
          });
        } catch (error) {
          throw new Error(
            `remote_command_envelope_rejected:${error?.code || error?.message || error}`
          );
        }

        if (
          opened.header.source !== 'systemia-remote-capacity-broker' ||
          opened.header.kind !== 'remote.capacity.command'
        ) {
          throw new Error('remote_command_envelope_identity_mismatch');
        }

        const command = opened.payload || {};
        const commandId = String(command.command_id || '');
        if (!commandId || commandId !== opened.header.message_id) {
          throw new Error('remote_command_message_id_mismatch');
        }

        let result;
        if (commandReplayGuard.has(opened.header.message_id)) {
          result = commandResultCache.get(commandId);
          if (!result) throw new Error('remote_command_replay_without_cached_result');
          duplicateCommandsSuppressed += 1;
        } else {
          commandReplayGuard.mark(opened.header.message_id);
          result = await execute(command);
          commandResultCache.set(commandId, result);
          secureCommandsOpened += 1;
        }

        await sendResult(commandId, result);

        lastCommandAt = new Date().toISOString();
        lastError = null;
        backoff = pollBackoffMs;
      } catch (error) {
        if (!running) break;
        if (error?.name === 'AbortError') break;
        lastError = String(error?.message || error);
        if (/remote_(?:poll|result)_failed:401/.test(lastError)) {
          sessionToken = '';
        }
        await sleep(backoff);
        backoff = Math.min(5_000, Math.max(pollBackoffMs, backoff * 2));
      }
    }
  }

  const registration = await register();
  loopPromise = loop();

  return {
    schema: 'evercraft.remote-capacity.node-agent.v1',
    node_id: nodeId,
    device_fingerprint: deviceFingerprint,
    virtual_capacity_endpoint: registration.virtual_capacity_endpoint,
    status() {
      return {
        schema: 'evercraft.remote-capacity.node-agent-status.v1',
        running,
        command_policy: commandPolicy,
        node_id: nodeId,
        device_fingerprint: deviceFingerprint,
        registered_at: registeredAt,
        last_command_at: lastCommandAt,
        last_poll_at: lastPollAt,
        last_error: lastError,
        public_ingress: false,
        local_compute_scope: 'loopback_only',
        secure_envelope_schema: 'evercraft.secure-envelope.v1',
        secure_commands_opened: secureCommandsOpened,
        duplicate_commands_suppressed: duplicateCommandsSuppressed,
        result_retry_count: resultRetryCount,
      };
    },
    close: async () => {
      running = false;
      pollController?.abort();
      try { await loopPromise; } catch {}
    },
  };
}
