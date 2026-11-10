import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root=fileURLToPath(new URL('../../',import.meta.url));
const read=(path)=>readFileSync(root+path,'utf8');
const json=(path)=>JSON.parse(read(path));
const origin='https://fabric.systemiacommandcenters.com/mcp';
const manifests=[
  'plugins/evercraft-fabric/mcp.json',
  'plugins/evercraft-fabric/.mcp.json',
  'plugins/evercraft-ai-suite/mcp.json',
  'plugins/evercraft-ai-suite/.mcp.json',
];

for(const manifest of manifests){
  test('owned Streamable HTTP transport: '+manifest,()=>{
    const config=json(manifest);
    const servers=Object.values(config.mcpServers||{});
    assert.equal(servers.length,1,'one intentional MCP route per package');
    assert.equal(servers[0].url,origin,'never route users to a retired transport');
    assert.equal(servers[0].type,'streamable-http');
    assert.equal(JSON.stringify(servers).includes('base44.app'),false);
  });
}
test('public-facing package is Evercraft and matches its submission version',()=>{
  const pkg=json('plugins/evercraft-fabric/plugin.json');
  const submission=read('plugins/evercraft-fabric/OPENAI-SUBMISSION.md');
  assert.equal(pkg.name,'evercraft');
  assert.equal(pkg.extensions?.['com.openai']?.interface?.displayName,'Evercraft');
  assert.ok(submission.includes('Package version: **'+pkg.version+'**'));
  assert.ok(submission.includes('**not proven**'),'no automatic public directory claim');
});
test('legacy AI Suite is not promoted as a second front door',()=>{
  const docs=read('plugins/evercraft-ai-suite/README.md');
  assert.ok(docs.includes('legacy compatibility package'));
  assert.ok(docs.includes('not the primary public ChatGPT plugin'));
});
