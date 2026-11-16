/**
 * Systemia Remote Ops: 30-day flight demonstration engine.
 * Fictional, deterministic training assumptions; not a demand forecast.
 * Pure module: no network, storage, production mutations, or real accounts.
 */
export const PRESETS = Object.freeze({
  service: Object.freeze({
    name: 'Home services', subtitle: 'A two-person cleaning crew',
    openingCash: 12000, visitors: 4.2, capacity: 5, staffCapacity: 2,
    ticket: 190, variableCost: 45, dailyOverhead: 245, staff: 1, dailyPay: 115,
    description: 'Run a small service crew with bookings, supplies and payroll.'
  }),
  gym: Object.freeze({
    name: 'Fitness studio', subtitle: 'Classes and day passes, not membership billing',
    openingCash: 35000, visitors: 38, capacity: 42, staffCapacity: 18,
    ticket: 19, variableCost: 3, dailyOverhead: 400, staff: 2, dailyPay: 110,
    description: 'A simplified studio selling daily class slots and passes.'
  }),
  cafe: Object.freeze({
    name: 'Coffee cart', subtitle: 'Foot traffic meets thin margins',
    openingCash: 10000, visitors: 78, capacity: 90, staffCapacity: 30,
    ticket: 7, variableCost: 2.35, dailyOverhead: 235, staff: 1, dailyPay: 90,
    description: 'Balance foot traffic, staffing and small-ticket purchases.'
  })
});

export const ACTIONS = Object.freeze([
  { id: 'hold', name: 'Hold the course', detail: 'No special spending. Observe demand.' },
  { id: 'promote', name: 'Run a promotion', detail: 'Spend $170 today to boost modeled demand; modest reputation lift.' },
  { id: 'raise', name: 'Raise prices 8%', detail: 'Permanently raise your price. Some modeled customers may leave.' },
  { id: 'lower', name: 'Lower prices 8%', detail: 'Permanently lower your price to improve modeled demand.' },
  { id: 'hire', name: 'Hire capacity', detail: 'One-time $300 onboarding plus daily payroll from now on.' },
  { id: 'quality', name: 'Invest in experience', detail: 'Spend $450 to improve future modeled demand.' }
]);

const EVENTS = Object.freeze([
  { title: 'An ordinary Tuesday', description: 'No unusual changes in the fictional local market.', demand: 1, variable: 1 },
  { title: 'A competitor makes an offer', description: 'Some customers test another provider today.', demand: 0.79, variable: 1 },
  { title: 'A local mention spreads', description: 'An unexpected mention brings more interest.', demand: 1.21, variable: 1 },
  { title: 'Supplies are more expensive', description: 'Your per-sale inputs temporarily cost more.', demand: 1, variable: 1.22 },
  { title: 'A quiet day', description: 'Fewer customers arrive than you modeled.', demand: 0.72, variable: 1 },
  { title: 'The weekend rush', description: 'Demand picks up, but capacity still limits sales.', demand: 1.33, variable: 1 },
  { title: 'Routine operations', description: 'The operation runs close to baseline today.', demand: 0.96, variable: 1 }
]);

const round = value => Math.round((value + Number.EPSILON) * 100) / 100;
const amount = value => Math.round(value * 100) / 100;
const maxStaff = 6;

export function newRun(presetKey = 'service') {
  const preset = PRESETS[presetKey];
  if (!preset) throw new RangeError('Unknown fictional business preset');
  return {
    version: 1, presetKey, day: 1, cash: preset.openingCash, price: preset.ticket,
    brand: 1, staff: preset.staff, totalRevenue: 0, totalExpenses: 0,
    totalServed: 0, totalUnserved: 0, history: [], finished: false, ending: null
  };
}

export function eventForDay(state) {
  if (!PRESETS[state?.presetKey]) throw new RangeError('Unknown business');
  const offset = state.presetKey === 'gym' ? 2 : state.presetKey === 'cafe' ? 4 : 0;
  return EVENTS[((state.day - 1) * 5 + offset) % EVENTS.length];
}

