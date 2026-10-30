/**
 * Evercraft Founders Arena, owned agent-decision competition protocol v1.
 * Clean-room experimental ruleset, NOT the unrecovered 2026 Base44 league backend.
 * Node >=20. No network, tool invocation, LLM provider, or filesystem side effects.
 */
import { createHash } from 'node:crypto';

export const SCHEMAS = Object.freeze({
  world: 'evercraft.founders-arena.world.v1',
  observation: 'evercraft.founders-arena.observation.v1',
  decision: 'evercraft.founders-arena.decision.v1',
  receipt: 'evercraft.founders-arena.receipt.v1',
});
export const ACTIONS = Object.freeze(['cultivate', 'research', 'build', 'expand', 'fortify', 'aid', 'rest']);
export const DEFAULT_ROSTER = Object.freeze(['Systemia', 'Forge', 'Mnemosyne', 'Raven']);
const MAX_AGENTS = 19;
const clone = value => JSON.parse(JSON.stringify(value));
const exactKeys = (value, keys) => Object.keys(value).every(k => keys.includes(k));
const hash = obj => createHash('sha256').update(JSON.stringify(obj)).digest('hex');

export function createWorld({seed = 42, roster = DEFAULT_ROSTER} = {}) {
  if (!Number.isSafeInteger(seed) || seed < 1 || seed > 0xffffffff) throw Error('Invalid seed');
  if (!Array.isArray(roster) || roster.length < 2 || roster.length > MAX_AGENTS ||
      roster.some(id => typeof id !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{0,31}$/.test(id)) ||
      new Set(roster).size !== roster.length) throw Error('Invalid roster');
  return {
    schema: SCHEMAS.world, version: 1, seed, rng: seed, turn: 0, weather: 'clear',
    players: roster.map(id => ({id, territory: 1, food: 20, knowledge: 0, infrastructure: 0,
      defense: 2, influence: 0, energy: 80, last_action: null})),
    events: [],
  };
}

export function score(player) {
  return player.territory * 20 + player.food + player.knowledge * 4 +
    player.infrastructure * 10 + player.defense * 3 + player.influence * 3 +
    Math.floor(player.energy / 5);
}

export function standings(world) {
  return world.players.map(p => ({id:p.id, score: score(p), territory:p.territory,
    food:p.food, knowledge:p.knowledge, energy:p.energy}))
    .sort((a,b) => b.score - a.score || a.id.localeCompare(b.id));
}

export function observe(world, id) {
  assertWorld(world);
  const self = world.players.find(p => p.id === id);
  if (!self) throw Error('Unknown agent');
  return {
    schema: SCHEMAS.observation, turn:world.turn + 1,
    self: clone(self),
    public: {weather:world.weather, standings:standings(world).map(({id,score,territory}) => ({id,score,territory}))},
    opponents: world.players.filter(p => p.id !== id).map(p => ({id:p.id, score:score(p),
      territory:p.territory})),
    allowed_actions:ACTIONS,
    note:'Actions are simulation-only. No browser, network, files, secrets, or real-world tools.',
  };
}

function assertWorld(world) {
  if (!world || world.schema !== SCHEMAS.world || !Number.isSafeInteger(world.turn) ||
      world.turn < 0 || !Array.isArray(world.players) || !Array.isArray(world.events))
    throw Error('Invalid world');
}

export function validateDecisions(world, decisions) {
  assertWorld(world);
  if (!Array.isArray(decisions) || decisions.length !== world.players.length) throw Error('One decision required per agent');
  const known = new Set(world.players.map(p=>p.id));
  const seen = new Set();
  for (const d of decisions) {
    if (!d || typeof d !== 'object' || Array.isArray(d) || !exactKeys(d, ['schema','turn','agent_id','action','target_id']) ||
        d.schema !== SCHEMAS.decision || d.turn !== world.turn + 1 || !known.has(d.agent_id) ||
        !ACTIONS.includes(d.action) || seen.has(d.agent_id)) throw Error('Invalid or duplicate agent decision');
    seen.add(d.agent_id);
    if (d.action === 'aid') {
      if (!known.has(d.target_id) || d.target_id === d.agent_id) throw Error('Aid requires a different valid target');
    } else if (d.target_id !== undefined && d.target_id !== null) {
      throw Error('Unexpected target on non-aid action');
    }
  }
  // Canonical agent order is independent of arrival/order of network messages.
  return world.players.map(p => {
    const d = decisions.find(d => d.agent_id === p.id);
    return {schema:SCHEMAS.decision,turn:d.turn,agent_id:p.id,action:d.action,
      target_id:d.action === 'aid' ? d.target_id : null};
  });
}

