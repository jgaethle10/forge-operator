import test from 'node:test';
import assert from 'node:assert/strict';
import {assessRouterMappings} from '../scripts/edge-mapping-control.mjs';

const web=[
  {external:80,internal:18080,proto:'TCP',scope:'web'},
  {external:443,internal:8443,proto:'TCP',scope:'web'},
];
const dns=[
  {external:53,internal:1053,proto:'TCP',scope:'dns',production:true},
  {external:53,internal:1053,proto:'UDP',scope:'dns',production:true},
];
const diagnostics=[
  {external:53053,internal:1053,proto:'TCP',scope:'dns-diagnostic',diagnostic:true}
];
const ok=(m)=>({requested:m,success:true});
const fail=(m)=>({requested:m,success:false});

test('all-scopes requires BOTH web ports and DNS, not only DNS',()=>{
  const result=assessRouterMappings([...web,...dns,...diagnostics],[ok(web[0]),fail(web[1]),...dns.map(ok),...diagnostics.map(ok)]);
  assert.equal(result.production_mapping_control_ok,false);
  assert.equal(result.web_mapping_control_ok,false);
  assert.equal(result.dns_mapping_control_ok,true);
  assert.deepEqual(result.missing_production_mappings,[{external:443,internal:8443,proto:'TCP',scope:'web'}]);
});

test('fully accepted mappings are control-green, not public-ingress proof',()=>{
  const result=assessRouterMappings([...web,...dns,...diagnostics],[...web,...dns,...diagnostics].map(ok));
  assert.equal(result.production_mapping_control_ok,true);
  assert.equal(result.web_mapping_control_ok,true);
  assert.equal(result.dns_mapping_control_ok,true);
  assert.equal(result.diagnostic_mapping_control_ok,true);
  assert.equal('public_https_verified' in result,false);
});

test('diagnostic mappings cannot mask failed production mappings',()=>{
  const result=assessRouterMappings([...web,...dns,...diagnostics],[...diagnostics.map(ok),...dns.map(fail),...web.map(fail)]);
  assert.equal(result.production_mapping_control_ok,false);
  assert.equal(result.diagnostic_mapping_control_ok,true);
  assert.equal(result.web_mapping_control_ok,false);
});

test('web-only and DNS-only scopes are evaluated independently',()=>{
  const webResult=assessRouterMappings(web,web.map(ok));
  const dnsResult=assessRouterMappings(dns,dns.map(ok));
  assert.equal(webResult.production_mapping_control_ok,true);
  assert.equal(webResult.web_mapping_control_ok,true);
  assert.equal(webResult.dns_mapping_control_ok,false);
  assert.equal(dnsResult.production_mapping_control_ok,true);
  assert.equal(dnsResult.web_mapping_control_ok,false);
  assert.equal(dnsResult.dns_mapping_control_ok,true);
});

test('unrequested/empty or malformed input is never green',()=>{
  assert.equal(assessRouterMappings([],[]).production_mapping_control_ok,false);
  assert.throws(()=>assessRouterMappings(null,[]),TypeError);
  assert.equal(assessRouterMappings(web,[{requested:{...web[0],internal:8443},success:true},ok(web[1])]).production_mapping_control_ok,false);
});
