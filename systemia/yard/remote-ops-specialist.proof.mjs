import assert from 'node:assert/strict';
import { startSpecialistHandoffRuntime } from '../mcp/specialist-handoff-runtime.mjs';

const runtime=await startSpecialistHandoffRuntime({
  host:'127.0.0.1',
  port:0,
  gatewayUrl:'https://example.invalid/machine-commerce',
  gatewayFetch:async()=>{ throw new Error('commerce gateway must not be used by Remote Ops'); },
});

async function rpc(method,params,id=1){
  const response=await fetch(runtime.url+'/mcp/systemia-remote-ops',{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({jsonrpc:'2.0',id,method,params}),
  });
  assert.equal(response.status,200);
  return await response.json();
}

try{
  const health=await fetch(runtime.url+'/mcp/systemia-remote-ops').then(r=>r.json());
  assert.equal(health.ok,true);
  assert.equal(health.service,'Systemia Remote Ops');
  assert.equal(health.runtime,'Evercraft Compute');
  assert.equal(health.production_mutation_enabled,false);
  assert.equal(health.pricing_simulation_state,'native_deterministic_simulation');
  assert.equal(health.hiring_simulation_state,'native_assumption_driven_simulation');
  assert.equal(health.expansion_simulation_state,'native_assumption_driven_simulation');
  assert.equal(health.strategic_transaction_simulation_state,'native_assumption_driven_simulation');

  const init=await rpc('initialize',{
    protocolVersion:'2025-03-26',
    capabilities:{},
    clientInfo:{name:'remote-ops-proof',version:'1'},
  },1);
  assert.equal(init.result.serverInfo.name,'systemia-remote-ops');
  assert.equal(init.result.protocolVersion,'2025-03-26');

  const tools=await rpc('tools/list',{},2);
  assert.deepEqual(
    tools.result.tools.map(x=>x.name),
    [
      'route_business_decision',
      'simulate_pricing_change',
      'simulate_business_scenario',
      'get_decision_lab_capabilities',
    ]
  );
  assert.ok(tools.result.tools.every(x=>x.annotations.readOnlyHint===true));
  assert.ok(tools.result.tools.every(x=>x.annotations.destructiveHint===false));
  assert.ok(tools.result.tools.every(x=>x.annotations.idempotentHint===true));
  assert.ok(tools.result.tools.every(x=>x.annotations.openWorldHint===false));

  const pricingRoute=await rpc('tools/call',{
    name:'route_business_decision',
    arguments:{intent:'Should I raise my prices by 10 percent?'},
  },3);
  assert.equal(pricingRoute.result.structuredContent.decision_type,'pricing');
  assert.equal(pricingRoute.result.structuredContent.state,'native_deterministic_simulation');
  assert.equal(pricingRoute.result.structuredContent.runnable,true);
  assert.equal(pricingRoute.result.structuredContent.tool,'simulate_pricing_change');
  assert.equal(pricingRoute.result.structuredContent.external_action_taken,false);

  const hiring=await rpc('tools/call',{
    name:'route_business_decision',
    arguments:{intent:'Can I afford to hire another employee?'},
  },4);
  assert.equal(hiring.result.structuredContent.decision_type,'hiring_or_staffing');
  assert.equal(hiring.result.structuredContent.runnable,true);
  assert.equal(hiring.result.structuredContent.tool,'simulate_business_scenario');

  const expansion=await rpc('tools/call',{
    name:'route_business_decision',
    arguments:{intent:'Should I open a new location in another market?'},
  },5);
  assert.equal(expansion.result.structuredContent.decision_type,'expansion');
  assert.equal(expansion.result.structuredContent.runnable,true);

  const transaction=await rpc('tools/call',{
    name:'route_business_decision',
    arguments:{intent:'Should I buy a business from a competitor?'},
  },6);
  assert.equal(transaction.result.structuredContent.decision_type,'business_transaction');
  assert.equal(transaction.result.structuredContent.runnable,true);

  const startup=await rpc('tools/call',{
    name:'route_business_decision',
    arguments:{intent:'I am thinking about starting a business.'},
  },7);
  assert.equal(startup.result.structuredContent.decision_type,'startup');
  assert.equal(startup.result.structuredContent.runnable,true);

  const pricing=await rpc('tools/call',{
    name:'simulate_pricing_change',
    arguments:{
      industry:'General Contractor',
      current_price:100,
      customers_per_month:100,
      price_change_percent:10,
    },
  },8);
  assert.equal(pricing.result.structuredContent.modeled,true);
  assert.equal(pricing.result.structuredContent.external_action_taken,false);
  assert.equal(pricing.result.structuredContent.simulation.current_state.monthly_revenue,10000);
  assert.equal(pricing.result.structuredContent.simulation.projected_state.price,110);
  assert.equal(pricing.result.structuredContent.simulation.projected_state.customers_per_month,88);
  assert.equal(pricing.result.structuredContent.simulation.projected_state.monthly_revenue,9680);
  assert.equal(pricing.result.structuredContent.simulation.confidence_level,'Low');
  assert.match(pricing.result.structuredContent.simulation.confidence_note,/heuristic/i);
  assert.match(pricing.result.structuredContent.truth_boundary,/does not predict or guarantee/i);

  const scenario=await rpc('tools/call',{
    name:'simulate_business_scenario',
    arguments:{
      scenario_label:'Hire + growth case',
      decision_intent:'Should I hire another employee?',
      baseline:{
        monthly_revenue:10000,
        gross_margin_percent:50,
        fixed_costs_monthly:1000,
        payroll_monthly:2000,
        other_monthly_costs:500,
        cash_on_hand:12000,
      },
      adjustments:{
        revenue_change_percent:20,
        payroll_delta_monthly:1000,
        fixed_cost_delta_monthly:500,
        one_time_cash_outlay:2000,
      },
    },
  },9);
  const s=scenario.result.structuredContent.simulation;
  assert.equal(s.model_type,'user_assumption_arithmetic');
  assert.equal(s.decision_type,'hiring_or_staffing');
  assert.equal(s.baseline.operating_contribution_monthly,1500);
  assert.equal(s.scenario.monthly_revenue,12000);
  assert.equal(s.scenario.recurring_costs_monthly,5000);
  assert.equal(s.scenario.operating_contribution_monthly,1000);
  assert.equal(s.scenario.cash_after_one_time_outlay,10000);
  assert.equal(s.scenario.break_even_monthly_revenue,10000);
  assert.equal(s.delta.operating_contribution_monthly,-500);
  assert.match(s.truth_boundary,/did not infer demand/i);
  assert.equal(scenario.result.structuredContent.production_mutation_enabled,false);
  assert.equal(scenario.result.structuredContent.external_action_taken,false);

  const capabilities=await rpc('tools/call',{
    name:'get_decision_lab_capabilities',
    arguments:{},
  },10);
  assert.equal(capabilities.result.structuredContent.production_mutation_enabled,false);
  assert.equal(capabilities.result.structuredContent.public_mcp_runtime,'Evercraft Compute');
  assert.equal(
    capabilities.result.structuredContent.lanes.find(x=>x.decision_type==='pricing').mcp_runnable,
    true
  );
  assert.equal(
    capabilities.result.structuredContent.lanes.find(x=>x.decision_type==='hiring_or_staffing').mcp_runnable,
    true
  );
  assert.equal(
    capabilities.result.structuredContent.lanes.find(x=>x.decision_type==='business_transaction').mcp_runnable,
    true
  );

  const badPricing=await rpc('tools/call',{
    name:'simulate_pricing_change',
    arguments:{
      current_price:100,
      customers_per_month:100,
      price_change_percent:999,
    },
  },11);
  assert.equal(badPricing.error.code,-32602);

  const badScenario=await rpc('tools/call',{
    name:'simulate_business_scenario',
    arguments:{baseline:{monthly_revenue:'not-a-number',gross_margin_percent:50}},
  },12);
  assert.equal(badScenario.error.code,-32602);

  console.log(JSON.stringify({
    ok:true,
    schema:'evercraft.systemia-remote-ops.yard-proof.v2',
    runtime:'Evercraft Compute',
    mcp_path:'/mcp/systemia-remote-ops',
    tool_count:tools.result.tools.length,
    pricing_runnable:true,
    assumption_driven_business_scenarios_runnable:true,
    startup_runnable:true,
    hiring_runnable:true,
    product_service_runnable:true,
    expansion_runnable:true,
    strategic_transaction_runnable:true,
    capital_purchase_runnable:true,
    native_pricing:true,
    low_confidence_preserved:true,
    base44_pricing_required:false,
    production_mutation_enabled:false,
    external_action_taken:false,
  },null,2));
}finally{
  await runtime.close();
}
