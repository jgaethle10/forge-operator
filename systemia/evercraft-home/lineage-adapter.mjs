const CONTROL_ROOM_READ_PATH = /^\/(?:health|v1\/(?:snapshot|commit|diff|integrity))(?:\?[^#]*)?$/;

function assertLoopbackComputeBridge(value) {
  const url = new URL(String(value || ''));
  if (url.protocol !== 'http:') {
    throw new Error('lineage_control_room_bridge_must_use_loopback_http');
  }
  if (!['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) {
    throw new Error('lineage_control_room_bridge_must_use_loopback_http');
  }
  if (!/^\/v1\/services\/[^/?#]+\/http-bridge$/.test(url.pathname)) {
    throw new Error('lineage_control_room_bridge_path_invalid');
  }
  if (url.search || url.hash) {
    throw new Error('lineage_control_room_bridge_path_invalid');
  }
  return url.toString();
}

function assertToken(value) {
  const token = String(value || '').trim();
  if (Buffer.byteLength(token, 'utf8') < 32) {
    throw new Error('lineage_control_room_bridge_token_invalid');
  }
  return token;
}

function controlPath(path) {
  const value = String(path || '');
  if (!CONTROL_ROOM_READ_PATH.test(value)) {
    throw new Error('lineage_control_room_path_not_allowed');
  }
  return value;
}

async function decodeOuterResponse(response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      String(body?.error || 'lineage_control_room_compute_bridge_failed')
    );
    error.status = response.status;
    error.body = body;
    throw error;
  }
  if (body?.ok !== true || !Number.isInteger(Number(body.status))) {
    throw new Error('lineage_control_room_compute_bridge_response_invalid');
  }
  const bytes = Buffer.from(String(body.body_base64 || ''), 'base64');
  return {
    status: Number(body.status),
    headers: body.headers || {},
    bytes,
    receipt: body.receipt || null,
  };
}

export class LineageControlRoomHomeBridge {
  constructor({
    bridgeUrl,
    bridgeToken,
    timeoutMs = 10_000,
  } = {}) {
    this.bridgeUrl = assertLoopbackComputeBridge(bridgeUrl);
    this.bridgeToken = assertToken(bridgeToken);
    this.timeoutMs = Math.max(
      500,
      Math.min(30_000, Number(timeoutMs || 10_000))
    );
  }

  async _get(path) {
    const requestPath = controlPath(path);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(this.bridgeUrl, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.bridgeToken}`,
        },
        body: JSON.stringify({
          method: 'GET',
          path: requestPath,
          headers: { accept: 'application/json,text/html;q=.9' },
          body_base64: '',
        }),
      });
      const inner = await decodeOuterResponse(response);
      if (inner.status < 200 || inner.status >= 300) {
        const text = inner.bytes.toString('utf8').slice(0, 4096);
        const error = new Error(
          `lineage_control_room_inner_http_${inner.status}`
        );
        error.status = inner.status;
        error.inner_body = text;
        throw error;
      }
      return inner;
    } finally {
      clearTimeout(timer);
    }
  }

  async health() {
    return this.json('/health');
  }

  async snapshot({ ref = 'HEAD', limit = 160 } = {}) {
    const bounded = Math.max(1, Math.min(500, Number(limit || 160)));
    const params = new URLSearchParams({
      ref: String(ref || 'HEAD'),
      limit: String(Math.floor(bounded)),
    });
    return this.json('/v1/snapshot?' + params.toString());
  }

  async commit(id) {
    const value = String(id || '').trim();
    if (!value) throw new Error('lineage_control_room_commit_required');
    return this.json(
      '/v1/commit?' + new URLSearchParams({ id: value }).toString()
    );
  }

  async diff(from, to) {
    const left = String(from || '').trim();
    const right = String(to || '').trim();
    if (!left || !right) {
      throw new Error('lineage_control_room_diff_refs_required');
    }
    return this.json(
      '/v1/diff?' +
        new URLSearchParams({ from: left, to: right }).toString()
    );
  }

  async integrity({ fast = true } = {}) {
    return this.json('/v1/integrity?fast=' + (fast ? '1' : '0'));
  }

  async json(path) {
    const result = await this._get(path);
    try {
      return JSON.parse(result.bytes.toString('utf8'));
    } catch {
      throw new Error('lineage_control_room_inner_json_invalid');
    }
  }

  status() {
    return {
      schema: 'evercraft.home.lineage-control-room-bridge.v1',
      configured: true,
      transport: 'evercraft-compute-resident-http-bridge',
      loopback_compute_only: true,
      read_only: true,
      mutation_authority: false,
      secret_material_exposed: false,
      bridge_url_exposed: false,
      bridge_token_exposed: false,
    };
  }
}

export function lineageControlRoomBridgeConfigured({
  bridgeUrl,
  bridgeToken,
} = {}) {
  return Boolean(String(bridgeUrl || '').trim() && String(bridgeToken || '').trim());
}

export const lineageHomeBridgePolicy = {
  read_path_pattern: CONTROL_ROOM_READ_PATH.source,
};
