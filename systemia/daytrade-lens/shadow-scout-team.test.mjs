import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createShadowTeam, TRAINING_RULES } from './shadow-scout-team.mjs';

const START = '2026-10-27T12:00:00.000Z';
const day = '2026-10-27';
const at = (minute) => new Date(Date.parse(day+'T13:30:00.000Z') + minute * 60_000).toISOString();
function bar(minute, close = 100, extra = {}) {
  return {
    mode: 'MARKET_DATA_OBSERVATION_ONLY', source: 'ALPACA_IEX',
    freshness:'FRESH_FOR_OBSERVATION', type:'minute_bar', symbol:'SPY',
    source_timestamp:at(minute), received_at:new Date(Date.parse(at(minute))+59_000).toISOString(),
    data:{o:100,h:100.30,l:99.90,c:close,v:500,...extra},
  };
}
function quote(minute, seconds, bid, ask) {
  const t = new Date(Date.parse(at(minute)) + seconds*1000).toISOString();
  return {
    mode: 'MARKET_DATA_OBSERVATION_ONLY', source: 'ALPACA_IEX',
    freshness:'FRESH_FOR_OBSERVATION', type:'quote', symbol:'SPY',
    source_timestamp:t, received_at:new Date(Date.parse(t)+500).toISOString(),
    data:{bp:bid,ap:ask,bs:100,as:100},
  };
}
function seedOpen(team) {
  const output=[];
  for(let m=0;m<30;m++) output.push(...team.ingest(bar(m)));
  return output;
}

test('precommit frozen before candidate and requires later observed quote', () => {
  const team=createShadowTeam({startedAt:START});
  assert.equal(team.precommit.strategies.length,2);
  assert.equal(team.precommit.rules.max_risk_per_trade,0.1);
  assert.equal(seedOpen(team).length,0);
  const signal=team.ingest(bar(30,100.40,{h:100.50}));
  assert.equal(signal.length,1);
  assert.equal(signal[0].type,'PRECOMMITTED_HYPOTHESIS');
  assert.equal(signal[0].strategy_id,'opening_range_breakout');
  assert.equal(team.summary().days[0].hypothetical_entries,0);
  assert.equal(team.ingest(quote(30,40,100.42,100.45)).length,0); // quote timestamp before hypothesis
  const entered=team.ingest(quote(31,10,100.42,100.45));
  assert.equal(entered.length,1);
  assert.equal(entered[0].type,'HYPOTHETICAL_ENTRY');
  assert.equal(entered[0].execution_evidence,'NONE_NOT_A_BROKER_FILL');
  assert.ok(entered[0].planned_risk_dollars <= 0.10);
  assert.equal(team.summary().days[0].hypothetical_entries,1);
  const exited=team.ingest(quote(32,20,101.40,101.45));
  assert.equal(exited.length,1);
  assert.equal(exited[0].type,'HYPOTHETICAL_EXIT');
  assert.equal(exited[0].reason,'target');
  assert.ok(exited[0].simulated_net_pnl>0);
  assert.equal(team.summary().days[0].open_unverified_position,false);
});

test('not accepting missing opening minutes, hindsight, mock or stale feeds', () => {
  const team=createShadowTeam({startedAt:START});
  assert.deepEqual(team.ingest(bar(1)),[]);
  for(let i=2;i<30;i++) team.ingest(bar(i));
  assert.deepEqual(team.ingest(bar(30,100.40,{h:100.50})),[]);
  assert.deepEqual(team.ingest({...bar(31,100.40),freshness:'STALE_OR_CLOCK_SKEW'}),[]);
  assert.deepEqual(team.ingest({...bar(31,100.40),source:'MOCK'}),[]);
  const retro=createShadowTeam({startedAt:'2026-10-28T12:00:00.000Z'});
  assert.deepEqual(retro.ingest(bar(30,100.40)),[]);
  assert.throws(()=>createShadowTeam({}),/precommit_start_timestamp_required/);
});

test('rejects wide spread before committing hypothetical risk', () => {
  const team=createShadowTeam({startedAt:START});
  seedOpen(team);
  team.ingest(bar(30,100.4,{h:100.5}));
  const rejected=team.ingest(quote(31,10,100.01,101.02));
  assert.equal(rejected.length,1);
  assert.equal(rejected[0].type,'REJECTED');
  assert.equal(rejected[0].reason,'spread_too_wide');
  assert.equal(team.summary().days[0].hypothetical_entries,0);
});

test('precommit is deterministic and core risk constraints are stable', () => {
  const a=createShadowTeam({startedAt:START});
  const b=createShadowTeam({startedAt:START});
  assert.equal(a.precommit.hash,b.precommit.hash);
  assert.equal(TRAINING_RULES.virtual_cash,20);
  assert.equal(TRAINING_RULES.max_entries_per_day,2);
  assert.equal(TRAINING_RULES.max_daily_realized_loss,0.2);
  assert.equal(TRAINING_RULES.min_reward_risk,1.5);
});
