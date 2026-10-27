import crypto from 'node:crypto';

export const TRAINING_RULES = Object.freeze({
  virtual_cash: 20,
  max_risk_per_trade: 0.10,
  max_daily_realized_loss: 0.20,
  max_entries_per_day: 2,
  min_reward_risk: 1.5,
  simulated_impact_bps_each_side: 5,
  max_observed_spread_bps: 50,
  allowed_strategy_ids: ['opening_range_breakout', 'vwap_proxy_reclaim'],
});

const EASTERN = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York', hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit',
});
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const rounded = (v, digits = 8) => Number(v.toFixed(digits));
const sha = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

function sessionTime(timestamp) {
  const parts = Object.fromEntries(EASTERN.formatToParts(new Date(timestamp)).map((p) => [p.type, p.value]));
  return { date: [parts.year, parts.month, parts.day].join('-'), minute: Number(parts.hour) * 60 + Number(parts.minute) };
}

function isFresh(event) {
  return event?.mode === 'MARKET_DATA_OBSERVATION_ONLY' &&
    event?.source === 'ALPACA_IEX' &&
    event?.freshness === 'FRESH_FOR_OBSERVATION' &&
    ['minute_bar', 'updated_minute_bar', 'quote'].includes(event?.type) &&
    Number.isFinite(Date.parse(event?.source_timestamp)) &&
    Number.isFinite(Date.parse(event?.received_at));
}

function createSymbolState() {
  return { bars: [], barTimes: new Set(), attempts: new Set(), pending: null, firstMinute: null };
}

