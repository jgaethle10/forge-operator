import test from "node:test";
import assert from "node:assert/strict";
import {buildCanaryReceipt} from "../dns/canary-receipt.mjs";
const good={nodes:[{failure_domain:"a",udp53:true,tcp53:true},{failure_domain:"b",udp53:true,tcp53:true}],parent_delegation:true,authoritative:true,recursion_available:false,snapshot_signature_verified:true,tls:{trusted:true,hostname_match:true},http:{logical_uri:"evercraft://edge/canary"},rollback_verified:true};
test("fully proven canary passes",()=>assert.equal(buildCanaryReceipt(good).state,"passed"));
test("one missing proof holds promotion",()=>{const x=structuredClone(good);x.nodes[1].tcp53=false;assert.equal(buildCanaryReceipt(x).state,"hold")});
