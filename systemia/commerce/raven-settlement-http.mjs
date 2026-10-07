import {
  buildRavenSettlementAdapters,
  createRavenSettlementGateway,
} from './raven-settlement-gateway.mjs';

function clean(value) {
  return String(value ?? '').trim();
}

function bearerToken(req) {
  const header = clean(req?.get?.('authorization') || req?.headers?.authorization);
  return header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
}

export function registerRavenSettlementRoutes(app, {
  limiter = null,
  env = process.env,
  fetchImpl = globalThis.fetch,
} = {}) {
  const adapters = buildRavenSettlementAdapters({ env, fetchImpl });
  const gateway = createRavenSettlementGateway({ adapters });
  const configuredToken = clean(env?.RAVEN_SETTLEMENT_INTERNAL_TOKEN);

  app.get('/api/raven/settlement/health', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      ok: true,
      ...gateway.health(),
      internal_execution_configured: Boolean(configuredToken),
    });
  });

  const handlers = [];
  if (typeof limiter === 'function') handlers.push(limiter);
  handlers.push(async (req, res) => {
    try {
      if (!configuredToken) {
        res.status(503).json({
          ok: false,
          error: 'Raven Nexus settlement execution is not configured.',
        });
        return;
      }

      const supplied = bearerToken(req);
      if (!supplied || supplied !== configuredToken) {
        res.status(401).json({
          ok: false,
          error: 'Raven Nexus settlement authorization required.',
        });
        return;
      }

      const body = req?.body && typeof req.body === 'object' ? req.body : {};
      const order = body.order;
      const operation = clean(body.operation);
      if (!order || !operation) {
        res.status(400).json({
          ok: false,
          error: 'order and operation are required.',
        });
        return;
      }

      const observation = await gateway.execute({
        order,
        operation,
        params: body.params || {},
      });

      res.setHeader('Cache-Control', 'no-store');
      res.json({
        ok: true,
        ...observation,
      });
    } catch (error) {
      const code = clean(error?.code);
      const status =
        code === 'RAVEN_NO_ELIGIBLE_ADAPTER' ? 409 :
        code === 'RAVEN_ADAPTER_EXECUTION_UNAVAILABLE' ? 503 :
        502;

      res.status(status).json({
        ok: false,
        authority: 'Raven Nexus',
        payment_authority: 'Evercraft Payments',
        error: error instanceof Error ? error.message : String(error),
        code: code || null,
      });
    }
  });

  app.post('/api/raven/settlement/request', ...handlers);

  return {
    health: () => gateway.health(),
  };
}
