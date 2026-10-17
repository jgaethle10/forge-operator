import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {probeFabric,validateOrigin,EXPECTED_ID} from '../public-discovery.mjs';

async function serve({mode='json',missingTool=false,badMatch=false,badOffer=false,redirect=false,badIdentity=false}={}){
  const seen=[];
  const server=createServer(async(req,res)=>{
    if(redirect){res.writeHead(302,{location:'https://example.org/mcp'});res.end();return;}
    let body='';
    for await(const part of req){body+=part;if(body.length>10000){res.writeHead(413);res.end();return;}}
    let message;try{message=JSON.parse(body);}catch{res.writeHead(400);res.end();return;}
    seen.push({method:message.method,params:message.params,sid:req.headers['mcp-session-id']||null});
    const all=['list_evercraft_capabilities','match_evercraft_capability','get_evercraft_connection_options'];
    let result;
    switch(message.method){
      case 'initialize':
        result={serverInfo:{name:badIdentity?'untrusted-lookalike':'evercraft-fabric',version:'test'},protocolVersion:'2025-03-26',capabilities:{tools:{}}};break;
      case 'tools/list':
        result={tools:(missingTool?all.slice(0,2):all).map(name=>({name,description:'Read-only synthetic fixture'}))};break;
      case 'tools/call':
        if(message.params?.name==='match_evercraft_capability')result={structuredContent:{matches:[{public_id:badMatch?'not-exact-match':EXPECTED_ID}]}};
        else if(message.params?.name==='get_evercraft_connection_options')result={structuredContent:{human_offer_url:badOffer?'https://evil.example/checkout':'https://fabric.systemiacommandcenters.com/offers/findmypart'}};
        else {res.writeHead(400);res.end();return;}
        break;
      default:res.writeHead(400);res.end();return;
    }
    const rpc=JSON.stringify({jsonrpc:'2.0',id:message.id,result});
    const messageBody=mode==='sse'?'event: message\ndata: '+rpc+'\n\n':rpc;
    res.writeHead(200,{
      'content-type':mode==='sse'?'text/event-stream':'application/json',
      'mcp-session-id':'synthetic-session-001',
    });
    res.end(messageBody);
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const address=server.address();
  return {origin:'http://127.0.0.1:'+address.port,seen,close:()=>new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()))};
}
test('standalone no-dependency outsider flow exercises exact four public discovery requests',async()=>{
  const host=await serve();
  try{
    const result=await probeFabric({origin:host.origin,allowLoopback:true});
    assert.equal(result.state,'read_only_public_discovery_verified');
    assert.equal(result.matched_public_id,EXPECTED_ID);
    assert.equal(result.verified_payment,false);
    assert.equal(result.checkout_created,false);
    assert.equal(result.external_operator_connected,false);
    assert.equal(result.human_offer_present,true);
    assert.deepEqual(host.seen.map(x=>x.method),['initialize','tools/list','tools/call','tools/call']);
    assert.deepEqual(host.seen.filter(x=>x.method==='tools/call').map(x=>x.params.name),['match_evercraft_capability','get_evercraft_connection_options']);
    assert.equal(host.seen[1].sid,'synthetic-session-001');
    assert.equal(host.seen[2].params.arguments.intent,'Source an identified discontinued obsolete machine part');
  }finally{await host.close();}
});
test('standalone client decodes SSE responses',async()=>{
  const host=await serve({mode:'sse'});
  try{const receipt=await probeFabric({origin:host.origin,allowLoopback:true});assert.equal(receipt.matched_public_id,EXPECTED_ID);}
  finally{await host.close();}
});
test('unexpected origin including credential, off-domain and insecure targets is blocked',()=>{
  assert.throws(()=>validateOrigin('https://fake.example/'),/canonical/);
  assert.throws(()=>validateOrigin('http://fabric.systemiacommandcenters.com'),/canonical/);
  assert.throws(()=>validateOrigin('https://fabric.systemiacommandcenters.com/mcp'),/path/);
  assert.throws(()=>validateOrigin('https://a:b@fabric.systemiacommandcenters.com'),/credentials/);
  assert.throws(()=>validateOrigin('http://localhost:4444',{allowLoopback:true}),/canonical/);
  assert.equal(validateOrigin('http://127.0.0.1:4444',{allowLoopback:true}),'http://127.0.0.1:4444');
});
test('fail closed when public discovery tool is absent',async()=>{
 const host=await serve({missingTool:true});
 try{await assert.rejects(()=>probeFabric({origin:host.origin,allowLoopback:true}),/discovery tools missing/);}
 finally{await host.close();}
});
test('fail closed on wrong brand-blind match',async()=>{
 const host=await serve({badMatch:true});
 try{await assert.rejects(()=>probeFabric({origin:host.origin,allowLoopback:true}),/matching result/);}
 finally{await host.close();}
});
test('fail closed on external buyer URL even though client never opens buyer links',async()=>{
 const host=await serve({badOffer:true});
 try{await assert.rejects(()=>probeFabric({origin:host.origin,allowLoopback:true}),/Unexpected external buyer URL/);}
 finally{await host.close();}
});
test('refuse redirects instead of forwarding requests to new origins',async()=>{
 const host=await serve({redirect:true});
 try{await assert.rejects(()=>probeFabric({origin:host.origin,allowLoopback:true}),/redirect refused/);}
 finally{await host.close();}
});

test('fail closed when public endpoint claims an unexpected MCP server identity',async()=>{
 const host=await serve({badIdentity:true});
 try{await assert.rejects(()=>probeFabric({origin:host.origin,allowLoopback:true}),/server identity mismatch/);}
 finally{await host.close();}
});
