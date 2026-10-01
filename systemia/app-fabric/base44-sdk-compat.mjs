import { AppFabricError, createEvercraftAppClient } from './client.mjs';

function browserOrigin() {
  if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin;
  return '';
}

function normalizeOrigin(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const base = browserOrigin() || 'http://app-fabric.local';
  const url = new URL(text, base);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('app_fabric_origin_invalid');
  return url.origin;
}

function resolveFabricOrigin(config = {}) {
  const explicit =
    config.evercraftBaseUrl ||
    config.baseUrl ||
    (typeof process !== 'undefined' ? process.env?.EVERCRAFT_APP_FABRIC_URL : '') ||
    '';
  if (explicit) return normalizeOrigin(explicit);

  const legacyServer = String(config.serverUrl || '').trim();
  if (legacyServer) return normalizeOrigin(legacyServer);

  const current = browserOrigin();
  if (current) return current;
  throw new Error('evercraft_app_fabric_url_required');
}

function localToken() {
  if (typeof window === 'undefined' || !window.localStorage) return '';
  return (
    window.localStorage.getItem('evercraft_access_token') ||
    window.localStorage.getItem('base44_access_token') ||
    window.localStorage.getItem('token') ||
    ''
  );
}

function writeCompatToken(token) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  const value = String(token || '').trim();
  const keys = ['evercraft_access_token', 'base44_access_token', 'token'];
  for (const key of keys) {
    if (value) window.localStorage.setItem(key, value);
    else window.localStorage.removeItem(key);
  }
}

export function createClient(config = {}) {
  const appId = String(config.appId || config.app_id || '').trim();
  if (!appId) throw new Error('app_id_required');
  const baseUrl = resolveFabricOrigin(config);
  const initialToken = String(config.token || localToken() || '').trim();

  const client = createEvercraftAppClient({
    appId,
    baseUrl,
    token: initialToken,
    tokenProvider: config.tokenProvider || null,
    servicePermit: config.servicePermit || config.service_permit || '',
    fetchImpl: config.fetchImpl || globalThis.fetch
  });

  const rawSetToken = client.auth.setToken.bind(client.auth);
  client.auth.setToken = (nextToken) => {
    rawSetToken(nextToken);
    if (config.persistToken !== false) writeCompatToken(nextToken);
  };

  const rawLogin = client.auth.loginViaEmailPassword.bind(client.auth);
  client.auth.loginViaEmailPassword = async (...args) => {
    const result = await rawLogin(...args);
    const next = result?.access_token || result?.token || '';
    if (next && config.persistToken !== false) writeCompatToken(next);
    return result;
  };

  const rawVerifyOtp = client.auth.verifyOtp.bind(client.auth);
  client.auth.verifyOtp = async (...args) => {
    const result = await rawVerifyOtp(...args);
    const next = result?.access_token || result?.token || '';
    if (next) {
      rawSetToken(next);
      if (config.persistToken !== false) writeCompatToken(next);
    }
    return result;
  };

  const rawLogout = client.auth.logout.bind(client.auth);
  client.auth.logout = async (fromUrl = '') => {
    try {
      const result = await rawLogout();
      if (fromUrl && typeof window !== 'undefined') {
        window.location.assign(String(fromUrl));
      }
      return result;
    } finally {
      if (config.persistToken !== false) writeCompatToken('');
    }
  };

  const baseGetConfig = client.getConfig.bind(client);
  client.getConfig = () => ({
    ...baseGetConfig(),
    appId,
    functionsVersion: config.functionsVersion || null,
    requiresAuth: Boolean(config.requiresAuth),
    appBaseUrl: config.appBaseUrl || null,
    legacy_sdk_compatibility: true,
    source_platform_dependency: false
  });

  return client;
}

function joinUrl(baseURL, requestPath) {
  const base = String(baseURL || '').trim();
  const path = String(requestPath || '').trim();
  const origin = browserOrigin() || 'http://app-fabric.local';
  if (/^https?:\/\//i.test(path)) return path;
  if (/^https?:\/\//i.test(base)) {
    const relativePath = path.replace(/^\/+/, '');
    return new URL(relativePath, base.endsWith('/') ? base : base + '/').toString();
  }
  const merged = [base.replace(/\/$/, ''), path.replace(/^\//, '')].filter(Boolean).join('/');
  return new URL('/' + merged.replace(/^\//, ''), origin).toString();
}

export function createAxiosClient({
  baseURL = '',
  headers = {},
  token = '',
  interceptResponses = true,
  fetchImpl = globalThis.fetch
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('fetch_required');

  const execute = async (method, requestPath, body = undefined, options = {}) => {
    const requestHeaders = {
      accept: 'application/json',
      ...headers,
      ...(options?.headers || {})
    };
    const resolvedToken = String(options?.token || token || localToken() || '').trim();
    if (resolvedToken) requestHeaders.authorization = `Bearer ${resolvedToken}`;

    let payload = body;
    const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
    const isBlob = typeof Blob !== 'undefined' && body instanceof Blob;
    const isBinary = body instanceof Uint8Array || body instanceof ArrayBuffer;
    if (body !== undefined && body !== null && !isForm && !isBlob && !isBinary && typeof body !== 'string') {
      requestHeaders['content-type'] = requestHeaders['content-type'] || 'application/json';
      payload = JSON.stringify(body);
    }

    const response = await fetchImpl(joinUrl(baseURL, requestPath), {
      method,
      headers: requestHeaders,
      body: ['GET', 'HEAD'].includes(method) ? undefined : payload
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const code = data?.error?.code || data?.code || `app_fabric_http_${response.status}`;
      const message = data?.error?.message || data?.message || code;
      throw new AppFabricError(message, { status: response.status, code, data });
    }

    if (interceptResponses) return data;
    return {
      data,
      status: response.status,
      headers: response.headers
    };
  };

  return {
    get: (path, options) => execute('GET', path, undefined, options),
    post: (path, body, options) => execute('POST', path, body, options),
    put: (path, body, options) => execute('PUT', path, body, options),
    patch: (path, body, options) => execute('PATCH', path, body, options),
    delete: (path, options = {}) => execute('DELETE', path, options?.data, options)
  };
}
