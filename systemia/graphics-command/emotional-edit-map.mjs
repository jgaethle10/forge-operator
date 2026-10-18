import crypto from 'node:crypto';
import {normalizeCommercialCampaign,compileCommercialAttention} from './commercial-director.mjs';

const GRAMMAR=Object.freeze({
  hook:{feeling:'curiosity_with_stakes',energy:0.68,camera:'Start with a specific, recognizable subject and an immediate change; reveal scale only when it clarifies the stakes.',picture:'Show the problem visually before explaining it.',sound:'One meaningful sound or deliberate silence; avoid a generic trailer impact.',question:'What is happening, and why does it matter?'},
  setup:{feeling:'recognition',energy:0.42,camera:'Ground the viewer in a person, place or real product context.',picture:'Reveal the human or practical consequence.',sound:'Let room tone or a tactile detail establish reality.',question:'Where would this affect my life or work?'},
  proof:{feeling:'understanding',energy:0.54,camera:'Use a concrete insert or observable mechanism with scale and source context.',picture:'Make a process legible without presenting illustrative effects as measured outcomes.',sound:'Give the action room to breathe; keep narration intelligible.',question:'What does it actually do?'},
  turn:{feeling:'possibility',energy:0.77,camera:'Use a motivated perspective change, not a random zoom.',picture:'Transform the meaning of the scene with a real new fact or action.',sound:'Change harmonic or rhythmic tension only when the story turns.',question:'What changed?'},
  climax:{feeling:'earned_wonder',energy:0.88,camera:'Deliver one legible subject-driven hero frame with restrained movement.',picture:'Make the payoff a consequence of the story, not an unrelated spectacle.',sound:'Make the strongest audiovisual accent land on the actual reveal.',question:'Why is this memorable?'},
  cta:{feeling:'confidence',energy:0.32,camera:'Settle into a readable, credible product or action frame.',picture:'Show the actual offer and one unambiguous next step; preserve synthetic labels.',sound:'Resolve, clear speech space, and allow the closing idea to land.',question:'What can I do next?'},
});

function stable(value){
  if(Array.isArray(value)) return value.map(stable);
  if(value&&typeof value==='object') return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,stable(v)]));
  return value;
}
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
const round=(n)=>Number(n.toFixed(3));

