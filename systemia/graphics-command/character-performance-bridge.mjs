import {compileCharacterCommercial} from './character-commercial-bridge.mjs';

const DIRECTION={
  S01:{maya:{objective:'Get the client site photos out without losing fidelity',tactic:'Try once more, then accept the size error',end:[-.7,.68,.36],gaze:'laptop',breath:'shallow',micro:['drag the PNG to the attachment area','read the size warning','exhale through the nose']}},
  S02:{alex:{objective:'Understand why Maya is blocked',tactic:'Ask a quick empathetic question without taking over',end:[.05,.35,.75],gaze:'maya',breath:'steady',micro:['swivel toward Maya','lift one eyebrow','let the question land']}},
  S03:{maya:{objective:'Explain the delivery urgency',tactic:'Show Alex the failed attachment',end:[-.59,.63,.48],gaze:'alex',breath:'steady',micro:['slide the laptop along the table','hold on the warning','look for Alex response']},
       alex:{objective:'See the failed attachment and frame the real problem',tactic:'Read the screen carefully',end:[.05,.36,.77],gaze:'laptop',breath:'steady',micro:['track the laptop movement','read the warning','rest fingers near trackpad']}},
  S04:{alex:{objective:'Suggest a feasible preview rather than promise magical attachment bypass',tactic:'Introduce local image preparation with quiet confidence',end:[.31,.34,.82],gaze:'maya',breath:'steady',micro:['point at the existing browser tab','pause before touching the keyboard','leave Maya in control']},
       maya:{objective:'Understand whether this is a safe, useful workaround',tactic:'Watch the suggestion with caution',end:[-.32,.42,.56],gaze:'laptop',breath:'steady',micro:['lean toward display','follow finger to the tab','relax shoulders slightly']}},
  S06:{maya:{objective:'Confirm preview usefulness while protecting the original',tactic:'Ask the specific integrity question',end:[.04,.42,.7],gaze:'alex',breath:'steady',micro:['compare the displayed sizes','turn to Alex before the final question','wait for answer']}},
  S07:{alex:{objective:'Explain what was and was not transformed',tactic:'Answer without claiming the original was transmitted',end:[.38,.31,.85],gaze:'maya',breath:'steady',micro:['point at the original retained locally','make a small open-palm gesture','keep hands away from a send button']}},
  S08:{maya:{objective:'Acknowledge that the preview strategy is understandable',tactic:'Respond with genuine, modest relief',end:[.45,.27,.8],gaze:'alex',breath:'recovering',micro:['release a small smile','nod just once','look back at the laptop']},
       alex:{objective:'Let Maya own the solution',tactic:'Return to work after a brief smile',end:[.44,.2,.85],gaze:'laptop',breath:'steady',micro:['small smile','return hands to own keyboard','do not pretend a transfer succeeded']}}
};
const paceByShot={S01:'natural',S02:'measured',S03:'urgent',S04:'measured',S06:'measured',S07:'natural',S08:'natural'};
const toneByShot={S01:'Frustrated but composed, ordinary workplace stakes',S02:'Gentle concern, not a punchline',S03:'Time pressure without melodrama',S04:'Collaborative suggestion, not a sales speech',S06:'Interested but asks the real question',S07:'Clear explanation with no magical claims',S08:'Low-key shared relief'};
const state=a=>({valence:a[0],arousal:a[1],control:a[2]});
export function buildCharacterPerformanceInput(campaign,options={}){
  const bridge=compileCharacterCommercial(campaign,options);
  const byCharacter=new Map();
  const beats=[];
  const issues=[];
  for(const shot of bridge.shots){
    for(const entityId of shot.cast){
      const direction=DIRECTION[shot.id]?.[entityId];
      if(!direction){
        issues.push('performance_direction_missing:'+shot.id+':'+entityId);
        continue;
      }
      const previous=byCharacter.get(entityId);
      const start=previous??state(direction.end);
      const end=state(direction.end);
      const dialogueDelivery=shot.speakerId===entityId ? {
        pace:paceByShot[shot.id]??'natural',
        volume:'conversational',
        subtext:toneByShot[shot.id]??'Show a grounded, everyday response',
        pauseBeforeMs:shot.id==='S02'?120:shot.id==='S07'?100:70,
        pauseAfterMs:shot.id==='S08'?130:110
      }:undefined;
      beats.push({
        shotId:shot.id,entityId,
        objective:direction.objective,
        obstacle:shot.id==='S01'?'Attachment limits for large files':undefined,
        tactic:direction.tactic,
        start,end,continuity:'carry',
        gazeTarget:direction.gaze,
        breath:direction.breath,
        bodyEnergy:Math.min(.9,Math.max(.15,.25+end.arousal*.45)),
        gestureScale:Math.min(.85,Math.max(.12,.16+end.arousal*.35)),
        microActions:direction.micro,
        ...(dialogueDelivery?{dialogueDelivery}:{})
      });
      byCharacter.set(entityId,end);
    }
  }
  if(beats.length!==bridge.shots.reduce((n,shot)=>n+shot.cast.length,0)){
    issues.push('performance_coverage_incomplete');
  }
  return {
    bridge,issues,
    performancePlanInput:{
      schema:'evercraft.fallen.performance-plan-input.v1',
      sequenceId:bridge.cinematicSequenceInput.id,
      beats,
      carryTolerance:.35,
    },
    boundaries:{
      spokenLineIsRequiredForEveryVisibleSpeakingBeat:true,
      allVisibleCharactersMustReceivePerformanceDirection:true,
      emotionalContinuityMustBeCheckedByFallen:true,
      performancePlanIsNotAnActorVideo:true,
      publicationAuthority:false,
    },
  };
}
