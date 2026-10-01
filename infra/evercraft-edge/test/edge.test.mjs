import test from "node:test";
import assert from "node:assert/strict";
import {validateZone,nextSerial} from "../lib/zone.mjs";
import {validateRegistry} from "../lib/registry.mjs";
import {assertProvisionAuthorized} from "../lib/provider.mjs";

test("zone requires redundant authoritative nameservers",()=>{
  assert.throws(()=>validateZone({origin:"x.",serial:1,primary_ns:"ns1.x.",admin:"hostmaster.x.",nameservers:["ns1.x."],records:[]}));
});
test("valid zone passes",()=>{
  assert.equal(validateZone({origin:"x.",serial:1,primary_ns:"ns1.x.",admin:"hostmaster.x.",nameservers:["ns1.x.","ns2.x."],records:[{name:"@",type:"A",value:"192.0.2.1"}]}),true);
});
test("serial monotonically advances",()=>assert.ok(nextSerial(2026100101,new Date("2026-10-01T00:00:00Z"))>2026100101));
test("registry rejects duplicate permanent identities",()=>assert.throws(()=>validateRegistry({services:[{service_id:"a",logical_uri:"evercraft://a"},{service_id:"a",logical_uri:"evercraft://b"}]})));
test("new spend fails closed",()=>assert.throws(()=>assertProvisionAuthorized({creates_financial_obligation:true},{})));
test("approved or zero-cost capacity passes",()=>{
  assert.equal(assertProvisionAuthorized({creates_financial_obligation:false},{}),true);
  assert.equal(assertProvisionAuthorized({creates_financial_obligation:true},{approved_budget:true}),true);
});
