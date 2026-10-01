import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const installer=fs.readFileSync(new URL("../../../systemia/compute/install-node-seed.sh",import.meta.url),"utf8");
const preflight=fs.readFileSync(new URL("../../../systemia/compute/field-preflight.mjs",import.meta.url),"utf8");
const promote=fs.readFileSync(new URL("../../../scripts/promote-chromebook-edge-node.sh",import.meta.url),"utf8");
const one=fs.readFileSync(new URL("../../../scripts/make-chromebook-edge-node.sh",import.meta.url),"utf8");

test("NodeSeed installer admits operator-authorized Chromebook edge role",()=>{
 assert.match(installer,/operator_authorized_public_edge/);
 assert.match(installer,/infra\/evercraft-edge/);
 assert.match(installer,/public-edge-candidate/);
});
test("promotion starts native Edge DNS through NodeSeed",()=>{
 assert.match(promote,/evercraft-edge-dns-bootstrap\.service/);
 assert.match(promote,/systemia\.evercraft-edge-dns\.v1/);
 assert.match(promote,/5353/);
});
test("public-ingress label is granted only after external canary success",()=>{
 const canary=one.indexOf("gh run watch");
 const promotion=one.indexOf("public-ingress");
 assert.ok(canary>=0);
 assert.ok(promotion>canary);
 assert.match(one,/UDP/);
 assert.match(one,/TCP/);
});

test("operator-authorized Crostini edge has lightweight bounded preflight",()=>{
 assert.match(preflight,/operatorPublicEdgeChecks/);
 assert.match(preflight,/memory_at_least_2_gib:\s*memoryGiB >= 2/);
 assert.match(preflight,/free_disk_at_least_4_gib:\s*freeDiskGiB >= 4/);
 const block=preflight.slice(preflight.indexOf("const operatorPublicEdgeChecks"),preflight.indexOf("const fieldEligible"));
 assert.doesNotMatch(block,/virtualization_not_detected/);
 assert.match(preflight,/requestedRole === 'operator_authorized_public_edge'[\s\S]*operatorPublicEdgeEligible/);
});
