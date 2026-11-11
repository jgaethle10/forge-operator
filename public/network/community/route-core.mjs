// Pure, deterministic discovery routing. No I/O, account operations, payments or collection.
const CATALOG_SCHEMA = 'evercraft.network.community-route-catalog.v0';
const STATES = new Set(['planned', 'discovery', 'human_intake']);
const NORMALIZE_LIMIT = 240;
function phrase(value) {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, NORMALIZE_LIMIT);
}
function safeHref(href) {
  return typeof href === 'string' &&
    /^\/(?!\/)[a-z0-9/-]*$/.test(href) &&
    !href.includes('..') && !href.includes('\\');
}
export function validateCatalog(catalog) {
  if (!catalog || catalog.schema !== CATALOG_SCHEMA) throw Error('catalog_schema_invalid');
  if (catalog.release_state !== 'review_only_not_live' || catalog.execution_authority !== false ||
      catalog.money_movement_enabled !== false || catalog.personal_data_collected !== false) {
    throw Error('catalog_authority_boundary_invalid');
  }
  if (!Array.isArray(catalog.goals) || !Array.isArray(catalog.nodes) ||
      !Array.isArray(catalog.relationships)) throw Error('catalog_shape_invalid');
  const nodes = new Map();
  for (const node of catalog.nodes) {
    if (!node || !/^[a-z0-9-]+$/.test(node.id || '') || nodes.has(node.id)) throw Error('node_id_invalid');
    if (!STATES.has(node.state)) throw Error('node_state_invalid');
    if (node.state === 'planned' ? node.href !== null : !safeHref(node.href)) {
      throw Error('node_href_invalid');
    }
    if (!node.title || !node.description || !node.boundary) throw Error('node_evidence_missing');
    nodes.set(node.id, node);
  }
  const goals = new Set();
  for (const goal of catalog.goals) {
    if (!goal || !/^[a-z0-9-]+$/.test(goal.id || '') || goals.has(goal.id)) {
      throw Error('goal_id_invalid');
    }
    if (!goal.title || !Array.isArray(goal.keywords) || !Array.isArray(goal.nodes)) {
      throw Error('goal_shape_invalid');
    }
    if (!goal.keywords.every(k => typeof k === 'string' && phrase(k))) {
      throw Error('goal_keywords_invalid');
    }
    if (!goal.nodes.length || !goal.nodes.every(id => nodes.has(id))) throw Error('goal_nodes_invalid');
    goals.add(goal.id);
  }
  for (const edge of catalog.relationships) {
    if (!nodes.has(edge.from) || !nodes.has(edge.to) || !edge.kind) {
      throw Error('relationship_invalid');
    }
  }
  return true;
}
const publicView = node => ({
  id: node.id,
  title: node.title,
  state: node.state,
  href: node.href,
  description: node.description,
  boundary: node.boundary,
  action: node.state === 'planned' ? 'Not available yet'
    : node.state === 'human_intake' ? 'Review and choose whether to contact' : 'Explore public information'
});
export function resolveNetworkNeed(input = {}, catalog) {
  validateCatalog(catalog);
  const raw = phrase(input?.query);
  if (/\b(911|life-threatening emergency|immediate danger|suicide attempt)\b/.test(raw)) {
    return {
      schema: 'evercraft.network.community-resolution.v0',
      state: 'outside_directory_emergency',
      goal_id: null,
      available: [],
      planned: [],
      notice: 'Evercraft Network is not an emergency-response service. Contact appropriate emergency services.',
      external_side_effects_authorized: false
    };
  }
  const explicit = phrase(input?.goal_id);
  let selected = catalog.goals.find(g => g.id === explicit);
  if (!selected && raw) {
    const scored = catalog.goals.map(g => ({
      goal: g,
      score: g.keywords.reduce((total, item) => {
        const key = phrase(item);
        return total + (raw.includes(key) ? 2 + Math.min(3, key.split(' ').length) : 0);
      }, 0)
    })).filter(x => x.score > 0).sort((a,b) => b.score - a.score ||
      catalog.goals.indexOf(a.goal) - catalog.goals.indexOf(b.goal));
    selected = scored[0]?.goal;
  }
  if (!selected) {
    return {
      schema: 'evercraft.network.community-resolution.v0',
      state: 'no_verified_route',
      goal_id: null,
      available: [],
      planned: [],
      notice: 'No substantiated route matches yet. This preview will not invent a provider or job.',
      external_side_effects_authorized: false
    };
  }
  const byId = new Map(catalog.nodes.map(n => [n.id, n]));
  const routeNodes = selected.nodes.map(id => publicView(byId.get(id)));
  return {
    schema: 'evercraft.network.community-resolution.v0',
    state: 'matched',
    goal_id: selected.id,
    goal_title: selected.title,
    available: routeNodes.filter(n => n.state !== 'planned'),
    planned: routeNodes.filter(n => n.state === 'planned'),
    notice: 'These are discovery and human-directed handoffs, not enrollments, jobs, earnings or bookings.',
    external_side_effects_authorized: false
  };
}
