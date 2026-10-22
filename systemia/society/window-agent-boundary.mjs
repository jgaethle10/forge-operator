/**
 * Mossmere Agent Decision Boundary (experimental, NOT wired to the live heartbeat).
 *
 * An external model may propose one structured action based on one resident's
 * limited observation. The town, never the model, validates and applies effects.
 * An operator-trusted Ed25519 signing key authenticates the decision adapter's
 * evidence envelope; that signature is NOT proof of consciousness or of an
 * independent model call. Independently proving provider calls remains a release gate.
 *
 * No provider API calls, shell/network execution, costs or real-world actions.
 */
import {createHash, createPublicKey, verify} from 'node:crypto';

export const DECISION_SCHEMA='evercraft.window.agent-decision.v1';
export const OBSERVATION_SCHEMA='evercraft.window.agent-observation.v1';
export const RECEIPT_SCHEMA='evercraft.window.agent-receipt.v1';
const ACTIONS=['wait','move','work','offer_help','respond','share'];
const ZONES=['homes','bakery','garden','workshop','market','library','lake'];
const HELP=['repair','garden','teach','meal','art'];
const LIMIT=48;

export function hash(value){return createHash('sha256').update(JSON.stringify(value)).digest('hex');}
const bounded=(n,min,max)=>Math.min(max,Math.max(min,n));
const validId=s=>typeof s==='string'&&/^r(?:[1-9]|1[0-2])$/.test(s);
function assertWorld(w){
  if(!w||w.version!==1||!Array.isArray(w.actors)||w.actors.length!==12||
    !Number.isSafeInteger(w.tick)||!Number.isSafeInteger(w.next_event_id)||
    !Array.isArray(w.events)||!w.metrics||!Number.isFinite(w.minute))throw Error('Invalid Mossmere world');
  if(new Set(w.actors.map(a=>a.id)).size!==12)throw Error('Duplicate residents');
}
function actor(w,id){const a=w.actors.find(a=>a.id===id);if(!a||!validId(id))throw Error('Unknown resident');return a;}
function keysExactly(obj,allowed){
  return !!obj&&typeof obj==='object'&&!Array.isArray(obj)&&
    Object.keys(obj).every(k=>allowed.includes(k));
}
function zoneName(w,z){return w.zones.find(p=>p.id===z)?.name||z;}
function ensureLab(w){
  if(!w.agent_experiment_v1)w.agent_experiment_v1={schema:1,receipts:[],invitations:[],seen:[]};
  const l=w.agent_experiment_v1;
  if(l.schema!==1||!Array.isArray(l.receipts)||!Array.isArray(l.invitations)||!Array.isArray(l.seen))throw Error('Invalid experiment ledger');
  return l;
}

/** One resident only sees self, local peers and events involving self. */
export function residentObservation(world,agentId){
  assertWorld(world);
  const a=actor(world,agentId);
  const state=world.agent_experiment_v1||{schema:1,invitations:[]};
  const invitations=Array.isArray(state.invitations)?state.invitations:[];
  const observation={
    schema:OBSERVATION_SCHEMA,
    agent_id:a.id,
    world_tick:world.tick,
    world_hash:hash(world),
    day:world.day,
    time:world.minute,
    self:{
      name:a.name,job:a.job,zone:a.zone,household:a.household,
      aspiration:a.aspiration,energy:a.energy,hunger:a.hunger,social:a.social,
      coins:a.coins,mood:a.mood,memories:(a.memories||[]).slice(0,6)
    },
    surroundings:{
      location:zoneName(world,a.zone),
      nearby:world.actors.filter(b=>b.id!==a.id&&b.zone===a.zone)
        .map(b=>({id:b.id,name:b.name,job:b.job,relationship:a.bonds?.[b.id]??50})),
      local_events:world.events.filter(e=>e.agent===a.id||e.other_agent===a.id)
        .slice(0,6).map(e=>({id:e.id,type:e.type,description:String(e.description||'').slice(0,240)})),
      supplies:{bread:world.metrics.bread,produce:world.metrics.produce,repairs:world.metrics.repairs},
      pending_invitations:invitations.filter(i=>i.to===a.id&&i.state==='pending')
        .map(i=>({id:i.id,from:i.from,kind:i.kind}))
    },
    permitted_actions:ACTIONS
  };
  return structuredClone(observation);
}
function checkProposal(p,obs){
  if(!keysExactly(p,['schema','agent_id','observation_hash','action']))throw Error('Malformed decision');
  if(p.schema!==DECISION_SCHEMA||p.agent_id!==obs.agent_id||
    p.observation_hash!==hash(obs))throw Error('Stale or mismatched decision');
  const action=p.action;
  if(!keysExactly(action,['type','to','zone','kind','invitation_id','amount'])||
    !ACTIONS.includes(action.type))throw Error('Unsupported action');
  const allowed={
    wait:['type'],move:['type','zone'],work:['type'],offer_help:['type','to','kind'],
    respond:['type','invitation_id','kind'],share:['type','to','amount']
  }[action.type];
  if(Object.keys(action).some(k=>!allowed.includes(k)))throw Error('Extra action arguments');
  if(action.type==='move'&&!ZONES.includes(action.zone))throw Error('Invalid destination');
  if(action.type==='offer_help'&&(!validId(action.to)||!HELP.includes(action.kind)))throw Error('Invalid invitation');
  if(action.type==='respond'&&(!/^inv-[0-9]+$/.test(action.invitation_id||'')||
    !['accept','decline'].includes(action.kind)))throw Error('Invalid reply');
  if(action.type==='share'&&(!validId(action.to)||!Number.isInteger(action.amount)||
    action.amount<1||action.amount>5))throw Error('Invalid transfer');
  return action;
}
function proofPayload(proposal,proof){
  return {
    schema:RECEIPT_SCHEMA,observation_hash:proposal.observation_hash,
    decision_hash:hash(proposal),provider:proof.provider,
    provider_request_id:proof.provider_request_id,issued_at:proof.issued_at
  };
}
/**
 * Production accepts ONLY a signature from an externally approved model adapter.
 * The trusted public key is injected by the operator, never carried by the model.
 * A signature proves custody of a runtime key, NOT provider-billing or model-cognition.
 */
