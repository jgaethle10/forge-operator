import test from "node:test";
import assert from "node:assert/strict";
import {evaluateEdgeCapacity} from "../saban/capacity-admission.mjs";
const good=(id,domain)=>({node_id:id,authorized:true,connected:true,attestation_verified:true,placement_labels:["public-ingress"],zero_cost:true,udp53:true,tcp53:true,failure_domain:domain,supported_workloads:["systemia.evercraft-edge-dns.v1"]});
test("two distinct zero-cost authorized nodes satisfy Edge",()=>assert.equal(evaluateEdgeCapacity([good("a","x"),good("b","y")]).state,"ready"));
test("same failure domain is insufficient",()=>assert.equal(evaluateEdgeCapacity([good("a","x"),good("b","x")]).state,"capacity_needed"));
test("paid or unattested capacity is rejected",()=>{const paid={...good("b","y"),zero_cost:false};assert.equal(evaluateEdgeCapacity([good("a","x"),paid]).state,"capacity_needed")});
