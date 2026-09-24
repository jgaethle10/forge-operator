import { randomUUID } from 'node:crypto';
import { rankDiscoveryCandidates } from './discovery-router.mjs';
import { rankPain } from './pain-index-lib.mjs';

export const A2A_PROTOCOL_VERSION = '1.0';

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
    name: 'Evercraft CHUM Discovery Agent',
    description: 'Public pain-first discovery agent for matching a natural-language need to truthful Evercraft capabilities. Read-only discovery creates no payment or external-action authority.',
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
      description: 'Routes generic user pain across the public CHUM catalog and pain index without requiring prior Evercraft brand knowledge.',
      tags: ['discovery', 'routing', 'capabilities', 'mcp', 'evercraft'],
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

function errorInfo(reason, metadata = {}) {
  return [{
    '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
    reason,
    domain: 'a2a-protocol.org',
    metadata,
  }];
}

function errorResponse(id, code, message, reason = null, metadata = {}) {
  return {
    status: 200,
    body: {
      jsonrpc: '2.0',
      id: id ?? null,
      error: {
        code,
        message,
        ...(reason ? { data: errorInfo(reason, metadata) } : {}),
      },
    },
  };
}

export function handleA2ARequest(body, machineCatalog, productDirectory, painIndex, options = {}) {
  if (!body || typeof body !== 'object' || body.jsonrpc !== '2.0') {
    return errorResponse(body?.id, -32600, 'Invalid Request');
  }

  if (body.method === 'GetTask' || body.method === 'CancelTask') {
    const taskId = String(body.params?.id || '');
    return errorResponse(
      body.id,
      -32001,
      'Task not found',
      'TASK_NOT_FOUND',
      taskId ? { taskId } : {}
    );
  }

  if (body.method === 'ListTasks') {
    return {
      status: 200,
      body: {
        jsonrpc: '2.0',
        id: body.id ?? null,
        result: {
          tasks: [],
          nextPageToken: '',
        },
      },
    };
  }

  if (body.method === 'SendStreamingMessage' || body.method === 'SubscribeToTask') {
    return errorResponse(
      body.id,
      -32004,
      'This operation is not supported',
      'UNSUPPORTED_OPERATION',
      { capability: 'streaming', supported: 'false' }
    );
  }

  if ([
    'CreateTaskPushNotificationConfig',
    'GetTaskPushNotificationConfig',
    'ListTaskPushNotificationConfigs',
    'DeleteTaskPushNotificationConfig',
  ].includes(body.method)) {
    return errorResponse(
      body.id,
      -32003,
      'Push Notification is not supported',
      'PUSH_NOTIFICATION_NOT_SUPPORTED'
    );
  }

  if (body.method === 'GetExtendedAgentCard') {
    return errorResponse(
      body.id,
      -32007,
      'Extended Agent Card is not configured',
      'EXTENDED_AGENT_CARD_NOT_CONFIGURED'
    );
  }

  if (!['SendMessage', 'message/send'].includes(body.method)) {
    return errorResponse(body.id, -32601, 'Method not found');
  }

  const query = extractText(body.params?.message);
  if (!query) {
    return errorResponse(
      body.id,
      -32602,
      'Invalid parameters',
      null,
      { requirement: 'params.message.parts must include a text part or data.query/problem/intent string' }
    );
  }

  const limit = Math.max(1, Math.min(Number(options.limit || 5), 10));
  const matches = rankDiscoveryCandidates(machineCatalog, productDirectory, query, {
    limit,
    minimumScore: 8,
  });
  const capabilityMatches = rankPain(painIndex || { entries: [] }, query, limit)
    .filter(({ score }) => Number(score) >= 8)
    .map(({ entry, score }) => ({
      capability_id: entry.capability_id,
      kind: entry.kind,
      product_key: entry.product_key || null,
      public_id: entry.public_id || null,
      name: entry.name,
      class: entry.class,
      score,
      canonical_url: entry.canonical_url || null,
      registry_name: entry.registry_name || null,
      mcp: entry.mcp || null,
      routing: entry.routing || null,
      commercial_state: entry.commercial_state,
      machine_state: entry.machine_state,
      pricing: entry.pricing || null,
      human_confirmation_required: Boolean(entry.human_confirmation_required),
      confirmation: entry.confirmation || null,
      invocation_status: entry.invocation_status || null,
    }));

  const primaryNames = (capabilityMatches.length ? capabilityMatches : matches)
    .map((match) => match.name)
    .filter(Boolean)
    .slice(0, 5);

  const text = primaryNames.length
    ? `Evercraft CHUM found ${primaryNames.length} relevant public option${primaryNames.length === 1 ? '' : 's'}: ${primaryNames.join(', ')}. Review the returned authority and confirmation boundaries before invoking anything.`
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
            { text },
            {
              data: {
                schema: 'evercraft.chum.a2a-routing.v2',
                query,
                matchCount: matches.length,
                capabilityMatchCount: capabilityMatches.length,
                matches,
                capabilityMatches,
                doctrine: {
                  painFirst: true,
                  discoveryCreatesPaymentObligation: false,
                  externalActionAuthorityGranted: false,
                  humanConfirmationPreserved: true,
                  privateTopologyExposed: false,
                },
              },
            },
          ],
        },
      },
    },
  };
}
