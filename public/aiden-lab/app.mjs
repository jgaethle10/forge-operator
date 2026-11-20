import { TOPICS, CATEGORIES, STATE_LABELS } from './catalog.mjs';
import { LEARNING_WORLDS, WORLD_STATES } from './learning-worlds.mjs';
import './universe.mjs';

const $ = (id) => document.getElementById(id);
const grid = $('topicGrid');
const filters = $('filters');
const search = $('search');
const dialog = $('topicDialog');
const shelfKey = 'evercraft.aidens-lab.reading-shelf.v1';
const validIds = new Set(TOPICS.map((topic) => topic.id));
let selectedCategory = 'All';
let savedOnly = false;
let saved = new Set();

try {
  const stored = JSON.parse(localStorage.getItem(shelfKey) || '[]');
  if (Array.isArray(stored)) saved = new Set(stored.filter((id) => validIds.has(id)));
} catch { /* Private browsing/storage disabled; the shelf still works in this tab. */ }

function node(tag, className, content) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (content !== undefined) element.textContent = content;
  return element;
}

let chosenWorldId = 'infinite-classroom';
let showAllTopics = false;

function selectWorld(id, { scroll = false } = {}) {
  const world = LEARNING_WORLDS.find((entry) => entry.id === id);
  if (!world) return;
  chosenWorldId = id;
  const spotlight = $('worldSpotlight');
  if (!spotlight) return;
  spotlight.dataset.world = world.id;
  $('spotlightIcon').textContent = world.icon;
  $('spotlightKind').textContent = world.kind.toUpperCase();
  $('worldSpotlightTitle').textContent = world.title;
  $('spotlightDescription').textContent = world.description;
  $('spotlightStatus').textContent = WORLD_STATES[world.state];
  $('spotlightEvidence').textContent = world.evidence;
  const action = $('spotlightLink');
  action.textContent = world.action + ' ↗';
  action.href = world.url;
  if (world.url.startsWith('https://')) {
    action.target = '_blank';
    action.rel = 'noopener noreferrer';
  } else {
    action.removeAttribute('target');
    action.removeAttribute('rel');
  }
  for (const button of document.querySelectorAll('[data-world-id]')) {
    button.setAttribute('aria-pressed', String(button.dataset.worldId === id));
  }
  if (scroll) spotlight.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center' });
}

function buildLearningWorlds() {
  const host = $('learningWorldGrid');
  if (!host) return;
  host.replaceChildren();
  for (const world of LEARNING_WORLDS) {
    const tile = node('button', 'learning-world-tile');
    tile.type = 'button';
    tile.dataset.worldId = world.id;
    tile.dataset.state = world.state;
    tile.setAttribute('aria-label', 'Discover ' + world.title + '. ' + WORLD_STATES[world.state]);
    const icon = node('span', 'tile-planet', world.icon);
    icon.setAttribute('aria-hidden', 'true');
    const name = node('strong', 'tile-name', world.title);
    const kind = node('small', 'tile-subtitle', world.kind);
    tile.append(icon, name, kind);
    tile.addEventListener('click', () => selectWorld(world.id, { scroll: true }));
    host.append(tile);
  }
  for (const button of document.querySelectorAll('.universe-node')) {
    button.addEventListener('click', () => selectWorld(button.dataset.worldId, { scroll: true }));
  }
  selectWorld('infinite-classroom');
}

function persistShelf() {
  try { localStorage.setItem(shelfKey, JSON.stringify([...saved])); }
  catch { /* Explicitly local-first and usable with storage disabled. */ }
}

function visibleTopics() {
  const query = search.value.trim().toLocaleLowerCase().slice(0, 100);
  return TOPICS.filter((topic) =>
    (!savedOnly || saved.has(topic.id)) &&
    (selectedCategory === 'All' || topic.category === selectedCategory) &&
    (!query || [topic.title, topic.category, topic.summary, topic.question, topic.evidence, topic.unknown].some(
      (value) => value.toLocaleLowerCase().includes(query)
    ))
  );
}

