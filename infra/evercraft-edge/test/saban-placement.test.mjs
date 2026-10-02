import test from "node:test";
import assert from "node:assert/strict";
import {selectDnsNodes} from "../saban/placement.mjs";

const n=(id,domain,extra={})=>({
 node_id:id,
 endpoint:"https://"+id+".invalid",
 failure_domain:domain,
 placement_labels:["public-ingress"],
 authorized:true,
 connected:true,
 attestation:{verified:true},
 zero_cost:true,
 public_ingress:true,
 udp53:true,
 tcp53:true,
 supported_workloads:["systemia.evercraft-edge-dns.v1"],
 ...extra
});

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

test("undefined zero-cost, ingress, port proof, or workload support fails closed",()=>{
 assert.equal(selectDnsNodes([n("a","x"),n("b","y",{zero_cost:undefined})]).ready,false);
 assert.equal(selectDnsNodes([n("a","x"),n("b","y",{public_ingress:undefined})]).ready,false);
 assert.equal(selectDnsNodes([n("a","x"),n("b","y",{udp53:undefined})]).ready,false);
 assert.equal(selectDnsNodes([n("a","x"),n("b","y",{tcp53:undefined})]).ready,false);
 assert.equal(selectDnsNodes([n("a","x"),n("b","y",{supported_workloads:[]})]).ready,false);
});
test("endpoint identity is not accepted as a failure-domain substitute",()=>{
 assert.equal(selectDnsNodes([n("a",""),n("b","")]).ready,false);
});

test("stale or unauthorized historical nodes cannot be placed",()=>{
 assert.equal(selectDnsNodes([n("a","x"),n("b","y",{connected:false})]).ready,false);
 assert.equal(selectDnsNodes([n("a","x"),n("b","y",{authorized:false})]).ready,false);
});