function verifyProvenance(proposal,proof,options){
  if(options.mode==='fixture'){
    if(options.allowFixtures!==true)throw Error('Test fixtures forbidden outside explicit sandbox');
    return {label:'fixture',provider_request_id:null};
  }
  if(options.mode!=='attested_adapter'||!proof||!options.trustedPublicKey)
    throw Error('No approved model adapter attestation');
  if(!keysExactly(proof,['provider','provider_request_id','issued_at','signature'])||
    !/^[a-z0-9_.-]{2,60}$/i.test(proof.provider||'')||
    !/^[a-z0-9_.:-]{8,180}$/i.test(proof.provider_request_id||'')||
    !Number.isSafeInteger(proof.issued_at)||
    !/^[A-Za-z0-9+/]{86}==$/.test(proof.signature||''))
    throw Error('Malformed provenance proof');
  const signed=Buffer.from(JSON.stringify(proofPayload(proposal,proof)));
  const key=createPublicKey(options.trustedPublicKey);
  if(key.asymmetricKeyType!=='ed25519'||!verify(null,signed,key,Buffer.from(proof.signature,'base64')))
    throw Error('Untrusted or mismatched model adapter attestation');
  if(!Number.isSafeInteger(options.now)||Math.abs(options.now-proof.issued_at)>300000)
    throw Error('Stale model adapter attestation');
  return {label:'adapter_attested_unverified_model',provider_request_id:proof.provider_request_id};
}
function updateWorld(w,a,action){
  const lab=ensureLab(w);
  const other=action.to?actor(w,action.to):null;
  const nearby=other&&a.zone===other.zone&&other.id!==a.id;
  let outcome='',eventType='agent_choice';
  switch(action.type){
    case 'wait':
      a.energy=bounded(a.energy+6,0,100);a.action='Waiting and reflecting';
      outcome=a.name+' waited and recovered energy.';
      break;
    case 'move':
      if(a.energy<2)throw Error('Too exhausted to move');
      if(action.zone===a.zone)throw Error('Already at destination');
      a.energy-=2;a.zone=action.zone;a.action='Going to '+zoneName(w,action.zone);
      outcome=a.name+' moved to '+zoneName(w,action.zone)+'.';
      break;
    case 'work':
      if(a.zone!==a.work||a.energy<8||a.hunger<16)throw Error('Not able to work here');
      a.energy-=8;a.coins+=2;
      if(['baker','cook'].includes(a.job))w.metrics.bread+=2;
      else if(['gardener','organizer'].includes(a.job))w.metrics.produce+=2;
      else if(['carpenter','apprentice'].includes(a.job))w.metrics.repairs+=1;
      a.action='Working at '+zoneName(w,a.work);
      outcome=a.name+' chose to work for two coins.';
      break;
    case 'offer_help':{
      if(!nearby||a.energy<6)throw Error('Recipient not local or actor exhausted');
      if(lab.invitations.filter(i=>i.state==='pending'&&(i.from===a.id||i.to===a.id)).length>=2)
        throw Error('Too many open invitations');
      const invitation={id:'inv-'+w.next_event_id,from:a.id,to:other.id,kind:action.kind,state:'pending',created_tick:w.tick};
      lab.invitations.push(invitation);
      a.action='Offering '+action.kind+' help';
      outcome=a.name+' offered '+action.kind+' help to '+other.name+'.';
      eventType='agent_invitation';
      break;
    }
    case 'respond':{
      const i=lab.invitations.find(i=>i.id===action.invitation_id&&i.to===a.id&&i.state==='pending');
      if(!i)throw Error('No pending invitation for this actor');
      const sender=actor(w,i.from);
      if(sender.zone!==a.zone)throw Error('Inviter not nearby');
      if(action.kind==='accept'){
        if(sender.energy<4||a.energy<4)throw Error('Residents lack energy for joint activity');
        sender.energy-=4;a.energy-=4;
        if(i.kind==='garden')w.metrics.produce+=3;
        if(i.kind==='meal'){if(w.metrics.bread<1)throw Error('No bread available');w.metrics.bread-=1;a.hunger=bounded(a.hunger+8,0,100);}
        if(i.kind==='repair')w.metrics.repairs+=2;
        sender.bonds[a.id]=bounded((sender.bonds[a.id]??50)+4,0,100);
        a.bonds[sender.id]=bounded((a.bonds[sender.id]??50)+4,0,100);
        i.state='accepted';eventType='agent_cooperation';
        outcome=a.name+' accepted '+sender.name+'’s '+i.kind+' invitation.';
      }else{
        sender.bonds[a.id]=bounded((sender.bonds[a.id]??50)-2,0,100);
        a.bonds[sender.id]=bounded((a.bonds[sender.id]??50)-2,0,100);
        i.state='declined';eventType='agent_refusal';
        outcome=a.name+' declined '+sender.name+'’s '+i.kind+' invitation.';
      }
      i.resolved_tick=w.tick;a.action='Responding to '+sender.name;
      break;
    }
    case 'share':
      if(!nearby||a.coins<action.amount)throw Error('Insufficient funds or recipient out of range');
      a.coins-=action.amount;other.coins+=action.amount;
      a.action='Sharing coins with '+other.name;
      outcome=a.name+' shared '+action.amount+' coins with '+other.name+'.';
      eventType='agent_resource_transfer';
      break;
  }
  if(lab.invitations.length>LIMIT)lab.invitations=lab.invitations.filter(i=>i.state==='pending').slice(-LIMIT);
  return {outcome,eventType};
}
/**
 * Safe atomic commit: stale observations, invalid actions or missing attestation
 * throw before writing to the input world. This DOES NOT write canonical GitHub
 * state, authorize model tokens, or pay any provider.
 */
