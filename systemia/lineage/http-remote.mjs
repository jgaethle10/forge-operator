import { Buffer } from 'node:buffer';

async function readResponseJson(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    const error = new Error('lineage_remote_non_json_response');
    error.status = response.status;
    error.body_text = text.slice(0, 1024);
    throw error;
  }
}

function asHttpError(status, body) {
  const error = new Error(String(body?.error || `lineage_remote_http_${status}`));
  error.status = status;
  error.body = body;
  if (body?.error === 'STALE_REF') {
    error.code = 'STALE_REF';
    error.ref = body.ref;
    error.expected = body.expected ?? null;
    error.current = body.current ?? null;
    error.next = body.next ?? null;
  }
  return error;
}

export function directLineageRequester(baseUrl, { timeoutMs = 10_000 } = {}) {
  const origin = String(baseUrl || '').replace(/\/$/, '');
  if (!origin) throw new Error('lineage_remote_base_url_required');

  return async function request({ method = 'GET', path = '/', body = null }) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(origin + path, {
        method,
        signal: controller.signal,
        headers: body == null ? {} : { 'content-type': 'application/json' },
        body: body == null ? undefined : JSON.stringify(body),
      });
      const parsed = await readResponseJson(response);
      if (!response.ok) throw asHttpError(response.status, parsed);
      return parsed;
    } finally {
      clearTimeout(timer);
    }
  };
}

export function yardRelayLineageRequester({
  relayUrl,
  relayToken,
  timeoutMs = 15_000,
} = {}) {
  const url = String(relayUrl || '').trim();
  const token = String(relayToken || '').trim();
  if (!url || !token) throw new Error('lineage_yard_relay_authority_required');

  return async function request({ method = 'GET', path = '/', body = null }) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const payloadBytes = body == null
        ? Buffer.alloc(0)
        : Buffer.from(JSON.stringify(body));
      const response = await fetch(url, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          method,
          path,
          headers: body == null ? {} : { 'content-type': 'application/json' },
          body_base64: payloadBytes.toString('base64'),
        }),
      });
      const bridge = await readResponseJson(response);
      if (!response.ok) throw asHttpError(response.status, bridge);
      if (bridge?.ok !== true || !Number.isInteger(Number(bridge.status))) {
        throw new Error('lineage_yard_relay_response_invalid');
      }
      const innerStatus = Number(bridge.status);
      const innerBytes = Buffer.from(String(bridge.body_base64 || ''), 'base64');
      let inner = {};
      if (innerBytes.length) {
        try {
          inner = JSON.parse(innerBytes.toString('utf8'));
        } catch {
          throw new Error('lineage_yard_relay_inner_response_invalid');
        }
      }
      if (innerStatus < 200 || innerStatus >= 300) {
        throw asHttpError(innerStatus, inner);
      }
      return inner;
    } finally {
      clearTimeout(timer);
    }
  };
}

export class HttpLineageRemote {
  constructor(request) {
    if (typeof request !== 'function') throw new Error('lineage_remote_requester_required');
    this.request = request;
  }

  async init() {
    const health = await this.request({ method: 'GET', path: '/health' });
    if (health?.ok !== true || health?.protocol !== 'evercraft.lineage.remote.v1') {
      throw new Error('lineage_remote_health_contract_invalid');
    }
    return health;
  }

  async hasObject(id) {
    const result = await this.request({
      method: 'POST',
      path: '/v1/object/has',
      body: { id },
    });
    return result.present === true;
  }

  async putObject(id, bytes) {
    if (!Buffer.isBuffer(bytes)) bytes = Buffer.from(bytes);
    const result = await this.request({
      method: 'POST',
      path: '/v1/object/put',
      body: { id, bytes_base64: bytes.toString('base64') },
    });
    return {
      id: result.id,
      bytes: Number(result.bytes || bytes.length),
      stored: true,
    };
  }

  async getObject(id) {
    const result = await this.request({
      method: 'POST',
      path: '/v1/object/get',
      body: { id },
    });
    return Buffer.from(String(result.bytes_base64 || ''), 'base64');
  }

  async readRef(name) {
    const result = await this.request({
      method: 'POST',
      path: '/v1/ref/read',
      body: { name },
    });
    return result.head || null;
  }

  async compareAndSwapRef(name, expected, next) {
    return await this.request({
      method: 'POST',
      path: '/v1/ref/cas',
      body: {
        name,
        expected: expected || null,
        next: next || null,
      },
    });
  }

  async advertiseRefs() {
    return await this.request({ method: 'GET', path: '/v1/refs' });
  }
}

export function createDirectHttpLineageRemote(baseUrl, options = {}) {
  return new HttpLineageRemote(directLineageRequester(baseUrl, options));
}

export function createYardRelayLineageRemote(options = {}) {
  return new HttpLineageRemote(yardRelayLineageRequester(options));
}
