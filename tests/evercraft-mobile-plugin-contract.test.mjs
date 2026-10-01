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

test('mobile builder enforces registered app id and forbids direct MCP manifests',()=>{
  const script=fs.readFileSync('scripts/build-evercraft-mobile-plugin.mjs','utf8');
  assert.match(script,/^#!\/usr\/bin\/env node/);
  assert.match(script,/plugin_asdk_app_/);
  assert.match(script,/desktop-only MCP declaration leaked/);
  assert.match(script,/\.app\.json/);
});
