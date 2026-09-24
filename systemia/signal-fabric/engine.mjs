import { route } from './router.mjs';

const isoMs = (value) => new Date(value).getTime();

export function emptyState() {
  return {
    schema:'systemia.signal-fabric.state.v1',
    incidents:{},
    immediate_budget:{}
  };
}

export function ingest(state, rawSignal, options={}) {
  const next = structuredClone(state || emptyState());
  const decision = route(rawSignal);
  const now = isoMs(decision.created_at);
  const fp = decision.fingerprint;
  const prior = next.incidents[fp] || null;
  const isRecovery = ['recovered','healthy','resolved'].includes(String(rawSignal.status || '').toLowerCase());
  const dedupeMs = decision.dedupe_window_seconds * 1000;

  if (isRecovery && prior?.open) {
    next.incidents[fp] = {
      ...prior,
      open:false,
      recovered_at:decision.created_at,
      last_seen_at:decision.created_at,
      repeat_count:(prior.repeat_count || 1)+1
    };
    return {
      state:next,
      decision:{...decision,severity:'receipt',routes:['ledger'],action:'recovery',suppressed:false,incident_open:false}
    };
  }

  const repeatWithinWindow = prior && prior.open && (now - isoMs(prior.last_seen_at)) <= dedupeMs;
  const repeatCount = (prior?.repeat_count || 0) + 1;

  next.incidents[fp] = {
    fingerprint:fp,
    severity:decision.severity,
    open:decision.severity !== 'receipt',
    first_seen_at:prior?.first_seen_at || decision.created_at,
    last_seen_at:decision.created_at,
    repeat_count:repeatCount,
    product:decision.product,
    source:decision.source,
    summary:decision.summary
  };

  if (repeatWithinWindow) {
    return {
      state:next,
      decision:{...decision,action:'deduped',suppressed:true,incident_open:true,repeat_count:repeatCount,routes:['ledger']}
    };
  }

  const recipient = options.recipient || rawSignal.recipient || 'company-ops';
  if (decision.severity === 'critical') {
    const hour = decision.created_at.slice(0,13);
    const budgetKey = `${recipient}|${hour}`;
    const used = next.immediate_budget[budgetKey] || 0;
    const limit = options.immediateBudgetPerHour ?? 4;
    if (used >= limit) {
      return {
        state:next,
        decision:{
          ...decision,
          action:'budget_coalesced',
          suppressed:true,
          immediate_allowed:false,
          routes:['ledger','owner_queue'],
          incident_open:true,
          repeat_count:repeatCount
        }
      };
    }
    next.immediate_budget[budgetKey]=used+1;
  }

  return {
    state:next,
    decision:{...decision,action:'deliver',suppressed:false,incident_open:decision.severity !== 'receipt',repeat_count:repeatCount}
  };
}
