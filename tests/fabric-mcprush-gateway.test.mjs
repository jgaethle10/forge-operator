import test from 'node:test';
import assert from 'node:assert/strict';
import {startFabricLocalRuntime} from '../systemia/mcp/fabric-local-runtime.mjs';

const token='mgw_test_marketplace_only_secret_123456789';
const catalog=[{
  public_id:'marketplace-test-v1',
  name:'Market Discovery Example',
  description:'Read-only example used to prove isolated gateway access.',
  keywords:['discovery'],
  state:'available',
  connections:[],
}];
const rpc=(method,id=1,params={})=>JSON.stringify({jsonrpc:'2.0',id,method,params});

test('mcprush route is opt-in and fail-closed without altering direct MCP',async()=>{
  const runtime=await startFabricLocalRuntime({
    host:'127.0.0.1',port:0,catalog,mcprushMachineCommerceToken:'',
  });
  try{
    assert.equal(runtime.marketplaceMcpUrl,null);
    const health=await fetch(runtime.url+'/health').then(x=>x.json());
    assert.equal(health.mcprush_machine_commerce_token_configured,false);
    assert.equal(health.mcprush_machine_commerce_verification,'external_not_asserted');
    assert.equal(JSON.stringify(health).includes(token),false);
    const gated=await fetch(runtime.url+'/mcprush/mcp',{
      method:'POST',headers:{'content-type':'application/json'},
      body:rpc('tools/list'),
    });
    assert.equal(gated.status,503);
    const direct=await fetch(runtime.mcpUrl,{
      method:'POST',headers:{'content-type':'application/json'},
      body:rpc('tools/list'),
    });
    assert.equal(direct.status,200);
    assert.equal((await direct.json()).result.tools.length,3);
  }finally{await runtime.close();}
});

test('mcprush requires separate token for GET, initialize and every tools/list request',async()=>{
  const runtime=await startFabricLocalRuntime({
    host:'127.0.0.1',port:0,catalog,mcprushMachineCommerceToken:token,
  });
  try{
    assert.equal(runtime.marketplaceMcpUrl,runtime.url+'/mcprush/mcp');
    const health=await fetch(runtime.url+'/health').then(r=>r.json());
    assert.equal(health.mcprush_machine_commerce_token_configured,true);
    assert.equal(health.mcprush_machine_commerce_tool_scope,'read_only_discovery');
    assert.equal(JSON.stringify(health).includes(token),false);
    for(const headers of [
      {},
      {'x-mcprush-token':'incorrect'},
      {authorization:'Bearer '+token},
    ]){
      const res=await fetch(runtime.marketplaceMcpUrl,{
        method:'POST',headers:{...headers,'content-type':'application/json'},
        body:rpc('tools/list'),
      });
      assert.equal(res.status,401);
      assert.equal((await res.text()).includes(token),false);
    }
    assert.equal((await fetch(runtime.marketplaceMcpUrl)).status,401);
    const authorizedHeaders={'content-type':'application/json','x-mcprush-token':token};
    const init=await fetch(runtime.marketplaceMcpUrl,{
      method:'POST',headers:authorizedHeaders,
      body:rpc('initialize',1,{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'mcprush-verifier',version:'1'}}),
    });
    assert.equal(init.status,200);
    assert.ok(init.headers.get('mcp-session-id'));
    assert.equal((await init.json()).result.serverInfo.name,'evercraft-fabric');
    for(let i=0;i<5;i++){
      const res=await fetch(runtime.marketplaceMcpUrl,{
        method:'POST',headers:authorizedHeaders,body:rpc('tools/list',i+2),
      });
      assert.equal(res.status,200);
      const tools=(await res.json()).result.tools;
      assert.deepEqual(tools.map(t=>t.name),[
        'match_evercraft_capability',
        'list_evercraft_capabilities',
        'get_evercraft_connection_options',
      ]);
      assert.ok(tools.every(t=>t.annotations.readOnlyHint===true));
    }
    const status=await fetch(runtime.marketplaceMcpUrl,{headers:{'x-mcprush-token':token}});
    assert.equal(status.status,200);
    assert.equal((await status.json()).read_only,true);
    // Original public MCP access remains independent of marketplace authentication.
    const direct=await fetch(runtime.mcpUrl,{
      method:'POST',headers:{'content-type':'application/json'},
      body:rpc('tools/list'),
    });
    assert.equal(direct.status,200);
  }finally{await runtime.close();}
});
