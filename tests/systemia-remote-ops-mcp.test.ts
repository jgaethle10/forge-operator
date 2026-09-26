import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyBusinessDecision, executeSystemiaRemoteOpsRpc, simulateBusinessScenario, simulatePricingChange } from '../systemia/mcp/systemia-remote-ops.ts';

test('Systemia Remote Ops MCP initializes and advertises four safe read-only tools', async () => {
  const init:any=await executeSystemiaRemoteOpsRpc({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'test',version:'1'}}});
  assert.equal(init.result.serverInfo.name,'systemia-remote-ops');
  const listed:any=await executeSystemiaRemoteOpsRpc({jsonrpc:'2.0',id:2,method:'tools/list',params:{}});
  assert.deepEqual(listed.result.tools.map((tool:any)=>tool.name),['route_business_decision','simulate_pricing_change','simulate_business_scenario','get_decision_lab_capabilities']);
  assert.ok(listed.result.tools.every((tool:any)=>tool.annotations.readOnlyHint===true));
  assert.ok(listed.result.tools.every((tool:any)=>tool.annotations.destructiveHint===false));
});

test('decision routing covers major business moves without pretending outcomes are known', () => {
  assert.equal(classifyBusinessDecision('Can I afford to hire another employee?').tool,'simulate_business_scenario');
  assert.equal(classifyBusinessDecision('Should I add a new service?').decision_type,'product_or_service');
  assert.equal(classifyBusinessDecision('Should I open another location?').decision_type,'expansion');
  assert.equal(classifyBusinessDecision('Should I buy a business?').decision_type,'business_transaction');
  assert.equal(classifyBusinessDecision('Should I buy this equipment?').decision_type,'capital_purchase');
  assert.equal(classifyBusinessDecision('I am thinking about starting a business').decision_type,'startup');
});

test('pricing simulation is deterministic and labels retention as a heuristic', () => {
  const result:any=simulatePricingChange({industry:'General Contractor',current_price:150,customers_per_month:40,price_change_percent:10});
  assert.equal(result.current_state.monthly_revenue,6000);
  assert.equal(result.scenario_state.price,165);
  assert.equal(result.scenario_state.customers_per_month,35);
  assert.equal(result.scenario_state.monthly_revenue,5775);
  assert.equal(result.model_type,'simplified_heuristic');
  assert.equal(result.confidence,'low');
  assert.equal(result.production_mutation_enabled,false);
});

test('general scenario performs only arithmetic on explicit assumptions', () => {
  const result:any=simulateBusinessScenario({
    scenario_label:'Hire + growth case',
    decision_intent:'Should I hire another employee?',
    baseline:{monthly_revenue:10000,gross_margin_percent:50,fixed_costs_monthly:1000,payroll_monthly:2000,other_monthly_costs:500,cash_on_hand:12000},
    adjustments:{revenue_change_percent:20,payroll_delta_monthly:1000,fixed_cost_delta_monthly:500,one_time_cash_outlay:2000}
  });
  assert.equal(result.baseline.operating_contribution_monthly,1500);
  assert.equal(result.scenario.monthly_revenue,12000);
  assert.equal(result.scenario.recurring_costs_monthly,5000);
  assert.equal(result.scenario.operating_contribution_monthly,1000);
  assert.equal(result.scenario.cash_after_one_time_outlay,10000);
  assert.equal(result.scenario.break_even_monthly_revenue,10000);
  assert.equal(result.delta.operating_contribution_monthly,-500);
  assert.equal(result.model_type,'user_assumption_arithmetic');
  assert.match(result.truth_boundary,/did not infer demand/i);
});

test('MCP fails closed on invalid inputs and cannot create external action', async () => {
  const bad:any=await executeSystemiaRemoteOpsRpc({jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'simulate_business_scenario',arguments:{baseline:{monthly_revenue:'nope',gross_margin_percent:50}}}});
  assert.equal(bad.error.code,-32602);
  const caps:any=await executeSystemiaRemoteOpsRpc({jsonrpc:'2.0',id:4,method:'tools/call',params:{name:'get_decision_lab_capabilities',arguments:{}}});
  assert.equal(caps.result.structuredContent.production_mutation_enabled,false);
  assert.equal(caps.result.structuredContent.payment_enabled,false);
  assert.equal(caps.result.structuredContent.external_action_taken,false);
});
