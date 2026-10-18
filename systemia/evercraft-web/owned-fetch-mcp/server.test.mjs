import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchPublicPage, startOwnedWebFetchMcp, webMcpResponse, WEB_MCP_TOOLS } from './server.mjs';

const clock = () => new Date('2026-10-18T02:00:00.000Z');
const resolved = [];
const resolveHost = async (hostname) => {
  resolved.push(hostname);
  if (hostname === 'private.test') throw new Error('private_or_reserved_target');
  return [{address:'93.184.216.34',family:4}];
};

test('bounded text fetch returns source-labeled SHA-256 receipt and redacts query', async () => {
  const row = await fetchPublicPage('https://public.example/story?private_search=do-not-expose', {
    clock, resolveHost,
    request: async (url, address) => {
      assert.equal(url.hostname, 'public.example');
      assert.equal(address.address, '93.184.216.34');
      return {status:200, contentType:'text/html; charset=utf-8',
        data:Buffer.from('<html><head><title>Story</title><script>secretToken</script></head><body><h1>Heading</h1><p>Hello there</p></body></html>')};
    },
  });
  assert.equal(row.ok,true);
  assert.equal(row.title,'Story');
  assert.deepEqual(row.headings,[{level:1,text:'Heading'}]);
  assert.match(row.text,/Hello there/);
  assert.doesNotMatch(row.text,/secretToken|<script>/);
  assert.equal(row.source_url_redacted,'https://public.example/story');
  assert.doesNotMatch(JSON.stringify(row),/do-not-expose/);
  assert.match(row.content_sha256,/^sha256:[a-f0-9]{64}$/);
  assert.match(row.evidence_receipt_sha256,/^sha256:[a-f0-9]{64}$/);
  assert.equal(row.browser_execution,false);
  assert.equal(row.payment_authority,false);
});

test('private, localhost, credentials and non-http targets are rejected before network', async () => {
  const request = () => {throw Error('must never reach network');};
  for(const url of [
    'http://127.0.0.1/admin','http://[::1]/',
    'http://10.0.0.1/','http://169.254.169.254/latest/meta-data',
    'http://user:pass@public.example/','file:///etc/passwd',
    'http://public.example:8080/'
  ]) {
    await assert.rejects(fetchPublicPage(url,{request}), /private_or_reserved_target|embedded_credentials_not_allowed|unsupported_url_scheme|unsupported_port/);
  }
});

test('redirect revalidates DNS and blocks private destination', async () => {
  let calls=0;
  await assert.rejects(fetchPublicPage('https://public.example/start',{
    resolveHost,
    request: async()=>{
      calls++;
      return {status:302,location:'https://private.test/secret',data:Buffer.alloc(0)};
    }
  }),/private_or_reserved_target/);
  assert.equal(calls,1);
  assert.deepEqual(resolved.slice(-2),['public.example','private.test']);
});

test('HTTPS downgrade, redirect loop, huge body, upstream error and disallowed MIME hold', async () => {
  await assert.rejects(fetchPublicPage('https://public.example/',{
    resolveHost, request:async()=>({status:302,location:'http://public.example/',data:Buffer.alloc(0)})
  }),/https_downgrade_forbidden/);
  await assert.rejects(fetchPublicPage('https://public.example/',{
    resolveHost, request:async()=>({status:302,location:'/again',data:Buffer.alloc(0)})
  }),/redirect_limit_exceeded/);
  await assert.rejects(fetchPublicPage('https://public.example/',{
    resolveHost, request:async()=>({status:200,contentType:'text/plain',data:Buffer.alloc(270000)})
  }),/response_too_large/);
  await assert.rejects(fetchPublicPage('https://public.example/',{
    resolveHost, request:async()=>({status:500,data:Buffer.alloc(0)})
  }),/upstream_http_500/);
  await assert.rejects(fetchPublicPage('https://public.example/',{
    resolveHost, request:async()=>({status:200,contentType:'application/octet-stream',data:Buffer.from('bytes')})
  }),/unsupported_content_type_or_encoding/);
});


