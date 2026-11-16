import { PRESETS, ACTIONS, newRun, eventForDay, previewAction, advanceDay, rewindDay, summarizeRun } from './engine.mjs';

const id = name => document.getElementById(name);
const money = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
const priceMoney = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(value);
let state = null;
let selectedAction = 'hold';

function show(element, visible) { element.hidden = !visible; }
function text(element, value) { element.textContent = String(value); }

function showSetup() {
  state = null;
  selectedAction = 'hold';
  show(id('setup'), true);
  show(id('cockpit'), false);
  show(id('finish'), false);
  updateBusinessDetail();
}

function updateBusinessDetail() {
  const p = PRESETS[id('business').value] || PRESETS.service;
  text(id('business-detail'), p.description + ' Opening cash: ' + money(p.openingCash) + '.');
}

function renderChoices() {
  const list = id('choices');
  list.replaceChildren();
  for (const action of ACTIONS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'choice';
    button.setAttribute('aria-pressed', String(action.id === selectedAction));
    button.disabled = action.id === 'hire' && state.staff >= 6;
    const heading = document.createElement('strong');
    heading.textContent = action.name;
    const detail = document.createElement('small');
    detail.textContent = action.detail;
    button.append(heading, detail);
    button.addEventListener('click', () => {
      selectedAction = action.id;
      renderChoices();
      renderPreview();
    });
    list.appendChild(button);
  }
}

function renderPreview() {
  const p = previewAction(state, selectedAction);
  const hold = previewAction(state, 'hold');
  const deltaFromHold = p.profit - hold.profit;
  text(id('compare-note'), selectedAction === 'hold'
    ? 'Holding course is the comparison baseline for today.'
    : 'Compared with holding course today: ' + (deltaFromHold >= 0 ? '+' : '') + money(deltaFromHold) +
      ' modeled daily contribution. This is a same-day comparison, not a long-term projection.');
  text(id('estimate-net'), money(p.profit));
  text(id('estimate-cash'), money(p.cash));
  text(id('estimate-demand'), p.demand);
  text(id('estimate-served'), p.served + ' of ' + p.capacity + ' slots');
  text(id('estimate-revenue'), money(p.revenue));
  text(id('estimate-expenses'), money(p.expenses));
  const note = 'Today: ' + money(p.costs.overhead) + ' fixed, ' + money(p.costs.payroll) +
    ' payroll, ' + money(p.costs.variableCosts) + ' variable cost' +
    (p.costs.actionCost ? ', and ' + money(p.costs.actionCost) + ' special action cost.' : '.') +
    ' Customer count is a simplified assumption, not observed demand.';
  text(id('preview-explain'), note);
}

function renderAssumptions() {
  const p = PRESETS[state.presetKey];
  const rows = [
    ['Base customers / day', String(p.visitors) + ' before scenario effects'],
    ['Fixed overhead / day', money(p.dailyOverhead)],
    ['Cost per completed sale', priceMoney(p.variableCost)],
    ['Payroll per staff / day', money(p.dailyPay)],
    ['Experience multiplier', (state.brand * 100).toFixed(1) + '%'],
    ['Price response', 'Simplified fixed sensitivity']
  ];
  const list = id('assumptions');
  list.replaceChildren();
  for (const [key, value] of rows) {
    const row = document.createElement('li');
    const label = document.createElement('span');
    const strong = document.createElement('strong');
    label.textContent = key;
    strong.textContent = value;
    row.append(label, strong);
    list.appendChild(row);
  }
}

function renderLedger() {
  const ledger = id('ledger');
  ledger.replaceChildren();
  if (!state.history.length) {
    const paragraph = document.createElement('p');
    paragraph.textContent = 'No simulated days completed yet.';
    ledger.appendChild(paragraph);
    return;
  }
  for (const item of state.history.slice().reverse().slice(0, 30)) {
    const row = document.createElement('div');
    row.className = 'receipt';
    const day = document.createElement('span');
    day.className = 'day';
    day.textContent = 'DAY ' + item.day;
    const detail = document.createElement('div');
    const action = document.createElement('strong');
    action.textContent = item.actionName;
    const event = document.createElement('small');
    event.textContent = item.eventTitle + ' · ' + item.served + ' served / ' + item.unserved + ' unserved';
    detail.append(action, event);
    const result = document.createElement('div');
    result.className = 'right';
    const profit = document.createElement('strong');
    profit.textContent = (item.profit >= 0 ? '+' : '') + money(item.profit);
    profit.style.color = item.profit >= 0 ? 'var(--good)' : 'var(--bad)';
    const cash = document.createElement('small');
    cash.textContent = money(item.cash) + ' cash';
    result.append(profit, cash);
    row.append(day, detail, result);
    ledger.appendChild(row);
  }
}

