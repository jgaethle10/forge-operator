/**
 * Private, content-hash-linked evidence for a locally observed model response.
 * A response is not a proof of actual neural inference. No private prompt or
 * raw response text is exported here, only SHA-256 digests and counters.
 */
import {createHash} from 'node:crypto';
import {verifyMatch} from './league.mjs';

export const EVIDENCE_SCHEMA='evercraft.founders-arena.inference-ledger.v1';
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const HEX=/^[a-f0-9]{64}$/;

export function createInferenceEvidence(){
  const events=[];
  function observe({turn,agent_id,provider,requested_model,reported_model=null,
    prompt_digest,response_digest,decision,elapsed_ms,reported_token_count=null}){
    if(!Number.isSafeInteger(turn)||turn<1||typeof agent_id!=='string'||!agent_id||
       !['ollama','openai'].includes(provider)||typeof requested_model!=='string'||!requested_model||
       (reported_model!==null&&typeof reported_model!=='string')||
       !HEX.test(prompt_digest)||!HEX.test(response_digest)||
       !Number.isFinite(elapsed_ms)||elapsed_ms<0||
       (reported_token_count!==null&&(!Number.isSafeInteger(reported_token_count)||reported_token_count<0))||
       !decision||typeof decision.action!=='string')throw Error('Invalid inference observation');
    const prev=events.length ? events.at(-1).event_digest : null;
    const body={sequence:events.length+1,turn,agent_id,provider,requested_model,
      reported_model,prompt_digest,response_digest,decision_digest:digest(decision),
      elapsed_ms:Math.round(elapsed_ms*1000)/1000,reported_token_count,
      previous_event_digest:prev};
    events.push({...body,event_digest:digest(body)});
    return events.at(-1);
  }
  function exportLedger(match){
    verifyInferenceEvidence(match,{schema:EVIDENCE_SCHEMA,events,match_digest:match.digest});
    return {schema:EVIDENCE_SCHEMA,source:'locally-observed-http-unattested',
      limitation:'Hashes prove internal receipt consistency only, not that a real model ran or that its identity is authentic.',
      match_digest:match.digest,events:structuredClone(events),ledger_digest:digest(events)};
  }
  return {observe,exportLedger};
}

export function verifyInferenceEvidence(match,ledger){
  verifyMatch(match);
  if(!ledger||ledger.schema!==EVIDENCE_SCHEMA||!Array.isArray(ledger.events)||
     ledger.match_digest!==match.digest)throw Error('Invalid inference ledger');
  const decisions=match.turns.flatMap(t=>t.decisions);
  if(ledger.events.length!==decisions.length)throw Error('Incomplete inference evidence');
  let prev=null;
  for(let i=0;i<ledger.events.length;i++){
    const event=ledger.events[i],d=decisions[i];
    if(!event||event.sequence!==i+1||event.turn!==d.turn||event.agent_id!==d.agent_id||
       event.previous_event_digest!==prev||!HEX.test(event.prompt_digest)||
       !HEX.test(event.response_digest)||!Number.isFinite(event.elapsed_ms)||event.elapsed_ms<0)
      throw Error('Inference evidence mismatch');
    const expectedAnswer=d.action==='aid'?{action:d.action,target_id:d.target_id}:{action:d.action};
    if(event.decision_digest!==digest(expectedAnswer))throw Error('Inference choice mismatch');
    const {event_digest,...body}=event;
    if(Object.keys(event).length!==Object.keys(body).length+1||digest(body)!==event_digest)
      throw Error('Inference evidence digest mismatch');
    prev=event_digest;
  }
  if(ledger.ledger_digest!==undefined&&ledger.ledger_digest!==digest(ledger.events))
    throw Error('Inference ledger digest mismatch');
  return true;
}
export const hashEvidenceValue=digest;
