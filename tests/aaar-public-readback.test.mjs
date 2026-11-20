import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectAaarPublic,ORIGIN} from '../scripts/probe-aaar-public-readback.mjs';

const source=Buffer.from('<!doctype html><main><button id="beginFlight">Fly</button></main></html>'.padEnd(10001,' '));
const health={schema:'evercraft.worlds.vault.v1',ok:true,mode:'owned-durable-vault'};
const respond=(route,{status=200,changed=false,mime='text/html',identity=health}={})=>{
  if(route.endsWith('/worlds/api/health'))return new Response(JSON.stringify(identity),{status,headers:{'content-type':'application/json'}});
  return new Response(changed?Buffer.concat([source,Buffer.from('different')]):source,{status,headers:{'content-type':mime}});
};
const run=(opts={})=>inspectAaarPublic({sourceBytes:source,dnsLookup:async()=>['192.0.2.1'],
  fetchFn:async(url)=>respond(url),clock:()=>'2026-11-19T00:00:00Z',...opts});

test('matching owned origin is only read-only verified, never Safari/device certified',async()=>{
  const r=await run();assert.equal(r.verified_readonly,true);
  assert.equal(r.physical_safari_verified,false);assert.equal(r.live_flight_controls_verified,false);
  assert.equal(r.deployment_approved,false);assert.equal(r.checks.flight,'pass');assert.equal(r.origin,ORIGIN);
});
test('unresolvable public DNS is a hard stop and avoids HTTPS requests',async()=>{
  let requested=false;const r=await run({dnsLookup:async()=>{throw Error('ENOTFOUND');},
    fetchFn:async()=>{requested=true;throw Error('should not fetch');}});
  assert.equal(r.verified_readonly,false);assert.equal(requested,false);assert.equal(r.reason,'public_dns_resolution_failed');
});
test('served bytes differing from release source fail closed',async()=>{
  const r=await run({fetchFn:async url=>respond(url,{changed:true})});
  assert.equal(r.verified_readonly,false);assert.equal(r.reason,'served_source_mismatch');
});
test('wrong vault identity cannot qualify as owned release',async()=>{
  const r=await run({fetchFn:async url=>respond(url,{identity:{ok:true,schema:'other',mode:'other'}})});
  assert.equal(r.verified_readonly,false);assert.equal(r.reason,'wrong_worlds_health_identity');
});
test('wrong content type fails even when source bytes match',async()=>{
  const r=await run({fetchFn:async url=>respond(url,{mime:'application/octet-stream'})});
  assert.equal(r.verified_readonly,false);assert.equal(r.reason,'flight_route_not_html');
});
test('route HTTP failure never becomes a successful readback',async()=>{
  const r=await run({fetchFn:async url=>url.endsWith('/worlds/flight/')?new Response('missing',{status:404}):respond(url)});
  assert.equal(r.verified_readonly,false);assert.equal(r.checks.flight,'http_404');
});
