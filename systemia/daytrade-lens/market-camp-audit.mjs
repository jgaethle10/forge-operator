import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const money = (n) => Number(n.toFixed(8));
export function auditMarketCamp(jsonl) {
  const rows = String(jsonl || '').trim().split('\n').filter(Boolean).map((line,i) => {
    try { return JSON.parse(line); }
    catch { throw new Error('observer_invalid_json_at_line_' + (i+1)); }
  });
  const result = {
    schema:'evercraft.daytrade.market-camp-audit.v1',
    classification:'SOURCE_LOG_NOT_BROKER_EVIDENCE',
    source:'ALPACA_IEX_ONLY',
    broker_paper_fills:0, broker_live_fills:0,
    observer_start:null, observer_stop:null, feed_subscription_confirmed_in_log:false,
    strategy_precommit:null, market_events:0, quotes:0, minute_bars:0,
    fresh_observations:0, stale_observations:0, symbols:{},
    hypotheses:0, rejections:0, hypothetical_entries:0, hypothetical_exits:0,
    wins:0, losses:0, hypothetically_open:0, hypothetical_realized_pnl:0,
    cumulative_planned_risk:0, max_planned_risk:0, max_intraday_entry_count:0,
    warnings:[], risk_flags:[], decisions:[],
  };
  const warnings = new Set();
  const riskFlags = new Set();
  const positions = new Map();
  const dailyEntries = new Map();
  const seenSequence = new Set();
  let precommitSeen = false, observedMarket = false, previousReceived = null;
  for(const row of rows) {
    if (row?.kind === 'observer_start') {
      if(result.observer_start) riskFlags.add('DUPLICATE_OBSERVER_START');
      result.observer_start = {at:row.at, symbols:row.symbols, stop_at:row.stop_at, feed:row.feed};
      if (row.feed !== 'wss://stream.data.alpaca.markets/v2/iex') riskFlags.add('UNEXPECTED_FEED');
    }
    if(row?.kind === 'observer_stop') result.observer_stop = {at:row.at, reason:row.reason, shadow_halted:row.shadow_halted, counts:row.captured};
    if(row?.kind === 'shadow_precommit') {
      if(observedMarket) riskFlags.add('PRECOMMIT_AFTER_MARKET_DATA');
      if(precommitSeen) riskFlags.add('DUPLICATE_PRECOMMIT');
      precommitSeen=true;
      result.strategy_precommit={at:row.precommit?.started_at,hash:row.precommit?.hash,rules:row.precommit?.rules};
      const rules=row.precommit?.rules;
      if(!rules || rules.virtual_cash!==20 || rules.max_risk_per_trade!==0.1 ||
         rules.max_daily_realized_loss!==0.2 || rules.max_entries_per_day!==2 ||
         rules.min_reward_risk!==1.5) riskFlags.add('RISK_CONFIG_DRIFT');
    }
    if(row?.kind === 'subscription_status' && row.subscribed===true) result.feed_subscription_confirmed_in_log=true;
    if(row?.kind === 'feed_error'|| row?.kind==='authentication_or_subscription_timeout') warnings.add('FEED_ERROR_RECORDED');
    if(row?.kind === 'shadow_team_fail_closed') riskFlags.add('SHADOW_ENGINE_FAILED_CLOSED');
    if(row?.kind === 'market_event') {
      observedMarket=true;
      const e=row.event;
      if (!e || e.source!=='ALPACA_IEX'||e.mode!=='MARKET_DATA_OBSERVATION_ONLY') {
        riskFlags.add('INVALID_MARKET_EVENT_LABEL'); continue;
      }
      const received=Date.parse(e.received_at);
      const source=Date.parse(e.source_timestamp);
      if(!Number.isFinite(received) || !Number.isFinite(source)) {
        warnings.add('INVALID_EVENT_TIMESTAMPS');
        continue;
      }
      if(previousReceived !== null && received < previousReceived) warnings.add('OUT_OF_ORDER_RECEIPT');
      previousReceived=received;
      result.market_events++;
      result.symbols[e.symbol] ??= {observations:0,quotes:0,minute_bars:0,stale:0};
      const symbol=result.symbols[e.symbol];
      symbol.observations++;
      if(e.type==='quote') {result.quotes++;symbol.quotes++;}
      if(e.type==='minute_bar') {result.minute_bars++;symbol.minute_bars++;}
      if(e.freshness==='FRESH_FOR_OBSERVATION') result.fresh_observations++;
      else {result.stale_observations++;symbol.stale++;}
      continue;
    }
    if(row?.kind === 'shadow_team_decision') {
      const d=row.decision;
      if(!d || d.mode!=='HYPOTHETICAL_ONLY_NO_BROKER_ORDERS') {
        riskFlags.add('NON_SHADOW_DECISION_LABEL');continue;
      }
      const id=String(d.sequence);
      if(seenSequence.has(id)) riskFlags.add('DUPLICATE_DECISION_SEQUENCE');
      seenSequence.add(id);
      if(!precommitSeen || d.strategy_precommit_hash!==result.strategy_precommit?.hash) riskFlags.add('MISSING_OR_CHANGED_PRECOMMIT');
      const key=d.date+'|'+d.symbol;
      if(d.type==='PRECOMMITTED_HYPOTHESIS') result.hypotheses++;
      if(d.type==='REJECTED') result.rejections++;
      if(d.type==='HYPOTHETICAL_ENTRY') {
        result.hypothetical_entries++;
        dailyEntries.set(d.date,(dailyEntries.get(d.date)||0)+1);
        result.max_intraday_entry_count=Math.max(result.max_intraday_entry_count,dailyEntries.get(d.date));
        if(dailyEntries.get(d.date)>2) riskFlags.add('DAILY_TRADE_LIMIT_VIOLATION');
        if(positions.size>0) riskFlags.add('OVERLAPPING_HYPOTHETICAL_POSITION');
        if(d.quantity<=0 || d.quantity*d.hypothetical_entry>20+0.3) riskFlags.add('SIZE_OR_CASH_BOUND');
        if(d.planned_risk_dollars>0.1000001 || !(d.planned_risk_dollars>0)) riskFlags.add('PLANNED_RISK_BOUND');
        if(d.reward_risk_ratio<1.5) riskFlags.add('REWARD_RISK_BOUND');
        if(d.execution_evidence!=='NONE_NOT_A_BROKER_FILL') riskFlags.add('BAD_BROKER_EVIDENCE_CLAIM');
        result.max_planned_risk=Math.max(result.max_planned_risk,d.planned_risk_dollars);
        result.cumulative_planned_risk=money(result.cumulative_planned_risk+d.planned_risk_dollars);
        positions.set(key,d);
      }
      if(d.type==='HYPOTHETICAL_EXIT') {
        result.hypothetical_exits++;
        if(!positions.has(key)) riskFlags.add('EXIT_WITHOUT_PRIOR_ENTRY');
        positions.delete(key);
        if(typeof d.simulated_net_pnl!=='number' || !Number.isFinite(d.simulated_net_pnl)) riskFlags.add('INVALID_SIMULATED_PNL');
        else {
          result.hypothetical_realized_pnl=money(result.hypothetical_realized_pnl+d.simulated_net_pnl);
          if(d.simulated_net_pnl>0) result.wins++;
          if(d.simulated_net_pnl<0) result.losses++;
        }
        if(d.execution_evidence!=='NONE_NOT_A_BROKER_FILL') riskFlags.add('BAD_BROKER_EVIDENCE_CLAIM');
      }
      result.decisions.push({at:d.at,symbol:d.symbol,strategy_id:d.strategy_id,type:d.type,reason:d.reason||null});
    }
  }
  if(!result.observer_start) warnings.add('NO_OBSERVER_START');
  if(!result.observer_stop) warnings.add('NO_OBSERVER_STOP_YET');
  if(!precommitSeen) warnings.add('NO_PROSPECTIVE_STRATEGY_PRECOMMIT');
  if(!result.feed_subscription_confirmed_in_log) warnings.add('NO_SUBSCRIPTION_RECEIPT');
  if(result.market_events===0) warnings.add('NO_MARKET_EVENTS');
  if(result.stale_observations) warnings.add('STALE_MARKET_EVENTS_PRESENT');
  result.hypothetically_open=positions.size;
  if(positions.size) warnings.add('HYPOTHETICAL_POSITIONS_WITHOUT_EXIT_EVIDENCE');
  result.warnings=[...warnings];
  result.risk_flags=[...riskFlags];
  result.audit_state=result.risk_flags.length?'FAIL_REVIEW_REQUIRED':
    result.market_events&&precommitSeen&&result.feed_subscription_confirmed_in_log?
      'READ_ONLY_OBSERVATIONS_AUDITABLE_NOT_BROKER_CONFIRMED':'INSUFFICIENT_SOURCE_EVIDENCE';
  return result;
}
export function renderCampMarkdown(report) {
  const lines=[
    '# Evercraft DayTrade Lens - Market Training Audit',
    '',
    'This report contains **read-only IEX market observations and hypothetical entries/exits, NOT broker paper or real-money fills.**',
    '',
    '- State: **'+report.audit_state+'**',
    '- Observations: '+report.market_events+' ('+report.quotes+' sampled quotes, '+report.minute_bars+' minute bars)',
    '- Fresh / stale: '+report.fresh_observations+' / '+report.stale_observations,
    '- Precommitted hypotheses: '+report.hypotheses+', rejections: '+report.rejections,
    '- Hypothetical entries / exits: '+report.hypothetical_entries+' / '+report.hypothetical_exits,
    '- Hypothetical wins / losses: '+report.wins+' / '+report.losses,
    '- Hypothetical realized P&L net modeled impact: $'+report.hypothetical_realized_pnl.toFixed(4),
    '- Unresolved hypothetical positions: '+report.hypothetically_open,
    '- Actual broker paper/live fills: **0 / 0 (no broker connection in this pipeline)**',
    '- Precommit: '+(report.strategy_precommit?.hash||'MISSING'),
    '',
    '## Quality flags',
    ...(report.warnings.length?report.warnings.map(s=>'- WARNING '+s):['- No quality warnings']),
    ...(report.risk_flags.length?report.risk_flags.map(s=>'- RISK '+s):['- No rule violations detected in the parsed journal']),
    '',
    '## Source coverage',
    '| Symbol | Events | Quotes | Minute bars | Stale |',
    '|---|---:|---:|---:|---:|',
    ...Object.entries(report.symbols).map(([symbol,x])=>('| '+symbol+' | '+x.observations+' | '+x.quotes+' | '+x.minute_bars+' | '+x.stale+' |')),
    '',
    '## Important limitations',
    'IEX-only quotes are not consolidated market NBBO. Simulated entry and exit prices are counterfactual and may not have been executable. No strategy is proven by one trading session. Separate broker-confirmed PAPER integration remains locked.',
    '',
  ];
  return lines.join('\n');
}
if(process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const input=process.argv[2];
  const output=process.argv[3];
  if(!input||!output) throw new Error('usage: node market-camp-audit.mjs INPUT.jsonl OUTPUT.md');
  const report=auditMarketCamp(fs.readFileSync(input,'utf8'));
  fs.mkdirSync(path.dirname(output),{recursive:true});
  fs.writeFileSync(output,renderCampMarkdown(report));
  fs.writeFileSync(output.replace(/\.md$/i,'.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({audit_state:report.audit_state,report:output,risk_flags:report.risk_flags}));
  if(report.risk_flags.length) process.exitCode=2;
}
