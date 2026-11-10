/**
 * Evidence-labeled, read-only civic/social policy decision projection.
 * This is NOT a model action log, a digital signature or an admission receipt.
 * Deliberately attached to the existing persisted Window heartbeat state.
 */
import {createHash} from 'node:crypto';

export const RECEIPT_SCHEMA='evercraft.window.policy-decision-receipts.v1';
export const MAX_DECISION_RECEIPTS=48;
const POLICY_SOURCES=new Set(['rule_policy_v1','social_policy_v1']);
const POLICY_TYPES=new Set([
  'proposal','pledge','refusal','funded','failure','construction','project_completed',
  'promise_made','promise_kept','promise_broken','invitation_declined'
]);
const sha256=s=>createHash('sha256').update(s).digest('hex');
const validId=id=>typeof id==='string'&&/^e[1-9][0-9]{0,12}$/.test(id);
const safeText=(value,limit)=>typeof value==='string'?value.slice(0,limit):'';

export function projectDecisionReceipts(world,startEventId,{limit=MAX_DECISION_RECEIPTS}={}){
  if(!world||!Array.isArray(world.events)||!Array.isArray(world.actors)||
     !Number.isSafeInteger(world.next_event_id)||world.next_event_id<1||
     !Number.isSafeInteger(startEventId)||startEventId<1||startEventId>world.next_event_id||
     !Number.isSafeInteger(limit)||limit<1||limit>MAX_DECISION_RECEIPTS)
    throw Error('Invalid society receipt projection inputs');
  const actorIds=new Set(world.actors.map(a=>a.id));
  if(actorIds.size!==world.actors.length)throw Error('Duplicated resident identity');
  const expected=world.next_event_id-startEventId;
  const retained=world.events.filter(e=>{
    if(!e||!validId(e.id))throw Error('Invalid event ID in heartbeat ledger');
    const n=Number(e.id.slice(1));
    return n>=startEventId&&n<world.next_event_id;
  });
  const seen=new Set(retained.map(e=>e.id));
  if(seen.size!==retained.length)throw Error('Duplicate event in heartbeat ledger');
  const policy=retained.filter(e=>POLICY_SOURCES.has(e.source)&&POLICY_TYPES.has(e.type));
  const selected=policy.slice(0,limit);
  const receipts=selected.map(e=>{
    if(!actorIds.has(e.agent))throw Error('Unknown decision actor');
    if(e.other_agent!=null&&!actorIds.has(e.other_agent))throw Error('Unknown related resident');
    if(!Number.isSafeInteger(e.day)||e.day<1||typeof e.time!=='string'||!/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/.test(e.time))throw Error('Invalid decision time');
    const evidence={
      event_id:e.id,
      source:e.source,
      event_type:e.type,
      actor_id:e.agent,
      related_actor_id:e.other_agent??null,
      day:e.day,
      time:e.time,
      description:safeText(e.description,240)
    };
    return {...evidence,
      authority:'window_civic_social_rule_policy',
      inference:'none',
      external_actions:false,
      fictional:true,
      content_sha256:sha256(JSON.stringify(evidence))
    };
  });
  return {
    schema:RECEIPT_SCHEMA,
    status:'source_policy_projection_only',
    execution_mode:'deterministic_rules_no_llm',
    attestation:'content_digest_not_signature',
    event_id_floor:startEventId,
    event_id_ceiling_exclusive:world.next_event_id,
    total_events_generated:expected,
    events_available_in_bounded_ledger:retained.length,
    policy_events_available:policy.length,
    captured_receipts:receipts.length,
    omitted_policy_events:policy.length-receipts.length,
    coverage:retained.length===expected?'complete':'partial_bounded_ledger',
    receipts
  };
}
