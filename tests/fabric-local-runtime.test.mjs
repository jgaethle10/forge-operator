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
      {type:'website',label:'website',url:'https://example.com/'},
    ],
  },
];

test('native-only bridge removes Base44 MCP routes but keeps non-MCP and owned MCP routes',()=>{
  const prepared=nativeOnlyCatalog(catalog);
  assert.equal(prepared.removed_legacy_base44_mcp_connections,1);
  const connections=prepared.capabilities[0].connections;
  assert.equal(connections.some((x)=>/base44\.app/.test(x.url)),false);
  assert.equal(connections.some((x)=>x.url==='https://fabric.evercraft.example/mcp/native'),true);
  assert.equal(connections.some((x)=>x.type==='website'),true);
});

test('Fabric local runtime is read-only, tunnel-compatible, and makes no Base44 transport available',async()=>{
  const runtime=await startFabricLocalRuntime({host:'127.0.0.1',port:0,catalog});
  try {
    const health=await fetch(runtime.url+'/health').then((r)=>r.json());
    assert.equal(health.ok,true);
    assert.equal(health.base44_transport_enabled,false);
    assert.equal(health.secure_tunnel_compatible,true);
    assert.equal(health.public_plugin_submission_ready,false);
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
