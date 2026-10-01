import assert from 'node:assert/strict';
import { output, minimumAdmissionViolations, fullShipViolations } from './build-registry.mjs';

assert.equal(output.schema,'evercraft.capability-registry.v2');
assert.equal(output.standard,'docs/LLM_PRODUCT_STANDARD.md');
assert.equal(output.truth_boundary.documentation_is_not_runtime_proof,true);
assert.equal(output.truth_boundary.registry_publication_is_not_independent_discoverability,true);

assert.equal(output.sources.public_product_count,64);
assert.equal(output.sources.estate_snapshot_complete_claim,false);
assert.ok(output.sources.estate_snapshot_count>=100);
assert.ok(output.sources.systemia_module_count>0);
assert.ok(output.sources.plugin_package_count>0);
assert.ok(output.sources.workflow_count>0);
assert.equal(output.sources.open_runtime_incident_count,1);

const ids=output.entries.map((row)=>row.stable_id);
assert.equal(new Set(ids).size,ids.length,'stable IDs must be unique');

const aliev=output.entries.find((row)=>row.stable_id==='product:aliev');
assert.ok(aliev,'AliEV must exist');
assert.ok(aliev.problem_language.length>0,'AliEV needs problem-first language');
assert.ok(aliev.machine_endpoint,'AliEV needs a declared machine route');
assert.ok(aliev.source_refs.length>0,'AliEV needs evidence refs');

const daytrade=output.entries.find((row)=>row.stable_id==='product:daytrade-lens');
assert.ok(daytrade,'DayTrade Lens must exist');
assert.ok(daytrade.problem_language.some((x)=>/paper trade|risk discipline|trading/i.test(x)));
assert.equal(daytrade.lifecycle.independently_discoverable,false);

const forensiscope=output.entries.find((row)=>row.stable_id==='product:forensiscope');
assert.ok(forensiscope);
assert.ok(forensiscope.problem_language.length>0);
assert.ok(forensiscope.machine_endpoint);

const fabric=output.entries.find((row)=>row.stable_id==='platform:evercraft-fabric');
assert.ok(fabric,'Fabric platform must be registered');
assert.ok(fabric.blockers.some((x)=>/mcp_sse_probe_404/.test(x)),'fresh external Fabric failure must remain a registry blocker');
const fabricDebt=output.debt_queue.find((row)=>row.stable_id==='platform:evercraft-fabric');
assert.equal(fabricDebt?.priority,'P0_SHARED_INFRA');

const fallen=output.entries.find((row)=>row.stable_id==='media:fallen');
assert.ok(fallen,'historical seed must keep Fallen visible');
assert.ok(fallen.problem_language.length>0);

const optic=output.entries.find((row)=>row.stable_id==='historical:opticvault');
assert.ok(optic,'estate-only projects must not disappear');
assert.ok(optic.blockers.includes('capability_state_not_verified'));

const blank={
  problem_language:[],
  human_url:null,
  machine_endpoint:null,
  test_state:{declared_test_surface:false},
  evidence_provenance:{source_refs:[]},
  authentication:{state:'unknown'},
  structured_output:[],
  human_handoff:{state:'unknown'},
  lifecycle:{externally_reachable:false,tested:false},
  llm_discovery_state:{independently_discoverable_proven:false},
};
assert.deepEqual(minimumAdmissionViolations(blank),[
  'problem_language_missing',
  'human_url_missing',
  'machine_endpoint_missing',
  'machine_test_surface_missing',
  'evidence_provenance_missing',
]);
assert.ok(fullShipViolations(blank).includes('independent_discoverability_not_proven'));

assert.equal(output.release_gate.state,'pass','baseline debt is debt, but must not masquerade as a new regression');
assert.equal(output.release_gate.new_public_product_violations.length,0);
assert.ok(output.debt_queue.length>0,'existing conversion debt must remain visible');

console.log('Evercraft portfolio LLM product registry tests: PASS');
