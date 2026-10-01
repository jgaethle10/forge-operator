import test from 'node:test';
import assert from 'node:assert/strict';
import {
  nativeOnlyCatalog,
  startFabricLocalRuntime,
} from '../systemia/mcp/fabric-local-runtime.mjs';

const catalog=[
  {
    public_id:'native-product-v1',
    name:'Native Product',
    description:'A native Evercraft capability.',
    keywords:['native'],
    state:'payment_ready',
    commercial_state:'sell_now',
    pricing:'Quick start $49 one-time.',
    use_when:['I need a native capability right now','route this problem to Native Product'],
    entry_paid_offer:{name:'Quick start',price:'$49',billing:'one_time',price_usd_normalized:49},
    connections:[
      {type:'mcp',label:'legacy universal',url:'https://legacy.base44.app/functions/mcp'},
      {type:'mcp',label:'owned direct',url:'https://fabric.evercraft.example/mcp/native'},
      {type:'website',label:'legacy website',url:'https://product.base44.app/view'},
      {type:'website',label:'owned website',url:'https://example.com/'},
    ],
  },
];

test('native-only bridge removes every Base44 handoff while keeping owned/public-safe routes',()=>{
  const prepared=nativeOnlyCatalog(catalog);
  assert.equal(prepared.removed_legacy_base44_connections,2);
  assert.equal(prepared.removed_legacy_base44_mcp_connections,1);
  const connections=prepared.capabilities[0].connections;
  assert.equal(connections.some((x)=>/base44\.app/.test(x.url)),false);
  assert.equal(connections.some((x)=>x.url==='https://fabric.evercraft.example/mcp/native'),true);
  assert.equal(connections.some((x)=>x.type==='website'&&x.url==='https://example.com/'),true);
});

test('Fabric local runtime is read-only, tunnel-compatible, and makes no Base44 transport available',async()=>{
  const runtime=await startFabricLocalRuntime({host:'127.0.0.1',port:0,catalog});
  try {
    const health=await fetch(runtime.url+'/health').then((r)=>r.json());
    assert.equal(health.ok,true);
    assert.equal(health.base44_transport_enabled,false);
    assert.equal(health.secure_tunnel_compatible,true);
    assert.equal(health.public_plugin_submission_ready,true);
    assert.equal(health.provider_publication_state,'external_to_runtime');
    assert.equal(health.removed_legacy_base44_connections,2);
    assert.equal(health.removed_legacy_base44_mcp_connections,1);
    assert.deepEqual(health.transport_modes,['application/json','text/event-stream']);

    const sseProbe=await fetch(runtime.mcpUrl,{
      headers:{accept:'text/event-stream'},
    });
    assert.equal(sseProbe.status,200);
    assert.match(sseProbe.headers.get('content-type')||'',/^text\/event-stream/);
    assert.equal(sseProbe.headers.get('mcp-protocol-version'),'2025-03-26');
    assert.match(await sseProbe.text(),/^event: message\ndata: \{/);

    const initResponse=await fetch(runtime.mcpUrl,{
      method:'POST',
      headers:{'content-type':'application/json','accept':'application/json, text/event-stream'},
      body:JSON.stringify({
        jsonrpc:'2.0',id:1,method:'initialize',
        params:{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'secure-tunnel-test',version:'1'}},
      }),
    });
    assert.equal(initResponse.status,200);
    assert.match(initResponse.headers.get('content-type')||'',/^text\/event-stream/);
    assert.ok(initResponse.headers.get('mcp-session-id'));
    assert.equal(initResponse.headers.get('mcp-protocol-version'),'2025-03-26');
    const initEvent=await initResponse.text();
    assert.match(initEvent,/^event: message\ndata: /);
    const init=JSON.parse(initEvent.split('data: ')[1].trim());
    assert.equal(init.result.serverInfo.name,'evercraft-fabric');

    const tools=await fetch(runtime.mcpUrl,{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/list',params:{}}),
    }).then((r)=>r.json());
    assert.deepEqual(tools.result.tools.map((x)=>x.name),[
      'match_evercraft_capability',
      'list_evercraft_capabilities',
      'get_evercraft_connection_options',
      'inspect_public_website',
    ]);
    assert.ok(tools.result.tools.every((x)=>x.annotations.readOnlyHint===true));
    assert.equal(
      tools.result.tools.find((x)=>x.name==='inspect_public_website')?.annotations.openWorldHint,
      true
    );

    const publicTools=await fetch(runtime.openAiMcpUrl,{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({jsonrpc:'2.0',id:22,method:'tools/list',params:{}}),
    }).then((r)=>r.json());
    assert.deepEqual(publicTools.result.tools.map((x)=>x.name),['inspect_public_website']);

    const blockedPublicRouter=await fetch(runtime.openAiMcpUrl,{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({
        jsonrpc:'2.0',id:23,method:'tools/call',
        params:{name:'match_evercraft_capability',arguments:{intent:'find a product'}},
      }),
    }).then((r)=>r.json());
    assert.equal(blockedPublicRouter.error.code,-32602);

    const options=await fetch(runtime.mcpUrl,{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({
        jsonrpc:'2.0',id:3,method:'tools/call',
        params:{name:'get_evercraft_connection_options',arguments:{public_id:'native-product-v1'}},
      }),
    }).then((r)=>r.json());
    const body=options.result.structuredContent;
    assert.equal(body.external_action_taken,false);
    assert.equal(body.connections.some((x)=>/base44\.app/.test(x.url)),false);
  } finally {
    await runtime.close();
  }
});


