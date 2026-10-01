import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FALLEN_MCP,
  fallenMachineTools,
  planVisualExplanation,
  auditVisualExplanationPlan,
  executeFallenRpc,
} from './mcp.mjs';

const groundedInput={
  title:'River conditions explained',
  education_goal:'Show what changed, what is known, and what remains uncertain.',
  format:'world_intelligence',
  aspect_ratio:'16:9',
  duration_sec:60,
  claims:[
    {
      claim_id:'flow',
      claim:'Observed river flow changed during the measured period.',
      source_refs:['usgs:gauge:1'],
      evidence_state:'observed',
      volatile:true,
      freshness_state:'fresh',
    },
    {
      claim_id:'context',
      claim:'The historical baseline provides context but does not by itself establish causation.',
      source_refs:['usgs:historical:1'],
      evidence_state:'public_source',
      volatile:false,
      freshness_state:'not_applicable',
    }
  ],
  visual_assets:[
    {
      asset_id:'gauge-chart',
      label:'USGS gauge chart',
      source_refs:['usgs:gauge:1'],
      evidence_state:'observed',
      rights_state:'verified',
    },
    {
      asset_id:'baseline-chart',
      label:'Historical baseline chart',
      source_refs:['usgs:historical:1'],
      evidence_state:'public_source',
      rights_state:'verified',
    }
  ]
};

test('Fallen machine surface is planning-only and read-only',async()=>{
  const tools=fallenMachineTools();
  assert.deepEqual(tools.map((x)=>x.name),[
    'get_fallen_capabilities',
    'plan_visual_explanation',
    'audit_visual_explanation_plan',
  ]);
  assert.ok(tools.every((x)=>x.annotations.readOnlyHint===true));
  assert.ok(tools.every((x)=>x.annotations.destructiveHint===false));

  const init=await executeFallenRpc({
    jsonrpc:'2.0',id:1,method:'initialize',
    params:{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'test',version:'1'}},
  });
  assert.equal(init.result.serverInfo.name,FALLEN_MCP.server_name);
  assert.match(init.result.instructions,/does not .*render final media/i);
});

test('grounded visual plan preserves evidence and hands rendering to authenticated Fallen',()=>{
  const plan=planVisualExplanation(groundedInput);
  assert.equal(plan.admission_state,'PLANNING_ACCEPTED_RENDER_AUTHORITY_REQUIRED');
  assert.equal(plan.provider_execution,false);
  assert.equal(plan.rendering_authority,false);
  assert.equal(plan.publication_authority,false);
  assert.equal(plan.external_action_taken,false);
  assert.equal(plan.scenes.length,2);
  assert.ok(plan.scenes.every((scene)=>scene.source_refs.length>0));
  assert.ok(plan.scenes.every((scene)=>scene.visual_state==='source_grounded_visual_available'));
  assert.equal(plan.human_handoff.target,'authenticated_fallen_studio');
  assert.ok(/^sha256:[a-f0-9]{64}$/.test(plan.receipt_id));

  const audit=auditVisualExplanationPlan(plan);
  assert.equal(audit.status,'PUBLIC_PLAN_CONTRACT_PASS');
  assert.equal(audit.finding_count,0);
});

test('volatile stale claim blocks render admission',()=>{
  const input=structuredClone(groundedInput);
  input.claims[0].freshness_state='stale';
  const plan=planVisualExplanation(input);
  assert.equal(plan.admission_state,'BLOCKED_BEFORE_RENDER');
  assert.ok(plan.blockers.includes('volatile_claim_not_fresh:flow:stale'));
  assert.equal(plan.rendering_authority,false);
});

test('unresolved rights block render admission and restricted media never passes silently',()=>{
  const unresolved=structuredClone(groundedInput);
  unresolved.visual_assets[0].rights_state='unresolved';
  const p1=planVisualExplanation(unresolved);
  assert.equal(p1.admission_state,'BLOCKED_BEFORE_RENDER');
  assert.ok(p1.blockers.includes('visual_asset_rights_unresolved:gauge-chart'));

  const restricted=structuredClone(groundedInput);
  restricted.visual_assets[0].rights_state='restricted';
  const p2=planVisualExplanation(restricted);
  assert.ok(p2.blockers.includes('visual_asset_rights_restricted:gauge-chart'));
});

test('missing visual evidence becomes an explicit production need rather than decorative substitution',()=>{
  const input=structuredClone(groundedInput);
  input.visual_assets=[];
  const plan=planVisualExplanation(input);
  assert.equal(plan.scenes[0].visual_state,'visual_evidence_needed');
  assert.ok(plan.warnings.includes('visual_evidence_needed:flow'));
  assert.ok(plan.next_safe_actions.includes('resolve_visual_evidence:flow'));
  assert.match(plan.scenes[0].direction,/Do not substitute decorative stock/);
});

test('audit rejects attempts to mutate public plan authority flags',()=>{
  const plan=planVisualExplanation(groundedInput);
  const mutated={...plan,rendering_authority:true,publication_authority:true,provider_execution:true};
  const audit=auditVisualExplanationPlan(mutated);
  assert.equal(audit.status,'NEEDS_RESOLUTION_OR_HUMAN_REVIEW');
  assert.ok(audit.findings.includes('rendering_authority_must_be_false_on_public_plan'));
  assert.ok(audit.findings.includes('publication_authority_must_be_false_on_public_plan'));
  assert.ok(audit.findings.includes('provider_execution_must_be_false_on_public_plan'));
});
