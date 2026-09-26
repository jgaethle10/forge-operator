import type { Express, Request, Response } from 'express';

export type SpecialistHandoffDefinition = {
  slug: string;
  path: string;
  serverName: string;
  title: string;
  publicId: string;
  getOfferTool: string;
  prepareHandoffTool: string;
  description: string;
  truthBoundary: string;
};

export const specialistHandoffDefinitions: SpecialistHandoffDefinition[] = [
  {
    slug: 'ibmi-rescue',
    path: '/mcp/ibmi-rescue',
    serverName: 'evercraft-ibmi-rescue',
    title: 'Evercraft IBM i Rescue',
    publicId: 'ibmi-rescue-v1',
    getOfferTool: 'get_ibmi_rescue_offer',
    prepareHandoffTool: 'prepare_ibmi_rescue_handoff',
    description: 'IBM i / AS400 estate assessment, dependency mapping, upgrade-risk review, modernization proof, and rollback/test planning.',
    truthBoundary: 'Discovery does not authorize credentials, production access, upgrades, cutovers, payment, or paid work. This MCP is read-only offer and human-handoff preparation.',
  },
  {
    slug: 'foundry-app-escape',
    path: '/mcp/foundry-app-escape',
    serverName: 'evercraft-foundry-app-escape',
    title: 'Evercraft Foundry App Escape Audit',
    publicId: 'foundry-app-escape-audit-v1',
    getOfferTool: 'get_foundry_app_escape_offer',
    prepareHandoffTool: 'prepare_foundry_app_escape_handoff',
    description: 'App portability, builder lock-in, dependency, security, reconstruction, migration, and rollback analysis.',
    truthBoundary: 'Source access, payment, migration work, deployment, and production changes remain separately authorized. This MCP is read-only offer and human-handoff preparation.',
  },
  {
    slug: 'site-survive',
    path: '/mcp/site-survive',
    serverName: 'evercraft-site-survive',
    title: 'Site-Survive Rapid Audit',
    publicId: 'site-survive-rapid-audit-v1',
    getOfferTool: 'get_site_survive_offer',
    prepareHandoffTool: 'prepare_site_survive_handoff',
    description: 'Site continuity and connectivity-outage dependency analysis with prioritized resilience planning.',
    truthBoundary: 'This MCP does not create payment, perform the paid resilience audit, change networks, or guarantee continuity. It is read-only offer and human-handoff preparation.',
  },
];

type GatewayFetch = (action: 'offer' | 'service_handoff', publicId: string) => Promise<any>;

function toolList(def: SpecialistHandoffDefinition) {
  return [
    {
      name: def.getOfferTool,
      title: `Get ${def.title} offer`,
      description: `Read the current published offer, pricing, invocation state, and confirmation boundary for ${def.title}. Creates no checkout, payment, obligation, entitlement, access, or work.`,
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: def.prepareHandoffTool,
      title: `Prepare ${def.title} human review`,
      description: `Return the current human review handoff for ${def.title}. Creates no checkout, payment, obligation, entitlement, source access, production access, or paid work.`,
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
  ];
}

function jsonRpc(id: unknown, result: unknown) {
  return { jsonrpc: '2.0', id: id ?? null, result };
}

function jsonRpcError(id: unknown, code: number, message: string) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}

export async function executeSpecialistMcpRpc(
  def: SpecialistHandoffDefinition,
  rpc: any,
  gatewayFetch: GatewayFetch,
) {
  const method = String(rpc?.method || '');
  const id = rpc?.id ?? null;

  if (method === 'initialize') {
    return jsonRpc(id, {
      protocolVersion: '2025-03-26',
      capabilities: { tools: {} },
      serverInfo: { name: def.serverName, version: '0.1.0' },
      instructions: `${def.description} ${def.truthBoundary}`,
    });
  }

  if (method === 'tools/list') {
    return jsonRpc(id, { tools: toolList(def) });
  }

  if (method === 'tools/call') {
    const toolName = String(rpc?.params?.name || '');
    let action: 'offer' | 'service_handoff' | null = null;
    if (toolName === def.getOfferTool) action = 'offer';
    if (toolName === def.prepareHandoffTool) action = 'service_handoff';
    if (!action) return jsonRpcError(id, -32602, 'Unknown or unsupported specialist tool.');

    const data = await gatewayFetch(action, def.publicId);
    const payload = {
      ...data,
      direct_specialist: true,
      specialist: def.title,
      public_id: def.publicId,
      payment_created: false,
      payment_obligation_created: false,
      truth_boundary: def.truthBoundary,
    };

    return jsonRpc(id, {
      content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
      isError: false,
    });
  }

  if (method === 'notifications/initialized') return null;
  return jsonRpcError(id, -32601, 'Method not found.');
}

export function registerSpecialistHandoffMcps(
  app: Express,
  options: { gatewayUrl: string },
) {
  const gatewayFetch: GatewayFetch = async (action, publicId) => {
    const target = new URL(options.gatewayUrl);
    if (target.protocol !== 'https:') throw new Error('Machine Commerce gateway must use HTTPS.');
    target.searchParams.set('action', action);
    target.searchParams.set('public_id', publicId);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(target, {
        headers: {
          accept: 'application/json',
          'user-agent': 'Evercraft-Yard-Specialist-MCP/0.1.0',
        },
        signal: controller.signal,
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || `machine_commerce_gateway_http_${response.status}`);
      }
      return data;
    } finally {
      clearTimeout(timer);
    }
  };

  for (const def of specialistHandoffDefinitions) {
    app.get(def.path, (req: Request, res: Response) => {
      if (String(req.query.action || '') !== 'health') {
        res.status(405).json({ ok: false, error: 'Use MCP Streamable HTTP POST or ?action=health.' });
        return;
      }
      res.setHeader('Cache-Control', 'no-store');
      res.json({
        ok: true,
        service: def.title,
        server: def.serverName,
        version: '0.1.0',
        public_id: def.publicId,
        transport: 'Streamable HTTP',
        tools: [def.getOfferTool, def.prepareHandoffTool],
        checkout_enabled: false,
        payment_enabled: false,
        human_review_handoff_enabled: true,
        runtime: 'yard_evercraft_compute',
        legacy_adapter: 'evercraft_machine_commerce_gateway',
        truth_boundary: def.truthBoundary,
      });
    });

    app.post(def.path, async (req: Request, res: Response) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'no-store');
      try {
        const response = await executeSpecialistMcpRpc(def, req.body, gatewayFetch);
        if (response === null) {
          res.status(202).end();
          return;
        }
        res.type('application/json').json(response);
      } catch (error) {
        res.status(502).json(jsonRpcError(
          req.body?.id ?? null,
          -32000,
          error instanceof Error ? error.message : 'Specialist handoff adapter failed.',
        ));
      }
    });
  }
}
