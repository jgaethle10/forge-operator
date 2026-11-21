// Living Worlds: read-only admission decisions for an owned, authenticated Worlds gateway.
// This module does NOT identify users, issue Passport grants, send messages, or store memories.
// Call only with server-owned presence resolution and block checks. Fail closed.
export const LIVING_LOBBY_SCHEMA = 'evercraft.worlds.living-lobby-policy.v1';
export const WORLDS_PRODUCT = 'evercraft-worlds';
export const LIVING_LOBBIES = Object.freeze({
  business: Object.freeze({label:'Business & Connections', minimum_human_age:'adult', pilot_contact:true}),
  explore: Object.freeze({label:'Explore', minimum_human_age:'undecided', pilot_contact:false}),
  play: Object.freeze({label:'Play', minimum_human_age:'undecided', pilot_contact:false}),
  learn: Object.freeze({label:'Learn', minimum_human_age:'undecided', pilot_contact:false}),
  community: Object.freeze({label:'Community', minimum_human_age:'undecided', pilot_contact:false}),
});
const deny = (reason) => ({schema:LIVING_LOBBY_SCHEMA, decision:'deny', reason});
const proposal = (reason) => ({schema:LIVING_LOBBY_SCHEMA, decision:'proposal_only', reason});
const goodRef = s => typeof s === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(s);
const validHuman = p => p?.kind !== 'human' || p.age_evidence === 'verified_adult';

function presence(resolver, id, lobby) {
  if (!goodRef(id)) return null;
  let p;
  try { p = resolver(id); } catch { return null; }
  if (!p || p.verified !== true || p.active !== true || p.lobby_id !== lobby ||
    !goodRef(p.subject_ref) || !['human','agent'].includes(p.kind)) return null;
  return p;
}
function permitted(passport, subject, scope, resource, at) {
  try {
    return passport.authorize({subject_ref:subject, product:WORLDS_PRODUCT,
      scope, resource_ref:resource, at}).decision === 'allow';
  } catch { return false; }
}
function safeConfig({passport, resolvePresence, isBlocked, lobby_id, at}) {
  if (!passport || typeof passport.authorize !== 'function' ||
    typeof resolvePresence !== 'function' || typeof isBlocked !== 'function') return null;
  if (!LIVING_LOBBIES[lobby_id]?.pilot_contact) return null;
  if (typeof at !== 'string' || !Number.isFinite(Date.parse(at))) return null;
  return {passport,resolvePresence,isBlocked,lobby_id,at,resource:'worlds:lobby:'+lobby_id};
}
function blocked(check, recipient, sender) {
  // A failure reading the server-owned block list must never become consent.
  try { return check(recipient.subject_ref, sender.subject_ref) !== false; }
  catch { return true; }
}

// Returning proposal_only means NO message, disclosure, invitation, meeting, or action
// is dispatched. An authenticated target must accept a specific invitation separately.
export function decideWorldsApproach(options={}) {
  const cfg = safeConfig(options);
  if (!cfg) return deny('gateway_or_lobby_not_ready');
  const from = presence(cfg.resolvePresence, options.from_presence_id, cfg.lobby_id);
  const to = presence(cfg.resolvePresence, options.to_presence_id, cfg.lobby_id);
  if (!from || !to) return deny('presence_not_verified');
  if (from.subject_ref === to.subject_ref) return deny('same_subject');
  if (!validHuman(from) || !validHuman(to)) return deny('adult_gate_not_verified');
  if (blocked(cfg.isBlocked, to, from) || blocked(cfg.isBlocked, from, to)) return deny('blocked');
  if (!permitted(cfg.passport,from.subject_ref,'worlds.contact.initiate',cfg.resource,cfg.at)) return deny('initiator_not_authorized');
  const receiveScope = from.kind === 'human' ? 'worlds.contact.receive.human' : 'worlds.contact.receive.agent';
  if (!permitted(cfg.passport,to.subject_ref,receiveScope,cfg.resource,cfg.at)) return deny('recipient_not_opted_in');
  return proposal('individual_acceptance_required');
}

// An AI facilitator may propose an introduction only when BOTH humans have
// opted into agent-suggested introductions. It may not disclose information,
// invite either person, or complete an introduction from this decision alone.
export function decideWorldsIntroduction(options={}) {
  const cfg = safeConfig(options);
  if (!cfg) return deny('gateway_or_lobby_not_ready');
  const agent = presence(cfg.resolvePresence,options.agent_presence_id,cfg.lobby_id);
  const first = presence(cfg.resolvePresence,options.first_presence_id,cfg.lobby_id);
  const second = presence(cfg.resolvePresence,options.second_presence_id,cfg.lobby_id);
  if (!agent || !first || !second || agent.kind !== 'agent' ||
      first.kind !== 'human' || second.kind !== 'human') return deny('presence_not_verified');
  if (new Set([agent.subject_ref,first.subject_ref,second.subject_ref]).size !== 3) return deny('same_subject');
  if (!validHuman(first) || !validHuman(second)) return deny('adult_gate_not_verified');
  if ([first,second].some(h => blocked(cfg.isBlocked,h,agent) || blocked(cfg.isBlocked,agent,h)) ||
      blocked(cfg.isBlocked,first,second) || blocked(cfg.isBlocked,second,first)) return deny('blocked');
  if (!permitted(cfg.passport,agent.subject_ref,'worlds.introduction.propose',cfg.resource,cfg.at)) return deny('agent_not_authorized');
  if (![first,second].every(h => permitted(cfg.passport,h.subject_ref,'worlds.introduction.suggest',cfg.resource,cfg.at))) return deny('mutual_introduction_consent_missing');
  return proposal('two_individual_acceptances_required');
}
