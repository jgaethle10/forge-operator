import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateCaddyBrokerTarget as evaluate,
  loopbackAdminOwner,
} from '../systemia/yard/penguin-caddy-broker-target-witness.mjs';

const pid=4321;
const ss=(address='127.0.0.1',port=2019,owner=pid)=>
  'LISTEN 0 4096 '+address+':'+port+
  ' 0.0.0.0:* users:(("caddy",pid='+owner+',fd=7))';
function fixture(){
  return {
    brokerPort:8797,
    adminOwnerVerified:true,
    configStable:true,
    config:{
      admin:{listen:'127.0.0.1:2019'},
      apps:{http:{servers:{
        srv0:{routes:[
          {handle:[{handler:'reverse_proxy',
            upstreams:[{dial:'127.0.0.1:8787'}]}]},
          {handle:[{handler:'reverse_proxy',
            upstreams:[{dial:'127.0.0.1:8443'}]}]},
        ]},
      }}},
    },
  };
}
test('safe active config scope excludes only a direct candidate port, never all routes',()=>{
  const result=evaluate(fixture());
  assert.equal(result.observed,true,JSON.stringify(result));
  assert.equal(result.candidate_port_suspected_in_caddy,false);
  assert.equal(result.external_route_absence_proven,false);
  assert.equal(result.historical_grants_absence_proven,false);
  assert.equal(result.public_route_created,null);
  assert.equal(result.physical_broker_activation_authorized,false);
  assert.equal(result.source_config_printed,false);
  assert.equal(result.source_config_persisted,false);
});

test('explicit broker target anywhere in active Caddy JSON fails closed',()=>{
  const examples=[
    '127.0.0.1:8797','localhost:8797','[::1]:8797',
    'https://broker.example/redirect?port=8797',
    '{http.vars.proxy}:8797',
  ];
  for(const dial of examples){
    const input=fixture();
    input.config.apps.http.servers.srv0.routes[0].handle[0].upstreams[0].dial=dial;
    const result=evaluate(input);
    assert.equal(result.observed,false,JSON.stringify({dial,result}));
    assert.ok(result.hold_reasons.includes(
      'candidate_port_present_in_active_caddy_config'));
  }
});
test('candidate port appearing as a numeric plugin field still fails closed',()=>{
  const input=fixture();
  input.config.apps.http.servers.srv0.routes.push({
    handle:[{handler:'experimental_proxy',target_port:8797}],
  });
  const result=evaluate(input);
  assert.equal(result.observed,false);
  assert.ok(result.hold_reasons.includes(
    'candidate_port_present_in_active_caddy_config'));
});

test('untrusted, missing or changed active Caddy config is always HOLD',()=>{
  const changes=[
    v=>{v.adminOwnerVerified=false},
    v=>{v.configStable=false},
    v=>{v.config=null},
    v=>{v.config=[]},
    v=>{v.brokerPort=42420},
    v=>{v.brokerPort=0},
    v=>{v.config={custom:'127.0.0.1:8797'}},
  ];
  for(const change of changes){
    const input=fixture();change(input);
    assert.equal(evaluate(input).observed,false);
    assert.equal(evaluate(input).physical_broker_activation_authorized,false);
  }
});
test('OS process must exactly own a single IPv4 loopback admin listener',()=>{
  assert.equal(loopbackAdminOwner({ss:ss(),pid}),true);
  for(const v of [
    {ss:ss('0.0.0.0'),pid},
    {ss:ss('[::1]'),pid},
    {ss:ss('127.0.0.1',2019,6543),pid},
    {ss:ss('127.0.0.1',2018),pid},
    {ss:ss()+'\n'+ss(),pid},
    {ss:'',pid},
    {ss:ss(),pid:0},
  ])assert.equal(loopbackAdminOwner(v),false,JSON.stringify(v));
});
test('untrusted source data cannot leak through the sanitized diagnostic',()=>{
  const input=fixture();
  const secret='DO_NOT_PRINT_BEARER_TOKEN';
  input.config.apps.http.servers.srv0.routes.push({
    handle:[{handler:'reverse_proxy',
      headers:{Authorization:secret},upstreams:[{dial:'localhost:8797'}]}],
  });
  const result=evaluate(input);
  assert.equal(result.observed,false);
  assert.equal(JSON.stringify(result).includes(secret),false);
  assert.equal(result.tokens_or_credentials_printed,false);
});
