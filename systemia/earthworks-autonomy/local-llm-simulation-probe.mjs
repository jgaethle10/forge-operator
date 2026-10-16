/**
 * Bounded, opt-in loopback LLM probe. Turns a LOCAL model's proposed JSON goal
 * into a SIMULATION-ONLY EarthWorks action. Never talks to physical devices.
 *
 * Does not auto-run on import; caller must explicitly invoke the probe.
 */
import { parsePlannerGoal, submitLocalModelResponse } from './local-planner-goal-adapter.mjs';
import { EmbodiedGoalSimulator } from './embodied-goal-simulator.mjs';

export const LOCAL_PROBE_POLICY = Object.freeze({
  schema: 'evercraft.embodied.local-model-probe.v1',
  response_byte_limit: 16_384,
  maximum_model_output_bytes: 1_024,
  default_timeout_ms: 30_000,
  simulation_only: true,
});

export function validateLoopbackEndpoint(endpoint) {
  if (typeof endpoint !== 'string' || !/^http:\/\/(127\.0\.0\.1|\[::1\]):[0-9]{1,5}\/v1\/chat\/completions$/.test(endpoint)) {
    throw new Error('loopback_endpoint_required');
  }
  const url = new URL(endpoint);
  const port = Number(url.port);
  if (!(port >= 1 && port <= 65535)) throw new Error('loopback_port_invalid');
  return url.toString();
}

function boundedString(value, name, maxBytes) {
  if (typeof value !== 'string' || !value.trim()
    || Buffer.byteLength(value, 'utf8') > maxBytes
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) {
    throw new Error(name + '_invalid');
  }
  return value;
}

async function readJsonBounded(response) {
  const declared = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(declared) && declared > LOCAL_PROBE_POLICY.response_byte_limit) {
    throw new Error('model_response_oversized');
  }
  if (!response.body?.getReader) throw new Error('streaming_response_required');
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > LOCAL_PROBE_POLICY.response_byte_limit) throw new Error('model_response_oversized');
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
  let decoded;
  try {
    decoded = JSON.parse(Buffer.concat(chunks.map(chunk => Buffer.from(chunk))).toString('utf8'));
  } catch {
    throw new Error('model_response_invalid_json');
  }
  return decoded;
}

export async function queryLocalModel({
  endpoint,
  model,
  intent,
  request_id,
  timeout_ms = LOCAL_PROBE_POLICY.default_timeout_ms,
  fetch_impl = globalThis.fetch,
  now_ms = () => performance.now(),
} = {}) {
  const url = validateLoopbackEndpoint(endpoint);
  boundedString(model, 'model', 160);
  boundedString(intent, 'intent', 512);
  if (typeof request_id !== 'string' || !/^[A-Za-z0-9._-]{1,100}$/.test(request_id)) {
    throw new Error('request_id_invalid');
  }
  if (!Number.isInteger(timeout_ms) || timeout_ms < 100 || timeout_ms > 120_000) {
    throw new Error('timeout_invalid');
  }
  if (typeof fetch_impl !== 'function' || typeof now_ms !== 'function') throw new Error('probe_dependencies_invalid');

  const aborter = new AbortController();
  const timeout = setTimeout(() => aborter.abort(), timeout_ms);
  const startedAt = now_ms();
  try {
    const response = await fetch_impl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'accept': 'application/json' },
      // No cookies, auth headers or redirects. The only accepted host is numeric loopback.
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
      signal: aborter.signal,
      body: JSON.stringify({
        model,
        stream: false,
        temperature: 0,
        max_tokens: 160,
        messages: [
          {
            role: 'system',
            content: 'Return ONLY one JSON object for a SIMULATED robot. Schema evercraft.embodied.goal.v1. '
              + 'Fields for goto: schema,request_id,kind,target_x_m,target_y_m,speed_mps. '
              + 'For stop: schema,request_id,kind. Only kind goto or stop. '
              + 'Coordinates -1 to 1 meters, speed >0 to 0.15 m/s. '
              + 'Use request_id exactly as supplied. If uncertain, choose stop. '
              + 'There is NO physical execution authority. Never output code, markdown, tool calls, or device commands.',
          },
          { role: 'user', content: JSON.stringify({ request_id, simulated_task: intent }) },
        ],
      }),
    });
    if (response?.status !== 200) throw new Error('model_http_status_' + String(response?.status ?? 'unknown'));
    const payload = await readJsonBounded(response);
    if (!payload || !Array.isArray(payload.choices) || payload.choices.length !== 1) {
      throw new Error('model_response_unexpected_choices');
    }
    const choice = payload.choices[0];
    if (choice?.finish_reason !== 'stop'
      || choice?.message?.role !== 'assistant'
      || Object.hasOwn(choice.message, 'tool_calls')
      || typeof choice.message.content !== 'string') {
      throw new Error('model_response_not_final_plain_text');
    }
    const output = choice.message.content;
    const goal = parsePlannerGoal(output);
    if (goal.request_id !== request_id) throw new Error('model_response_request_id_mismatch');
    const elapsed_ms = Math.max(0, now_ms() - startedAt);
    return {
      schema: LOCAL_PROBE_POLICY.schema,
      request_id,
      proposed_goal: goal,
      output_bytes: Buffer.byteLength(output, 'utf8'),
      inference_elapsed_ms: Number(elapsed_ms.toFixed(3)),
      model_reported_usage: {
        prompt_tokens: Number.isSafeInteger(payload.usage?.prompt_tokens) ? payload.usage.prompt_tokens : null,
        completion_tokens: Number.isSafeInteger(payload.usage?.completion_tokens) ? payload.usage.completion_tokens : null,
      },
      physical_actuation_enabled: false,
      evidence_state: 'local_model_response_unverified_no_hardware',
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function runLocalModelSimulation({
  simulator, authority_context, ...query
} = {}) {
  if (!(simulator instanceof EmbodiedGoalSimulator)) throw new Error('simulator_instance_required');
  if (authority_context?.authority_state !== 'simulation'
      || authority_context?.robot_id !== simulator.robot_id) {
    throw new Error('simulation_authority_required');
  }
  // Model response is not an authority source. Existing simulator independently checks
  // all bounds, observations, leases, obstacles and duplicate command IDs.
  const result = await queryLocalModel(query);
  const acceptance = submitLocalModelResponse(
    JSON.stringify(result.proposed_goal),
    simulator,
    authority_context,
  );
  return { ...result, accepted_in_simulation: acceptance.accepted, simulator_state: simulator.snapshot() };
}
