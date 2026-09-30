import crypto from 'node:crypto';
import type { CinematicSequenceInput } from './cinematic-sequence.js';

export interface PerformanceState {
  valence:number;
  arousal:number;
  control:number;
}

export type PerformanceContinuity='carry'|'turn'|'reset';
export type BreathDirection='held'|'shallow'|'steady'|'deep'|'ragged'|'recovering';

export interface CharacterPerformanceBeat {
  shotId:string;
  entityId:string;
  objective:string;
  obstacle?:string;
  tactic:string;
  start:PerformanceState;
  end:PerformanceState;
  continuity:PerformanceContinuity;
  trigger?:string;
  gazeTarget?:string;
  breath?:BreathDirection;
  bodyEnergy?:number;
  gestureScale?:number;
  microActions:string[];
  dialogueDelivery?:{
    pace:'slow'|'measured'|'natural'|'urgent'|'broken';
    volume:'whisper'|'soft'|'conversational'|'raised'|'shout';
    subtext:string;
    pauseBeforeMs?:number;
    pauseAfterMs?:number;
  };
}

export interface PerformancePlanInput {
  schema:'evercraft.fallen.performance-plan-input.v1';
  sequenceId:string;
  beats:CharacterPerformanceBeat[];
  carryTolerance?:number;
}

export interface PerformanceDirection {
  shotId:string;
  entityId:string;
  prompt:string;
  beatDigest:string;
}

export interface PerformancePlan {
  schema:'evercraft.fallen.performance-plan.v1';
  sequenceId:string;
  status:'accepted'|'rejected';
  directions:PerformanceDirection[];
  errors:string[];
  warnings:string[];
  digest:string;
  boundaries:{
    everyVisibleCharacterDirected:true;
    emotionalTeleportFailsClosed:true;
    dialoguePerformanceRequired:true;
    performanceDoesNotOverrideBlocking:true;
    directPublicationAuthority:false;
  };
  createdAt:string;
}

function stable(value:unknown):unknown{
  if(Array.isArray(value)) return value.map(stable);
  if(value&&typeof value==='object'){
    return Object.fromEntries(
      Object.entries(value as Record<string,unknown>)
        .sort(([a],[b])=>a.localeCompare(b))
        .map(([key,item])=>[key,stable(item)])
    );
  }
  return value;
}

