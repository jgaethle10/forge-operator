import http from 'node:http';
import { URL } from 'node:url';
import { safeKey } from './query.mjs';

const DEFAULT_MAX_BODY_BYTES = 8 * 1024 * 1024;

function json(response, status, body, headers = {}) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
    ...headers
  });
  response.end(payload);
}

function empty(response, status = 204, headers = {}) {
  response.writeHead(status, { 'cache-control': 'no-store', ...headers });
  response.end();
}

function redirect(response, location, status = 302, headers = {}) {
  const target = String(location || '').trim();
  if (!target) throw new Error('redirect_location_required');
  response.writeHead(status, {
    location: target,
    'cache-control': 'no-store',
    ...headers
  });
  response.end();
}

function bearer(request) {
  const raw = String(request.headers.authorization || '');
  return raw.startsWith('Bearer ') ? raw.slice(7).trim() : '';
}

async function readBody(request, maxBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) throw new Error('request_body_too_large');
    chunks.push(chunk);
  }
  if (!chunks.length) return null;
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) return null;
  return JSON.parse(raw);
}

function parseJsonParam(url, name, fallback) {
  const raw = url.searchParams.get(name);
  if (!raw) return fallback;
  return JSON.parse(raw);
}

function intParam(url, name, fallback) {
  const raw = url.searchParams.get(name);
  if (raw == null || raw === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function fieldsParam(url) {
  const raw = url.searchParams.get('fields');
  return raw ? raw.split(',').map((v) => v.trim()).filter(Boolean) : [];
}

function corsHeaders(request, allowedOrigins) {
  const origin = String(request.headers.origin || '');
  if (!origin || !allowedOrigins.length) return {};
  if (!allowedOrigins.includes(origin)) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-credentials': 'true',
    'access-control-allow-headers': 'authorization,content-type,x-evercraft-service-permit,x-evercraft-request-id',
    'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    vary: 'Origin'
  };
}

function httpError(error) {
  const code = String(error?.message || error || 'app_fabric_error');
  if (code.includes('not_found')) return 404;
  if (code.includes('unauthorized') || code.includes('authentication') || code.includes('credentials')) return 401;
  if (code.includes('forbidden') || code.includes('denied') || code.includes('permit')) return 403;
  if (code.includes('conflict')) return 409;
  if (code.includes('too_large')) return 413;
  if (code.includes('invalid') || code.includes('required') || code.includes('unsupported')) return 400;
  return 500;
}

async function maybe(value) {
  return await value;
}

export function createAppFabricHandler({
  store,
  authorize,
  identityResolver = async () => null,
  serviceAuthorizer = async () => false,
  functionInvoker = null,
  integrationInvoker = null,
  authHandlers = {},
  appLogSink = null,
  realtimeBus = null,
  realtimePollMs = 100,
  realtimeHeartbeatMs = 15_000,
  allowedOrigins = [],
  maxBodyBytes = DEFAULT_MAX_BODY_BYTES
} = {}) {
  if (!store) throw new Error('app_fabric_store_required');
  if (typeof authorize !== 'function') throw new Error('app_fabric_authorizer_required');

  return async function appFabricHandler(request, response) {
    const cors = corsHeaders(request, allowedOrigins);
    if (request.method === 'OPTIONS') return empty(response, 204, cors);

    try {
      const url = new URL(request.url || '/', 'http://app-fabric.local');
      if (url.pathname === '/health') {
        return json(response, 200, {
          schema: 'evercraft.app-fabric.health.v1',
          state: 'healthy',
          entity_store: store.health(),
          realtime: realtimeBus ? realtimeBus.health() : { state: 'not_configured' }
        }, cors);
      }

      const publicSettingsMatch = url.pathname.match(/^\/api\/apps\/public\/prod\/public-settings\/by-id\/([^/]+)$/);
      if (publicSettingsMatch && request.method === 'GET') {
        if (typeof authHandlers.publicSettings !== 'function') throw new Error('public_settings_unsupported');
        const requestedAppKey = safeKey(decodeURIComponent(publicSettingsMatch[1]), 'app_key');
        return json(response, 200, await maybe(authHandlers.publicSettings({
          appKey: requestedAppKey,
          request
        })), cors);
      }

      const appMatch = url.pathname.match(/^\/api\/apps\/([^/]+)\/(.+)$/);
      if (!appMatch) return json(response, 404, { error: 'route_not_found' }, cors);
      const appKey = safeKey(decodeURIComponent(appMatch[1]), 'app_key');
      const remainder = appMatch[2];
      const token = bearer(request);
      const servicePermit = String(request.headers['x-evercraft-service-permit'] || '').trim();
      const serviceRole = servicePermit
        ? Boolean(await maybe(serviceAuthorizer({ request, appKey, permit: servicePermit })))
        : false;
      if (servicePermit && !serviceRole) throw new Error('service_permit_denied');
      const identity = serviceRole ? null : await maybe(identityResolver({ request, appKey, token }));
      const subjectRef = identity?.subject_ref || identity?.subjectRef || null;

      const require = async (input) => {
        const decision = await maybe(authorize({
          request,
          appKey,
          serviceRole,
          subjectRef,
          identity,
          ...input
        }));
        const allowed = decision === true || decision?.decision === 'allow' || decision?.allowed === true;
        if (!allowed) throw new Error('app_fabric_access_denied');
        return decision;
      };

      const entityMatch = remainder.match(/^entities\/([^/]+)(?:\/(.*))?$/);
      if (entityMatch) {
        const entity = safeKey(decodeURIComponent(entityMatch[1]), 'entity');
        const tail = entityMatch[2] ? decodeURIComponent(entityMatch[2]) : '';

        if (entity === 'User' && tail === 'me') {
          await require({ kind: 'auth', operation: request.method === 'PUT' ? 'user.update_me' : 'user.me', entity });
          if (!subjectRef && !serviceRole) throw new Error('authentication_required');
          if (request.method === 'GET') {
            if (typeof authHandlers.me !== 'function') throw new Error('auth_me_unsupported');
            return json(response, 200, await maybe(authHandlers.me({ appKey, subjectRef, identity, serviceRole })), cors);
          }
          if (request.method === 'PUT') {
            const body = await readBody(request, maxBodyBytes);
            if (typeof authHandlers.updateMe !== 'function') throw new Error('auth_update_me_unsupported');
            return json(response, 200, await maybe(authHandlers.updateMe({ appKey, subjectRef, identity, body })), cors);
          }
          return json(response, 405, { error: 'method_not_allowed' }, cors);
        }

        if (request.method === 'GET' && tail === 'subscribe') {
          if (!realtimeBus) throw new Error('realtime_not_configured');
          await require({ kind: 'entity', operation: 'subscribe', entity });
          let afterSequence = Math.max(
            0,
            Number(request.headers['last-event-id'] || url.searchParams.get('after') || 0) || 0
          );
          const pollMs = Math.max(25, Math.min(5000, Number(realtimePollMs || 100)));
          const heartbeatMs = Math.max(1000, Math.min(120000, Number(realtimeHeartbeatMs || 15000)));
          response.writeHead(200, {
            'content-type': 'text/event-stream; charset=utf-8',
            'cache-control': 'no-store, no-transform',
            connection: 'keep-alive',
            'x-accel-buffering': 'no',
            ...cors
          });
          response.write(': ready\n\n');
          let closed = false;
          let lastHeartbeat = Date.now();
          const close = () => { closed = true; clearInterval(timer); };
          const pump = () => {
            if (closed || response.destroyed || response.writableEnded) return;
            const events = realtimeBus.read(appKey, entity, { afterSequence, limit: 250 });
            for (const event of events) {
              response.write(`id: ${event.sequence}\n`);
              response.write('event: entity\n');
              response.write(`data: ${JSON.stringify(event)}\n\n`);
              afterSequence = event.sequence;
              lastHeartbeat = Date.now();
            }
            if (Date.now() - lastHeartbeat >= heartbeatMs) {
              response.write(`: heartbeat ${Date.now()}\n\n`);
              lastHeartbeat = Date.now();
            }
          };
          const timer = setInterval(pump, pollMs);
          timer.unref?.();
          request.once('aborted', close);
          response.once('close', close);
          pump();
          return;
        }

        if (request.method === 'GET' && tail === 'count') {
          const query = parseJsonParam(url, 'q', {});
          await require({ kind: 'entity', operation: 'count', entity, query });
          return json(response, 200, { count: store.count(appKey, entity, query) }, cors);
        }

        if (request.method === 'GET' && tail === 'v2/list') {
          const query = parseJsonParam(url, 'q', {});
          const sort = url.searchParams.get('sort') || '';
          const limit = intParam(url, 'limit', 100);
          const cursor = Math.max(0, Number(url.searchParams.get('cursor') || 0));
          const fields = fieldsParam(url);
          await require({ kind: 'entity', operation: 'list', entity, query });
          const data = store.list(appKey, entity, { query, sort, limit, skip: cursor, fields });
          const nextCursor = data.length === limit ? String(cursor + data.length) : null;
          return json(response, 200, { data, next_cursor: nextCursor }, cors);
        }

        if (request.method === 'GET' && tail) {
          await require({ kind: 'entity', operation: 'get', entity, entityId: tail });
          return json(response, 200, store.get(appKey, entity, tail), cors);
        }

        if (request.method === 'GET' && !tail) {
          const query = parseJsonParam(url, 'q', {});
          const sort = url.searchParams.get('sort') || '';
          const limit = intParam(url, 'limit', 100);
          const skip = intParam(url, 'skip', 0);
          const fields = fieldsParam(url);
          await require({ kind: 'entity', operation: 'list', entity, query });
          return json(response, 200, store.list(appKey, entity, { query, sort, limit, skip, fields }), cors);
        }

        if (request.method === 'POST' && tail === 'bulk') {
          const body = await readBody(request, maxBodyBytes);
          await require({ kind: 'entity', operation: 'bulk_create', entity, body });
          return json(response, 200, store.bulkCreate(appKey, entity, body || []).records, cors);
        }

        if (request.method === 'POST' && tail === 'import') {
          const body = await readBody(request, maxBodyBytes);
          await require({ kind: 'entity', operation: 'import_entities', entity, body });
          const rows = Array.isArray(body) ? body : (Array.isArray(body?.records) ? body.records : []);
          return json(response, 200, store.bulkCreate(appKey, entity, rows).records, cors);
        }

        if (request.method === 'POST' && tail === 'aggregate') {
          const body = await readBody(request, maxBodyBytes);
          await require({ kind: 'entity', operation: 'aggregate', entity, body });
          return json(response, 200, store.aggregate(appKey, entity, body || {}), cors);
        }

        if (request.method === 'POST' && tail === 'upsert') {
          const body = await readBody(request, maxBodyBytes);
          await require({ kind: 'entity', operation: 'upsert', entity, body });
          return json(response, 200, store.upsert(
            appKey,
            entity,
            Array.isArray(body?.records) ? body.records : [],
            { key: body?.key || 'id' }
          ).records, cors);
        }

        if (request.method === 'POST' && !tail) {
          const body = await readBody(request, maxBodyBytes);
          await require({ kind: 'entity', operation: 'create', entity, body });
          return json(response, 200, store.create(appKey, entity, body || {}).record, cors);
        }

        if (request.method === 'PUT' && tail === 'bulk') {
          const body = await readBody(request, maxBodyBytes);
          await require({ kind: 'entity', operation: 'bulk_update', entity, body });
          return json(response, 200, store.bulkUpdate(appKey, entity, body || []).records, cors);
        }

        if (request.method === 'PUT' && tail) {
          const body = await readBody(request, maxBodyBytes);
          await require({ kind: 'entity', operation: 'update', entity, entityId: tail, body });
          return json(response, 200, store.update(appKey, entity, tail, body || {}).record, cors);
        }

        if (request.method === 'PATCH' && tail === 'update-many') {
          const body = await readBody(request, maxBodyBytes);
          await require({ kind: 'entity', operation: 'update_many', entity, body });
          return json(response, 200, store.updateMany(
            appKey,
            entity,
            body?.query || {},
            body?.data || {}
          ).records, cors);
        }

        if (request.method === 'DELETE' && tail) {
          await require({ kind: 'entity', operation: 'delete', entity, entityId: tail });
          return json(response, 200, store.delete(appKey, entity, tail).record, cors);
        }

        if (request.method === 'DELETE' && !tail) {
          const body = await readBody(request, maxBodyBytes);
          await require({ kind: 'entity', operation: 'delete_many', entity, body });
          const result = store.deleteMany(appKey, entity, body || {});
          return json(response, 200, { deleted_count: result.deleted_count }, cors);
        }

        return json(response, 405, { error: 'method_not_allowed' }, cors);
      }

      const functionMatch = remainder.match(/^functions\/([^/]+)$/);
      if (functionMatch) {
        const functionName = safeKey(decodeURIComponent(functionMatch[1]), 'function_name');
        if (request.method !== 'POST') return json(response, 405, { error: 'method_not_allowed' }, cors);
        if (typeof functionInvoker !== 'function') throw new Error('function_runtime_unsupported');
        const body = await readBody(request, maxBodyBytes);
        await require({ kind: 'function', operation: 'invoke', functionName, body });
        const result = await maybe(functionInvoker({
          appKey,
          functionName,
          body: body || {},
          subjectRef,
          identity,
          serviceRole,
          request
        }));
        return json(response, 200, result ?? null, cors);
      }

      const coreIntegration = remainder.match(/^integration-endpoints\/Core\/([^/]+)$/);
      if (coreIntegration) {
        const operation = safeKey(decodeURIComponent(coreIntegration[1]), 'integration_operation');
        if (request.method !== 'POST') return json(response, 405, { error: 'method_not_allowed' }, cors);
        if (typeof integrationInvoker !== 'function') throw new Error('integration_runtime_unsupported');
        const body = await readBody(request, maxBodyBytes);
        await require({ kind: 'integration', operation: 'invoke', provider: 'Core', integrationOperation: operation, body });
        const result = await maybe(integrationInvoker({
          appKey,
          provider: 'Core',
          operation,
          body: body || {},
          subjectRef,
          identity,
          serviceRole,
          request
        }));
        return json(response, 200, result ?? null, cors);
      }

      const installable = remainder.match(/^integration-endpoints\/installable\/([^/]+)\/integration-endpoints\/([^/]+)$/);
      if (installable) {
        const provider = safeKey(decodeURIComponent(installable[1]), 'integration_provider');
        const operation = safeKey(decodeURIComponent(installable[2]), 'integration_operation');
        if (request.method !== 'POST') return json(response, 405, { error: 'method_not_allowed' }, cors);
        if (typeof integrationInvoker !== 'function') throw new Error('integration_runtime_unsupported');
        const body = await readBody(request, maxBodyBytes);
        await require({ kind: 'integration', operation: 'invoke', provider, integrationOperation: operation, body });
        const result = await maybe(integrationInvoker({
          appKey,
          provider,
          operation,
          body: body || {},
          subjectRef,
          identity,
          serviceRole,
          request
        }));
        return json(response, 200, result ?? null, cors);
      }

      const customIntegration = remainder.match(/^integrations\/custom\/([^/]+)\/([^/]+)$/);
      if (customIntegration) {
        const provider = safeKey(decodeURIComponent(customIntegration[1]), 'integration_provider');
        const operation = safeKey(decodeURIComponent(customIntegration[2]), 'integration_operation');
        if (request.method !== 'POST') return json(response, 405, { error: 'method_not_allowed' }, cors);
        if (typeof integrationInvoker !== 'function') throw new Error('integration_runtime_unsupported');
        const body = await readBody(request, maxBodyBytes);
        await require({ kind: 'integration', operation: 'invoke', provider, integrationOperation: operation, body });
        const result = await maybe(integrationInvoker({
          appKey,
          provider,
          operation,
          body: body || {},
          subjectRef,
          identity,
          serviceRole,
          request
        }));
        return json(response, 200, result ?? null, cors);
      }

      if (remainder === 'auth/login' && request.method === 'POST') {
        if (typeof authHandlers.login !== 'function') throw new Error('auth_login_unsupported');
        const body = await readBody(request, maxBodyBytes);
        const result = await maybe(authHandlers.login({ appKey, body: body || {}, request }));
        return json(response, 200, result, cors);
      }

      if (remainder === 'auth/logout' && request.method === 'POST') {
        if (typeof authHandlers.logout !== 'function') return json(response, 200, { logged_out: true }, cors);
        return json(response, 200, await maybe(authHandlers.logout({ appKey, subjectRef, identity, request })), cors);
      }

      if (remainder === 'app-logs/user-in-app' && request.method === 'POST') {
        const body = await readBody(request, maxBodyBytes);
        await require({ kind: 'telemetry', operation: 'log_user_in_app', body });
        if (typeof appLogSink !== 'function') {
          return json(response, 202, {
            recorded: false,
            state: 'telemetry_sink_not_configured',
            external_action_taken: false
          }, cors);
        }
        return json(response, 200, await maybe(appLogSink({
          appKey,
          subjectRef,
          identity,
          pageName: String(body?.page_name || '').slice(0, 240),
          metadata: body?.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
            ? body.metadata
            : {},
          request
        })), cors);
      }

            const authActionMatch = remainder.match(/^auth\/(register|verify-otp|resend-otp|reset-password-request|reset-password)$/);
      if (authActionMatch) {
        if (request.method !== 'POST') return json(response, 405, { error: 'method_not_allowed' }, cors);
        const handlerName = {
          'register': 'register',
          'verify-otp': 'verifyOtp',
          'resend-otp': 'resendOtp',
          'reset-password-request': 'resetPasswordRequest',
          'reset-password': 'resetPassword'
        }[authActionMatch[1]];
        if (typeof authHandlers[handlerName] !== 'function') throw new Error(`auth_${authActionMatch[1]}_unsupported`);
        const body = await readBody(request, maxBodyBytes);
        return json(response, 200, await maybe(authHandlers[handlerName]({
          appKey,
          body: body || {},
          request
        })), cors);
      }

      const providerLoginMatch = remainder.match(/^auth\/([^/]+)\/login$/);
      if (providerLoginMatch && request.method === 'GET') {
        if (typeof authHandlers.providerLogin !== 'function') throw new Error('auth_provider_login_unsupported');
        const provider = safeKey(decodeURIComponent(providerLoginMatch[1]), 'auth_provider');
        const result = await maybe(authHandlers.providerLogin({
          appKey,
          provider,
          fromUrl: url.searchParams.get('from_url') || '/',
          request
        }));
        const target = typeof result === 'string' ? result : result?.redirect_url;
        return redirect(response, target, Number(result?.status || 302), cors);
      }

      return json(response, 404, { error: 'route_not_found' }, cors);
    } catch (error) {
      return json(response, httpError(error), {
        error: {
          code: String(error?.message || 'app_fabric_error'),
          message: httpError(error) >= 500 ? 'App Fabric request failed.' : String(error?.message || 'request_failed')
        }
      }, cors);
    }
  };
}

export function startAppFabricGateway({
  host = '127.0.0.1',
  port = 0,
  ...options
} = {}) {
  const handler = createAppFabricHandler(options);
  const server = http.createServer((request, response) => {
    handler(request, response).catch((error) => {
      if (!response.headersSent) {
        json(response, 500, { error: { code: 'app_fabric_unhandled', message: String(error?.message || error) } });
      } else {
        response.destroy(error);
      }
    });
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      const address = server.address();
      resolve({
        server,
        host,
        port: typeof address === 'object' && address ? address.port : port,
        origin: `http://${host}:${typeof address === 'object' && address ? address.port : port}`
      });
    });
  });
}
