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
    signal,
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
  if (method === 'POST' && route === '/v1/attest') return true;
  if (method === 'POST' && route === '/v1/leases') return true;
  if (method === 'POST' && route === '/v1/jobs') return true;
  if (
    method === 'GET' &&
    /^\/v1\/services\/[^/]+\/health$/.test(route)
  ) return true;
  if (
    method === 'POST' &&
    /^\/v1\/services\/[^/]+\/(?:cycle|checkpoint|deployment-receipt|stop)$/.test(route)
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

export async function startOutboundNodeAgent({
  brokerUrl,
  localCapacityEndpoint,
  localAllocatorToken,
  pollBackoffMs = 100,
  capacityRefreshEveryPoll = true,
} = {}) {
  const broker = assertBrokerUrl(brokerUrl);
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
  let lastError = null;
  let loopPromise = null;

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
    const capacityResponse = await localRequest('/v1/capacity');
    if (!capacityResponse.ok) {
      throw new Error(`local_capacity_failed:${capacityResponse.status}`);
    }
    const capacity = capacityResponse.body;
    nodeId = String(capacity.node_id || '');
    deviceFingerprint = String(capacity.device_fingerprint || '');
    if (!nodeId || !deviceFingerprint) {
      throw new Error('local Compute capacity is missing device identity');
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
    if (!routeAllowed(method, route)) {
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
          capacity = fresh.body;
        }

        pollController = new AbortController();
        const polled = await jsonRequest(`${broker}/v1/remote/agent/poll`, {
          method: 'POST',
          body: capacity === undefined ? {} : { capacity },
          bearerToken: sessionToken,
          signal: pollController.signal,
        });
        pollController = null;

        if (!running) break;

        if (polled.status === 401) {
          sessionToken = '';
          continue;
        }
        if (polled.status === 204) {
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
        node_id: nodeId,
        device_fingerprint: deviceFingerprint,
        registered_at: registeredAt,
        last_command_at: lastCommandAt,
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
