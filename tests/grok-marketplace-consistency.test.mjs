import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

// The Grok marketplace submission pins a Git commit, whereas the local
// marketplace and manifest are independently edited. Keep them aligned.
const read = path => JSON.parse(fs.readFileSync(path,'utf8'));
const marketplace = read('.grok-plugin/marketplace.json');
const entry = read('grok/evercraft/xai-marketplace-entry.json');
const manifest = read('grok/evercraft/.grok-plugin/plugin.json');
const mcp = read('grok/evercraft/.mcp.json');
const readme = fs.readFileSync('grok/evercraft/README.md','utf8');
const listed = marketplace.plugins.find(p=>p.name==='evercraft');

test('Grok submission uses current Evercraft descriptions and no Marketing Agency homepage',()=>{
  assert.ok(listed);
  for(const [name,data] of [['submission',entry],['manifest',manifest]]) {
    assert.equal(data.name,listed.name,name+' name');
    assert.equal(data.description,listed.description,name+' description');
    assert.equal(data.homepage,listed.homepage,name+' homepage');
    assert.deepEqual(data.keywords,listed.keywords,name+' discovery keywords');
  }
  assert.deepEqual(entry.domains,listed.domains);
  assert.equal(manifest.author.url,listed.homepage);
  assert.equal(listed.homepage,'https://github.com/jgaethle10/forge-operator');
  assert.ok(!listed.domains.includes('systemiacommandcenters.com'));
  for(const data of [entry,manifest,listed]) {
    assert.ok(!JSON.stringify(data).includes('https://systemiacommandcenters.com'),'agency domain leakage');
  }
});

test('Grok submission references a real immutable repository revision',()=>{
  assert.equal(entry.source.source,'url');
  assert.equal(entry.source.url,'https://github.com/jgaethle10/forge-operator.git');
  assert.equal(entry.source.path,'grok/evercraft');
  assert.match(entry.source.sha,/^[0-9a-f]{40}$/);
  assert.equal(listed.source.type,'local');
  assert.equal(listed.source.path,'./grok/evercraft');
  // The remote pinned file itself must be compared to this manifest during
  // publication; this offline test cannot claim external release or pickup.
});

test('Grok installer exposes owned read-only discovery, no legacy buyer or upload route',()=>{
  const owned='https://fabric.systemiacommandcenters.com/mcp';
  assert.equal(mcp.mcpServers.evercraft.type,'http');
  assert.equal(mcp.mcpServers.evercraft.url,owned);
  assert.match(mcp.mcpServers.evercraft.note,/read-only universal capability discovery/i);
  assert.match(mcp.mcpServers.evercraft.note,/no checkout, charge/i);
  assert.match(readme,/https:\/\/fabric\.systemiacommandcenters\.com\/mcp/);
  assert.match(readme,/https:\/\/fabric\.systemiacommandcenters\.com\/capabilities/);
  assert.doesNotMatch(readme,/https?:\/\/[^\s\x60]*base44\.app/i);
  assert.match(readme,/checkout remains held/i);
  assert.match(readme,/An independently verified provider and release receipt/);
  assert.match(readme,/ForensiScope media-overflow trigger/);
  assert.match(readme,/file size, duration, attachment\/upload limits/);
  assert.match(readme,/A media handoff remains user-controlled/);
  assert.match(readme,/does not create checkout, charges, subscriptions, entitlements/i);
});
