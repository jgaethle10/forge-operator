/**
 * The Window: fictional social-deduction experiment for existing Mossmere residents.
 * Replayable rule-policy demonstration, not LLM actions or live testimony.
 * No canonical-world mutation, network, money, or real-person records.
 */
export const MYSTERY_SCHEMA = 'evercraft.window.mystery-lab.v1';
const SUSPECT_IDS = Object.freeze(['r2', 'r5', 'r6', 'r7']);
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
export function createMystery(world, seed = 0) {
  if (!world || !Array.isArray(world.actors) || !Number.isSafeInteger(seed) || seed < 0 || seed > 1_000_000)
    throw Error('Invalid mystery scenario input');
  const suspects = SUSPECT_IDS.map(id => {
    const a = world.actors.find(actor => actor.id === id);
    if (!a || typeof a.name !== 'string' || typeof a.job !== 'string')
      throw Error('Required Mossmere resident missing');
    return {id, name:a.name, job:a.job, zone:a.zone};
  });
  const culprit = suspects[(Math.imul(seed+7, 17) >>> 0) % suspects.length];
  const witness = suspects.find(s => s.id !== culprit.id);
  const sourceActor = world.actors.find(a => a.id === witness.id);
  const perceivedTrust = clamp(Number(sourceActor?.bonds?.[culprit.id] ?? 50), 0, 100);
  const clues = [
    {id:'register', category:'access_log', reliability:'record', source:'Workshop ledger',
      text:'The missing blueprint was checked out after closing. The access log lists several possible visitors, not a verified culprit.', implicated:[]},
    {id:'testimony', category:'statement', reliability:'uncorroborated', source:witness.name+' (fictional witness)',
      text:witness.name+' reports seeing '+culprit.name+' carrying a rolled paper near the workshop. They may be mistaken; their existing trust in that resident is '+perceivedTrust+'/100.', implicated:[culprit.id]},
    {id:'inventory', category:'artifact', reliability:'physical_record', source:'Reconstructed inventory',
      text:'A recovered tube bears '+culprit.name+"'s workshop inventory mark. This links the person to the tube, but does not by itself establish intent.", implicated:[culprit.id]},
    {id:'corroboration', category:'independent_check', reliability:'record', source:'Library return ledger',
      text:'An independent return slip records '+culprit.name+' bringing back the missing blueprint during the same evening.', implicated:[culprit.id]}
  ];
  return {schema:MYSTERY_SCHEMA, seed, source:'local_deterministic_rule_scenario', fictional:true,
    worldTick:Number.isFinite(world.tick)?world.tick:null, title:'The Missing Blueprint',
    suspects, clues, revealed:0, answerId:culprit.id, accusation:null, maxReveals:clues.length};
}
function assertCase(s) {
  if (!s || s.schema !== MYSTERY_SCHEMA || !Array.isArray(s.suspects) ||
      !Array.isArray(s.clues) || !Number.isInteger(s.revealed) ||
      s.revealed < 0 || s.revealed > 4 || s.maxReveals !== 4)
    throw Error('Invalid mystery case');
}
export function revealNext(s) {
  assertCase(s);
  if (s.accusation || s.revealed >= s.maxReveals) return s;
  return {...s, revealed:s.revealed+1};
}
export function suspicionScores(s) {
  assertCase(s);
  const scores=Object.fromEntries(s.suspects.map(a=>[a.id,0]));
  for (const clue of s.clues.slice(0,s.revealed)) {
    const weight=clue.reliability==='uncorroborated'?1:3;
    for (const id of clue.implicated) if (Object.hasOwn(scores,id)) scores[id]+=weight;
  }
  return scores;
}
export function accuse(s, id) {
  assertCase(s);
  if (s.accusation) throw Error('Case already resolved');
  if (s.revealed<3) throw Error('Examine at least three clues before making an accusation');
  if (!s.suspects.some(a=>a.id===id)) throw Error('Unknown suspect');
  return {...s, accusation:{suspectId:id,correct:id===s.answerId,revealedAnswer:s.answerId}};
}
