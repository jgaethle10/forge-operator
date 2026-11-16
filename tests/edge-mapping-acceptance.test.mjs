import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {assessMappingResult} from '../scripts/edge-mapping-acceptance.mjs';

const web80={external:80,internal:18080,proto:'TCP',production:true};
const web443={external:443,internal:8443,proto:'TCP',production:true};
const dnsTcp={external:53,internal:1053,proto:'TCP',production:true};
const dnsUdp={external:53,internal:1053,proto:'UDP',production:true};
const diag={external:53053,internal:1053,proto:'TCP',diagnostic:true};
const ok=x=>({requested:x,success:true});
const fail=x=>({requested:x,success:false});
const desired=[web80,web443,dnsTcp,dnsUdp,diag];

test('DNS success cannot disguise loss of WAN TCP 443 or TCP 80',()=>{
  const r=assessMappingResult(desired,[fail(web80),fail(web443),ok(dnsTcp),ok(dnsUdp),ok(diag)]);
  assert.equal(r.production_ok,false);
  assert.equal(r.diagnostic_ok,true);
});
test('every production web and DNS mapping required in one protocol attempt',()=>{
  const r=assessMappingResult(desired,[ok(web80),ok(web443),ok(dnsTcp),ok(dnsUdp),fail(diag)]);
  assert.equal(r.production_ok,true);
  assert.equal(r.diagnostic_ok,false);
  assert.equal(assessMappingResult(desired,[ok(web80),ok(web443),ok(dnsTcp)]).production_ok,false);
});
test('web-only and DNS-only scopes require their own selected production ports',()=>{
  assert.equal(assessMappingResult([web80,web443],[ok(web80)]).production_ok,false);
  assert.equal(assessMappingResult([web80,web443],[ok(web80),ok(web443)]).production_ok,true);
  assert.equal(assessMappingResult([dnsTcp,dnsUdp],[ok(dnsTcp)]).production_ok,false);
  assert.equal(assessMappingResult([dnsTcp,dnsUdp],[ok(dnsTcp),ok(dnsUdp)]).production_ok,true);
});
test('reject missing replies, mismatched assigned ports and expired leases',()=>{
  assert.equal(assessMappingResult([web443],[]).production_ok,false);
  assert.equal(assessMappingResult([web443],[{...ok(web443),external:444,internal:8443,lifetime:300}]).production_ok,false);
  assert.equal(assessMappingResult([web443],[{...ok(web443),external:443,internal:8443,lifetime:0}]).production_ok,false);
  assert.equal(assessMappingResult([web443],[{...ok(web443),external:443,internal:8443,lifetime:300}]).production_ok,true);
});
test('diagnostic mappings and no required production mappings never report production ready',()=>{
  assert.equal(assessMappingResult([diag],[ok(diag)]).production_ok,false);
  assert.equal(assessMappingResult([],[ok(web80),ok(web443)]).production_ok,false);
  assert.equal(assessMappingResult(null,null).production_ok,false);
});
test('live mapper labels WAN 80/443 production, uses same attempt acceptance and never claims public ingress',()=>{
  const mapper=fs.readFileSync(new URL('../scripts/evercraft-public-edge-map.mjs',import.meta.url),'utf8');
  assert.match(mapper,/external: 80, internal: 18080,[^\n]*production:true/);
  assert.match(mapper,/external: 443, internal: 8443,[^\n]*production:true/);
  assert.match(mapper,/assessMappingResult\(mappings,result\.mappings\)/);
  assert.match(mapper,/assessMappingResult\(mappings,mapped\)/);
  assert.match(mapper,/public_ingress_verified: false/);
  assert.match(mapper,/out\.production_mapping_control_ok = out\.ok === true;/);
});
