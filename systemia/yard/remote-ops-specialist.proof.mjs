import assert from 'node:assert/strict';
import { startSpecialistHandoffRuntime } from '../mcp/specialist-handoff-runtime.mjs';

const pricingCalls=[];
const runtime=await startSpecialistHandoffRuntime({
  host:'127.0.0.1',
  port:0,
  gatewayUrl:'https://example.invalid/machine-commerce',
  gatewayFetch:async()=>{ throw new Error('commerce gateway must not be used by Remote Ops'); },
  remoteOpsPricingUrl:'https://example.invalid/pricing',
  remoteOpsPricingFetch:async(payload)=>{
    pricingCalls.push(payload);
    return {
      industry:payload.industry,
      current_state:{
        price:payload.current_price,
        customers_per_month:payload.customers_per_month,
        monthly_revenue:payload.current_price*payload.customers_per_month,
      },
      projected_state:{
        price:payload.current_price*(1+payload.price_change_percent/100),
        customers_per_month:95,
        monthly_revenue:10450,
        retention_rate:95,
      },
      revenue_change:450,
      revenue_change_percent:4.5,
      risk_level:'Low',
      confidence_level:'Low',
      confidence_note:'No historical data yet. Your results will help us improve',
      assumptions:['Proof fixture only'],
      falsification_criteria:'Compare actual retained customers and revenue after the change.',
    };
  },
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
  assert.equal(health.pricing_simulation_state,'live_public');
  assert.equal(health.hiring_simulation_state,'held_not_mcp_runnable');
  assert.equal(health.expansion_simulation_state,'held_not_mcp_runnable');

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
  assert.equal(pricingRoute.result.structuredContent.state,'live_public_simulation');
  assert.equal(pricingRoute.result.structuredContent.runnable,true);
  assert.equal(pricingRoute.result.structuredContent.tool,'simulate_pricing_change');
  assert.equal(pricingRoute.result.structuredContent.external_action_taken,false);

  const hiring=await rpc('tools/call',{
    name:'route_business_decision',
    arguments:{intent:'Can I afford to hire another employee?'},
  },4);
  assert.equal(hiring.result.structuredContent.decision_type,'hiring');
  assert.equal(hiring.result.structuredContent.runnable,false);
  assert.equal(hiring.result.structuredContent.state,'public_experience_not_yet_runnable_by_mcp');

  const expansion=await rpc('tools/call',{
    name:'route_business_decision',
    arguments:{intent:'Should I open a new location in another market?'},
  },5);
  assert.equal(expansion.result.structuredContent.decision_type,'expansion');
  assert.equal(expansion.result.structuredContent.runnable,false);
  assert.equal(expansion.result.structuredContent.state,'public_experience_not_yet_runnable_by_mcp');

  const transaction=await rpc('tools/call',{
    name:'route_business_decision',
    arguments:{intent:'Should I buy a business from a competitor?'},
  },6);
  assert.equal(transaction.result.structuredContent.decision_type,'strategic_transaction');
  assert.equal(transaction.result.structuredContent.runnable,false);
  assert.equal(transaction.result.structuredContent.state,'decision_lab_discovery_only');

  const simulation=await rpc('tools/call',{
    name:'simulate_pricing_change',
    arguments:{
      industry:'General Contractor',
      current_price:100,
      customers_per_month:100,
      price_change_percent:10,
    },
  },7);
  assert.equal(pricingCalls.length,1);
  assert.deepEqual(pricingCalls[0],{
    industry:'General Contractor',
    current_price:100,
    customers_per_month:100,
    price_change_percent:10,
  });
  assert.equal(simulation.result.structuredContent.modeled,true);
  assert.equal(simulation.result.structuredContent.external_action_taken,false);
  assert.equal(simulation.result.structuredContent.simulation.confidence_level,'Low');
  assert.match(
    simulation.result.structuredContent.truth_boundary,
    /does not predict or guarantee/i
  );

  const capabilities=await rpc('tools/call',{
    name:'get_decision_lab_capabilities',
    arguments:{},
  },8);
  assert.equal(capabilities.result.structuredContent.production_mutation_enabled,false);
  assert.equal(capabilities.result.structuredContent.public_mcp_runtime,'Evercraft Compute');
  assert.equal(
    capabilities.result.structuredContent.lanes.find(x=>x.decision_type==='pricing').mcp_runnable,
    true
  );
  assert.equal(
    capabilities.result.structuredContent.lanes.find(x=>x.decision_type==='hiring').mcp_runnable,
    false
  );

  const badPricing=await rpc('tools/call',{
    name:'simulate_pricing_change',
    arguments:{
      current_price:100,
      customers_per_month:100,
      price_change_percent:999,
    },
  },9);
  assert.equal(badPricing.error.code,-32602);
  assert.equal(pricingCalls.length,1);

  console.log(JSON.stringify({
    ok:true,
    schema:'evercraft.systemia-remote-ops.yard-proof.v1',
    runtime:'Evercraft Compute',
    mcp_path:'/mcp/systemia-remote-ops',
    tool_count:tools.result.tools.length,
    pricing_runnable:true,
    hiring_runnable:false,
    expansion_runnable:false,
    strategic_transaction_runnable:false,
    modeled_pricing:true,
    low_confidence_preserved:true,
    production_mutation_enabled:false,
    external_action_taken:false,
    base44_mcp_deployment_required:false,
    legacy_pricing_adapter_preserved:true,
  },null,2));
}finally{
  await runtime.close();
}
