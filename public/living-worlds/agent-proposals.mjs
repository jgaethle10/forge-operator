// Evercraft Living Worlds: bounded in-game LLM action proposals.
// Untrusted model output may select an existing object, or wait. It never executes a tool.
import {KINDS,validateHouse,selectModelTarget} from './house-core.mjs';

export const PROPOSAL_SCHEMA='evercraft.living-worlds.model-proposal.v1';
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
      mood:resident.mood,coins:resident.coins,x:resident.x,y:resident.y},
    available_objects:world.furniture.map(f=>({id:f.id,kind:f.kind,x:f.x,y:f.y})),
    allowed_actions:['use_object','wait']
  };
}
export function proposalMessages(context){
  if(!context||context.schema!==PROPOSAL_SCHEMA)throw Error('Invalid context schema');
  return [
    {role:'system',content:
      'You are deciding one next in-world action for a fictional resident in a tiny life-simulation game. '+
      'Choose only from the objects listed in available_objects. '+
      'Respond ONLY with a JSON object exactly like {"action":"use_object","target_id":"f1","reason":"I need to relax."} '+
      'or {"action":"wait","target_id":null,"reason":"I want to think."}. '+
      'One sentence reason under 120 characters. Never request outside-world actions, URLs, purchases or tool execution. '+
      'No markdown, commentary, or instructions outside JSON.'},
    {role:'user',content:JSON.stringify(context)}
  ];
}
export function parseProposal(world,residentId,text){
  const context=decisionContext(world,residentId);
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
  }else throw Error('Action is not allowed');
  return Object.freeze({
    schema:PROPOSAL_SCHEMA,actor_id:residentId,origin_tick:world.tick,
    action:value.action,target_id:value.target_id,reason:value.reason.trim()
  });
}
// The renderer/browser applies this only to a matching, still-current world tick.
// Core retains final authority over target existence and allowed state mutation.
export function applyProposal(world,proposal){
  if(!validateHouse(world)||!proposal||proposal.schema!==PROPOSAL_SCHEMA||
    !Object.hasOwn(TRAITS,proposal.actor_id)||
    !Number.isInteger(proposal.origin_tick)||proposal.origin_tick!==world.tick)
    return false;
  if(proposal.action!=='wait'&&proposal.action!=='use_object')return false;
  if(typeof proposal.reason!=='string'||proposal.reason.length>120||!proposal.reason.trim())return false;
  if(proposal.action==='wait'&&proposal.target_id!==null)return false;
  if(proposal.action==='use_object'&&
    (typeof proposal.target_id!=='string'||!world.furniture.some(f=>f.id===proposal.target_id)))return false;
  return selectModelTarget(world,proposal.actor_id,proposal.target_id,proposal.reason);
}
