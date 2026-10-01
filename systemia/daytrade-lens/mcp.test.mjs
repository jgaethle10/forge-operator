import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DAYTRADE_LENS_MCP,
  dayTradeLensTools,
  executeDayTradeLensRpc,
  runDayTradeReturnStress,
} from './mcp.mjs';

test('DayTrade Lens MCP exposes only bounded read-only research and practice tools',async()=>{
  const tools=dayTradeLensTools();
  assert.deepEqual(tools.map((x)=>x.name),[
    'get_daytrade_lens_capabilities',
    'run_daytrade_risk_gate',
    'run_daytrade_adversarial_drills',
    'stress_test_return_series',
  ]);
  assert.ok(tools.every((x)=>x.annotations.readOnlyHint===true));
  assert.ok(tools.every((x)=>x.annotations.destructiveHint===false));

  const init=await executeDayTradeLensRpc({
    jsonrpc:'2.0',id:1,method:'initialize',
    params:{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'test',version:'1'}},
  });
  assert.equal(init.result.serverInfo.name,DAYTRADE_LENS_MCP.server_name);
  assert.match(init.result.instructions,/No personalized investment advice/);
  assert.match(init.result.instructions,/No .*order placement/i);
});

test('paper-practice risk gate rejects stale and mock data without any broker action',async()=>{
  const stale=await executeDayTradeLensRpc({
    jsonrpc:'2.0',id:2,method:'tools/call',
    params:{name:'run_daytrade_risk_gate',arguments:{
      data_source:'ALPACA_IEX',
      source_age_seconds:30,
      stale_after_seconds:15,
      reward_risk_ratio:2,
      planned_risk_dollars:0.10,
      trades_today:0,
      open_position:false,
    }},
  });
  assert.equal(stale.result.structuredContent.gate.pass,false);
  assert.equal(stale.result.structuredContent.gate.reason,'stale_market_data');
  assert.equal(stale.result.structuredContent.live_trade_authority,false);
  assert.equal(stale.result.structuredContent.broker_action_taken,false);

  const mock=await executeDayTradeLensRpc({
    jsonrpc:'2.0',id:3,method:'tools/call',
    params:{name:'run_daytrade_risk_gate',arguments:{
      data_source:'MOCK',
      source_age_seconds:0,
      reward_risk_ratio:2,
      planned_risk_dollars:0.10,
      trades_today:0,
      open_position:false,
    }},
  });
  assert.equal(mock.result.structuredContent.gate.pass,false);
  assert.equal(mock.result.structuredContent.gate.reason,'unverified_data_source');
});

test('return stress is deterministic, caller-evidence bounded, and never claims a tradable edge',()=>{
  const args={
    strategy_returns:[0.01,0.012,0.008,0.015,0.009,0.011,0.013,0.007,0.014,0.01,0.012,0.009,0.011,0.013,0.008,0.014],
    benchmark_returns:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    origin_refs:['a','b','c','d','e','f','g','h','i','j','k','l','m','n','o','p'],
    expected_direction:'positive',
    transaction_cost_bps:5,
    bootstrap_iterations:300,
    null_iterations:300,
  };
  const a=runDayTradeReturnStress(args);
  const b=runDayTradeReturnStress(args);
  assert.equal(a.receipt_id,b.receipt_id);
  assert.equal(a.edge_claimed,false);
  assert.equal(a.live_trade_authority,false);
  assert.equal(a.broker_action_taken,false);
  assert.equal(a.external_action_taken,false);
  assert.equal(a.evidence_state,'modeled_from_caller_supplied_return_series');
  assert.ok(['RESEARCH_SIGNAL_SURVIVED_DECLARED_TESTS','RESEARCH_MORE_REQUIRED'].includes(a.status));
  assert.equal(a.sample.temporal_claim,false);
});

test('return stress does not fabricate origin-balanced evidence when origin refs are absent',()=>{
  const result=runDayTradeReturnStress({
    strategy_returns:[0.01,-0.005,0.003,0.002,0.004,-0.002],
    transaction_cost_bps:10,
    bootstrap_iterations:100,
    null_iterations:100,
  });
  assert.equal(result.origin_balanced_bootstrap,null);
  assert.equal(result.checks.origin_balanced_p05_positive,null);
  assert.ok(result.uncertainty.some((x)=>/origin_refs were not supplied/.test(x)));
});

test('adversarial drills keep the built-in safety controls intact',async()=>{
  const response=await executeDayTradeLensRpc({
    jsonrpc:'2.0',id:4,method:'tools/call',
    params:{name:'run_daytrade_adversarial_drills',arguments:{}},
  });
  assert.equal(response.result.structuredContent.all_expected_controls_held,true);
  assert.equal(response.result.structuredContent.live_trade_authority,false);
});
