import { buildCapabilityIndex } from './everscript.mjs';

function defaultInputSchema(action) {
  const arity = Number.isInteger(action?.arity) ? action.arity : 0;
  return {
    type: 'object',
    properties: {
      args: {
        type: 'array',
        minItems: arity,
        maxItems: arity,
        items: {},
        description: 'Positional EverScript capability arguments.',
      },
    },
    required: ['args'],
    additionalProperties: false,
  };
}

export function manifestsToMcpTools(manifests) {
  const tools = [];
  for (const manifest of manifests) {
    for (const [actionName, action] of Object.entries(manifest.actions ?? {})) {
      tools.push({
        name: `${manifest.name}__${actionName}`,
        description: action.description ?? `${manifest.name}.${actionName}`,
        inputSchema: action.inputSchema ?? defaultInputSchema(action),
        annotations: {
          evercraftCapability: manifest.name,
          evercraftCapabilityVersion: manifest.version,
          evercraftAction: actionName,
          billable: Boolean(action.billable),
          approvalRecommended: Boolean(action.approvalRecommended),
        },
      });
    }
  }
  return tools;
}

export function buildAgentDescriptor(manifests, { baseUrl = '' } = {}) {
  const join = (path) => baseUrl ? `${baseUrl.replace(/\/$/, '')}${path}` : path;
  return {
    schema: 'evercraft.agent-descriptor.v1',
    protocol: 'everscript',
    protocolVersion: '0.3',
    discovery: join('/.well-known/everscript/capabilities'),
    compile: join('/v1/compile'),
    execute: join('/v1/run'),
    mcpTools: join('/v1/mcp/tools'),
    flow: ['discover', 'verify', 'compile', 'quote', 'approve', 'reserve', 'execute', 'settle', 'receipt', 'verify'],
    capabilityIndex: buildCapabilityIndex(manifests),
  };
}
