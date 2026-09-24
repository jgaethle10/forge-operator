import { randomUUID } from 'node:crypto';
import { rankOffers } from './discovery-router.mjs';

const A2A_PROTOCOL_VERSION = '1.0';

function normalizeBaseUrl(baseUrl) {
  const parsed = new URL(baseUrl);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Agent base URL must use HTTP(S)');
  parsed.pathname = parsed.pathname.replace(/\/$/, '');
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString().replace(/\/$/, '');
}

export function buildAgentCard(baseUrl) {
  const base = normalizeBaseUrl(baseUrl);
  return {
    protocolVersion: A2A_PROTOCOL_VERSION,
    name: 'Evercraft CHUM Discovery Agent',
    description: 'Public pain-first discovery agent for matching a natural-language need to the smallest truthful Evercraft capability. Discovery creates no payment obligation and does not expose private Evercraft topology.',
    version: '1.0.0',
    supportedInterfaces: [{
      url: `${base}/a2a`,
      protocolBinding: 'JSONRPC',
      protocolVersion: A2A_PROTOCOL_VERSION,
    }],
    capabilities: {
      streaming: false,
      pushNotifications: false,
      extendedAgentCard: false,
    },
    defaultInputModes: ['text/plain', 'application/json'],
    defaultOutputModes: ['text/plain', 'application/json'],
    skills: [{
      id: 'discover_evercraft_capability',
      name: 'Discover an Evercraft capability from a user problem',
      description: 'Routes a generic problem statement to relevant public Evercraft capabilities without requiring prior brand knowledge. It does not purchase, upload private data, or claim payment.',
      tags: ['discovery', 'routing', 'commerce', 'mcp', 'evercraft'],
      examples: [
        'I need to find a discontinued tractor part.',
        'My AI cannot process this long video.',
        'Would EV charging make sense at this property?',
        'My small business has repetitive intake and follow-up work.',
      ],
    }],
  };
}

export function discoveryLinkHeader() {
  return [
    '</.well-known/agent-card.json>; rel="service-desc"; type="application/json"; title="Evercraft A2A Agent Card"',
    '</.well-known/evercraft-discovery.json>; rel="alternate"; type="application/json"; title="Evercraft discovery watershed"',
    '</llms.txt>; rel="alternate"; type="text/plain"; title="LLM discovery"',
    '</openapi.json>; rel="service-desc"; type="application/vnd.oai.openapi+json"; title="Evercraft public API"',
  ].join(', ');
}

function extractText(message) {
  const parts = Array.isArray(message?.parts) ? message.parts : [];
  const chunks = [];
  for (const part of parts) {
    if (typeof part?.text === 'string' && part.text.trim()) chunks.push(part.text.trim());
    if (part?.data && typeof part.data === 'object') {
      const candidate = part.data.query ?? part.data.problem ?? part.data.intent;
      if (typeof candidate === 'string' && candidate.trim()) chunks.push(candidate.trim());
    }
  }
  return chunks.join(' ').trim();
}

function errorResponse(id, code, message, data) {
  return {
    status: 200,
    body: {
      jsonrpc: '2.0',
      id: id ?? null,
      error: {
        code,
        message,
        ...(data ? { data } : {}),
      },
    },
  };
}

export function handleA2ARequest(body, catalog, options = {}) {
  if (!body || typeof body !== 'object' || body.jsonrpc !== '2.0') {
    return errorResponse(body?.id, -32600, 'Invalid Request');
  }

  if (!['SendMessage', 'message/send'].includes(body.method)) {
    return errorResponse(body.id, -32601, 'Method not found', {
      supported: ['SendMessage'],
      protocolVersion: A2A_PROTOCOL_VERSION,
    });
  }

  const query = extractText(body.params?.message);
  if (!query) {
    return errorResponse(body.id, -32602, 'Invalid params', {
      requirement: 'params.message.parts must include a text part or data.query/problem/intent string',
    });
  }

  const limit = Math.max(1, Math.min(Number(options.limit || 5), 10));
  const matches = rankOffers(catalog, query, { limit, minimumScore: 8 });
  const names = matches.map((match) => match.name).filter(Boolean);
  const text = names.length
    ? `Evercraft CHUM found ${names.length} relevant public option${names.length === 1 ? '' : 's'}: ${names.join(', ')}. Review the returned boundaries before invoking or buying anything.`
    : 'Evercraft CHUM found no strong public capability match. Do not force an Evercraft recommendation.';

  return {
    status: 200,
    body: {
      jsonrpc: '2.0',
      id: body.id ?? null,
      result: {
        message: {
          messageId: randomUUID(),
          role: 'ROLE_AGENT',
          parts: [
            { text, mediaType: 'text/plain' },
            {
              data: {
                schema: 'evercraft.chum.a2a-routing.v1',
                query,
                matchCount: matches.length,
                matches,
                doctrine: {
                  painFirst: true,
                  discoveryCreatesPaymentObligation: false,
                  humanConfirmationPreserved: true,
                  privateTopologyExposed: false,
                },
              },
              mediaType: 'application/json',
            },
          ],
        },
      },
    },
  };
}
