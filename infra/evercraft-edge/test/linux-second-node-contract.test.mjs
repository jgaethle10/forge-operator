import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const promote=fs.readFileSync(new URL("../../../scripts/promote-linux-edge-node.sh",import.meta.url),"utf8");
const make=fs.readFileSync(new URL("../../../scripts/make-linux-edge-node.sh",import.meta.url),"utf8");
const seed=fs.readFileSync(new URL("../../../systemia/compute/node-seed.mjs",import.meta.url),"utf8");
const runtime=fs.readFileSync(new URL("../../../systemia/compute/runtime-node.mjs",import.meta.url),"utf8");

test("generic Linux Edge requires explicit current owner authorization",()=>{
 assert.match(promote,/EVERCRAFT_EDGE_OPERATOR_AUTHORIZED/);
 assert.match(make,/EVERCRAFT_EDGE_OPERATOR_AUTHORIZED/);
 assert.match(promote,/owner explicitly authorizes/);
});

test("second node requires a distinct declared failure domain",()=>{
 assert.match(promote,/EVERCRAFT_FAILURE_DOMAIN/);
 assert.match(promote,/home-wan-1/);
 assert.match(make,/second node must be outside Penguin's home-wan-1 failure domain/);
});

test("NodeSeed capacity exposes placement-critical facts directly",()=>{
 assert.match(seed,/failureDomain/);
 assert.match(seed,/zeroCost/);
 assert.match(runtime,/failure_domain:/);
 assert.match(runtime,/zero_cost:/);
 assert.match(runtime,/public_ingress:/);
});

test("generic Linux promotion is fail-closed on external DNS proof",()=>{
 const verify=make.indexOf("external-public-verifier.mjs");
 const promotion=make.indexOf("Promoting Linux node to public-ingress");
 assert.ok(verify>=0);
 assert.ok(promotion>verify);
 assert.match(make,/runtime_identity_verified/);
 assert.match(make,/runtime_identity_distinct_sources/);
 assert.match(make,/tcp53_successes/);
 assert.match(make,/udp53_successes/);
});

test("generic Linux promotion never persists public IP in its promotion receipt",()=>{
 assert.match(make,/"public_ip_persisted":false/);
 assert.doesNotMatch(make,/"public_ipv4":/);
});
