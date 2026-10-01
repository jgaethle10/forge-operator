class AppFabricError extends Error {
  constructor(message, { status = 0, code = '', data = null } = {}) {
    super(message);
    this.name = 'EvercraftAppFabricError';
    this.status = status;
    this.code = code || message;
    this.data = data;
  }
}

function cleanOrigin(value) {
  const url = new URL(String(value || '').trim());
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('app_fabric_origin_invalid');
  return url.origin;
}

function queryString(params = {}) {
  const url = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === '' || (Array.isArray(value) && value.length === 0)) continue;
    url.set(key, Array.isArray(value) ? value.join(',') : String(value));
  }
  const text = url.toString();
  return text ? `?${text}` : '';
}

export function createEvercraftAppClient({
  appId,
  baseUrl,
  token = '',
  tokenProvider = null,
  servicePermit = '',
  fetchImpl = globalThis.fetch
} = {}) {
  const appKey = String(appId || '').trim();
  if (!appKey) throw new Error('app_id_required');
  const origin = cleanOrigin(baseUrl);
  if (typeof fetchImpl !== 'function') throw new Error('fetch_required');

  let currentToken = String(token || '').trim();

  const request = async (method, path, body = undefined, extraHeaders = {}) => {
    const resolvedToken = tokenProvider ? await tokenProvider() : currentToken;
    const headers = {
      accept: 'application/json',
      ...extraHeaders
    };
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (resolvedToken) headers.authorization = `Bearer ${resolvedToken}`;
    if (servicePermit) headers['x-evercraft-service-permit'] = servicePermit;

    const response = await fetchImpl(`${origin}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const code = data?.error?.code || data?.code || `app_fabric_http_${response.status}`;
      const message = data?.error?.message || data?.message || code;
      throw new AppFabricError(message, { status: response.status, code, data });
    }
    return data;
  };

  const entityClient = (entity) => {
    const root = `/api/apps/${encodeURIComponent(appKey)}/entities/${encodeURIComponent(entity)}`;
    return {
      async list(sort = '', limit = 100, skip = 0, fields = []) {
        if (sort && typeof sort === 'object' && !Array.isArray(sort)) {
          const options = sort;
          const params = {
            sort: options.sort || '',
            limit: options.limit ?? 100,
            cursor: options.cursor || '',
            fields: options.fields || []
          };
          if (options.distinct) params.distinct = options.distinct;
          const result = await request('GET', `${root}/v2/list${queryString(params)}`);
          return result;
        }
        return await request('GET', `${root}${queryString({ sort, limit, skip, fields })}`);
      },
      async filter(query = {}, sort = '', limit = 100, skip = 0, fields = []) {
        if (sort && typeof sort === 'object' && !Array.isArray(sort)) {
          const options = sort;
          return await request('GET', `${root}/v2/list${queryString({
            q: JSON.stringify(query || {}),
            sort: options.sort || '',
            limit: options.limit ?? 100,
            cursor: options.cursor || '',
            fields: options.fields || []
          })}`);
        }
        return await request('GET', `${root}${queryString({
          q: JSON.stringify(query || {}),
          sort,
          limit,
          skip,
          fields
        })}`);
      },
      async get(id) {
        return await request('GET', `${root}/${encodeURIComponent(id)}`);
      },
      async create(record) {
        return await request('POST', root, record);
      },
      async update(id, patch) {
        return await request('PUT', `${root}/${encodeURIComponent(id)}`, patch);
      },
      async delete(id) {
        return await request('DELETE', `${root}/${encodeURIComponent(id)}`);
      },
      async deleteMany(query = {}) {
        return await request('DELETE', root, query);
      },
      async bulkCreate(records) {
        return await request('POST', `${root}/bulk`, records);
      },
      async importEntities(records) {
        return await request('POST', `${root}/import`, records);
      },
      async updateMany(query, data) {
        return await request('PATCH', `${root}/update-many`, { query, data });
      },
      async count(query = {}) {
        const result = await request('GET', `${root}/count${queryString({ q: JSON.stringify(query || {}) })}`);
        return Number(result?.count || 0);
      },
      async aggregate(spec = {}) {
        return await request('POST', `${root}/aggregate`, spec);
      },
      async upsert(records, options = {}) {
        return await request('POST', `${root}/upsert`, { records, key: options.key || 'id' });
      },
      async bulkUpdate(records) {
        return await request('PUT', `${root}/bulk`, records);
      },
      subscribe(callback, options = {}) {
        if (typeof callback !== 'function') throw new AppFabricError('realtime_callback_required', { code: 'realtime_callback_required' });
        const controller = new AbortController();
        const externalSignal = options?.signal || null;
        if (externalSignal) {
          if (externalSignal.aborted) controller.abort();
          else externalSignal.addEventListener('abort', () => controller.abort(), { once: true });
        }
        let lastSequence = Math.max(0, Number(options?.afterSequence || 0) || 0);
        let readyResolve;
        let readyReject;
        let readySettled = false;
        const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
        const task = (async () => {
          try {
            const resolvedToken = tokenProvider ? await tokenProvider() : currentToken;
            const headers = { accept: 'text/event-stream' };
            if (resolvedToken) headers.authorization = `Bearer ${resolvedToken}`;
            if (servicePermit) headers['x-evercraft-service-permit'] = servicePermit;
            if (lastSequence > 0) headers['last-event-id'] = String(lastSequence);
            const response = await fetchImpl(`${origin}${root}/subscribe?after=${encodeURIComponent(lastSequence)}`, {
              method: 'GET',
              headers,
              signal: controller.signal
            });
            if (!response.ok) {
              const data = await response.json().catch(() => null);
              const code = data?.error?.code || `app_fabric_http_${response.status}`;
              throw new AppFabricError(data?.error?.message || code, { status: response.status, code, data });
            }
            if (!response.body?.getReader) throw new AppFabricError('realtime_stream_unavailable', { code: 'realtime_stream_unavailable' });
            readySettled = true;
            readyResolve(true);
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            while (true) {
              const { value, done } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              const blocks = buffer.split(/\r?\n\r?\n/);
              buffer = blocks.pop() || '';
              for (const block of blocks) {
                const dataLines = block.split(/\r?\n/)
                  .filter((line) => line.startsWith('data:'))
                  .map((line) => line.slice(5).trimStart());
                if (!dataLines.length) continue;
                const event = JSON.parse(dataLines.join('\n'));
                if (Number.isFinite(Number(event?.sequence))) lastSequence = Number(event.sequence);
                await callback(event);
              }
            }
            return true;
          } catch (error) {
            if (error?.name === 'AbortError' || controller.signal.aborted) {
              if (!readySettled) { readySettled = true; readyResolve(false); }
              return false;
            }
            if (!readySettled) { readySettled = true; readyReject(error); }
            if (typeof options?.onError === 'function') await options.onError(error);
            return false;
          }
        })();
        const unsubscribe = () => controller.abort();
        unsubscribe.ready = ready;
        unsubscribe.done = task;
        Object.defineProperty(unsubscribe, 'lastSequence', { get: () => lastSequence });
        return unsubscribe;
      }
    };
  };

  const entities = new Proxy({}, {
    get(_target, property) {
      if (typeof property !== 'string' || property === 'then' || property.startsWith('_')) return undefined;
      return entityClient(property);
    }
  });

  const integrations = new Proxy({}, {
    get(_target, provider) {
      if (typeof provider !== 'string' || provider === 'then' || provider.startsWith('_')) return undefined;
      if (provider === 'custom') {
        return {
          call: async (slug, operation, input = {}) =>
            await request(
              'POST',
              `/api/apps/${encodeURIComponent(appKey)}/integrations/custom/${encodeURIComponent(slug)}/${encodeURIComponent(operation)}`,
              input
            )
        };
      }
      return new Proxy({}, {
        get(_inner, operation) {
          if (typeof operation !== 'string' || operation === 'then' || operation.startsWith('_')) return undefined;
          return async (input = {}) => {
            const path = provider === 'Core'
              ? `/api/apps/${encodeURIComponent(appKey)}/integration-endpoints/Core/${encodeURIComponent(operation)}`
              : `/api/apps/${encodeURIComponent(appKey)}/integration-endpoints/installable/${encodeURIComponent(provider)}/integration-endpoints/${encodeURIComponent(operation)}`;
            return await request('POST', path, input);
          };
        }
      });
    }
  });

  const auth = {
    hasToken() {
      return Boolean(currentToken || tokenProvider);
    },
    setToken(nextToken) {
      currentToken = String(nextToken || '').trim();
    },
    async isAuthenticated() {
      if (!currentToken && !tokenProvider) return false;
      try {
        await request('GET', `/api/apps/${encodeURIComponent(appKey)}/entities/User/me`);
        return true;
      } catch (error) {
        if (error?.status === 401 || error?.status === 403) return false;
        throw error;
      }
    },
    async me() {
      return await request('GET', `/api/apps/${encodeURIComponent(appKey)}/entities/User/me`);
    },
    async updateMe(patch) {
      return await request('PUT', `/api/apps/${encodeURIComponent(appKey)}/entities/User/me`, patch);
    },
    async register(input = {}, password = undefined) {
      const body = typeof input === 'string'
        ? { email: input, login: input, password }
        : { ...(input || {}) };
      return await request('POST', `/api/apps/${encodeURIComponent(appKey)}/auth/register`, body);
    },
    async verifyOtp(input = {}) {
      return await request('POST', `/api/apps/${encodeURIComponent(appKey)}/auth/verify-otp`, input || {});
    },
    async resendOtp(input = {}) {
      const body = typeof input === 'string' ? { email: input, login: input } : (input || {});
      return await request('POST', `/api/apps/${encodeURIComponent(appKey)}/auth/resend-otp`, body);
    },
    async resetPasswordRequest(input = {}) {
      const body = typeof input === 'string' ? { email: input, login: input } : (input || {});
      return await request('POST', `/api/apps/${encodeURIComponent(appKey)}/auth/reset-password-request`, body);
    },
    async resetPassword(input = {}) {
      return await request('POST', `/api/apps/${encodeURIComponent(appKey)}/auth/reset-password`, input || {});
    },
    async loginViaEmailPassword(login, password, extras = {}) {
      const result = await request('POST', `/api/apps/${encodeURIComponent(appKey)}/auth/login`, {
        email: login,
        login,
        password,
        ...extras
      });
      const next = result?.access_token || result?.token || '';
      if (next) currentToken = next;
      return result;
    },
    async logout() {
      const result = await request('POST', `/api/apps/${encodeURIComponent(appKey)}/auth/logout`, {});
      currentToken = '';
      return result;
    },
    redirectToLogin(fromUrl = '') {
      if (typeof window === 'undefined') throw new Error('browser_environment_required');
      const from = fromUrl || window.location.href;
      window.location.href = `${origin}/login?app=${encodeURIComponent(appKey)}&from_url=${encodeURIComponent(from)}`;
    },
    loginWithProvider(provider, fromUrl = '/') {
      if (typeof window === 'undefined') throw new Error('browser_environment_required');
      const from = new URL(fromUrl, window.location.origin).toString();
      window.location.href = `${origin}/api/apps/${encodeURIComponent(appKey)}/auth/${encodeURIComponent(provider)}/login?from_url=${encodeURIComponent(from)}`;
    }
  };

  const app = {
    async getPublicSettings() {
      return await request(
        'GET',
        `/api/apps/public/prod/public-settings/by-id/${encodeURIComponent(appKey)}`
      );
    }
  };

  const appLogs = {
    async logUserInApp(pageName = '', metadata = {}) {
      return await request(
        'POST',
        `/api/apps/${encodeURIComponent(appKey)}/app-logs/user-in-app`,
        {
          page_name: String(pageName || '').slice(0, 240),
          metadata: metadata && typeof metadata === 'object' && !Array.isArray(metadata)
            ? metadata
            : {}
        }
      );
    }
  };

  return {
    getConfig() {
      return {
        appId: appKey,
        baseUrl: origin,
        serverUrl: origin,
        transport: 'evercraft-app-fabric'
      };
    },
    entities,
    functions: {
      async invoke(functionName, input = {}) {
        const data = await request(
          'POST',
          `/api/apps/${encodeURIComponent(appKey)}/functions/${encodeURIComponent(functionName)}`,
          input
        );
        return { data };
      }
    },
    integrations,
    auth,
    app,
    appLogs,
    get asServiceRole() {
      if (!servicePermit) throw new AppFabricError('service_permit_required', { code: 'service_permit_required' });
      return createEvercraftAppClient({
        appId: appKey,
        baseUrl: origin,
        servicePermit,
        fetchImpl
      });
    }
  };
}

export function createClientFromRequest(request, {
  appId = process.env.EVERCRAFT_APP_KEY,
  baseUrl = process.env.EVERCRAFT_APP_FABRIC_URL,
  servicePermit = process.env.EVERCRAFT_APP_SERVICE_PERMIT || '',
  fetchImpl = globalThis.fetch
} = {}) {
  const authorization = String(request?.headers?.get?.('authorization') || request?.headers?.authorization || '');
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  return createEvercraftAppClient({
    appId,
    baseUrl,
    token,
    servicePermit,
    fetchImpl
  });
}

export { AppFabricError };
