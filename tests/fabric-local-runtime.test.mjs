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
    state:'available',
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
    assert.equal(health.public_plugin_submission_ready,false);
    assert.equal(health.removed_legacy_base44_connections,2);
    assert.equal(health.removed_legacy_base44_mcp_connections,1);

    const init=await fetch(runtime.mcpUrl,{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({
        jsonrpc:'2.0',id:1,method:'initialize',
        params:{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'secure-tunnel-test',version:'1'}},
      }),
    }).then((r)=>r.json());
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
    ]);
    assert.ok(tools.result.tools.every((x)=>x.annotations.readOnlyHint===true));

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
    assert.match(home,/\/assets\/evercraft-icon\.png/);

    const directoryResponse=await fetch(runtime.url+'/capabilities');
    assert.equal(directoryResponse.status,200);
    const directory=await directoryResponse.text();
    assert.match(directory,/Native Product/);
    assert.match(directory,/available/);
    assert.equal(directory.includes('base44.app'),false);

    const iconResponse=await fetch(runtime.url+'/assets/evercraft-icon.png');
    assert.equal(iconResponse.status,200);
    assert.equal(iconResponse.headers.get('content-type'),'image/png');
    assert.ok((await iconResponse.arrayBuffer()).byteLength>1000);

    const privacyResponse=await fetch(runtime.url+'/privacy');
    assert.equal(privacyResponse.status,200);
    const privacy=await privacyResponse.text();
    assert.match(privacy,/Evercraft Fabric Privacy Policy/);
    assert.match(privacy,/Information processed/);
  } finally {
    await runtime.close();
  }
});
