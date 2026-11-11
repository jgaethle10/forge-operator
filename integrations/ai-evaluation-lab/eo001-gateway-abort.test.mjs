import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {localJsonRequest,createSovereignInfer,MODEL_ID}
  from './eo001-sovereign-gateway-candidate.mjs';

test('pre-aborted HTTP signal refuses even a loopback request',async()=>{
  const controller=new AbortController();
  controller.abort();
  await assert.rejects(
    localJsonRequest({port:18080,route:'/health',token:'fixture-token',
      signal:controller.signal,timeoutMs:1000}),
    /GATEWAY_ABORTED/
  );
});
test('an invalid signal cannot silently bypass cancellation',()=>{
  assert.throws(()=>localJsonRequest({port:18080,route:'/health',
    token:'fixture-token',signal:{aborted:false}}),/INVALID_ABORT_SIGNAL/);
});
test('actual loopback HTTP request is canceled mid-response, without a model',async()=>{
  const server=http.createServer((_req,res)=>{
    res.writeHead(200,{'content-type':'application/json'});
    res.write('{"incomplete":');
  });
  try{
    await new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(0,'127.0.0.1',resolve);
    });
    const port=server.address().port;
    const controller=new AbortController();
    const request=localJsonRequest({
      port,route:'/health',token:'synthetic-not-a-secret',
      timeoutMs:1200,signal:controller.signal
    });
    setTimeout(()=>controller.abort(),30);
    await assert.rejects(request,/GATEWAY_ABORTED/);
  }finally{
    server.closeAllConnections();
    await new Promise(resolve=>server.close(resolve));
  }
});
test('abort signal is threaded through isolated health and synthetic completion',async()=>{
  const ac=new AbortController(),calls=[];
  const request=async info=>{
    calls.push(info);
    if(info.route==='/health')
      return {ok:true,bind:'127.0.0.1',tools_enabled:false};
    return {model:MODEL_ID,choices:[{message:{content:'{"action":"finish"}'},finish_reason:'stop'}]};
  };
  const infer=createSovereignInfer({port:18080,tokenFile:'/fixture',
    request,readToken:()=> 'fixture-token'});
  await infer({input:'synthetic input',signal:ac.signal});
  assert.equal(calls.length,2);
  assert.equal(calls[0].signal,ac.signal);
  assert.equal(calls[1].signal,ac.signal);
});
test('aborted during health check: zero inference calls',async()=>{
  const ac=new AbortController(),calls=[];
  const request=async info=>{
    calls.push(info.route);
    if(info.route==='/health'){
      ac.abort();
      return {ok:true,bind:'127.0.0.1',tools_enabled:false};
    }
    throw Error('model must not run after abort');
  };
  const infer=createSovereignInfer({port:18080,tokenFile:'/fixture',
    request,readToken:()=> 'fixture-token'});
  await assert.rejects(infer({input:'safe synthetic',signal:ac.signal}),/GATEWAY_ABORTED/);
  assert.deepEqual(calls,['/health']);
});
test('aborted before token read performs no transport',async()=>{
  const ac=new AbortController();ac.abort();
  const infer=createSovereignInfer({port:18080,tokenFile:'/fixture',
    request:()=>{throw Error('transport should not run');},
    readToken:()=>{throw Error('token should not be read');}});
  await assert.rejects(infer({input:'safe synthetic',signal:ac.signal}),/GATEWAY_ABORTED/);
});
