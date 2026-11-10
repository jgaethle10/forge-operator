import assert from 'node:assert/strict';
import { test } from 'node:test';
import { auditMarketCamp, renderCampMarkdown } from './market-camp-audit.mjs';

const hash = 'test_precommit_hash';
const at = '2026-10-27T14:01:00.000Z';
const row = (kind,extra={}) => ({schema:'evercraft.daytrade.market-data-observation.v1',kind,at,...extra});
const rules={virtual_cash:20,max_risk_per_trade:0.1,max_daily_realized_loss:0.2,max_entries_per_day:2,min_reward_risk:1.5};
const observer = () => [
  row('observer_start',{feed:'wss://stream.data.alpaca.markets/v2/iex',symbols:['SPY']}),
  row('shadow_precommit',{precommit:{started_at:'2026-10-27T12:00:00Z',hash,rules}}),
  row('subscription_status',{subscribed:true}),
  row('market_event',{event:{mode:'MARKET_DATA_OBSERVATION_ONLY',source:'ALPACA_IEX',type:'quote',
    symbol:'SPY',received_at:at,source_timestamp:'2026-10-27T14:00:59.000Z',freshness:'FRESH_FOR_OBSERVATION'}}),
];
const decision = (sequence,type,extra={})=>row('shadow_team_decision',{decision:{
  schema:'evercraft.daytrade.shadow-decision.v1',sequence,type,mode:'HYPOTHETICAL_ONLY_NO_BROKER_ORDERS',
  strategy_precommit_hash:hash,at,symbol:'SPY',date:'2026-10-27',
  strategy_id:'opening_range_breakout',...extra,
}});
const toJournal = (rows) => rows.map(x=>JSON.stringify(x)).join('\n')+'\n';

test('produces explicit shadow-only audit with realized net hypothetical P&L',()=>{
  const rows=[
    ...observer(),
    decision(1,'PRECOMMITTED_HYPOTHESIS'),
    decision(2,'HYPOTHETICAL_ENTRY',{quantity:0.15,hypothetical_entry:100.5,planned_risk_dollars:0.05,
      reward_risk_ratio:1.5,execution_evidence:'NONE_NOT_A_BROKER_FILL'}),
    decision(3,'HYPOTHETICAL_EXIT',{simulated_net_pnl:0.08,execution_evidence:'NONE_NOT_A_BROKER_FILL'}),
    row('observer_stop',{reason:'configured_session_end',shadow_halted:false,captured:1}),
  ];
  const audit=auditMarketCamp(toJournal(rows));
  assert.equal(audit.audit_state,'READ_ONLY_OBSERVATIONS_AUDITABLE_NOT_BROKER_CONFIRMED');
  assert.equal(audit.broker_paper_fills,0);
  assert.equal(audit.hypothetical_entries,1);
  assert.equal(audit.hypothetical_exits,1);
  assert.equal(audit.hypothetical_realized_pnl,0.08);
  assert.equal(audit.hypothetically_open,0);
  assert.deepEqual(audit.risk_flags,[]);
  assert.match(renderCampMarkdown(audit),/NOT broker paper or real-money fills/);
});

test('raises risk flags for exceeding daily trade limit and precommit drift',()=>{
  const rows=[...observer()];
  for(let i=0;i<3;i++){
    rows.push(decision(i*2+1,'HYPOTHETICAL_ENTRY',{quantity:0.1,hypothetical_entry:100,
      planned_risk_dollars:i===2?0.15:0.05,reward_risk_ratio:1.5,
      execution_evidence:'NONE_NOT_A_BROKER_FILL',strategy_precommit_hash:i===2?'tampered':hash}));
    rows.push(decision(i*2+2,'HYPOTHETICAL_EXIT',{simulated_net_pnl:-0.01,
      execution_evidence:'NONE_NOT_A_BROKER_FILL'}));
  }
  const audit=auditMarketCamp(toJournal(rows));
  assert.equal(audit.audit_state,'FAIL_REVIEW_REQUIRED');
  assert.ok(audit.risk_flags.includes('DAILY_TRADE_LIMIT_VIOLATION'));
  assert.ok(audit.risk_flags.includes('PLANNED_RISK_BOUND'));
  assert.ok(audit.risk_flags.includes('MISSING_OR_CHANGED_PRECOMMIT'));
});

test('marks unauthenticated, missing and stale streams as insufficient',()=>{
  const rows=[
    row('observer_start',{feed:'wss://stream.data.alpaca.markets/v2/iex'}),
    row('market_event',{event:{mode:'MARKET_DATA_OBSERVATION_ONLY',source:'ALPACA_IEX',type:'quote',
      symbol:'QQQ',received_at:at,source_timestamp:at,freshness:'STALE_OR_CLOCK_SKEW'}}),
  ];
  const audit=auditMarketCamp(toJournal(rows));
  assert.equal(audit.audit_state,'INSUFFICIENT_SOURCE_EVIDENCE');
  assert.ok(audit.warnings.includes('NO_SUBSCRIPTION_RECEIPT'));
  assert.ok(audit.warnings.includes('STALE_MARKET_EVENTS_PRESENT'));
  assert.ok(audit.warnings.includes('NO_PROSPECTIVE_STRATEGY_PRECOMMIT'));
  assert.ok(audit.warnings.includes('NO_OBSERVER_STOP_YET'));
});

test('rejects corrupt JSONL and flags orphan exit',()=>{
  assert.throws(()=>auditMarketCamp('{broken'),/observer_invalid_json_at_line_1/);
  const report=auditMarketCamp(toJournal([...observer(),decision(1,'HYPOTHETICAL_EXIT',{
    simulated_net_pnl:0,execution_evidence:'NONE_NOT_A_BROKER_FILL'})]));
  assert.ok(report.risk_flags.includes('EXIT_WITHOUT_PRIOR_ENTRY'));
});
