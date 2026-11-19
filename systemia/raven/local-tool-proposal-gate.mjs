import { createHash } from 'node:crypto';

export const PROPOSAL_TOOL = Object.freeze({
  type: 'function',
  function: {
    name: 'submit_work_proposal',
    description: 'Submit one proposed work item for separate review. Never execute it.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        task_id: { type: 'string', description: 'The exact task id supplied by the operator.' },
        operation: { type: 'string', enum: ['inspect', 'draft', 'verify'] },
        target: { type: 'string', description: 'Workspace-relative POSIX file target, never absolute.' },
        rationale: { type: 'string', description: 'A brief explanation of the proposal.' },
      },
      required: ['task_id', 'operation', 'target', 'rationale'],
    },
  },
});

const sha256 = value => 'sha256:' + createHash('sha256').update(value).digest('hex');
const plain = value => value !== null && typeof value === 'object' &&
  !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

export function localOllamaOrigin(origin = 'http://127.0.0.1:11434') {
  let url;
  try { url = new URL(origin); } catch { throw new Error('ollama_origin_invalid'); }
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) {
    throw new Error('ollama_origin_not_loopback');
  }
  return url.origin;
}

export function validateWorkProposal(value, expectedTaskId) {
  if (!plain(value)) throw new Error('proposal_not_object');
  const keys = Object.keys(value).sort();
  if (keys.join(',') !== 'operation,rationale,target,task_id') throw new Error('proposal_fields_invalid');
  if (value.task_id !== expectedTaskId) throw new Error('proposal_task_mismatch');
  if (!['inspect', 'draft', 'verify'].includes(value.operation)) throw new Error('proposal_operation_invalid');
  if (typeof value.rationale !== 'string' || !value.rationale.trim() || value.rationale.length > 600 ||
    /[\u0000-\u001f]/.test(value.rationale)) throw new Error('proposal_rationale_invalid');
  const target = value.target;
  if (typeof target !== 'string' || target.length === 0 || target.length > 240 ||
    target.startsWith('/') || target.startsWith('~') || target.includes('\\') ||
    target.includes(':') || /[\u0000-\u001f]/.test(target) ||
    target.split('/').some(part => !part || part === '.' || part === '..') ||
    target.split('/').some(part => part.startsWith('.'))) {
    throw new Error('proposal_target_invalid');
  }
  return { task_id: value.task_id, operation: value.operation, target,
    rationale: value.rationale.trim() };
}

export function evaluateToolResponse(body, { model, taskId }) {
  if (!plain(body) || body.done !== true || body.model !== model || body.done_reason === 'length') {
    throw new Error('ollama_response_incomplete_or_wrong_model');
  }
  const message = body.message;
  if (!plain(message) || message.role !== 'assistant') throw new Error('ollama_assistant_message_required');
  if (typeof message.content !== 'string' || message.content.trim()) {
    throw new Error('ollama_text_instead_of_tool_call');
  }
  if (!Array.isArray(message.tool_calls) || message.tool_calls.length !== 1) {
    throw new Error('ollama_exactly_one_tool_call_required');
  }
  const call = message.tool_calls[0];
  if (!plain(call) || !plain(call.function) || call.function.name !== PROPOSAL_TOOL.function.name) {
    throw new Error('ollama_tool_name_unexpected');
  }
  let args = call.function.arguments;
  if (typeof args === 'string') {
    if (Buffer.byteLength(args, 'utf8') > 8192) throw new Error('ollama_arguments_too_large');
    try { args = JSON.parse(args); } catch { throw new Error('ollama_arguments_invalid_json'); }
  }
  const proposal = validateWorkProposal(args, taskId);
  return { proposal, proposal_sha256: sha256(JSON.stringify(proposal)) };
}

async function jsonRequest(url, init, fetchImpl, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { ...init, redirect: 'error', signal: controller.signal });
    if (!res.ok) throw new Error('ollama_http_failure');
    const bytes = await res.text();
    if (Buffer.byteLength(bytes, 'utf8') > 262144) throw new Error('ollama_response_too_large');
    try { return JSON.parse(bytes); } catch { throw new Error('ollama_invalid_json_response'); }
  } finally { clearTimeout(timer); }
}

export async function inspectLocalToolProposal({
  model, taskId, objective, origin = 'http://127.0.0.1:11434',
  fetchImpl = globalThis.fetch, timeoutMs = 120000, now = () => new Date(),
} = {}) {
  // Validate locally before making even an inventory request.
  const base = localOllamaOrigin(origin);
  if (typeof model !== 'string' || !/^[\w][\w./:-]{0,119}$/.test(model)) throw new Error('model_invalid');
  if (typeof taskId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(taskId)) throw new Error('task_id_invalid');
  if (typeof objective !== 'string' || !objective.trim() || objective.length > 4000) throw new Error('objective_invalid');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 300000) throw new Error('timeout_invalid');
  const start = now().toISOString();
  const core = {
    schema: 'evercraft.raven.local-tool-proposal.v1',
    task_id: taskId, model, objective_sha256: sha256(objective),
    local_origin_only: true, code_executed: false, side_effects_authorized: false,
    model_downloads_authorized: false, recorded_at: start,
  };
  let phase = 'inventory';
  try {
    const tags = await jsonRequest(base + '/api/tags', { method: 'GET', headers: { accept: 'application/json' } },
      fetchImpl, Math.min(10000, timeoutMs));
    const exact = Array.isArray(tags?.models) ? tags.models.find(row =>
      (row?.name === model || row?.model === model) && typeof row.digest === 'string' && row.digest) : null;
    if (!exact) throw new Error('model_not_installed');
    phase = 'inference';
    const request = {
      model, stream: false,
      messages: [
        { role: 'system', content: 'Return exactly one submit_work_proposal tool call. Do not perform any file or shell action. No prose. This is a non-executing compatibility check.' },
        { role: 'user', content: 'Task ID: ' + taskId + '\nObjective: ' + objective + '\nSelect inspect, draft, or verify. Choose a workspace-relative target.' },
      ],
      tools: [PROPOSAL_TOOL],
      options: { temperature: 0, num_predict: 256, num_ctx: 2048 },
      keep_alive: 0,
    };
    const result = await jsonRequest(base + '/api/chat', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request),
    }, fetchImpl, timeoutMs);
    phase = 'validation';
    const evaluated = evaluateToolResponse(result, { model, taskId });
    return { ...core, status: 'validated_proposal_only', model_digest: exact.digest,
      proposal: evaluated.proposal, proposal_sha256: evaluated.proposal_sha256,
      executable: false, completed_at: now().toISOString() };
  } catch (err) {
    // No exception messages, provider payloads or prompt content leave this boundary.
    const code = err?.message?.startsWith('ollama_') || err?.message?.startsWith('proposal_') ||
      err?.message === 'model_not_installed' ? err.message :
      err?.name === 'AbortError' ? 'ollama_timeout' : 'ollama_transport_error';
    return { ...core, status: 'blocked', blocked_reason: code, phase,
      executable: false, completed_at: now().toISOString() };
  }
}
