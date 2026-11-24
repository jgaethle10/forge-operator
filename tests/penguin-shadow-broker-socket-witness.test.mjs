import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateShadowBrokerSocketBinding as evaluate}
  from '../systemia/yard/penguin-shadow-broker-socket-witness.mjs';

const line=(addr,pid=1234,port=50505)=>
  'LISTEN 0 511 '+addr+':'+port+
  ' 0.0.0.0:* users:(("node",pid='+pid+',fd=14))';
const base=()=>({
  ssOutput:[
    line('127.0.0.1',1234,42420),
    line('127.0.0.1',1234,1053),
    line('127.0.0.1',1234,44677),
    line('127.0.0.1'),
    line('127.0.0.1',9999,40404),
  ].join('\n'),
  pid:1234,brokerPort:50505,
});

test('accepts exactly one PID-owned loopback broker socket, without inferring any public-route status',()=>{
  const r=evaluate(base());
  assert.equal(r.verified,true,JSON.stringify(r));
  assert.equal(r.loopback_only_verified,true);
  assert.equal(r.socket_owner_is_live_nodeseed,true);
  assert.equal(r.public_route_absence_proven,false);
  assert.equal(r.historical_grants_absence_proven,false);
  assert.equal(r.broker_activation_authorized,false);
  assert.equal(r.socket_listing_printed,false);
  assert.equal(r.process_arguments_printed,false);
});

test('rejects wildcard, LAN and IPv6 binds instead of treating them as loopback',()=>{
  for(const address of ['0.0.0.0','192.168.1.5','[::]','[::1]','*']){
    const v=base();v.ssOutput=line(address);
    const r=evaluate(v);
    assert.equal(r.verified,false,JSON.stringify({address,r}));
    assert.ok(r.hold_reasons.includes('broker_listener_not_ipv4_loopback'));
  }
});

test('rejects missing, duplicate, wrong PID or unowned broker sockets',()=>{
  const modifications=[
    v=>{v.ssOutput=line('127.0.0.1',9999)},
    v=>{v.ssOutput=line('127.0.0.1')+'\n'+line('127.0.0.1')},
    v=>{v.ssOutput='LISTEN 0 511 127.0.0.1:50505 0.0.0.0:*'},
    v=>{v.ssOutput=line('127.0.0.1',12345)},
    v=>{v.pid=0},
    v=>{v.brokerPort=42420},
    v=>{v.ssOutput=null},
  ];
  for(const change of modifications){
    const v=base();change(v);
    const r=evaluate(v);
    assert.equal(r.verified,false,JSON.stringify(r));
    assert.equal(r.broker_activation_authorized,false);
  }
});

test('ss output never gets exposed even when malformed or unavailable',()=>{
  const secret='MY_PROCESS_ARGS_PRIVATE';
  const r=evaluate({
    ssOutput:'LISTEN 0 511 127.0.0.1:50505 0.0.0.0:* '+secret,
    pid:1234,brokerPort:50505,
  });
  assert.equal(r.verified,false);
  assert.equal(JSON.stringify(r).includes(secret),false);
  assert.equal(r.public_route_absence_proven,false);
});
