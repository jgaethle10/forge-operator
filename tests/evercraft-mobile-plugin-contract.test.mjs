import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root=JSON.parse(fs.readFileSync('plugins/evercraft-mobile-template/plugin.json','utf8'));
const codex=JSON.parse(fs.readFileSync('plugins/evercraft-mobile-template/.codex-plugin/plugin.json','utf8'));
const example=JSON.parse(fs.readFileSync('plugins/evercraft-mobile-template/.app.json.example','utf8'));

test('mobile template references an app instead of direct MCP configuration',()=>{
  assert.equal(root.extensions?.['com.openai']?.apps,'./.app.json');
  assert.equal(codex.apps,'./.app.json');
  assert.equal(fs.existsSync('plugins/evercraft-mobile-template/mcp.json'),false);
  assert.equal(fs.existsSync('plugins/evercraft-mobile-template/.mcp.json'),false);
});

test('mobile app manifest example uses an OpenAI registered MCP app id shape',()=>{
  const id=example.apps?.evercraft?.id;
  assert.match(id,/^plugin_asdk_app_/);
  assert.equal(example.apps?.evercraft?.required,true);
});

test('app-backed builder is web/workspace-only unless deliberately enabled',()=>{
  const script=fs.readFileSync('scripts/build-evercraft-mobile-plugin.mjs','utf8');
  assert.match(script,/^#!\/usr\/bin\/env node/);
  assert.match(script,/plugin_asdk_app_/);
  assert.match(script,/desktop-only MCP declaration leaked/);
  assert.match(script,/allow-web-only-app-reference/);
  assert.match(script,/canonical private mobile path/);
  assert.match(script,/\.app\.json/);
});

test('Sites bridge is the canonical private phone experiment',()=>{
  const bridge=JSON.parse(fs.readFileSync('plugins/evercraft-sites-bridge/contract.json','utf8'));
  assert.equal(bridge.mcp_url,'https://fabric.systemiacommandcenters.com/mcp');
  assert.deepEqual(bridge.allowed_tools,[
    'match_evercraft_capability',
    'list_evercraft_capabilities',
    'get_evercraft_connection_options',
  ]);
  assert.equal(bridge.authority.read_only,true);
  assert.equal(bridge.authority.payment,false);
  assert.equal(bridge.acceptance.mobile_plugin_visible,true);
  assert.equal(bridge.acceptance.desktop_only_label,false);
});
