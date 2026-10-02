import test from "node:test";
import assert from "node:assert/strict";
import {evaluateDomainControl,makeChallenge} from "../dns/domain-control.mjs";
test("registrar receipt alone cannot authorize Edge cutover",()=>{const r=evaluateDomainControl({domain:"example.com",registrarEvidence:{state:"verified_receipt"},dnsObservation:{parent_ns:["a.","b."],authoritative_reachable:true},challenge:{verified:false,token_unique:true}});assert.equal(r.edge_eligible,false);assert.ok(r.failed.includes("mutation_challenge"))});
test("full ownership and live mutation proof unlocks domain",()=>{const r=evaluateDomainControl({domain:"example.com",registrarEvidence:{state:"verified_receipt"},dnsObservation:{parent_ns:["a.","b."],authoritative_reachable:true},challenge:{verified:true,token_unique:true}});assert.equal(r.edge_eligible,true)});
test("challenge is narrowly scoped TXT",()=>assert.equal(makeChallenge("example.com","abcdefghijkl").name,"_evercraft-control.example.com"));