export function applyAgentDecision(world,observation,proposal,proof=null,options={}){
  assertWorld(world);
  if(observation?.schema!==OBSERVATION_SCHEMA||!validId(observation.agent_id)||
    hash(observation)!==hash(residentObservation(world,observation.agent_id)))
    throw Error('Observation stale or tampered');
  const action=checkProposal(proposal,observation);
  const provenance=verifyProvenance(proposal,proof,options);
  const w=structuredClone(world);
  const lab=ensureLab(w);
  const decisionId=hash({observation_hash:proposal.observation_hash,decision:proposal});
  if(lab.seen.includes(decisionId))throw Error('Replayed decision');
  const a=actor(w,proposal.agent_id);
  const {outcome,eventType}=updateWorld(w,a,action);
  lab.seen.push(decisionId);lab.seen=lab.seen.slice(-LIMIT);
  const event={id:'e'+w.next_event_id++,type:eventType,agent:a.id,day:w.day,
    time:String(Math.floor(w.minute/60)).padStart(2,'0')+':'+String(w.minute%60).padStart(2,'0'),
    description:outcome,source:'agent_experiment_v1'};
  w.events.unshift(event);w.events=w.events.slice(0,160);
  a.memories.unshift(outcome);a.memories=a.memories.slice(0,8);
  const receipt={schema:RECEIPT_SCHEMA,id:decisionId,world_tick:w.tick,
    agent_id:a.id,observation_hash:proposal.observation_hash,action:structuredClone(action),
    outcome,provenance:provenance.label,provider_request_id:provenance.provider_request_id,
    before_world_hash:observation.world_hash,after_world_hash:hash(w),event_id:event.id,
    release_status:'held_not_live'};
  lab.receipts.push(receipt);lab.receipts=lab.receipts.slice(-LIMIT);
  return {world:w,receipt:structuredClone(receipt)};
}
/** Spectator-safe: no private observation, prompts, provider tokens or reasoning trace. */
export function spectatorDecisions(world){
  assertWorld(world);
  const records=world.agent_experiment_v1?.receipts||[];
  return records.map(r=>({
    id:r.id,agent_id:r.agent_id,world_tick:r.world_tick,action:r.action.type,
    outcome:r.outcome,provenance:r.provenance,release_status:r.release_status,
    // Receipt is an integrity handle, not evidence of a model call on its own.
    receipt_hash:hash(r)
  }));
}
