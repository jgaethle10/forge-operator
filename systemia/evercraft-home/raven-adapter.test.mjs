import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readRavenOverview } from "./raven-adapter.mjs";

const here=path.dirname(fileURLToPath(import.meta.url));
const repoRoot=path.resolve(here,"..","..");

test("Raven overview exposes registered capability without inventing a private runtime",()=>{
  const result=readRavenOverview(repoRoot);
  assert.equal(result.schema,"evercraft.home.raven-overview.v1");
  assert.equal(result.product_key,"raven-nexus");
  assert.equal(result.state,"registered_public_capability");
  assert.equal(result.runtime.standalone_private_runtime_evidenced,false);
  assert.equal(result.runtime.authorized_nexus_bridge_required_for_behavioral_probes,true);
  assert.match(result.evidence_semantics,/not proof of a live private Raven human runtime/i);
});

test("Raven overview preserves provider probe truth",()=>{
  const result=readRavenOverview(repoRoot);
  assert.ok(result.provider_summary.declared>=7);
  assert.equal(
    result.provider_summary.completed_behavioral_probes+
      result.provider_summary.not_run+
      result.provider_summary.other,
    result.provider_summary.declared
  );
  assert.ok(result.probe_suite.cases_total>0);
  assert.equal(result.probe_suite.bridge_contract_declared,true);
  assert.equal(result.probe_suite.workload_declared,true);
});

test("Raven overview reflects the owned public discovery route without exposing credentials",()=>{
  const result=readRavenOverview(repoRoot);
  assert.equal(result.runtime.public_discovery_route_declared,true);
  assert.equal(result.runtime.legacy_public_route_declared,false);
  const serialized=JSON.stringify(result).toLowerCase();
  assert.equal(serialized.includes("base44.app"),false);
  assert.equal(serialized.includes("nexus_probe_bridge_token"),false);
  assert.equal(serialized.includes("authorization: bearer"),false);
});