function digest(value:unknown){
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

function validState(state:PerformanceState){
  return Number.isFinite(state.valence)&&state.valence>=-1&&state.valence<=1&&
    Number.isFinite(state.arousal)&&state.arousal>=0&&state.arousal<=1&&
    Number.isFinite(state.control)&&state.control>=0&&state.control<=1;
}

function distance(a:PerformanceState,b:PerformanceState){
  return Math.sqrt(
    (a.valence-b.valence)**2+
    (a.arousal-b.arousal)**2+
    (a.control-b.control)**2
  )/Math.sqrt(3);
}

function fmt(value:number){
  return Number(value.toFixed(2));
}

function directionPrompt(beat:CharacterPerformanceBeat){
  const start=`valence=${fmt(beat.start.valence)}, arousal=${fmt(beat.start.arousal)}, control=${fmt(beat.start.control)}`;
  const end=`valence=${fmt(beat.end.valence)}, arousal=${fmt(beat.end.arousal)}, control=${fmt(beat.end.control)}`;
  const dialogue=beat.dialogueDelivery
    ? `Dialogue delivery: pace=${beat.dialogueDelivery.pace}; volume=${beat.dialogueDelivery.volume}; subtext=${beat.dialogueDelivery.subtext}; pause_before_ms=${beat.dialogueDelivery.pauseBeforeMs??0}; pause_after_ms=${beat.dialogueDelivery.pauseAfterMs??0}.`
    : 'No spoken performance is required for this character in this shot.';
  return [
    `PERFORMANCE DIRECTION FOR ${beat.entityId}.`,
    `Objective: ${beat.objective.trim()}.`,
    ...(beat.obstacle?.trim()?[ `Obstacle: ${beat.obstacle.trim()}.` ]:[]),
    `Tactic: ${beat.tactic.trim()}.`,
    `Emotional trajectory: start [${start}] -> end [${end}].`,
    `Continuity mode: ${beat.continuity}.`+(beat.trigger?.trim()?` Trigger: ${beat.trigger.trim()}.`:''),
    beat.gazeTarget?.trim()?`Gaze target: ${beat.gazeTarget.trim()}. Do not wander the eyeline without motivated action.`:'Keep gaze motivated by the blocking and objective.',
    `Breath: ${beat.breath??'steady'}. Body energy: ${fmt(beat.bodyEnergy??.5)}. Gesture scale: ${fmt(beat.gestureScale??.35)}.`,
    `Micro-actions: ${beat.microActions.map(item=>item.trim()).filter(Boolean).join('; ')}.`,
    dialogue,
    'Act through intention and physical behavior, not a frozen facial-expression label. Preserve the shot blocking contract. Avoid repetitive blinking, lip flutter, rubbery hands, constant head bobbing, random smiles, generic nodding, melodramatic gesturing and motion that does not serve the objective.',
  ].join('\n');
}

function beatKey(shotId:string,entityId:string){
  return shotId+'|'+entityId;
}

export function compilePerformancePlan(input:{
  sequence:CinematicSequenceInput;
  performance:PerformancePlanInput;
}):PerformancePlan{
  const {sequence,performance}=input;
  if(performance.schema!=='evercraft.fallen.performance-plan-input.v1'){
    throw new Error('performance_plan_schema_invalid');
  }
  if(performance.sequenceId!==sequence.id){
    throw new Error('performance_sequence_id_mismatch');
  }

  const errors:string[]=[];
  const warnings:string[]=[];
  const beats=new Map<string,CharacterPerformanceBeat>();
  const carryTolerance=performance.carryTolerance??.35;

  for(const beat of performance.beats){
    const key=beatKey(beat.shotId,beat.entityId);
    if(beats.has(key)){
      errors.push('duplicate_performance_beat:'+key);
      continue;
    }
    beats.set(key,beat);
    if(!beat.objective?.trim()) errors.push('performance_objective_missing:'+key);
    if(!beat.tactic?.trim()) errors.push('performance_tactic_missing:'+key);
    if(!validState(beat.start)||!validState(beat.end)) errors.push('performance_state_invalid:'+key);
    if(!beat.microActions?.map(item=>item.trim()).filter(Boolean).length){
      errors.push('performance_micro_actions_missing:'+key);
    }
    if(beat.bodyEnergy!==undefined&&(beat.bodyEnergy<0||beat.bodyEnergy>1)){
      errors.push('performance_body_energy_invalid:'+key);
    }
    if(beat.gestureScale!==undefined&&(beat.gestureScale<0||beat.gestureScale>1)){
      errors.push('performance_gesture_scale_invalid:'+key);
    }
    if((beat.continuity==='turn'||beat.continuity==='reset')&&!beat.trigger?.trim()){
      errors.push('performance_transition_trigger_missing:'+key);
    }
  }

  for(const shot of sequence.shots){
    const visible=new Set(shot.characters.map(character=>character.entityId));
    for(const entityId of visible){
      if(!beats.has(beatKey(shot.id,entityId))){
        errors.push('visible_character_performance_missing:'+shot.id+':'+entityId);
      }
    }
    if(shot.dialogue){
      const speaker=beats.get(beatKey(shot.id,shot.dialogue.speakerId));
      if(!speaker?.dialogueDelivery){
        errors.push('dialogue_performance_missing:'+shot.id+':'+shot.dialogue.speakerId);
      }
      if(
        shot.dialogue.targetId&&
        speaker?.gazeTarget&&
        speaker.gazeTarget!==shot.dialogue.targetId
      ){
        errors.push('dialogue_gaze_target_mismatch:'+shot.id+':'+shot.dialogue.speakerId);
      }
    }
  }

  const shotIds=new Set(sequence.shots.map(shot=>shot.id));
  for(const beat of performance.beats){
    const shot=sequence.shots.find(item=>item.id===beat.shotId);
    if(!shotIds.has(beat.shotId)){
      errors.push('performance_unknown_shot:'+beat.shotId);
      continue;
    }
    if(!shot?.characters.some(character=>character.entityId===beat.entityId)){
      errors.push('performance_entity_not_visible:'+beat.shotId+':'+beat.entityId);
    }
  }

  const lastByEntity=new Map<string,CharacterPerformanceBeat>();
  for(const shot of sequence.shots){
    for(const character of shot.characters){
      const beat=beats.get(beatKey(shot.id,character.entityId));
      if(!beat) continue;
      const prior=lastByEntity.get(character.entityId);
      if(prior){
        const jump=distance(prior.end,beat.start);
        if(beat.continuity==='carry'&&jump>carryTolerance){
          errors.push(
            'performance_emotional_teleport:'+prior.shotId+'->'+beat.shotId+':'+beat.entityId
          );
        }else if(beat.continuity==='carry'&&jump>.2){
          warnings.push(
            'performance_large_carry_delta:'+prior.shotId+'->'+beat.shotId+':'+beat.entityId
          );
        }
      }
      lastByEntity.set(character.entityId,beat);
    }
  }

  const directions=performance.beats
    .filter(beat=>shotIds.has(beat.shotId))
    .map(beat=>{
      const prompt=directionPrompt(beat);
      return {
        shotId:beat.shotId,
        entityId:beat.entityId,
        prompt,
        beatDigest:digest(beat),
      };
    });

  const core={
    schema:'evercraft.fallen.performance-plan.v1' as const,
    sequenceId:sequence.id,
    status:errors.length?('rejected' as const):('accepted' as const),
    directions,
    errors:[...new Set(errors)],
    warnings:[...new Set(warnings)],
    boundaries:{
      everyVisibleCharacterDirected:true as const,
      emotionalTeleportFailsClosed:true as const,
      dialoguePerformanceRequired:true as const,
      performanceDoesNotOverrideBlocking:true as const,
      directPublicationAuthority:false as const,
    },
    createdAt:new Date().toISOString(),
  };

  return {...core,digest:digest({...core,createdAt:undefined})};
}

export function applyPerformanceDirection(input:{
  sequence:CinematicSequenceInput;
  plan:PerformancePlan;
}):CinematicSequenceInput{
  if(input.plan.status!=='accepted'){
    throw new Error('performance_plan_not_accepted');
  }
  if(input.plan.sequenceId!==input.sequence.id){
    throw new Error('performance_apply_sequence_mismatch');
  }
  const byShot=new Map<string,PerformanceDirection[]>();
  for(const direction of input.plan.directions){
    const list=byShot.get(direction.shotId)??[];
    list.push(direction);
    byShot.set(direction.shotId,list);
  }

  return {
    ...input.sequence,
    shots:input.sequence.shots.map(shot=>{
      const directions=byShot.get(shot.id)??[];
      if(!directions.length) return shot;
      return {
        ...shot,
        prompt:[
          shot.prompt.trim(),
          '',
          'FALLEN PERFORMANCE DIRECTOR:',
          ...directions.map(direction=>direction.prompt),
        ].join('\n'),
      };
    }),
  };
}