test('Fabric public customer front door is branded, browsable, and policy-safe',async()=>{
  const runtime=await startFabricLocalRuntime({host:'127.0.0.1',port:0,catalog});
  try {
    const homeResponse=await fetch(runtime.url+'/');
    assert.equal(homeResponse.status,200);
    assert.match(homeResponse.headers.get('content-type')||'',/^text\/html/);
    assert.equal(homeResponse.headers.get('x-frame-options'),'DENY');
    const home=await homeResponse.text();
    assert.match(home,/Bring the problem/);
    assert.match(home,/Explore 1 capabilities/);
    assert.match(home,/No silent checkout/);
    assert.match(home,/Available now/);
    assert.match(home,/Quick start \$49 one-time/);
    assert.match(home,/\/capabilities\/native-product-v1/);
    assert.match(home,/\/assets\/evercraft-icon\.png/);

    const directoryResponse=await fetch(runtime.url+'/capabilities');
    assert.equal(directoryResponse.status,200);
    const directory=await directoryResponse.text();
    assert.match(directory,/Native Product/);
    assert.match(directory,/sell_now/);
    assert.match(directory,/Quick start \$49 one-time/);
    assert.match(directory,/\/capabilities\/native-product-v1/);
    assert.equal(directory.includes('base44.app'),false);

    const detailResponse=await fetch(runtime.url+'/capabilities/native-product-v1');
    assert.equal(detailResponse.status,200);
    const detail=await detailResponse.text();
    assert.match(detail,/Native Product/);
    assert.match(detail,/Quick start \$49 one-time/);
    assert.match(detail,/I need a native capability right now/);
    assert.equal(detail.includes('base44.app'),false);

    const capabilityJson=await fetch(runtime.url+'/capabilities/native-product-v1.json').then((r)=>r.json());
    assert.equal(capabilityJson.ok,true);
    assert.equal(capabilityJson.capability.public_id,'native-product-v1');
    assert.equal(capabilityJson.capability.commercial_state,'sell_now');
    assert.equal(capabilityJson.capability.entry_paid_offer.price,'$49');
    assert.equal(capabilityJson.transactional,false);

    const directoryJson=await fetch(runtime.url+'/capabilities.json').then((r)=>r.json());
    assert.equal(directoryJson.returned,1);
    assert.equal(directoryJson.capabilities[0].pricing,'Quick start $49 one-time.');

    const iconResponse=await fetch(runtime.url+'/assets/evercraft-icon.png');
    assert.equal(iconResponse.status,200);
    assert.equal(iconResponse.headers.get('content-type'),'image/png');
    assert.ok((await iconResponse.arrayBuffer()).byteLength>1000);

    const listingPages=[
      ['support',/Evercraft Fabric Support/],
      ['privacy',/Evercraft Fabric Privacy Policy/],
      ['terms',/Evercraft Fabric Terms of Service/],
    ];
    for(const [page,pattern] of listingPages){
      const response=await fetch(runtime.url+'/'+page);
      assert.equal(response.status,200);
      assert.match(response.headers.get('content-type')||'',/^text\/html/);
      assert.match(await response.text(),pattern);
    }

    const journalResponse=await fetch(runtime.url+'/journal/');
    assert.equal(journalResponse.status,200);
    assert.match(journalResponse.headers.get('content-type')||'',/^text\/html/);
    assert.equal(journalResponse.headers.get('x-robots-tag'),'noindex, nofollow');
    const journal=await journalResponse.text();
    assert.match(journal,/Evercraft Journal/);
    assert.doesNotMatch(journal,/Black Friday|shopping assistant|optimize your cart/i);
  } finally {
    await runtime.close();
  }
});
