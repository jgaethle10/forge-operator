import test from 'node:test';
import assert from 'node:assert/strict';
import {exerciseIndependentTool} from '../independent-tool-client.mjs';

test('independent MCP test tool performs real initialize/list/invoke and verifies nonce receipt',async()=>{
 const r=await exerciseIndependentTool({nonce:'DISPOSABLE_42abcX'});
 assert.equal(r.state,'local_mcp_tool_invoked_and_verified');
 assert.equal(r.server,'evercraft-operator-test-tool');
 assert.equal(r.tool,'operator_probe_nonce');
 assert.match(r.output_sha256,/^[a-f0-9]{64}$/);
 assert.equal(r.external_partner_connected,false);
 assert.equal(r.public_fabric_catalog_modified,false);
 assert.equal(r.payment_verified,false);
});
test('each unique nonce yields a distinct provable receipt',async()=>{
 const a=await exerciseIndependentTool({nonce:'disposable_number_111'});
 const b=await exerciseIndependentTool({nonce:'disposable_number_222'});
 assert.notEqual(a.output_sha256,b.output_sha256);
});
test('test MCP client rejects non-disposable input before spawning',async()=>{
 await assert.rejects(()=>exerciseIndependentTool({nonce:'payment:secret'}),/Only disposable/);
 await assert.rejects(()=>exerciseIndependentTool({nonce:'short'}),/Only disposable/);
});
test('test MCP client refuses non-MCP executables',async()=>{
 await assert.rejects(()=>exerciseIndependentTool({serverPath:process.execPath}),/timeout|stopped|Wrong|exceeded|Invalid/);
});
