import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const installer=fs.readFileSync(new URL("../../../systemia/compute/install-node-seed.sh",import.meta.url),"utf8");
const preflight=fs.readFileSync(new URL("../../../systemia/compute/field-preflight.mjs",import.meta.url),"utf8");
const promote=fs.readFileSync(new URL("../../../scripts/promote-chromebook-edge-node.sh",import.meta.url),"utf8");
const one=fs.readFileSync(new URL("../../../scripts/make-chromebook-edge-node.sh",import.meta.url),"utf8");
const mapper=fs.readFileSync(new URL("../../../scripts/evercraft-public-edge-map.mjs",import.meta.url),"utf8");

test("NodeSeed installer admits operator-authorized Chromebook edge role",()=>{
 assert.match(installer,/operator_authorized_public_edge/);
 assert.match(installer,/infra\/evercraft-edge/);
 assert.match(installer,/public-edge-candidate/);
});
test("promotion starts native Edge DNS through NodeSeed",()=>{
 assert.match(promote,/evercraft-edge-dns-bootstrap\.service/);
 assert.match(promote,/systemia\.evercraft-edge-dns\.v1/);
 assert.match(promote,/1053/);
});
test("public-ingress label is granted only after distributed external verification",()=>{
 const verifier=one.indexOf("external-public-verifier.mjs");
 const receiptCheck=one.indexOf("r.verified!==true");
 const promotion=one.indexOf('echo "[6/6] External canary passed. Promoting placement label to public-ingress..."');
 assert.ok(verifier>=0);
 assert.ok(receiptCheck>verifier);
 assert.ok(promotion>receiptCheck);
 assert.match(one,/udp53_successes/);
 assert.match(one,/runtime_identity_verified/);
 assert.match(one,/runtime_identity_distinct_sources/);
 assert.match(one,/tcp_proof_mode/);
});

test("operator-authorized Crostini edge has lightweight bounded preflight",()=>{
 assert.match(preflight,/operatorPublicEdgeChecks/);
 assert.match(preflight,/memory_at_least_2_gib:\s*memoryGiB >= 2/);
 assert.match(preflight,/free_disk_at_least_4_gib:\s*freeDiskGiB >= 4/);
 const block=preflight.slice(preflight.indexOf("const operatorPublicEdgeChecks"),preflight.indexOf("const fieldEligible"));
 assert.doesNotMatch(block,/virtualization_not_detected/);
 assert.match(preflight,/requestedRole === 'operator_authorized_public_edge'[\s\S]*operatorPublicEdgeEligible/);
});

test("DNS promotion scopes host-forward and router mapping checks to DNS only",()=>{
 assert.match(one,/--scope dns/);
 assert.match(mapper,/\['all','web','dns'\]/);
 assert.match(mapper,/scope==='all'\|\|scope==='dns'/);
 assert.match(mapper,/scope==='all'\|\|scope==='web'/);
});

test("Chromebook Edge DNS avoids the standardized mDNS host port",()=>{
 assert.doesNotMatch(promote,/5353/);
 assert.doesNotMatch(one,/5353/);
 assert.match(promote,/1053/);
 assert.match(one,/1053/);
 assert.match(mapper,/external: 53, internal: 1053, proto: 'TCP'/);
 assert.match(mapper,/external: 53, internal: 1053, proto: 'UDP'/);
});

test("WAN diagnosis distinguishes production DNS 53 from temporary high-port evidence",()=>{
 assert.match(mapper,/external: 53, internal: 1053, proto: 'TCP'/);
 assert.match(mapper,/external: 53, internal: 1053, proto: 'UDP'/);
 assert.match(mapper,/external: 53053, internal: 1053, proto: 'TCP'/);
 assert.match(mapper,/external: 53053, internal: 1053, proto: 'UDP'/);
 assert.match(mapper,/production_mapping_control_ok/);
 assert.match(mapper,/diagnostic_mapping_control_ok/);
});
