import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCapabilityPromotionQueue } from '../systemia/saban/capability-promotion.mjs';

const base={
  conformance:{products:[]},
  registryCatalog:{products:[]},
  machineCatalog:{offers:[]},
  links:{links:[]}
};

test('published registry truth behind a discovery-only index is repairable drift',()=>{
  const report=buildCapabilityPromotionQueue({
    ...base,
    publicIndex:{products:[{product_key:'x',name:'X',canonical_url:'https://x.example',invocation:{mode:'discovery_only',url:null}}]},
    conformance:{products:[{product_key:'x',mcp_registry:{publication_state:'published_shared_server'}}]}
  });
  assert.equal(report.queue[0].state,'repairable_binding_drift');
  assert.equal(report.queue[0].priority,'P0');
});

test('callable machine evidence without conformance is a promotion candidate, not an automatic promotion',()=>{
  const report=buildCapabilityPromotionQueue({
    ...base,
    publicIndex:{products:[{product_key:'x',name:'X',canonical_url:'https://x.example/docs',invocation:{mode:'discovery_only',url:null}}]},
    machineCatalog:{offers:[{public_id:'x-v1',public_url:'https://x.example/docs',machine_state:'read_only_mcp_live'}]}
  });
  assert.equal(report.queue[0].state,'callable_evidence_needs_binding_or_conformance');
  assert.equal(report.queue[0].priority,'P1');
  assert.equal(report.queue[0].current_mode,'discovery_only');
});

test('machine discovery stays held when execution is not proven',()=>{
  const report=buildCapabilityPromotionQueue({
    ...base,
    publicIndex:{products:[{product_key:'x',name:'X',canonical_url:'https://x.example',invocation:{mode:'discovery_only',url:null}}]},
    machineCatalog:{offers:[{public_id:'x-v1',public_url:'https://machine.example/docs',machine_state:'discovery_only'}]},
    links:{links:[{product_key:'x',machine_public_id:'x-v1'}]}
  });
  assert.equal(report.queue[0].state,'machine_discovery_only');
  assert.equal(report.queue[0].priority,'P2');
});

test('live MCP products remain maintenance items',()=>{
  const report=buildCapabilityPromotionQueue({
    ...base,
    publicIndex:{products:[{product_key:'x',name:'X',canonical_url:'https://x.example',invocation:{mode:'mcp',url:'https://mcp.example'}}]}
  });
  assert.equal(report.queue[0].state,'mcp_live');
  assert.equal(report.summary.mcp_live,1);
});


test('source implementation never promotes without independent live verification',()=>{
  const report=buildCapabilityPromotionQueue({
    ...base,
    publicIndex:{products:[{product_key:'x',name:'X',canonical_url:'https://x.example',invocation:{mode:'discovery_only',url:null}}]},
    machineCatalog:{offers:[{public_id:'x-v1',public_url:'https://machine.example/docs',machine_state:'discovery_only'}]},
    links:{links:[{
      product_key:'x',
      machine_public_id:'x-v1',
      implementation_state:'source_implemented_live_verification_pending',
      candidate_endpoint:'https://machine.example/candidate',
      source_checkpoint:'abc123',
      required_next_primitive:'Verify the live endpoint first.'
    }]}
  });
  assert.equal(report.queue[0].state,'source_implemented_live_verification_pending');
  assert.equal(report.queue[0].priority,'P1');
  assert.equal(report.queue[0].current_mode,'discovery_only');
  assert.equal(report.queue[0].candidate_endpoint,'https://machine.example/candidate');
  assert.equal(report.queue[0].source_checkpoint,'abc123');
  assert.equal(report.queue[0].next_action,'Verify the live endpoint first.');
  assert.equal(report.summary.source_implemented_live_verification_pending,1);
});
