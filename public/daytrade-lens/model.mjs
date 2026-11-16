// DayTrade Lens customer practice model.
// Local educational calculations only: never a broker order, market quote, or fill.
export const PRACTICE_LIMITS = Object.freeze({
  virtual_notional_usd: 20,
  max_modeled_risk_usd: 0.10,
  max_self_reported_daily_loss_usd: 0.20,
  max_plans_per_day: 2,
  minimum_reward_risk: 1.5,
  adverse_slippage_bps: 10,
  cost_reserve_bps: 5,
});

export function localDay(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (!Number.isFinite(d.getTime())) throw new Error('invalid_date');
  const part = n => String(n).padStart(2, '0');
  return [d.getFullYear(), part(d.getMonth() + 1), part(d.getDate())].join('-');
}
function finitePositive(value) {
  const n = Number(value);
  return value !== '' && value !== null && value !== undefined && Number.isFinite(n) && n > 0 ? n : null;
}
function rounded(value, digits = 6) {
  return Math.round((value + Number.EPSILON) * 10 ** digits) / 10 ** digits;
}
export function assessScenario(values = {}) {
  const notional = finitePositive(values.notional);
  const entry = finitePositive(values.entry);
  const stop = finitePositive(values.stop);
  const target = finitePositive(values.target);
  const reasons = [];
  if (!notional || !entry || !stop || !target) reasons.push('Enter a positive notional, entry, stop and target.');
  if (notional && notional > PRACTICE_LIMITS.virtual_notional_usd) reasons.push('Exceeds the $20 virtual position limit.');
  if (entry && stop && stop >= entry) reasons.push('A long setup needs a stop below entry.');
  if (entry && target && target <= entry) reasons.push('A long setup needs a target above entry.');
  let risk = null, reward = null, rr = null, qty = null;
  if (notional && entry && stop && target && stop < entry && target > entry) {
    qty = notional / entry;
    const stress = notional * (PRACTICE_LIMITS.adverse_slippage_bps + PRACTICE_LIMITS.cost_reserve_bps) / 10000;
    risk = (entry - stop) * qty + stress;
    reward = (target - entry) * qty - stress;
    rr = risk > 0 ? reward / risk : null;
    if (risk > PRACTICE_LIMITS.max_modeled_risk_usd + 1e-9) reasons.push('Modeled stressed downside exceeds $0.10.');
    if (!(rr >= PRACTICE_LIMITS.minimum_reward_risk)) reasons.push('Modeled reward/risk must be at least 1.5:1.');
  }
  return Object.freeze({
    eligible: reasons.length === 0,
    reasons,
    risk: risk === null ? null : rounded(risk),
    reward: reward === null ? null : rounded(reward),
    rewardRisk: rr === null ? null : rounded(rr, 3),
    estimatedQuantity: qty === null ? null : rounded(qty),
    disclaimer: 'Hypothetical sizing only. Stops and slippage are not guaranteed. No broker order is created.',
  });
}
export function cleanText(value, maximum = 300) {
  return String(value ?? '').trim().slice(0, maximum);
}
export function normalizeStoredEntries(input) {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 250).flatMap(entry => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
    if (typeof entry.id !== 'string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(entry.id) ||
        typeof entry.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(entry.day) ||
        !['planned', 'reviewed'].includes(entry.status)) return [];
    const numbers = ['notional', 'entry', 'stop', 'target'].map(key => finitePositive(entry[key]));
    if (numbers.some(x => x === null)) return [];
    const assessment = assessScenario({ notional: numbers[0], entry: numbers[1], stop: numbers[2], target: numbers[3] });
    if (!assessment.eligible) return [];
    const result = entry.status === 'reviewed' && ['skipped','simulated'].includes(entry.result) ? entry.result : null;
    const pnl = result === 'simulated' && Number.isFinite(entry.pnl) && Math.abs(entry.pnl) <= 20 ? entry.pnl : 0;
    if (entry.status === 'reviewed' && !result) return [];
    return [{
      id: entry.id, day: entry.day,
      createdAt: cleanText(entry.createdAt, 60),
      symbol: cleanText(entry.symbol, 12).toUpperCase().replace(/[^A-Z]/g, ''),
      setup: cleanText(entry.setup, 70),
      thesis: cleanText(entry.thesis, 500),
      lesson: cleanText(entry.lesson, 500),
      notional: numbers[0], entry: numbers[1], stop: numbers[2], target: numbers[3],
      risk: assessment.risk, rewardRisk: assessment.rewardRisk,
      status: entry.status, result, pnl,
    }];
  });
}
export function practiceGate(entries, day = localDay()) {
  const current = normalizeStoredEntries(entries).filter(x => x.day === day);
  const pending = current.filter(x => x.status === 'planned').length;
  const loss = current.filter(x => x.result === 'simulated').reduce((total, x) => total + x.pnl, 0);
  const reasons = [];
  if (current.length >= PRACTICE_LIMITS.max_plans_per_day) reasons.push('Two practice plans already saved today.');
  if (pending > 0) reasons.push('Review or skip the open practice plan first.');
  if (loss <= -PRACTICE_LIMITS.max_self_reported_daily_loss_usd) reasons.push('Self-reported daily loss stop reached.');
  return { allowed: reasons.length === 0, reasons, plans: current.length, pending, selfReportedPnL: rounded(loss, 2) };
}
export function journalSummary(entries) {
  const clean = normalizeStoredEntries(entries);
  const reviewed = clean.filter(x => x.status === 'reviewed');
  const simulated = reviewed.filter(x => x.result === 'simulated');
  const net = simulated.reduce((sum, x) => sum + x.pnl, 0);
  return Object.freeze({
    totalPlans: clean.length,
    needsReview: clean.filter(x => x.status === 'planned').length,
    reviewed: reviewed.length,
    simulatedOutcomes: simulated.length,
    selfReportedNet: rounded(net, 2),
  });
}
export function exportJournal(entries) {
  return {
    schema: 'evercraft.daytrade-lens.local-practice-journal.v1',
    mode: 'LOCAL_SELF_REPORTED_NO_BROKER',
    broker_verified_fills: 0,
    real_money_execution: false,
    warning: 'Self-reported practice notes, not certified market or broker evidence.',
    exported_at: new Date().toISOString(),
    entries: normalizeStoredEntries(entries),
  };
}
