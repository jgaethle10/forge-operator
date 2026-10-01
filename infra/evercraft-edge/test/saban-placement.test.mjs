import test from "node:test";
import assert from "node:assert/strict";
import {selectDnsNodes} from "../saban/placement.mjs";

const n=(id,domain,extra={})=>({node_id:id,endpoint:"https://"+id+".invalid",failure_domain:domain,placement_labels:["public-ingress"],attestation:{verified:true},zero_cost:true,public_ingress:true,...extra});

test("DNS placement requires two failure domains",()=>{
 assert.equal(selectDnsNodes([n("a","x"),n("b","x")]).ready,false);
 assert.equal(selectDnsNodes([n("a","x"),n("b","y")]).ready,true);
});
test("unattested node cannot become authoritative",()=>{
 const bad=n("b","y",{attestation:{verified:false}});
 assert.equal(selectDnsNodes([n("a","x"),bad]).ready,false);
});
test("paid capacity is rejected under bootstrap zero-spend policy",()=>{
 assert.equal(selectDnsNodes([n("a","x"),n("b","y",{zero_cost:false})]).ready,false);
});