function renderSpark() {
  const chart = id('spark');
  chart.replaceChildren();
  if (!state.history.length) {
    chart.setAttribute('aria-label', 'No modeled results yet');
    return;
  }
  const max = Math.max(1, ...state.history.map(item => Math.abs(item.profit)));
  for (const item of state.history) {
    const bar = document.createElement('i');
    bar.className = item.profit < 0 ? 'loss' : '';
    bar.style.height = Math.max(8, Math.round(Math.abs(item.profit) / max * 64)) + 'px';
    bar.title = 'Day ' + item.day + ': ' + money(item.profit) + ' net';
    chart.appendChild(bar);
  }
  chart.setAttribute('aria-label', 'Modeled daily contribution through day ' + state.history.length);
}

function renderFinish() {
  const summary = summarizeRun(state);
  show(id('finish'), true);
  const good = summary.modeledProfit >= 0;
  text(id('finish-title'), summary.outcome === 'cash_exhausted' ? 'Cash exhausted on day ' + summary.elapsed :
    'You completed the 30-day flight.');
  text(id('finish-details'), 'You began with ' + money(summary.startingCash) + ', booked ' +
    money(summary.totalRevenue) + ' in modeled sales, incurred ' + money(summary.totalExpenses) +
    ' in modeled costs, and ended with ' + money(summary.endingCash) +
    '. Modeled net: ' + (good ? '+' : '') + money(summary.modeledProfit) + '. You served ' +
    summary.sold + ' fictional orders and had ' + summary.unmetDemand +
    ' units of unmet modeled demand. This is a training exercise, not a business prediction.');
  id('finish').focus();
}

function render() {
  if (!state) return;
  show(id('setup'), false);
  show(id('cockpit'), true);
  text(id('flight-label'), PRESETS[state.presetKey].name.toUpperCase() + ' / FLIGHT RECORDER');
  text(id('day-title'), state.finished ? 'Flight ended after ' + state.history.length + ' days' : 'Day ' + state.day + ' of 30');
  id('progress').style.width = String(state.history.length / 30 * 100) + '%';
  text(id('cash'), money(state.cash));
  text(id('revenue'), money(state.totalRevenue));
  text(id('net'), money(state.totalRevenue - state.totalExpenses));
  id('net').className = 'value ' + (state.totalRevenue - state.totalExpenses >= 0 ? 'pos' : 'neg');
  text(id('price'), priceMoney(state.price));
  text(id('staff'), state.staff + ' staff modeled');
  id('rewind').disabled = state.history.length === 0;
  renderAssumptions();
  renderSpark();
  renderLedger();
  if (state.finished) {
    text(id('event-title'), 'End of flight');
    text(id('event-desc'), 'This run has reached its end.');
    id('choices').replaceChildren();
    id('advance').disabled = true;
    renderFinish();
  } else {
    show(id('finish'), false);
    const event = eventForDay(state);
    text(id('event-title'), event.title);
    text(id('event-desc'), event.description);
    id('advance').disabled = false;
    renderChoices();
    renderPreview();
  }
}

id('business').addEventListener('change', updateBusinessDetail);
id('start').addEventListener('click', () => {
  state = newRun(id('business').value);
  selectedAction = 'hold';
  render();
  id('cockpit').scrollIntoView({ behavior: 'smooth', block: 'start' });
});
id('advance').addEventListener('click', () => {
  if (!state || state.finished) return;
  state = advanceDay(state, selectedAction);
  selectedAction = 'hold';
  render();
});
id('restart').addEventListener('click', showSetup);
id('rewind').addEventListener('click', () => {
  if (!state || !state.history.length) return;
  state = rewindDay(state);
  selectedAction = 'hold';
  render();
  id('cockpit').scrollIntoView({ behavior: 'smooth', block: 'start' });
});
id('replay').addEventListener('click', showSetup);
id('export').addEventListener('click', () => {
  if (!state) return;
  const payload = {
    schema: 'evercraft.remote-ops.flight-receipt.v1',
    model: 'fictional_assumption_arithmetic',
    disclaimer: summarizeRun(state).disclaimer,
    preset: PRESETS[state.presetKey],
    summary: summarizeRun(state),
    history: state.history
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'remote-ops-' + state.presetKey + '-fictional-flight.json';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
});
updateBusinessDetail();
