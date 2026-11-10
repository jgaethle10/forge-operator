import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRpcMessages,checkOwnedMcp} from './inspect-owned-mcp-cold-client.mjs';
const registry=(remotes)=>({state:'OBSERVED_WITH_FINDINGS',servers:remotes.map(([name,url])=>({name,remotes:[{url}]}))});
test('parses JSON and SSE tool result messages',()=>{
  assert.equal(parseRpcMessages('data: {"jsonrpc":"2.0","id":2,"result":{"tools":[{"name":"match_offer"}]}}')[0].result.tools[0].name,'match_offer');
});
test('only exact owned HTTPS mcp paths are probed',async()=>{
  const calls=[];
  const f=async(url,opts)=>{
    calls.push({url,req:JSON.parse(opts.body)});
    if(JSON.parse(opts.body).method==='initialize')return new Response(JSON.stringify({jsonrpc:'2.0',id:1,result:{serverInfo:{name:'Evercraft'},protocolVersion:'2025-03-26'}}),{status:200,headers:{'content-type':'application/json','mcp-session-id':'session-1'}});
    return new Response(JSON.stringify({jsonrpc:'2.0',id:2,result:{tools:[{name:'match_offer'}]}}),{status:200,headers:{'content-type':'application/json'}});
  };
  const receipt=await checkOwnedMcp({receipt:registry([
    ['io.github.jgaethle10/evercraft-machine-commerce','https://fabric.systemiacommandcenters.com/mcp'],
    ['io.github.jgaethle10/forensiscope','https://forensiscope.base44.app/mcp'],
    ['io.github.jgaethle10/evil','https://fabric.systemiacommandcenters.com.evil.test/mcp']
  ]),fetchFn:f});
  assert.equal(receipt.target_count,1);
  assert.equal(receipt.verified_count,1);
  assert.equal(receipt.results[0].tool_count,1);
  assert.deepEqual(calls.map(x=>x.req.method),['initialize','tools/list']);
});
test('HTTP 200 with HTML or no tools never proves MCP readiness',async()=>{
  const f=async()=>new Response('<html>not an MCP endpoint</html>',{status:200});
  const r=await checkOwnedMcp({receipt:registry([['io.github.jgaethle10/faie','https://fabric.systemiacommandcenters.com/mcp/faie']]),fetchFn:f});
  assert.equal(r.verified_count,0);
  assert.equal(r.results[0].initialize_valid,false);
});
