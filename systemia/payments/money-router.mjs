import { PaymentsInvariantError } from './economic-kernel.mjs';

function fail(code, message) { throw new PaymentsInvariantError(code, message); }
function need(ok, code, message) { if (!ok) fail(code, message); }
function text(value, name) {
  need(typeof value === 'string' && value.trim(), 'invalid_string', name + ' must be non-empty');
  return value.trim();
}
function money(value, name) {
  need(Number.isSafeInteger(value) && value >= 0, 'invalid_minor_amount', name + ' must be a non-negative integer');
  return value;
}
function upper(value) { return text(value, 'currency').toUpperCase(); }

export class EvercraftMoneyRouter {
  constructor() { this.rails = new Map(); }

  registerRail({ rail_id, provider, currencies, capabilities = [], fee_bps = 0, fixed_fee_minor = 0, settlement_minutes = 0, enabled = true, priority = 100 }) {
    const id = text(rail_id, 'rail_id');
    need(!this.rails.has(id), 'rail_exists', 'rail already registered');
    need(Array.isArray(currencies) && currencies.length, 'rail_currency_required', 'rail must declare at least one currency');
    const rail = {
      schema: 'evercraft.settlement-rail.v1', rail_id: id, provider: text(provider, 'provider'),
      currencies: [...new Set(currencies.map(upper))], capabilities: [...new Set(capabilities.map((value) => text(value, 'capability')))],
      fee_bps: money(fee_bps, 'fee_bps'), fixed_fee_minor: money(fixed_fee_minor, 'fixed_fee_minor'),
      settlement_minutes: money(settlement_minutes, 'settlement_minutes'), enabled: Boolean(enabled), priority: money(priority, 'priority')
    };
    this.rails.set(id, rail);
    return structuredClone(rail);
  }

  route({ amount_minor, currency, required_capabilities = [], strategy = 'lowest_cost', preferred_rail_ids = [] }) {
    const amount = money(amount_minor, 'amount_minor');
    need(amount > 0, 'zero_value_route', 'route amount must be greater than zero');
    const code = upper(currency);
    const required = [...new Set(required_capabilities.map((value) => text(value, 'required capability')))];
    const eligible = [...this.rails.values()].filter((rail) => rail.enabled && rail.currencies.includes(code) && required.every((capability) => rail.capabilities.includes(capability))).map((rail) => ({
      ...rail,
      estimated_fee_minor: rail.fixed_fee_minor + Math.ceil(amount * rail.fee_bps / 10000)
    }));
    need(eligible.length, 'no_eligible_settlement_rail', 'no settlement rail satisfies the declared order requirements');

    let ordered;
    if (strategy === 'lowest_cost') {
      ordered = eligible.sort((a, b) => a.estimated_fee_minor - b.estimated_fee_minor || a.settlement_minutes - b.settlement_minutes || a.priority - b.priority || a.rail_id.localeCompare(b.rail_id));
    } else if (strategy === 'fastest_settlement') {
      ordered = eligible.sort((a, b) => a.settlement_minutes - b.settlement_minutes || a.estimated_fee_minor - b.estimated_fee_minor || a.priority - b.priority || a.rail_id.localeCompare(b.rail_id));
    } else if (strategy === 'preferred_order') {
      const rank = new Map(preferred_rail_ids.map((id, index) => [id, index]));
      ordered = eligible.sort((a, b) => (rank.get(a.rail_id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.rail_id) ?? Number.MAX_SAFE_INTEGER) || a.priority - b.priority || a.estimated_fee_minor - b.estimated_fee_minor || a.rail_id.localeCompare(b.rail_id));
    } else {
      fail('unknown_routing_strategy', 'routing strategy must be explicit and supported');
    }

    const selected = ordered[0];
    return {
      schema: 'evercraft.money-route.v1',
      economic_authority: 'Evercraft Payments',
      processor_role: 'replaceable_settlement_adapter',
      amount_minor: amount,
      currency: code,
      required_capabilities: required,
      strategy,
      selected_rail_id: selected.rail_id,
      selected_provider: selected.provider,
      estimated_fee_minor: selected.estimated_fee_minor,
      estimated_settlement_minutes: selected.settlement_minutes,
      eligible_rails: ordered.map((rail) => ({ rail_id: rail.rail_id, provider: rail.provider, estimated_fee_minor: rail.estimated_fee_minor, settlement_minutes: rail.settlement_minutes, priority: rail.priority }))
    };
  }
}