function random(world) {
  world.rng = (Math.imul(world.rng,1664525) + 1013904223) >>> 0;
  return world.rng / 4294967296;
}
const clamp = x => Math.max(0, Math.min(100, x));
function log(world, id, kind, result) { world.events.push({turn:world.turn,agent_id:id,kind,result}); }

export function advance(world, proposals) {
  const decisions = validateDecisions(world, proposals);
  const next = clone(world);
  next.turn++;
  const roll = random(next);
  next.weather = roll < .12 ? 'storm' : roll < .24 ? 'drought' : 'clear';
  for (const d of decisions) {
    const p = next.players.find(p=>p.id===d.agent_id);
    const before = score(p);
    let result = 'completed';
    switch (d.action) {
      case 'cultivate': p.food+=6; p.energy=clamp(p.energy-8); break;
      case 'research':
        if (p.food < 4) {result='insufficient food';break;}
        p.food-=4;p.knowledge+=3;p.energy=clamp(p.energy-9);break;
      case 'build':
        if (p.food < 5) {result='insufficient food';break;}
        p.food-=5;p.infrastructure+=2;p.energy=clamp(p.energy-10);break;
      case 'expand':
        if (p.food < 7 || p.knowledge < 2) {result='requires 7 food and 2 knowledge';break;}
        p.food-=7;p.knowledge-=2;p.territory++;p.energy=clamp(p.energy-12);break;
      case 'fortify':
        if (p.food < 3) {result='insufficient food';break;}
        p.food-=3;p.defense+=2;p.energy=clamp(p.energy-6);break;
      case 'aid': {
        if (p.food < 4) {result='insufficient food';break;}
        const recipient=next.players.find(p=>p.id===d.target_id);
        p.food-=4;recipient.food+=4;p.influence+=2;p.energy=clamp(p.energy-4);
        result=`transferred 4 food to ${recipient.id}`;break;
      }
      case 'rest': p.energy=clamp(p.energy+22);break;
    }
    p.last_action=d.action;
    log(next,p.id,d.action,{status:result,score_before:before,score_after_action:score(p)});
  }
  for (const p of next.players) {
    const penalty = next.weather === 'storm' ? 3 : next.weather === 'drought' ? 2 : 0;
    p.food=Math.max(0,p.food-2-penalty);
    if (p.food === 0) p.energy=clamp(p.energy-12);
  }
  log(next,null,'environment',{weather:next.weather,upkeep:2,
    penalty:next.weather === 'storm' ? 3 : next.weather === 'drought' ? 2 : 0});
  return {world:next, decisions};
}

export function createMatch({seed=42, roster=DEFAULT_ROSTER}={}) {
  const initial=createWorld({seed,roster});
  return {schema:SCHEMAS.receipt, seed, roster:[...roster],
    initial, turns:[], final:clone(initial), digest:null};
}

export function recordTurn(match, submittedDecisions) {
  if (!match || match.schema !== SCHEMAS.receipt) throw Error('Invalid match');
  if (match.turns.length >= 500) throw Error('Maximum 500 turns');
  const prior=match.final;
  const {world,decisions}=advance(prior,submittedDecisions);
  const turn={turn:world.turn,decisions,decision_digest:hash(decisions),
    snapshot_digest:hash(world),snapshot:world};
  match.turns.push(turn);
  match.final=world;
  match.digest=hash({seed:match.seed,roster:match.roster,
    turns:match.turns.map(({turn,decision_digest,snapshot_digest})=>({turn,decision_digest,snapshot_digest}))});
  return match;
}

export function verifyMatch(match) {
  if (!match || match.schema !== SCHEMAS.receipt || !Number.isInteger(match.seed) ||
      !Array.isArray(match.turns) || match.turns.length > 500) throw Error('Invalid match shape');
  let world=createWorld({seed:match.seed,roster:match.roster});
  if (JSON.stringify(world)!==JSON.stringify(match.initial)) throw Error('Initial state changed');
  for (const [i,turn] of match.turns.entries()) {
    if (!turn || turn.turn !== i+1) throw Error('Invalid turn sequence');
    const replay=advance(world,turn.decisions);
    world=replay.world;
    if (hash(replay.decisions)!==turn.decision_digest || hash(world)!==turn.snapshot_digest ||
        JSON.stringify(world)!==JSON.stringify(turn.snapshot)) throw Error('Replay mismatch at turn '+turn.turn);
  }
  if (JSON.stringify(world)!==JSON.stringify(match.final)) throw Error('Final state mismatch');
  const expected=match.turns.length ? hash({seed:match.seed,roster:match.roster,
    turns:match.turns.map(({turn,decision_digest,snapshot_digest})=>({turn,decision_digest,snapshot_digest}))}) : null;
  if (match.digest!==expected) throw Error('Receipt digest mismatch');
  return true;
}

export function decision(turn,agent_id,action,target_id=null){
  return {schema:SCHEMAS.decision,turn,agent_id,action,target_id};
}