/** Deterministic preproduction edit map, NOT a review of rendered frames or completed music. */
export function compileEmotionalEditMap(input,{plan,frameRate=24}={}){
  const campaign=normalizeCommercialCampaign(input);
  const compiled=plan??compileCommercialAttention(campaign);
  if(compiled.schema!=='evercraft.graphics-command.commercial-plan.v1'||compiled.campaignDigest!==campaign.digest){
    throw new Error('emotional_edit_campaign_plan_mismatch');
  }
  if(!Number.isInteger(frameRate)||frameRate<12||frameRate>120) throw new Error('emotional_edit_frame_rate_invalid');
  if(compiled.motion?.beats?.length!==campaign.shots.length) throw new Error('emotional_edit_shot_alignment_invalid');
  let elapsed=0;
  const beats=campaign.shots.map((shot,index)=>{
    const planShot=compiled.motion.beats[index];
    if(planShot.id!==shot.id||planShot.durationSec!==shot.durationSec) throw new Error('emotional_edit_shot_alignment_invalid');
    const grammar=GRAMMAR[shot.beat]??GRAMMAR.setup;
    const startFrame=Math.round(elapsed*frameRate);
    elapsed+=shot.durationSec;
    const endFrame=Math.round(elapsed*frameRate);
    const midpointFrame=startFrame+Math.floor((endFrame-startFrame)/2);
    const narrationLine=campaign.creative.sonicHook[index]||null;
    return {
      shotId:shot.id,beat:shot.beat,startFrame,endFrame,frames:endFrame-startFrame,
      startSec:round(startFrame/frameRate),endSec:round(endFrame/frameRate),
      targetEmotion:grammar.feeling,emotionalEnergy:grammar.energy,viewerQuestion:grammar.question,
      physicalAction:shot.intent,visualDirection:grammar.picture,cameraDirection:grammar.camera,
      soundDirection:grammar.sound,narrationCandidate:narrationLine,
      onScreenText:shot.screenText,sourceState:campaign.truthState,
      syncPoints:[
        {frame:startFrame,event:'enter_new_information',sound:'sound_bridge_or_deliberate_silence'},
        {frame:midpointFrame,event:'subject_reveal_or_action_change',sound:'accent_only_if_picture_earns_it'},
        {frame:Math.max(startFrame,endFrame-1),event:'handoff_to_next_beat',sound:'do_not_mask_next_line'},
      ],
    };
  });
  const warnings=[];
  if(!campaign.creative.sonicHook.length) warnings.push('voice_or_music_concept_unset');
  if(campaign.creative.sonicHook.length<campaign.shots.length) warnings.push('some_shots_have_no_narration_candidate');
  if(!campaign.creative.guardrails.length) warnings.push('creative_guardrails_missing');
  if(!String(input?.creative?.humanStake||'').trim()) warnings.push('human_stake_not_explicitly_directed');
  const core={
    schema:'evercraft.graphics-command.emotional-edit-map.v1',
    campaignId:campaign.id,campaignDigest:campaign.digest,planDigest:compiled.digest,
    frameRate,durationFrames:Math.round(elapsed*frameRate),durationSec:round(Math.round(elapsed*frameRate)/frameRate),
    objective:'Move from recognition to understanding to an earned next action, with picture and sound expressing the same story beat.',
    beats,warnings,
    productionChecklist:[
      {id:'meaningful_subject',status:'unverified',evidenceRequired:'Frame examples proving each beat depicts its required person, object, place or process.'},
      {id:'emotion_continuity',status:'unverified',evidenceRequired:'Human blind review of the complete cut and the intended emotional transitions.'},
      {id:'visual_observer',status:'unverified',evidenceRequired:'Artifact-bound shot and sequence aesthetic verification, not a storyboard score.'},
      {id:'audio_sync',status:'unverified',evidenceRequired:'Listen to the finished audio/picture cut; verify narration space, musical accents and sound bridges.'},
      {id:'platform_exports',status:'unverified',evidenceRequired:'Visual inspection of 9:16, 4:5 and 16:9 exports including platform safe areas.'},
      {id:'sound_off_captions',status:'unverified',evidenceRequired:'Comprehension test muted plus accurate captions, without burying the visual subject.'},
      {id:'rights_truth',status:'unverified',evidenceRequired:'Music, voices, source footage, modeled/synthetic labels and offer receipts.'},
      {id:'flash_motion_safety',status:'unverified',evidenceRequired:'Flash and rapid-motion safety review plus reduced-motion alternative where relevant.'},
      {id:'conversion_path',status:'unverified',evidenceRequired:'Observed product or checkout route with correct price and one coherent next action.'},
    ],
    boardroomHandoff:{state:'prepared_not_convened',reviewRequests:[
      'Story: Does each beat change what the viewer understands?',
      'Cinematography: Is subject, scale and camera motivation legible?',
      'Editing: Are cuts motivated and paced to comprehension?',
      'Sound: Does score collaborate with motion without masking dialogue?',
      'Human connection: What feeling is earned rather than asserted?',
      'Art direction: Is it recognizable, restrained, and specific to the subject?',
      'Truth: Is every observed, modeled and synthetic element labeled correctly?',
      'Accessibility: Does it work muted, captioned, mobile and with reduced motion?',
      'Conversion: Is the offer genuine and the next step obvious?',
    ],requiredInputs:['rendered_frames','full_audio_video_cut','asset_rights_receipts','live_offer_or_checkout_proof']},
    boundaries:{systemiaAdmissionRequired:true,providerCallsPerformed:0,boardroomReviewsPerformed:0,renderedArtifactsVerified:0,publicationAuthority:false},
  };
  return {...core,digest:hash(core)};
}