function buildFilters() {
  filters.replaceChildren();
  for (const category of CATEGORIES) {
    const button = node('button', 'filter', category);
    button.type = 'button';
    button.setAttribute('aria-pressed', String(selectedCategory === category));
    button.addEventListener('click', () => {
      selectedCategory = category;
      buildFilters();
      render();
    });
    filters.append(button);
  }
}

function saveTopic(id) {
  if (saved.has(id)) saved.delete(id);
  else saved.add(id);
  persistShelf();
  render();
}

function openTopic(topic) {
  $('dialogCategory').textContent = topic.category + ' / ' + STATE_LABELS[topic.state];
  $('dialogIcon').textContent = topic.icon;
  $('dialogTitle').textContent = topic.title;
  $('dialogIntro').textContent = topic.summary;
  $('dialogQuestion').textContent = topic.question;
  $('dialogEvidence').textContent = topic.evidence;
  $('dialogOpen').textContent = topic.unknown;
  const links = $('dialogLinks');
  links.replaceChildren();
  for (const source of topic.links) {
    const link = node('a', '', source.label + ' ↗');
    link.href = source.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    links.append(link);
  }
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
}

function buildCard(topic) {
  const card = node('article', 'topic-card');
  const top = node('div', 'card-top');
  const icon = node('div', 'topic-icon', topic.icon);
  icon.setAttribute('aria-hidden', 'true');
  const bookmark = node('button', 'bookmark', saved.has(topic.id) ? '★' : '☆');
  bookmark.type = 'button';
  bookmark.setAttribute('aria-label', (saved.has(topic.id) ? 'Remove ' : 'Save ') + topic.title + (saved.has(topic.id) ? ' from reading shelf' : ' to reading shelf'));
  bookmark.setAttribute('aria-pressed', String(saved.has(topic.id)));
  bookmark.addEventListener('click', () => saveTopic(topic.id));
  top.append(icon, bookmark);
  const category = node('p', 'card-category', topic.category.toUpperCase());
  const title = node('h3', '', topic.title);
  const excerpt = node('p', 'card-excerpt', topic.summary);
  const foot = node('div', 'card-foot');
  foot.append(node('span', '', STATE_LABELS[topic.state]));
  const open = node('button', 'open-topic', 'Enter room ↗');
  open.type = 'button';
  open.setAttribute('aria-label', 'Explore ' + topic.title);
  open.addEventListener('click', () => openTopic(topic));
  foot.append(open);
  card.append(top, category, title, excerpt, foot);
  return card;
}

function render() {
  const items = visibleTopics();
  $('savedFilter').setAttribute('aria-pressed', String(savedOnly));
  $('savedCount').textContent = String(saved.size);
  $('resultsCount').textContent = items.length + (items.length === 1 ? ' science room' : ' science rooms') + ' to explore';
  $('empty').hidden = items.length !== 0;
  const view = showAllTopics || selectedCategory !== 'All' || savedOnly || search.value.trim() ? items : items.slice(0, 6);
  grid.replaceChildren(...view.map(buildCard));
  const more = $('showMoreTopics');
  more.hidden = view.length === items.length;
  more.textContent = 'Explore all ' + items.length + ' science rooms ↗';
}

$('savedFilter').addEventListener('click', () => { savedOnly = !savedOnly; render(); });
$('showMoreTopics').addEventListener('click', () => { showAllTopics = true; render(); });
search.addEventListener('input', render);
$('surprise').addEventListener('click', () => {
  const pool = visibleTopics();
  const candidates = pool.length ? pool : TOPICS;
  const topic = candidates[Math.floor(Math.random() * candidates.length)];
  openTopic(topic);
});
$('reset').addEventListener('click', () => {
  selectedCategory = 'All';
  savedOnly = false;
  search.value = '';
  showAllTopics = false;
  buildFilters();
  render();
  search.focus();
});
$('dialogClose').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (event) => {
  if (event.target === dialog) dialog.close();
});

buildLearningWorlds();
buildFilters();
render();
