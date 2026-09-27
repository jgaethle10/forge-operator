import { rankOpportunities } from './engine.mjs';

const clean = (value) => String(value ?? '').trim();

function minutesFor(row) {
  return Math.max(0, Number(row.travel_minutes ?? 0)) + Math.max(0, Number(row.action_minutes ?? 0));
}

function keyFor(row) {
  const benefitKey = clean(row.benefit_key);
  if (benefitKey) return 'benefit:' + benefitKey;
  const exclusiveGroup = clean(row.exclusive_group);
  if (exclusiveGroup) return 'exclusive:' + exclusiveGroup;
  return null;
}

export function composeHouseholdPlan(rawOpportunities, options = {}) {
  const ranked = rankOpportunities(rawOpportunities, options);
  const maxActions = Math.max(1, Math.min(100, Number(options.max_actions ?? 8)));
  const maxMinutes = Number.isFinite(Number(options.max_total_minutes))
    ? Math.max(0, Number(options.max_total_minutes))
    : Number.POSITIVE_INFINITY;

  const chosen = [];
  const alternatives = [];
  const occupied = new Map();
  let usedMinutes = 0;

  for (const row of ranked) {
    const key = keyFor(row);
    const minutes = minutesFor(row);

    if (key && occupied.has(key)) {
      alternatives.push({
        opportunity_id: row.id,
        alternative_to: occupied.get(key),
        reason: key.startsWith('benefit:') ? 'duplicate_benefit' : 'mutually_exclusive',
        net_value_cents: row.value.net_value_cents,
      });
      continue;
    }

    if (chosen.length >= maxActions) {
      alternatives.push({
        opportunity_id: row.id,
        alternative_to: null,
        reason: 'action_limit',
        net_value_cents: row.value.net_value_cents,
      });
      continue;
    }

    if (usedMinutes + minutes > maxMinutes) {
      alternatives.push({
        opportunity_id: row.id,
        alternative_to: null,
        reason: 'time_budget',
        net_value_cents: row.value.net_value_cents,
      });
      continue;
    }

    chosen.push(row);
    usedMinutes += minutes;
    if (key) occupied.set(key, row.id);
  }

  const identified = ranked.reduce((acc, row) => {
    if (row.value_basis === 'earn') acc.earn_cents += Math.max(0, row.value.net_value_cents);
    else acc.keep_cents += Math.max(0, row.value.net_value_cents);
    return acc;
  }, { keep_cents: 0, earn_cents: 0 });

  const capturable = chosen.reduce((acc, row) => {
    if (row.value_basis === 'earn') acc.earn_cents += Math.max(0, row.value.net_value_cents);
    else acc.keep_cents += Math.max(0, row.value.net_value_cents);
    return acc;
  }, { keep_cents: 0, earn_cents: 0 });

  return {
    schema: 'systemia.household-fabric.plan.v1',
    generated_at: (options.now instanceof Date ? options.now : new Date(options.now ?? Date.now())).toISOString(),
    geography: options.geography ?? null,
    plan_constraints: {
      max_actions: maxActions,
      max_total_minutes: Number.isFinite(maxMinutes) ? maxMinutes : null,
    },
    metrics: {
      identified_money_kept_cents: identified.keep_cents,
      identified_money_earned_cents: identified.earn_cents,
      planned_money_kept_cents: capturable.keep_cents,
      planned_money_earned_cents: capturable.earn_cents,
      planned_minutes: usedMinutes,
      opportunities_identified: ranked.length,
      actions_selected: chosen.length,
      alternatives_preserved: alternatives.length,
    },
    actions: chosen,
    alternatives,
    guardrails: {
      mutually_exclusive_value_double_counted: false,
      duplicate_benefit_double_counted: false,
      alternatives_hidden: false,
    },
  };
}
