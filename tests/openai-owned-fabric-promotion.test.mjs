import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  assertVerifiedOwnedCanary,
  normalizeOwnedOrigin,
  promoteOpenAiOwnedFabric,
} from '../scripts/promote-openai-owned-fabric.mjs';

function fixture(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-openai-owned-'));
  fs.mkdirSync(path.join(root,'plugins/evercraft-fabric'),{recursive:true});
  fs.mkdirSync(path.join(root,'distribution/openai-plugin'),{recursive:true});
  fs.mkdirSync(path.join(root,'artifacts'),{recursive:true});
  fs.writeFileSync(path.join(root,'plugins/evercraft-fabric/mcp.json'),JSON.stringify({
    $schema:'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json',
    mcpServers:{evercraft:{type:'streamable-http',url:'https://legacy.base44.app/mcp'}},
  }));
  fs.writeFileSync(path.join(root,'plugins/evercraft-fabric/.mcp.json'),JSON.stringify({
    mcpServers:{evercraft:{type:'http',url:'https://legacy.base44.app/mcp'}},
  }));
  fs.writeFileSync(path.join(root,'plugins/evercraft-fabric/openai-submission.json'),JSON.stringify({
    schema:'evercraft.openai-plugin-submission.v1',
    submission_state:'source_ready_account_gate_pending',
    compatibility_transport:{owned_fabric_cutover_required:true},
  }));
  fs.writeFileSync(path.join(root,'distribution/openai-plugin/submission.json'),JSON.stringify({
    schema:'evercraft.openai-plugin-submission-prep.v2',
    mcp:{url:'https://legacy.base44.app/mcp',owned_fabric_cutover_required:true},
  }));
  const canary={
    schema:'evercraft.public-edge.external-canary.v1',
    verified:true,
    state:'public_https_verified',
    origin:'https://fabric.evercraft.example',
    public_https_verified:true,
    identity_attestation_verified:true,
    same_device_binding:true,
    field_enrollment_verified:true,
    mcp_initialize_verified:true,
    mcp_tools_list_verified:true,
    mcp_tool_calls_verified:true,
    openai_profile_verified:true,
    read_only_authority_verified:true,
    external_saas_route_provider_required:false,
    device_fingerprint:'sha256:'+'a'.repeat(64),
    public_edge_admission_receipt_ref:'sha256:'+'b'.repeat(64),
  };
  fs.writeFileSync(path.join(root,'artifacts/canary.json'),JSON.stringify(canary));
  return root;
}

test('owned origin validator rejects compatibility and local hosts',()=>{
  assert.throws(()=>normalizeOwnedOrigin('https://foo.base44.app'),/must_not_be_base44/);
  assert.throws(()=>normalizeOwnedOrigin('http://fabric.example.com'),/must_use_https/);
  assert.throws(()=>normalizeOwnedOrigin('https://localhost'),/must_be_public/);
  assert.equal(normalizeOwnedOrigin('https://fabric.evercraft.example/'),'https://fabric.evercraft.example');
});

test('canary validation fails closed',()=>{
  assert.throws(()=>assertVerifiedOwnedCanary({schema:'evercraft.public-edge.external-canary.v1'}),/canary_state_invalid/);
});

test('verified canary promotes all OpenAI package pointers to owned Fabric',()=>{
  const root=fixture();
  const result=promoteOpenAiOwnedFabric({root,receiptPath:'artifacts/canary.json'});
  assert.equal(result.mcp_url,'https://fabric.evercraft.example/mcp/openai');

  const portable=JSON.parse(fs.readFileSync(path.join(root,'plugins/evercraft-fabric/mcp.json'),'utf8'));
  const compat=JSON.parse(fs.readFileSync(path.join(root,'plugins/evercraft-fabric/.mcp.json'),'utf8'));
  const source=JSON.parse(fs.readFileSync(path.join(root,'plugins/evercraft-fabric/openai-submission.json'),'utf8'));
  const distribution=JSON.parse(fs.readFileSync(path.join(root,'distribution/openai-plugin/submission.json'),'utf8'));

  assert.equal(portable.mcpServers.evercraft.url,result.mcp_url);
  assert.equal(compat.mcpServers.evercraft.url,result.mcp_url);
  assert.equal(source.owned_fabric_transport.mcp,result.mcp_url);
  assert.equal(source.compatibility_transport.active,false);
  assert.equal(source.compatibility_transport.owned_fabric_cutover_required,false);
  assert.equal(distribution.mcp.url,result.mcp_url);
  assert.equal(distribution.mcp.authority,'owned_public_fabric');
  assert.equal(distribution.mcp.origin_change_requires_new_plugin_submission,true);
  assert.ok(fs.existsSync(path.join(root,'artifacts/openai-owned-fabric-promotion-receipt.json')));
});
