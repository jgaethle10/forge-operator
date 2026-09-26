import fs from 'node:fs';
import assert from 'node:assert/strict';

const readJson = (path) => JSON.parse(fs.readFileSync(path, 'utf8'));
const doors = readJson('public/.well-known/evercraft-direct-doors.json');

assert.equal(doors.schema, 'evercraft.direct-product-doors.v1');
assert.equal(doors.routing_policy.default, 'specialist_direct_when_clear');
assert.equal(doors.routing_policy.fallback, 'evercraft_machine_commerce_when_ambiguous_or_specialist_unavailable');

const byProduct = new Map(doors.doors.map((door) => [door.product, door]));

for (const product of ['ForensiScope', 'AliEV / RIVET', 'FindMyPart', 'Systemia Website Audit', 'Evercraft Web', 'Systemia Remote Ops']) {
  assert.ok(byProduct.has(product), 'missing direct door: ' + product);
}

for (const product of ['ForensiScope', 'AliEV / RIVET', 'FindMyPart']) {
  const door = byProduct.get(product);
  assert.equal(door.state, 'registry_published_direct_mcp_existing');
  assert.match(door.registry_name, /^io\.github\.jgaethle10\//);
  assert.match(door.remote_mcp, /^https:\/\//);
  assert.ok(door.plugin_package);
  assert.ok(fs.existsSync(door.plugin_package + '/plugin.json'), 'missing plugin manifest for ' + product);
  assert.ok(fs.existsSync(door.plugin_package + '/mcp.json'), 'missing MCP config for ' + product);
  assert.ok(fs.existsSync(door.plugin_package + '/.mcp.json'), 'missing Codex MCP config for ' + product);
  assert.ok(fs.existsSync(door.plugin_package + '/.codex-plugin/plugin.json'), 'missing Codex plugin manifest for ' + product);

  const mcp = readJson(door.plugin_package + '/mcp.json');
  const server = Object.values(mcp.mcpServers || {})[0];
  assert.equal(server.url, door.remote_mcp, 'plugin MCP URL drift for ' + product);
}

const remoteOps = byProduct.get('Systemia Remote Ops');
assert.equal(remoteOps.state, 'source_ready_deployment_unverified');
assert.equal(remoteOps.registry_name, null);
assert.ok(fs.existsSync('plugins/systemia-remote-ops/plugin.json'));
assert.ok(fs.existsSync('plugins/systemia-remote-ops/mcp.json'));

const publicCopy = fs.readFileSync('public/.well-known/evercraft-direct-doors.json', 'utf8');
const distributionCopy = fs.readFileSync('distribution/direct-product-doors.json', 'utf8');
assert.equal(publicCopy, distributionCopy, 'direct-door public and distribution copies drifted');

const aiDiscovery = fs.readFileSync('AI-DISCOVERY.md', 'utf8');
assert.match(aiDiscovery, /direct-door-first routing model/i);
assert.match(aiDiscovery, /universal Evercraft router exists for ambiguity/i);

const suiteSkill = fs.readFileSync('plugins/evercraft-ai-suite/skills/evercraft-ai-router/SKILL.md', 'utf8');
assert.match(suiteSkill, /dedicated Evercraft specialist plugin or MCP/i);
assert.match(suiteSkill, /fallback when no dedicated specialist is available/i);

console.log('DIRECT_PRODUCT_DOORS_PASS', {
  direct_doors: doors.doors.length,
  registry_backed_specialists: doors.doors.filter((d) => d.state === 'registry_published_direct_mcp_existing').length,
  remote_ops_state: remoteOps.state
});