export function createShadowTeam({ startedAt, rules = TRAINING_RULES } = {}) {
  if (!Number.isFinite(Date.parse(startedAt))) throw new Error('precommit_start_timestamp_required');
  const frozen = { schema: 'evercraft.daytrade.shadow-team.precommit.v1', started_at: startedAt,
    strategies: [...rules.allowed_strategy_ids], rules: { ...rules } };
  const precommitHash = sha(frozen);
  const bySymbol = new Map();
  const days = new Map();
  const decisionSeq = { value: 0 };
  const stamp = (type, event, extra = {}) => ({
    schema: 'evercraft.daytrade.shadow-decision.v1', sequence: ++decisionSeq.value,
    type, strategy_precommit_hash: precommitHash, mode: 'HYPOTHETICAL_ONLY_NO_BROKER_ORDERS',
    at: event.received_at, symbol: event.symbol, market_source_at: event.source_timestamp, ...extra,
  });

  function dayFor(date) {
    if (!days.has(date)) days.set(date, { entries: 0, realized_pnl: 0, open: null });
    return days.get(date);
  }

  function ingest(event) {
    if (!isFresh(event)) return [];
    if (Date.parse(event.received_at) < Date.parse(startedAt)) return [];
    if (!event.symbol || typeof event.symbol !== 'string') return [];
    const st = sessionTime(event.source_timestamp);
    if (st.minute < 570 || st.minute >= 960) return [];
    const date = st.date;
    const symbolKey = date + ':' + event.symbol;
    if (!bySymbol.has(symbolKey)) bySymbol.set(symbolKey, createSymbolState());
    const symbol = bySymbol.get(symbolKey);
    const day = dayFor(date);
    const events = [];
    const emit = (type, extra) => events.push(stamp(type, event, { date, ...extra }));

    if (event.type === 'quote') {
      const q = event.data || {};
      if (![q.bp, q.ap, q.bs, q.as].every(finite) || !(q.bp > 0 && q.ap >= q.bp)) return events;

      if (day.open && day.open.symbol === event.symbol) {
        const p = day.open;
        const forcedClose = st.minute >= 958;
        const closeReason = q.bp <= p.stop ? 'stop' : q.bp >= p.target ? 'target' : forcedClose ? 'end_of_day' : null;
        if (closeReason) {
          const exitPrice = q.bp * (1 - rules.simulated_impact_bps_each_side / 10000);
          const net = (exitPrice - p.entry) * p.quantity;
          day.realized_pnl = rounded(day.realized_pnl + net);
          emit('HYPOTHETICAL_EXIT', {
            strategy_id: p.strategy_id, quantity: p.quantity,
            entry_reference: p.entry_reference, hypothetical_entry: p.entry,
            hypothetical_exit: rounded(exitPrice), observed_bid_reference: q.bp,
            simulated_net_pnl: rounded(net), cumulative_realized_pnl: day.realized_pnl,
            reason: closeReason, execution_evidence: 'NONE_NOT_A_BROKER_FILL',
          });
          day.open = null;
        }
      }
      if (!day.open && symbol.pending && st.minute < 958) {
        const p = symbol.pending;
        // A future observation must occur *after* the hypothesis was actually recorded.
        if (Date.parse(event.received_at) > Date.parse(p.recorded_at) &&
            Date.parse(event.source_timestamp) > Date.parse(p.source_at)) {
          symbol.pending = null;
          const spreadBps = ((q.ap - q.bp) / ((q.ap + q.bp) / 2)) * 10000;
          const entry = q.ap * (1 + rules.simulated_impact_bps_each_side / 10000);
          const effectiveStop = p.stop * (1 - rules.simulated_impact_bps_each_side / 10000);
          const unitRisk = entry - effectiveStop;
          const remaining = rules.max_daily_realized_loss + day.realized_pnl;
          const gateFailure =
            spreadBps > rules.max_observed_spread_bps ? 'spread_too_wide' :
            day.entries >= rules.max_entries_per_day ? 'daily_entry_limit' :
            remaining <= 0 ? 'daily_loss_stop' :
            !(unitRisk > 0) ? 'invalid_prospective_stop' :
            entry <= 0 ? 'bad_entry_price' : null;
          if (gateFailure) emit('REJECTED', { strategy_id: p.strategy_id, reason: gateFailure });
          else {
            const maxAffordable = Math.max(0, rules.virtual_cash + day.realized_pnl);
            const quantity = Math.floor(Math.min(maxAffordable / entry, rules.max_risk_per_trade / unitRisk, remaining / unitRisk) * 1e6) / 1e6;
            const plannedRisk = quantity * unitRisk;
            if (quantity <= 0 || plannedRisk <= 0 || plannedRisk > rules.max_risk_per_trade + 1e-8) {
              emit('REJECTED', { strategy_id: p.strategy_id, reason: 'size_or_risk_invalid' });
            } else {
              const target = entry + rules.min_reward_risk * unitRisk;
              day.open = { ...p, symbol: event.symbol, quantity, entry, entry_reference: q.ap, target };
              day.entries++;
              emit('HYPOTHETICAL_ENTRY', {
                strategy_id: p.strategy_id, hypothesis_recorded_at: p.recorded_at,
                quote_reference_at: event.source_timestamp, observed_ask_reference: q.ap,
                observed_bid_reference: q.bp, spread_bps: rounded(spreadBps, 3),
                hypothetical_entry: rounded(entry), stop: rounded(p.stop),
                target: rounded(target), quantity, planned_risk_dollars: rounded(plannedRisk),
                reward_risk_ratio: rules.min_reward_risk, entries_today: day.entries,
                execution_evidence: 'NONE_NOT_A_BROKER_FILL',
              });
            }
          }
        }
      }
      return events;
    }

    // Updated minute bars can rewrite an already seen minute. Ignore them in
    // the prospective strategy lane rather than retroactively editing decisions.
    if (event.type !== 'minute_bar') return events;
    const bar = event.data || {};
    if (![bar.o,bar.h,bar.l,bar.c,bar.v].every(finite) ||
        !(bar.o > 0 && bar.h > 0 && bar.l > 0 && bar.c > 0 && bar.v >= 0 && bar.h >= bar.l)) return events;
    const minuteKey = event.source_timestamp;
    if (symbol.barTimes.has(minuteKey)) return events;
    // Do not silently use sparse or late-started IEX minutes as an opening range.
    if (symbol.firstMinute === null) symbol.firstMinute = st.minute;
    symbol.barTimes.add(minuteKey);
    const previous = symbol.bars.at(-1);
    symbol.bars.push({ ...bar, minute: st.minute, source_at: event.source_timestamp });
    if (symbol.bars.length > 480) symbol.bars.shift();
    if (st.minute < 600 || st.minute >= 900 || day.open || symbol.pending || day.entries >= rules.max_entries_per_day) return events;

    const opening = symbol.bars.filter((b) => b.minute >= 570 && b.minute < 600);
    if (symbol.firstMinute !== 570 || opening.length !== 30 ||
        opening.some((b, i) => b.minute !== 570 + i)) return events;

    const high = Math.max(...opening.map((b) => b.h));
    const low = Math.min(...opening.map((b) => b.l));
    const range = high - low;
    if (!(range > 0)) return events;

    let proposal = null;
    if (!symbol.attempts.has('opening_range_breakout') &&
        bar.c > high && bar.c <= high + 0.35 * range && bar.v > 0) {
      proposal = { strategy_id: 'opening_range_breakout', stop: high - 0.20 * range,
        rationale: 'completed_minute_bar_close_above_30m_opening_high' };
    } else if (!symbol.attempts.has('vwap_proxy_reclaim') && st.minute >= 610 && previous) {
      const rows = symbol.bars;
      const vwap = (xs) => {
        const volume = xs.reduce((s, b) => s + b.v, 0);
        return volume > 0 ? xs.reduce((s,b) => s + ((b.h + b.l + b.c) / 3) * b.v, 0) / volume : NaN;
      };
      const before = vwap(rows.slice(0, -1));
      const current = vwap(rows);
      if (finite(before) && finite(current) && previous.c < before &&
          bar.c > current && bar.c > previous.c && bar.v > 0) {
        const stop = Math.min(...rows.slice(-3).map((b) => b.l));
        if (stop < bar.c) proposal = { strategy_id: 'vwap_proxy_reclaim', stop,
          rationale: 'bar_close_reclaimed_typical_price_volume_weighted_proxy_NOT_true_exchange_VWAP' };
      }
    }
    if (proposal) {
      symbol.attempts.add(proposal.strategy_id);
      // Reservation is provisional and *not* a trade. A later fresh quote
      // must independently confirm the hypothetical entry.
      symbol.pending = { ...proposal, recorded_at: event.received_at, source_at: event.source_timestamp };
      emit('PRECOMMITTED_HYPOTHESIS', {
        strategy_id: proposal.strategy_id, stop: rounded(proposal.stop),
        observed_bar_close: bar.c, rationale: proposal.rationale,
        outcome: 'AWAITING_LATER_QUOTE', price_source: 'IEX_ONLY',
      });
    }
    return events;
  }

  function summary() {
    return {
      schema: 'evercraft.daytrade.shadow-team-summary.v1',
      precommit: frozen, precommit_hash: precommitHash,
      mode: 'SHADOW_ONLY_NO_BROKER_EXECUTION',
      days: [...days].map(([date,d]) => ({
        date, hypothetical_entries: d.entries, hypothetical_realized_pnl: d.realized_pnl,
        open_unverified_position: !!d.open,
      })),
    };
  }
  return { precommit: { ...frozen, hash: precommitHash }, ingest, summary };
}