test('first release holds IPv6-only resolutions pending mapped-address safety review', async () => {
  await assert.rejects(fetchPublicPage('https://public.example/',{
    resolveHost:async()=>[{address:'2606:4700:4700::1111',family:6}],
    request:()=>{throw Error('IPv6 outbound must not run');}
  }),/ipv4_public_target_required/);
  await assert.rejects(fetchPublicPage('https://public.example/',{
    resolveHost:async()=>[{address:'127.0.0.1',family:4}],
    request:()=>{throw Error('private IPv4 outbound must not run');}
  }),/ipv4_public_target_required/);
});

test('MCP only exposes Fetch capabilities and read-only tool; wrong arguments fail closed', async () => {
  assert.deepEqual(WEB_MCP_TOOLS.map(t=>t.name),['get_web_capabilities','fetch_url','fetch_urls']);
  const init=webMcpResponse({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-11-25'}});
  assert.equal(init.result.protocolVersion,'2025-11-25');
  assert.equal(init.result.serverInfo.name,'evercraft-web-owned-fetch-candidate');
  assert.equal(webMcpResponse({jsonrpc:'2.0',id:2,method:'tools/list'}).result.tools.length,3);
  const bad=webMcpResponse({jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'browser',arguments:{url:'https://example.com'}}});
  assert.equal(bad.error.code,-32602);
  const good=await webMcpResponse({jsonrpc:'2.0',id:4,method:'tools/call',params:{name:'fetch_url',arguments:{url:'https://example.com'}}},{
    fetcher: async()=>({ok:true,text:'read-only-fixture',evidence_state:'synthetic_fixture'})
  });
  assert.equal(good.result.structuredContent.text,'read-only-fixture');
  const rejected=await webMcpResponse({jsonrpc:'2.0',id:5,method:'tools/call',params:{name:'fetch_url',arguments:{url:'http://127.0.0.1'}}},{
    fetcher:fetchPublicPage,
  });
  assert.equal(rejected.result.isError,true);
  assert.match(rejected.result.content[0].text,/private_or_reserved_target/);
});


test('bounded multi-URL Fetch isolates failures, preserves order and avoids parallel egress', async () => {
  let active=0;
  let maxActive=0;
  const seen=[];
  const fetcher=async (url) => {
    active++;
    maxActive=Math.max(maxActive,active);
    seen.push(url);
    await new Promise(resolve=>setImmediate(resolve));
    active--;
    if(url.includes('denied')) throw new Error('private_or_reserved_target');
    return {ok:true,source_url_redacted:url,content_sha256:'sha256:'+'a'.repeat(64)};
  };
  const payload={jsonrpc:'2.0',id:11,method:'tools/call',
    params:{name:'fetch_urls',arguments:{urls:[
      'https://public.example/one',
      'http://127.0.0.1/denied',
      'https://public.example/three',
    ]}}};
  const response=await webMcpResponse(payload,{fetcher});
  assert.equal(response.result.structuredContent.attempted,3);
  assert.equal(response.result.structuredContent.succeeded,2);
  assert.equal(response.result.structuredContent.failed,1);
  assert.equal(response.result.structuredContent.results[0].index,0);
  assert.equal(response.result.structuredContent.results[0].ok,true);
  assert.equal(response.result.structuredContent.results[1].ok,false);
  assert.equal(response.result.structuredContent.results[1].error,'private_or_reserved_target');
  assert.equal(response.result.structuredContent.results[2].index,2);
  assert.equal(maxActive,1);
  assert.deepEqual(seen,payload.params.arguments.urls);
  assert.equal(response.result.structuredContent.payment_authority,false);
  assert.equal(response.result.structuredContent.browser_authority,false);
});

test('Fetch batch rejects empty, over-five, non-string and extra arguments before egress', async()=>{
  let called=0;
  const fetcher=async()=>{called++;return {ok:true};};
  for(const args of [
    {urls:[]}, {urls:Array(6).fill('https://example.com/')},
    {urls:['https://example.com/',42]},
    {urls:['https://example.com/'],admin:true},
    {url:'https://example.com/'},
  ]){
    const reply=webMcpResponse({jsonrpc:'2.0',id:8,method:'tools/call',
      params:{name:'fetch_urls',arguments:args}},{fetcher});
    assert.equal(reply.error.code,-32602);
  }
  assert.equal(called,0);
});

test('HTTP MCP is loopback-bound, bearer-authenticated, origin-restricted and non-transactional', async () => {
  await assert.rejects(startOwnedWebFetchMcp({host:'0.0.0.0',token:'x'.repeat(28)}),/loopback_only_candidate/);
  await assert.rejects(startOwnedWebFetchMcp({token:'short'}),/private_access_token_required/);
  const token='fake-local-only-test-token-000001';
  const app=await startOwnedWebFetchMcp({
    token,fetcher:async (url)=>({ok:true,source_url_redacted:url,text:'fixture',evidence_state:'synthetic_fixture'}),
  });
  const post=(body,headers={})=>fetch(app.url+'/mcp',{
    method:'POST',headers:{'content-type':'application/json',...headers},
    body:JSON.stringify(body),
  });
  try {
    const health=await fetch(app.url+'/health').then(x=>x.json());
    assert.equal(health.production_ready,false);
    assert.equal(health.registry_repoint_authorized,false);
    assert.equal((await post({jsonrpc:'2.0',id:1,method:'tools/list'})).status,401);
    assert.equal((await post({jsonrpc:'2.0',id:1,method:'tools/list'},
      {authorization:'Bearer '+token,origin:'http://malicious.example'})).status,403);
    const listed=await (await post({jsonrpc:'2.0',id:2,method:'tools/list'},
      {authorization:'Bearer '+token})).json();
    assert.equal(listed.result.tools.length,3);
    const run=await (await post({jsonrpc:'2.0',id:3,method:'tools/call',
      params:{name:'fetch_url',arguments:{url:'https://example.com'}}},
      {authorization:'Bearer '+token})).json();
    assert.equal(run.result.structuredContent.text,'fixture');
    assert.equal((await fetch(app.url+'/mcp',{method:'GET',
      headers:{authorization:'Bearer '+token}})).status,405);
    assert.equal((await post({jsonrpc:'2.0',method:'notifications/initialized'},
      {authorization:'Bearer '+token})).status,202);
    assert.equal((await post({jsonrpc:'2.0',id:8,method:'tools/call',
      params:{name:'checkout',arguments:{}}},{authorization:'Bearer '+token})).status,200);
  } finally {
    await app.close();
  }
});


test('MCP limits concurrent calls and rate without triggering duplicate fetch execution', {timeout:5000}, async () => {
  const token = 'test-worker-capability-auth-secret-00001';
  let release;
  let entered;
  const started = new Promise(resolve => { entered = resolve; });
  let invocations = 0;
  const app = await startOwnedWebFetchMcp({
    token, maxConcurrent:1, maxRequestsPerMinute:2,
    fetcher:async () => {
      invocations++;
      entered();
      await new Promise(resolve => { release = resolve; });
      return {ok:true,text:'fixture'};
    },
  });
  const post = () => fetch(app.url+'/mcp',{
    method:'POST',
    headers:{authorization:'Bearer '+token,'content-type':'application/json'},
    body:JSON.stringify({
      jsonrpc:'2.0',id:7,method:'tools/call',
      params:{name:'fetch_url',arguments:{url:'https://example.com/'}},
    }),
  });
  try {
    const first = post();
    await started;
    const overConcurrency = await post();
    assert.equal(overConcurrency.status,429);
    assert.equal((await overConcurrency.json()).error,'concurrency_limited');
    assert.equal(invocations,1);
    release();
    const success = await first;
    assert.equal(success.status,200);
    const overRate = await post();
    assert.equal(overRate.status,429);
    assert.equal((await overRate.json()).error,'rate_limited');
    assert.equal(invocations,1);
  } finally {
    if (release) release();
    await app.close();
  }
});
