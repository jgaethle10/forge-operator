import assert from 'node:assert/strict';
import test from 'node:test';
import { ownedHttpsEndpoint } from './owned-commerce-endpoint.mjs';

test('accepts owned HTTPS endpoint',()=>{
  assert.equal(ownedHttpsEndpoint('https://fabric.systemiacommandcenters.com/mcp',{name:'mcp'}),'https://fabric.systemiacommandcenters.com/mcp');
});
test('blocks legacy provider endpoint',()=>{
  assert.throws(()=>ownedHttpsEndpoint('https://example.base44.app/functions/x',{name:'gateway'}),/legacy_provider_blocked/);
});
test('fails closed when required endpoint is missing',()=>{
  assert.throws(()=>ownedHttpsEndpoint('',{name:'gateway'}),/gateway_required/);
  assert.equal(ownedHttpsEndpoint('',{name:'gateway',required:false}),null);
});
