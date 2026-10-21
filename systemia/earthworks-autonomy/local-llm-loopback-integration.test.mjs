import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { EmbodiedGoalSimulator } from './embodied-goal-simulator.mjs';
import { runLocalModelSimulation, queryLocalModel } from './local-llm-simulation-probe.mjs';

const goal = JSON.stringify({
  schema: 'evercraft.embodied.goal.v1',
  request_id: 'loopback-real-http-001',
  kind: 'goto', target_x_m: 0.25, target_y_m: 0, speed_mps: 0.1,
});
const response = body => JSON.stringify({
  choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: body } }],
  usage: { prompt_tokens: 45, completion_tokens: 21 },
});
async function withServer(handler, task) {
  const server = createServer(handler);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const endpoint = 'http://127.0.0.1:' + address.port + '/v1/chat/completions';
    return await task(endpoint);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}
const opts = endpoint => ({
  endpoint, model: 'stub-local-compatible-model',
  intent: 'Move to the synthetic marker', request_id: 'loopback-real-http-001',
});

test('real loopback HTTP transport delivers bounded JSON goal into simulator only', async () => {
  const seen = [];
  await withServer((request, reply) => {
    let body = '';
    request.on('data', chunk => { body += chunk.toString('utf8'); });
    request.on('end', () => {
      seen.push({ method: request.method, url: request.url, headers: request.headers, data: JSON.parse(body) });
      reply.writeHead(200, { 'content-type': 'application/json' });
      reply.end(response(goal));
    });
  }, async endpoint => {
    const sim = new EmbodiedGoalSimulator();
    sim.observe({ observed_at_s: 0, lease_until_s: 2,
      estop: false, human_nearby: false, obstacles: [] });
    const result = await runLocalModelSimulation({
      ...opts(endpoint), simulator: sim,
      authority_context: { authority_state: 'simulation', robot_id: sim.robot_id },
    });
    assert.equal(result.accepted_in_simulation, true);
    assert.equal(result.proposed_goal.kind, 'goto');
    assert.equal(result.simulator_state.physical_actuation_enabled, false);
    assert.equal(sim.pose.x, 0, 'local model HTTP call did not actuate a motor or advance simulation');
  });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].method, 'POST');
  assert.equal(seen[0].url, '/v1/chat/completions');
  assert.equal(seen[0].data.stream, false);
  assert.ok(!seen[0].headers.authorization);
  assert.ok(!seen[0].headers.cookie);
});

test('real HTTP redirect is refused even when destination is same localhost server', async () => {
  let redirects = 0, followed = 0;
  await withServer((request, reply) => {
    if (request.url === '/redirect-target') {
      followed++;
      reply.end(response(goal));
    } else {
      redirects++;
      reply.writeHead(302, { location: '/redirect-target' });
      reply.end();
    }
  }, async endpoint => {
    await assert.rejects(queryLocalModel(opts(endpoint)));
  });
  assert.equal(redirects, 1);
  assert.equal(followed, 0);
});

test('real loopback HTTP response containing a motor command is rejected', async () => {
  const malicious = JSON.stringify({
    ...JSON.parse(goal), raw_motor: 'forward', authority_state: 'bounded_physical',
  });
  await withServer((_, reply) => {
    reply.writeHead(200, { 'content-type': 'application/json' });
    reply.end(response(malicious));
  }, async endpoint => {
    await assert.rejects(queryLocalModel(opts(endpoint)), /model_output_invalid_goal_shape/);
  });
});
