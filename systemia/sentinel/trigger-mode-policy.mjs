#!/usr/bin/env node
import fs from 'node:fs';

export const TRIGGER_MODE_POLICY_SCHEMA = 'evercraft.systemia.trigger-mode-policy.v1';

export function resolveTriggerModePolicy(eventName) {
  const event = String(eventName || '').trim();
  if (!['push', 'schedule', 'workflow_dispatch'].includes(event)) {
    return {
      schema: TRIGGER_MODE_POLICY_SCHEMA,
      event_name: event || 'unknown',
      supported: false,
      require_consumer_bridge: false,
      accept_machine_only_measurement: false,
      broadcast_discovery: false,
      reason: 'unsupported_trigger_mode'
    };
  }

  return {
    schema: TRIGGER_MODE_POLICY_SCHEMA,
    event_name: event,
    supported: true,
    require_consumer_bridge: false,
    accept_machine_only_measurement: true,
    broadcast_discovery: event !== 'schedule',
    reason: event === 'schedule'
      ? 'scheduled_health_measurement_without_forcing_consumer_chat_authorization'
      : 'live_health_measurement_with_discovery_broadcast'
  };
}

function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : '';
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const eventName = arg('--event') || process.env.GITHUB_EVENT_NAME || '';
  const result = resolveTriggerModePolicy(eventName);
  const output = arg('--github-output') || process.env.GITHUB_OUTPUT || '';

  if (output) {
    fs.appendFileSync(output, [
      `supported=${result.supported ? 'true' : 'false'}`,
      `require_consumer_bridge=${result.require_consumer_bridge ? 'true' : 'false'}`,
      `accept_machine_only_measurement=${result.accept_machine_only_measurement ? 'true' : 'false'}`,
      `broadcast_discovery=${result.broadcast_discovery ? 'true' : 'false'}`
    ].join('\n') + '\n');
  }

  process.stdout.write(JSON.stringify(result) + '\n');
  if (!result.supported) process.exitCode = 2;
}
