import { validateCatalog, resolveNetworkNeed } from './route-core.mjs';

const form = document.getElementById('need-form');
const input = document.getElementById('need-input');
const goals = document.getElementById('goal-choices');
const results = document.getElementById('results');
const status = document.getElementById('load-status');
let catalog = null;

const element = (tag, className, value) => {
  const item = document.createElement(tag);
  if (className) item.className = className;
  if (value != null) item.textContent = value;
  return item;
};

const statusLabel = {
  discovery: 'Public information',
  human_intake: 'Human-directed inquiry',
  planned: 'Not available yet'
};

// Owned project paths can be /network/... or /forge-operator/network/... on GitHub Pages.
function sitePrefix() {
  const path = window.location.pathname;
  const at = path.indexOf('/network/community/');
  return at < 0 ? '' : path.slice(0, at);
}
function showRoutes(items, heading) {
  if (!items.length) return;
  results.append(element('h3', 'result-subheading', heading));
  const grid = element('div', 'results-grid');
  for (const node of items) {
    const card = element('article', 'route-card');
    card.append(element('span', 'route-state', statusLabel[node.state]));
    card.append(element('h4', '', node.title));
    card.append(element('p', '', node.description));
    card.append(element('p', 'boundary', node.boundary));
    if (node.href) {
      const link = element('a', 'link', node.action);
      link.href = sitePrefix() + node.href;
      card.append(link);
    } else {
      card.append(element('p', 'held', 'Connection not open yet'));
    }
    grid.append(card);
  }
  results.append(grid);
}
function display(inputValue) {
  const outcome = resolveNetworkNeed(inputValue, catalog);
  results.replaceChildren();
  results.append(element('h2', '', outcome.goal_title || 'Connection results'));
  results.append(element('p', 'explanation', outcome.notice));
  showRoutes(outcome.available, 'Existing discovery and inquiry paths');
  showRoutes(outcome.planned, 'Connections we are still building');
  results.hidden = false;
  results.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
async function load() {
  try {
    const response = await fetch('./routes.json', { cache: 'no-store', credentials: 'omit' });
    if (!response.ok) throw Error('catalog_unavailable');
    const body = await response.json();
    validateCatalog(body);
    catalog = body;
    const buttons = element('div', 'goals-grid');
    for (const goal of body.goals) {
      const choice = element('button', 'goal-button');
      choice.type = 'button';
      choice.append(element('strong', '', goal.title));
      choice.append(element('span', '', goal.detail));
      choice.addEventListener('click', () => display({ goal_id: goal.id }));
      buttons.append(choice);
    }
    goals.replaceChildren(buttons);
    form.querySelector('button[type="submit"]').disabled = false;
    status.textContent = 'Choose a starting point or describe what you need.';
  } catch {
    status.textContent = 'The connection directory could not be loaded. No routes can be verified at the moment.';
  }
}
form.addEventListener('submit', event => {
  event.preventDefault();
  if (!catalog) return;
  display({ query: input.value });
});
void load();
