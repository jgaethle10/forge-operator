import {
  assessScenario, cleanText, exportJournal, journalSummary,
  localDay, normalizeStoredEntries, practiceGate,
} from './model.mjs';

const STORAGE_KEY = 'evercraft.daytrade-lens.practice-journal.v1';
const $ = id => document.getElementById(id);
const usd = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value);
const precision = value => Number(value).toLocaleString('en-US', { maximumFractionDigits: 5 });

let entries = [];
let storageAvailable = true;
try {
  entries = normalizeStoredEntries(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'));
} catch {
  entries = [];
  storageAvailable = false;
}

function persist() {
  entries = normalizeStoredEntries(entries);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(entries)); }
  catch {
    storageAvailable = false;
    alert('Browser storage is unavailable. These changes may disappear when you close this page. Export your journal now.');
  }
}

function openView(name) {
  const views = ['overview', 'practice', 'journal', 'team', 'evidence'];
  if (!views.includes(name)) return;
  for (const view of views) {
    const current = view === name;
    $('view-' + view).hidden = !current;
  }
  document.querySelectorAll('[data-view]').forEach(button => {
    const selected = button.dataset.view === name;
    button.classList.toggle('selected', selected);
    if (selected) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  if (name === 'journal') renderJournal();
  if (name === 'practice') renderRisk();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => openView(button.dataset.view)));
document.querySelectorAll('[data-open]').forEach(button => button.addEventListener('click', () => openView(button.dataset.open)));

function planValues() {
  return {
    symbol: $('symbol').value.trim().toUpperCase(),
    setup: $('setup').value,
    notional: $('notional').value,
    entry: $('entry').value,
    stop: $('stop').value,
    target: $('target').value,
    thesis: $('thesis').value.trim(),
  };
}
function showMessage(message, success = false) {
  const node = $('plan-messages');
  node.textContent = message;
  node.classList.toggle('success', success);
}
function renderRisk() {
  const result = assessScenario(planValues());
  $('risk-usd').textContent = result.risk === null ? '—' : usd(result.risk);
  $('risk-rr').textContent = result.rewardRisk === null ? '—' : result.rewardRisk.toFixed(2) + ':1';
  $('risk-reward').textContent = result.reward === null ? '—' : usd(result.reward);
  $('risk-qty').textContent = result.estimatedQuantity === null ? '—' : precision(result.estimatedQuantity);
  const status = $('risk-status');
  status.textContent = result.eligible ? 'MODEL PASSES' : 'NOT READY';
  status.className = 'pill ' + (result.eligible ? 'good' : 'caution');
  const gate = practiceGate(entries);
  $('session-gate').textContent = gate.allowed
    ? gate.plans + ' of 2 plans used today. Self-reported outcome: ' + usd(gate.selfReportedPnL) + '.'
    : gate.reasons.join(' ');
  return result;
}
for (const id of ['symbol', 'notional', 'entry', 'stop', 'target']) {
  $(id).addEventListener('input', renderRisk);
}
$('load-example').addEventListener('click', () => {
  $('symbol').value = 'AAPL';
  $('setup').value = 'Trend continuation';
  $('notional').value = '10';
  $('entry').value = '100';
  $('stop').value = '99.50';
  $('target').value = '101.50';
  $('thesis').value = 'Example only: wait for confirmation; abandon the setup if support breaks. Prices are illustrative, not market data.';
  $('confirm-plan').checked = false;
  showMessage('Example values loaded. These are fictional prices, not a buy recommendation.');
  renderRisk();
});

$('plan-form').addEventListener('submit', event => {
  event.preventDefault();
  const values = planValues();
  const result = renderRisk();
  const gate = practiceGate(entries);
  if (!/^[A-Z]{1,5}$/.test(values.symbol)) {
    showMessage('Use a 1–5 letter U.S. equity symbol for practice.');
    return;
  }
  if (values.thesis.length < 12) {
    showMessage('Write a short thesis (at least 12 characters) before saving.');
    return;
  }
  if (!$('confirm-plan').checked) {
    showMessage('Confirm that you have a plan and are not chasing losses.');
    return;
  }
  if (!result.eligible) {
    showMessage(result.reasons.join(' '));
    return;
  }
  if (!gate.allowed) {
    showMessage(gate.reasons.join(' '));
    return;
  }
  const id = 'plan_' + crypto.randomUUID().replaceAll('-', '');
  entries.unshift({
    id, day: localDay(), createdAt: new Date().toISOString(),
    symbol: values.symbol, setup: cleanText(values.setup, 70),
    thesis: cleanText(values.thesis, 500), lesson: '',
    notional: Number(values.notional), entry: Number(values.entry),
    stop: Number(values.stop), target: Number(values.target),
    risk: result.risk, rewardRisk: result.rewardRisk,
    status: 'planned', result: null, pnl: 0,
  });
  persist();
  $('plan-form').reset();
  renderAll();
  openView('journal');
});

function el(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}
function renderJournal() {
  const list = $('journal-list');
  list.replaceChildren();
  if (entries.length === 0) {
    list.append(el('p', 'empty', 'No practice plans yet. Your first plan starts at the practice desk.'));
    return;
  }
  for (const item of entries) {
    const article = el('article', 'journal-entry');
    const heading = el('div', 'entry-head');
    const h = el('div');
    h.append(el('h3', '', item.symbol + ' · ' + item.setup));
    h.append(el('small', '', item.day + ' · ' + (item.status === 'planned' ? 'Needs review' : 'Reviewed / self-reported')));
    heading.append(h);
    heading.append(el('span', 'pill ' + (item.status === 'planned' ? 'neutral' : 'good'), item.status === 'planned' ? 'PLANNED ONLY' : 'MANUAL REVIEW'));
    article.append(heading);
    article.append(el('p', 'entry-details',
      'Virtual notional ' + usd(item.notional) + ' • Reference ' + usd(item.entry) +
      ' • Stop ' + usd(item.stop) + ' • Target ' + usd(item.target) +
      ' • Modeled risk ' + usd(item.risk) + ' • RR ' + item.rewardRisk.toFixed(2) + ':1'));
    article.append(el('p', 'entry-thesis', item.thesis));
    if (item.status === 'planned') {
      const form = el('form', 'review-form');
      const label = el('label', '', 'Outcome ');
      const select = el('select');
      select.setAttribute('aria-label', 'Practice outcome for ' + item.symbol);
      const skip = document.createElement('option');
      skip.value = 'skipped'; skip.textContent = 'No trade / skipped';
      const sim = document.createElement('option');
      sim.value = 'simulated'; sim.textContent = 'Manual simulated outcome';
      select.append(skip, sim);
      const amount = el('input');
      amount.type = 'number'; amount.step = '0.01'; amount.min = '-20'; amount.max = '20';
      amount.placeholder = 'P&L ($)'; amount.setAttribute('aria-label', 'Self-reported simulated profit or loss in USD');
      amount.disabled = true;
      select.addEventListener('change', () => { amount.disabled = select.value !== 'simulated'; if (amount.disabled) amount.value = ''; });
      const lesson = el('textarea');
      lesson.placeholder = 'What did you learn? (optional)';
      lesson.maxLength = 500;
      lesson.setAttribute('aria-label', 'Lesson from this practice plan');
      const button = el('button', '', 'Record review');
      button.type = 'submit';
      const message = el('div', 'messages');
      label.append(select);
      form.append(label, amount, lesson, button, message);
      form.addEventListener('submit', event => {
        event.preventDefault();
        let pnl = 0;
        if (select.value === 'simulated') {
          if (!amount.value.trim() || !Number.isFinite(Number(amount.value)) || Math.abs(Number(amount.value)) > 20) {
            message.textContent = 'Enter a self-reported P&L from -$20 to $20.';
            return;
          }
          pnl = Number(amount.value);
        }
        entries = entries.map(record => record.id === item.id ? {
          ...record, status: 'reviewed', result: select.value,
          pnl, lesson: cleanText(lesson.value, 500),
        } : record);
        persist();
        renderAll();
      });
      article.append(form);
    } else {
      article.append(el('p', 'review-note',
        item.result === 'skipped' ? 'Decision: skipped. No simulated P&L.' :
        'Manual simulation P&L: ' + usd(item.pnl) + '. Not broker verified.'));
      if (item.lesson) article.append(el('p', 'entry-lesson', item.lesson));
    }
    list.append(article);
  }
}
function renderAll() {
  const summary = journalSummary(entries);
  $('metric-plans').textContent = String(summary.totalPlans);
  $('metric-pending').textContent = String(summary.needsReview);
  $('metric-pnl').textContent = usd(summary.selfReportedNet);
  renderRisk();
  renderJournal();
}
$('export-journal').addEventListener('click', () => {
  const file = new Blob([JSON.stringify(exportJournal(entries), null, 2) + '\n'], { type: 'application/json' });
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'daytrade-lens-local-journal-' + localDay() + '.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$('clear-journal').addEventListener('click', () => {
  if (!entries.length || !confirm('Permanently clear every local DayTrade Lens practice entry in this browser? Export first if you want a copy.')) return;
  entries = [];
  persist();
  renderAll();
});

renderAll();
if (!storageAvailable) {
  $('session-gate').textContent = 'Browser storage may be unavailable. Export entries before closing the page.';
}
