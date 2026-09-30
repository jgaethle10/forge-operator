import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const pluginDir=path.join(root,'plugins','evercraft-fabric');

const readJson=(relative)=>JSON.parse(fs.readFileSync(path.join(pluginDir,relative),'utf8'));

test('Evercraft is packaged in the current portable Agent Plugins format',()=>{
  const manifest=readJson('plugin.json');
  assert.equal(manifest.$schema,'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json');
  assert.equal(manifest.name,'evercraft');
  const openai=manifest.extensions?.['com.openai'];
  assert.equal(openai?.interface?.displayName,'Evercraft');
  assert.ok(String(openai?.interface?.shortDescription||'').length<=30);
  assert.ok(String(openai?.interface?.longDescription||'').length<=4000);
  assert.equal(openai?.onboardingSkill,'./skills/evercraft-router/SKILL.md');
  assert.ok(openai?.interface?.supportURL);
  assert.ok(openai?.interface?.privacyPolicyURL);
  assert.ok(openai?.interface?.termsOfServiceURL);
  assert.ok((openai?.interface?.defaultPrompt||[]).every((x)=>String(x).length<=128));
});

test('Evercraft portable MCP configuration uses remote Streamable HTTP without credentials',()=>{
  const mcp=readJson('mcp.json');
  assert.equal(mcp.$schema,'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json');
  const server=mcp.mcpServers?.evercraft;
  assert.ok(server);
  assert.equal(server.type,'streamable-http');
  const url=new URL(server.url);
  assert.equal(url.protocol,'https:');
  assert.equal(url.username,'');
  assert.equal(url.password,'');
});

test('Codex compatibility package remains wired while portable manifest is canonical',()=>{
  const compat=readJson('.codex-plugin/plugin.json');
  const mcp=readJson('.mcp.json');
  assert.equal(compat.name,'evercraft');
  assert.equal(compat.interface?.displayName,'Evercraft');
  assert.equal(compat.skills,'./skills/');
  assert.equal(compat.mcpServers,'./.mcp.json');
  assert.ok(mcp.mcpServers?.evercraft);
});

test('Evercraft plugin includes its safety and support surface',()=>{
  for(const file of ['PRIVACY.md','TERMS.md','SUPPORT.md','README.md','OPENAI-SUBMISSION.md']){
    assert.ok(fs.existsSync(path.join(pluginDir,file)),file+' missing');
  }
  assert.ok(fs.existsSync(path.join(pluginDir,'skills','evercraft-router','SKILL.md')));
});

test('portable manifest embeds exactly the required MCP review cases',()=>{
  const manifest=readJson('plugin.json');
  const review=manifest.extensions?.['com.openai']?.review;
  assert.equal(review?.test_cases?.positive?.length,5);
  assert.equal(review?.test_cases?.negative?.length,3);
  assert.ok(review.test_cases.positive.every((x)=>x.description&&x.prompt&&x.tools_triggered&&x.expected_behavior));
  assert.ok(review.test_cases.negative.every((x)=>x.description&&x.prompt&&x.expected_behavior));
});

test('OpenAI account-side packet keeps public-directory and owned-route truth gates',()=>{
  const submission=readJson('openai-submission.json');
  assert.equal(submission.listing?.name,'Evercraft');
  assert.ok(submission.positive_tests.length>=5);
  assert.ok(submission.negative_tests.length>=3);
  assert.equal(submission.public_directory_claim_allowed,false);
  if(submission.owned_fabric_transport?.verified_external_canary===true){
    assert.equal(submission.compatibility_transport?.active,false);
    assert.equal(submission.compatibility_transport?.owned_fabric_cutover_required,false);
    assert.equal(submission.owned_fabric_transport?.authority,'owned_public_fabric');
    assert.equal(submission.owned_fabric_transport?.origin_change_requires_new_openai_plugin_submission,true);
  }else{
    assert.equal(submission.compatibility_transport?.owned_fabric_cutover_required,true);
  }
});

test('submission denial cases cover payment, privacy, and consequential actions',()=>{
  const submission=readJson('openai-submission.json');
  const negativeText=JSON.stringify(submission.negative_tests).toLowerCase();
  assert.match(negativeText,/payment|charge/);
  assert.match(negativeText,/private|credential|secret/);
  assert.match(negativeText,/consequential|publish|deploy/);
});


test('review test cases reference the live scanned Fabric matcher',()=>{
  const manifest=readJson('plugin.json');
  const review=manifest.extensions?.['com.openai']?.review;
  assert.ok(review.test_cases.positive.every((x)=>x.tools_triggered==='match_evercraft_capability'));
  assert.equal(manifest.version,'1.0.3');
});


test('portable and compatibility manifests agree on release identity',()=>{
  const portable=readJson('plugin.json');
  const compatibility=readJson('.codex-plugin/plugin.json');
  assert.equal(compatibility.version,portable.version);
  assert.equal(compatibility.name,portable.name);
  assert.equal(compatibility.interface?.category,portable.extensions?.['com.openai']?.interface?.category);
  assert.equal(compatibility.interface?.websiteURL,portable.homepage);
});

test('review package includes an accessible demo recording and release notes',()=>{
  const manifest=readJson('plugin.json');
  const openai=manifest.extensions?.['com.openai'];
  const demo=new URL(openai.review.demo_recording_url);
  assert.equal(demo.protocol,'https:');
  assert.equal(demo.hostname,'drive.google.com');
  assert.ok(String(openai.publication?.release_notes||'').length>20);
});