function calculate(state, actionId) {
  const preset = PRESETS[state?.presetKey];
  if (!preset || state.finished || state.day < 1 || state.day > 30) {
    throw new RangeError('This simulation run is not active');
  }
  const action = ACTIONS.find(item => item.id === actionId);
  if (!action) throw new RangeError('Invalid decision');
  if (actionId === 'hire' && state.staff >= maxStaff) {
    throw new RangeError('Staff capacity limit reached in this demonstration');
  }

  const price = actionId === 'raise' ? round(state.price * 1.08)
    : actionId === 'lower' ? round(state.price * 0.92) : state.price;
  const staff = actionId === 'hire' ? state.staff + 1 : state.staff;
  const brand = Math.min(1.5, round(state.brand + (actionId === 'quality' ? 0.08 : actionId === 'promote' ? 0.015 : 0)));
  const event = eventForDay(state);
  const priceSensitivity = Math.max(0.42, Math.min(1.8, 1 - 0.9 * (price / preset.ticket - 1)));
  const promotion = actionId === 'promote' ? 1.32 : 1;
  const demand = Math.max(0, Math.round(preset.visitors * brand * priceSensitivity * promotion * event.demand));
  const capacity = preset.capacity + (staff - preset.staff) * preset.staffCapacity;
  const served = Math.min(demand, capacity);
  const unserved = Math.max(0, demand - served);
  const revenue = amount(served * price);
  const variableCosts = amount(served * preset.variableCost * event.variable);
  const payroll = amount(staff * preset.dailyPay);
  const actionCost = actionId === 'promote' ? 170 : actionId === 'hire' ? 300 : actionId === 'quality' ? 450 : 0;
  const expenses = amount(preset.dailyOverhead + payroll + variableCosts + actionCost);
  const profit = amount(revenue - expenses);
  const cash = amount(state.cash + profit);
  return {
    day: state.day, actionId, actionName: action.name,
    eventTitle: event.title, eventDescription: event.description,
    demand, capacity, served, unserved, price, staff, brand,
    revenue, expenses, profit, cash,
    costs: { overhead: preset.dailyOverhead, payroll, variableCosts, actionCost }
  };
}

export function previewAction(state, actionId = 'hold') {
  return calculate(state, actionId);
}

export function advanceDay(state, actionId = 'hold') {
  const receipt = calculate(state, actionId);
  const finished = receipt.day === 30 || receipt.cash <= 0;
  return {
    ...state,
    day: state.day + 1,
    price: receipt.price, staff: receipt.staff, brand: receipt.brand,
    cash: receipt.cash,
    totalRevenue: round(state.totalRevenue + receipt.revenue),
    totalExpenses: round(state.totalExpenses + receipt.expenses),
    totalServed: state.totalServed + receipt.served,
    totalUnserved: state.totalUnserved + receipt.unserved,
    history: [...state.history, receipt],
    finished,
    ending: finished ? (receipt.cash <= 0 ? 'cash_exhausted' : 'completed_30_days') : null
  };
}

/**
 * Rewind a committed fictional day without mutating the incoming state.
 * Rebuild totals from immutable receipts; no external business state exists.
 */
export function rewindDay(state) {
  const preset = PRESETS[state?.presetKey];
  if (!preset || !Array.isArray(state.history)) throw new RangeError('Invalid flight state');
  if (state.history.length === 0) return { ...state };
  const history = state.history.slice(0, -1);
  const previous = history.at(-1);
  return {
    ...state,
    day: history.length + 1,
    price: previous ? previous.price : preset.ticket,
    staff: previous ? previous.staff : preset.staff,
    brand: previous ? previous.brand : 1,
    cash: previous ? previous.cash : preset.openingCash,
    totalRevenue: round(history.reduce((sum, item) => sum + item.revenue, 0)),
    totalExpenses: round(history.reduce((sum, item) => sum + item.expenses, 0)),
    totalServed: history.reduce((sum, item) => sum + item.served, 0),
    totalUnserved: history.reduce((sum, item) => sum + item.unserved, 0),
    history,
    finished: false,
    ending: null
  };
}

export function summarizeRun(state) {
  const preset = PRESETS[state.presetKey];
  if (!preset) throw new RangeError('Unknown business');
  const elapsed = state.history.length;
  return {
    elapsed, remaining: Math.max(0, 30 - elapsed),
    startingCash: preset.openingCash,
    endingCash: round(state.cash),
    totalRevenue: round(state.totalRevenue),
    totalExpenses: round(state.totalExpenses),
    modeledProfit: round(state.totalRevenue - state.totalExpenses),
    sold: state.totalServed,
    unmetDemand: state.totalUnserved,
    outcome: state.ending,
    disclaimer: 'Fictional deterministic arithmetic exercise. Scenario assumptions are not market evidence, prediction, financing advice or a real business outcome.'
  };
}
