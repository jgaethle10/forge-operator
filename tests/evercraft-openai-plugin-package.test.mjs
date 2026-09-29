import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const pluginDir=path.join(root,'plugins','evercraft-fabric');

const readJson=(relative)=>JSON.parse(fs.readFileSync(path.join(pluginDir,relative),'utf8'));

test('Evercraft is packaged as the umbrella OpenAI plugin',()=>{
  const manifest=readJson('.codex-plugin/plugin.json');
  assert.equal(manifest.name,'evercraft');
  assert.equal(manifest.interface?.displayName,'Evercraft');
  assert.equal(manifest.skills,'./skills/');
  assert.equal(manifest.mcpServers,'./.mcp.json');
  assert.match(String(manifest.interface?.longDescription||''),/smallest truthful Evercraft capability/i);
});

test('Evercraft MCP configuration is remote HTTPS and never embeds credentials',()=>{
  const mcp=readJson('.mcp.json');
  const server=mcp.mcpServers?.evercraft;
  assert.ok(server);
  assert.equal(server.type,'http');
  const url=new URL(server.url);
  assert.equal(url.protocol,'https:');
  assert.equal(url.username,'');
  assert.equal(url.password,'');
});

test('Evercraft plugin includes its safety and support surface',()=>{
  for(const file of ['PRIVACY.md','TERMS.md','SUPPORT.md','README.md','OPENAI-SUBMISSION.md']){
    assert.ok(fs.existsSync(path.join(pluginDir,file)),file+' missing');
  }
  assert.ok(fs.existsSync(path.join(pluginDir,'skills','evercraft-router','SKILL.md')));
});

test('OpenAI review matrix keeps the required positive and negative coverage',()=>{
  const submission=readJson('openai-submission.json');
  assert.equal(submission.listing?.name,'Evercraft');
  assert.ok(submission.positive_tests.length>=5);
  assert.ok(submission.negative_tests.length>=3);
  assert.equal(submission.public_directory_claim_allowed,false);
  assert.equal(submission.compatibility_transport?.owned_fabric_cutover_required,true);
});

test('submission tests cover payment, privacy, and consequential-action denial cases',()=>{
  const submission=readJson('openai-submission.json');
  const negativeText=JSON.stringify(submission.negative_tests).toLowerCase();
  assert.match(negativeText,/payment|charge/);
  assert.match(negativeText,/private|credential|secret/);
  assert.match(negativeText,/consequential|publish|deploy/);
});
