/**
 * Single public GET smoke from GitHub-hosted runner.
 * Exercises real TLS + pinned public DNS, but NOT a deployed public MCP route.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startOwnedWebFetchMcp } from './server.mjs';

test('live read-only public Fetch through local MCP over actual HTTPS egress', {timeout:40000}, async () => {
  const token = 'github-runner-loopback-test-token-0001';
  const adapter = await startOwnedWebFetchMcp({token, maxConcurrent:1, maxRequestsPerMinute:10});
  const rpc = (id, method, params) => fetch(adapter.url+'/mcp', {
    method:'POST',
    headers:{authorization:'Bearer '+token,'content-type':'application/json'},
    body:JSON.stringify({jsonrpc:'2.0',id,method,params}),
  }).then(async (r) => {
    assert.equal(r.status,200);
    return r.json();
  });
  try {
    const initialized=await rpc(1,'initialize',{protocolVersion:'2025-03-26'});
    assert.equal(initialized.result.serverInfo.name,'evercraft-web-owned-fetch-candidate');
    const tools=await rpc(2,'tools/list',{});
    assert.deepEqual(tools.result.tools.map(x=>x.name),['get_web_capabilities','fetch_url']);
    const fetched=await rpc(3,'tools/call',{
      name:'fetch_url',arguments:{url:'https://example.com/'},
    });
    assert.equal(fetched.result?.isError,undefined,'fetch_url returned error instead of evidence: '+JSON.stringify(fetched.result?.content || []));
    const row=fetched.result.structuredContent;
    assert.equal(row.ok,true);
    assert.equal(row.source_url_redacted,'https://example.com/');
    assert.equal(row.status,200);
    assert.match(row.text,/Example Domain/i);
    assert.match(row.content_sha256,/^sha256:[a-f0-9]{64}$/);
    assert.match(row.evidence_receipt_sha256,/^sha256:[a-f0-9]{64}$/);
    assert.equal(row.redirect_count>=0,true);
    assert.equal(row.payment_authority,false);
    const denied=await rpc(4,'tools/call',{
      name:'fetch_url',arguments:{url:'http://127.0.0.1/latest/meta-data'},
    });
    assert.equal(denied.result.isError,true);
    assert.match(denied.result.content[0].text,/private_or_reserved_target/);
  } finally {
    await adapter.close();
  }
});
