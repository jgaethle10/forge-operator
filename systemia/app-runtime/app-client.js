import { createEvercraftCoreClient } from '../core/core-client.js';

function normalizeBaseUrl(value) {
  return String(value || '/api').replace(/\/$/, '');
}

function storage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

function tokenKey(appId = '') {
  return `evercraft.session.${String(appId || 'default')}`;
}

function readToken(appId) {
  return storage()?.getItem(tokenKey(appId)) || '';
}

function writeToken(appId, token) {
  const target = storage();
  if (!target) return;
  if (token) target.setItem(tokenKey(appId), String(token));
  else target.removeItem(tokenKey(appId));
}

async function request(baseUrl, route, payload, appId) {
  const headers = { 'content-type': 'application/json' };
  const token = readToken(appId);
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(normalizeBaseUrl(baseUrl) + route, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload ?? {}),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.ok === false) {
    throw new Error(body?.error || `evercraft_app_http_${response.status}`);
  }
  return Object.prototype.hasOwnProperty.call(body, 'value') ? body.value : body;
}

function entityApi(name, context) {
  return {
    list(sort = '-created_date', limit = 50, skip = 0) {
      return request(context.baseUrl, `/entities/${name}/list`, { sort, limit, skip }, context.appId);
    },
    filter(query = {}, sort = '-created_date', limit = 50, skip = 0) {
      return request(context.baseUrl, `/entities/${name}/filter`, { query, sort, limit, skip }, context.appId);
    },
    create(data = {}) {
      return request(context.baseUrl, `/entities/${name}/create`, { data }, context.appId);
    },
    update(id, data = {}) {
      return request(context.baseUrl, `/entities/${name}/update`, { id, data }, context.appId);
    },
    delete(id) {
      return request(context.baseUrl, `/entities/${name}/delete`, { id }, context.appId);
    },
    subscribe(callback, { intervalMs = 2000, limit = 100 } = {}) {
      if (typeof callback !== 'function') throw new Error('subscribe_callback_required');
      let stopped = false;
      let initialized = false;
      const seen = new Map();

      const poll = async () => {
        if (stopped) return;
        try {
          const rows = await request(
            context.baseUrl,
            `/entities/${name}/list`,
            { sort: '-updated_date', limit },
            context.appId,
          );
          for (const row of [...rows].reverse()) {
            const stamp = String(row.updated_date || row.created_date || '');
            const prior = seen.get(row.id);
            if (initialized && prior !== stamp) {
              callback({ type: prior ? 'update' : 'create', data: row });
            }
            seen.set(row.id, stamp);
          }
          initialized = true;
        } catch (error) {
          if (!stopped) callback({ type: 'error', error });
        }
      };

      poll();
      const timer = setInterval(poll, Math.max(500, Number(intervalMs || 2000)));
      return () => {
        stopped = true;
        clearInterval(timer);
      };
    },
  };
}

function authApi(context) {
  const call = (operation, ...args) =>
    request(context.baseUrl, `/auth/${operation}`, { args }, context.appId);

  return {
    async me() {
      return call('me');
    },
    async isAuthenticated() {
      if (!readToken(context.appId)) return false;
      try {
        const result = await call('isAuthenticated');
        return typeof result === 'boolean' ? result : Boolean(result?.authenticated ?? result);
      } catch {
        return false;
      }
    },
    async loginViaEmailPassword(...args) {
      const result = await call('loginViaEmailPassword', ...args);
      if (result?.token) writeToken(context.appId, result.token);
      return result;
    },
    async loginWithProvider(...args) {
      const result = await call('loginWithProvider', ...args);
      if (result?.token) writeToken(context.appId, result.token);
      return result;
    },
    async register(...args) {
      const result = await call('register', ...args);
      if (result?.token) writeToken(context.appId, result.token);
      return result;
    },
    verifyOtp(...args) {
      return call('verifyOtp', ...args).then((result) => {
        if (result?.token) writeToken(context.appId, result.token);
        return result;
      });
    },
    resendOtp(...args) {
      return call('resendOtp', ...args);
    },
    resetPasswordRequest(...args) {
      return call('resetPasswordRequest', ...args);
    },
    resetPassword(...args) {
      return call('resetPassword', ...args);
    },
    setToken(token) {
      writeToken(context.appId, token);
      return token;
    },
    async logout(...args) {
      try {
        return await call('logout', ...args);
      } finally {
        writeToken(context.appId, '');
      }
    },
    redirectToLogin(returnTo = '') {
      if (typeof window === 'undefined') return context.loginUrl;
      const target = new URL(context.loginUrl, window.location.origin);
      target.searchParams.set('returnTo', returnTo || window.location.href);
      window.location.assign(target.toString());
      return target.toString();
    },
  };
}

export function createEvercraftAppClient({
  appId = 'evercraft',
  token = '',
  serverUrl = '/api',
  appBaseUrl = '',
  loginUrl = '/login',
  coreBaseUrl = '/api/core',
} = {}) {
  const context = {
    appId: String(appId || 'evercraft'),
    baseUrl: normalizeBaseUrl(serverUrl || '/api'),
    appBaseUrl,
    loginUrl,
  };
  if (token) writeToken(context.appId, token);

  const entities = new Proxy({}, {
    get(_target, property) {
      if (typeof property !== 'string') return undefined;
      return entityApi(property, context);
    },
  });

  const functions = {
    async invoke(name, payload = {}) {
      const value = await request(context.baseUrl, '/functions/invoke', { name, payload }, context.appId);
      return { data: value };
    },
  };

  return {
    entities,
    auth: authApi(context),
    functions,
    integrations: {
      Core: createEvercraftCoreClient({ baseUrl: coreBaseUrl }),
    },
    appId: context.appId,
    appBaseUrl,
  };
}

export const createClient = createEvercraftAppClient;
