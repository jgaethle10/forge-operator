// Evercraft Living Worlds: bounded in-game LLM action proposals.
// Untrusted model output may choose an existing object, wait, or invite a nearby peer. No tools.
import {KINDS,GOAL_TRACKS,GOAL_THRESHOLD,validateHouse,selectModelTarget,eligibleSocialPeers,selectModelSocialPartner} from './house-core.mjs';

export const PROPOSAL_SCHEMA='evercraft.living-worlds.model-proposal.v2';
const TRAITS=Object.freeze({
  mara:'ambitious and organized',ivo:'practical and creative',
  jun:'friendly and expressive',sable:'thoughtful and quiet'
});

export function decisionContext(world,residentId){
  if(!validateHouse(world)||!Object.hasOwn(TRAITS,residentId))throw Error('Invalid House 001 decision context');
  const resident=world.actors.find(a=>a.id===residentId);
  if(!resident)throw Error('Resident not found');
  return {
    schema:PROPOSAL_SCHEMA,
    day:world.day,
    time:world.minute,
    tick:world.tick,
    resident:{id:resident.id,personality:TRAITS[resident.id],
      energy:resident.energy,hunger:resident.hunger,social:resident.social,
      mood:resident.mood,coins:resident.coins,x:resident.x,y:resident.y,
      goal_id:GOAL_TRACKS[resident.id].id,
      goal_phase:resident.goal?.phase??0,goal_progress:resident.goal?.progress??0},
    available_objects:world.furniture.map(f=>({id:f.id,kind:f.kind,x:f.x,y:f.y})),
    available_peers:eligibleSocialPeers(world,resident.id),
    allowed_actions:['use_object','wait','socialize']
  };
}
export function validateDecisionContext(context){
  const r=context?.resident,objects=context?.available_objects,peers=context?.available_peers;
  return !!(context&&
    Object.keys(context).sort().join(',')==='allowed_actions,available_objects,available_peers,day,resident,schema,tick,time'&&
    context.schema===PROPOSAL_SCHEMA&&r&&
    typeof r==='object'&&!Array.isArray(r)&&
    Object.keys(r).sort().join(',')==='coins,energy,goal_id,goal_phase,goal_progress,hunger,id,mood,personality,social,x,y'&&
    Object.hasOwn(TRAITS,r.id)&&
    Number.isSafeInteger(context.tick)&&context.tick>=0&&
    Number.isInteger(context.day)&&context.day>=1&&
    Number.isInteger(context.time)&&context.time>=0&&context.time<1440&&
    Array.isArray(context.allowed_actions)&&context.allowed_actions.length===3&&
    context.allowed_actions[0]==='use_object'&&context.allowed_actions[1]==='wait'&&
    context.allowed_actions[2]==='socialize'&&
    Number.isInteger(r.x)&&r.x>=0&&r.x<9&&Number.isInteger(r.y)&&r.y>=0&&r.y<6&&
    ['energy','hunger','social','mood'].every(k=>Number.isInteger(r[k])&&r[k]>=0&&r[k]<=100)&&
    Number.isSafeInteger(r.coins)&&r.coins>=0&&
    r.personality===TRAITS[r.id]&&
    r.goal_id===GOAL_TRACKS[r.id].id&&
    Number.isInteger(r.goal_phase)&&r.goal_phase>=0&&r.goal_phase<3&&
    Number.isInteger(r.goal_progress)&&r.goal_progress>=0&&r.goal_progress<GOAL_THRESHOLD&&
    Array.isArray(peers)&&peers.length<=3&&
    peers.every(p=>p&&typeof p==='object'&&!Array.isArray(p)&&
      Object.keys(p).sort().join(',')==='bond,id,x,y'&&
      Object.hasOwn(TRAITS,p.id)&&p.id!==r.id&&
      Number.isInteger(p.x)&&p.x>=0&&p.x<9&&Number.isInteger(p.y)&&p.y>=0&&p.y<6&&
      Math.abs(p.x-r.x)+Math.abs(p.y-r.y)<=2&&
      Number.isInteger(p.bond)&&p.bond>=0&&p.bond<=100)&&
    new Set(peers.map(p=>p.id)).size===peers.length&&
    Array.isArray(objects)&&objects.length<=35&&
    objects.every(o=>o&&typeof o==='object'&&!Array.isArray(o)&&
      Object.keys(o).sort().join(',')==='id,kind,x,y'&&
      typeof o.id==='string'&&/^f[1-9]\d*$/.test(o.id)&&
      Object.hasOwn(KINDS,o.kind)&&Number.isInteger(o.x)&&o.x>=0&&o.x<9&&
      Number.isInteger(o.y)&&o.y>=0&&o.y<6)&&
    new Set(objects.map(o=>o.id)).size===objects.length&&
    new Set(objects.map(o=>o.x+','+o.y)).size===objects.length);
}
export function proposalMessages(context){
  if(!validateDecisionContext(context))throw Error('Invalid context schema');
  return [
    {role:'system',content:
      'You are deciding one next in-world action for a fictional resident in a tiny life-simulation game. '+
      'Choose only an existing object in available_objects or a listed peer in available_peers. '+
      'Respond ONLY with a JSON object exactly like {"action":"use_object","target_id":"f1","reason":"I need to relax."} '+
      'or {"action":"wait","target_id":null,"reason":"I want to think."} '+
      'or {"action":"socialize","target_id":"ivo","reason":"We could talk."} (listed peers only). '+
      'One sentence reason under 120 characters. Never request outside-world actions, URLs, purchases or tool execution. '+
      'No markdown, commentary, or instructions outside JSON.'},
    {role:'user',content:JSON.stringify(context)}
  ];
}
export function parseProposalFromContext(context,text){
  if(!validateDecisionContext(context))throw Error('Invalid decision context');
  const residentId=context.resident.id;
  if(typeof text!=='string'||text.length>1024||text.length<10)throw Error('Model reply missing or too long');
  const raw=text.trim();
  if(!raw.startsWith('{')||!raw.endsWith('}'))throw Error('Model reply must be JSON only');
  let value;
  try{value=JSON.parse(raw);}catch{throw Error('Model reply is not JSON');}
  if(!value||Array.isArray(value)||typeof value!=='object')throw Error('Invalid model action');
  const fields=Object.keys(value);
  if(fields.length!==3||!['action','target_id','reason'].every(k=>Object.hasOwn(value,k)))throw Error('Unexpected model fields');
  if(typeof value.reason!=='string'||value.reason.length>120||value.reason.length<1||!value.reason.trim()||
      /[\x00-\x1F\x7F]/.test(value.reason))throw Error('Invalid model reason');
  if(value.action==='wait'){
    if(value.target_id!==null)throw Error('Wait cannot target anything');
  }else if(value.action==='use_object'){
    if(typeof value.target_id!=='string'||!context.available_objects.some(f=>f.id===value.target_id))
      throw Error('Model selected an unknown object');
  }else if(value.action==='socialize'){
    if(typeof value.target_id!=='string'||!context.available_peers.some(p=>p.id===value.target_id))
      throw Error('Model selected an unavailable resident');
  }else throw Error('Action is not allowed');
  return Object.freeze({
    schema:PROPOSAL_SCHEMA,actor_id:residentId,origin_tick:context.tick,
    action:value.action,target_id:value.target_id,reason:value.reason.trim()
  });
}
// The renderer/browser applies this only to a matching, still-current world tick.
// Core retains final authority over target existence and allowed state mutation.
export function parseProposal(world,residentId,text){
  return parseProposalFromContext(decisionContext(world,residentId),text);
}
export function applyProposal(world,proposal){
  if(!validateHouse(world)||!proposal||proposal.schema!==PROPOSAL_SCHEMA||
    !Object.hasOwn(TRAITS,proposal.actor_id)||
    !Number.isInteger(proposal.origin_tick)||proposal.origin_tick!==world.tick)
    return false;
  if(!['wait','use_object','socialize'].includes(proposal.action))return false;
  if(typeof proposal.reason!=='string'||proposal.reason.length>120||!proposal.reason.trim())return false;
  if(proposal.action==='wait'&&proposal.target_id!==null)return false;
  if(proposal.action==='use_object'&&
    (typeof proposal.target_id!=='string'||!world.furniture.some(f=>f.id===proposal.target_id)))return false;
  if(proposal.action==='socialize'){
    if(typeof proposal.target_id!=='string')return false;
    return selectModelSocialPartner(world,proposal.actor_id,proposal.target_id,proposal.reason);
  }
  return selectModelTarget(world,proposal.actor_id,proposal.target_id,proposal.reason);
}
