/** Parse untrusted local-model text without granting it execution authority. No HTTP, SDK, or device I/O. */
import { EmbodiedGoalSimulator } from './embodied-goal-simulator.mjs';
export const GOAL_OUTPUT_CONTRACT = Object.freeze({
  schema: 'evercraft.embodied.goal.v1',
  allowed_kinds: ['goto', 'stop'],
  max_response_bytes: 1024,
  physical_actuation_enabled: false,
});
const finite = value => typeof value === 'number' && Number.isFinite(value);
export function parsePlannerGoal(raw) {
  if (typeof raw !== 'string' || Buffer.byteLength(raw, 'utf8') > GOAL_OUTPUT_CONTRACT.max_response_bytes) {
    throw new Error('model_output_invalid_size_or_type');
  }
  const text = raw.trim();
  if (!text.startsWith('{') || !text.endsWith('}')) throw new Error('model_output_not_plain_json');
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('model_output_invalid_json'); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('model_output_not_object');
  if (data.schema !== GOAL_OUTPUT_CONTRACT.schema) throw new Error('model_output_wrong_schema');
  // A model cannot smuggle unknown properties, a privileged authority field,
  // malformed IDs, or unbounded positions into the simulation-admission layer.
  const base = ['schema', 'request_id', 'kind'];
  const keys = data.kind === 'stop' ? base
    : data.kind === 'goto' ? [...base, 'target_x_m', 'target_y_m', 'speed_mps']
    : null;
  if (!keys || Object.keys(data).length !== keys.length || !keys.every(key => Object.hasOwn(data, key))
    || typeof data.request_id !== 'string' || !/^[A-Za-z0-9._-]{1,100}$/.test(data.request_id)) {
    throw new Error('model_output_invalid_goal_shape');
  }
  if (data.kind === 'goto' && (
    !finite(data.target_x_m) || Math.abs(data.target_x_m) > 1
    || !finite(data.target_y_m) || Math.abs(data.target_y_m) > 1
    || !finite(data.speed_mps) || data.speed_mps <= 0 || data.speed_mps > 0.15
  )) {
    throw new Error('model_output_unbounded_goal');
  }
  return data;
}
export function submitLocalModelResponse(raw, simulator, authorityContext) {
  if (!(simulator instanceof EmbodiedGoalSimulator)) throw new Error('simulator_instance_required');
  // Authority is supplied independently, never read from model JSON or caller-supplied narrative.
  return simulator.submitGoal(parsePlannerGoal(raw), authorityContext);
}
