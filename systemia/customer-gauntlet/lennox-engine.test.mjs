import assert from 'node:assert/strict';
import http from 'node:http';
import { runLocalLennox } from './lennox-engine.mjs';

const server=http.createServer((req,res)=>{
  if(req.url==='/bad-brand'){
    res.writeHead(200,{'content-type':'text/html'});
    res.end('<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width"><title>Base44 APP</title></head><body><button>Buy $299</button></body></html>');
    return;
  }
  res.writeHead(200,{'content-type':'text/html'});
  res.end('<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width"><title>AliEV</title></head><body><label for="email">Email</label><input id="email"><a href="/buy">Buy $299</a></body></html>');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const {port}=server.address();
try{
  const offer={public_id:'test-offer',name:'Test Offer',pricing:'$299 one-time',offers:[{price:'$299'}]};
  const good=await runLocalLennox({offer,persona:{id:'lennox-mobile-impatient',viewport:'mobile',tests:[]},reviewUrl:`http://127.0.0.1:${port}/`});
  assert.equal(good.engine,'raven_nexus_lennox_local_v1');
  assert.equal(good.owned_execution,true);
  assert.equal(good.independent_session,true);
  assert.ok(good.blocked_checks.includes('provider_payment_verification'));
  assert.ok(good.findings.some(f=>f.code==='unsafe_transport'),'HTTP test fixture should prove HTTPS guard');

  const brand=await runLocalLennox({offer,persona:{id:'lennox-skeptic',viewport:'desktop',tests:[]},reviewUrl:`http://127.0.0.1:${port}/bad-brand`});
  assert.ok(brand.findings.some(f=>f.code==='severe_brand_mismatch'));
  console.log('LENNOX_OWNED_ENGINE_PASS');
} finally {
  await new Promise(resolve=>server.close(resolve));
}
