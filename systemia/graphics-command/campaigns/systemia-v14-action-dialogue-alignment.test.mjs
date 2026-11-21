import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import test from 'node:test';

const filename=path.join(path.dirname(fileURLToPath(import.meta.url)),'systemia-v14-action-dialogue-alignment.json');
const input=JSON.parse(readFileSync(filename,'utf8'));

export function validateDialogueActionAlignment(cut){
  assert.equal(cut?.schema,'evercraft.graphics-command.dialogue-action-alignment.v1');
  assert.equal(cut.picture?.fps,24);
  assert.equal(cut.picture?.durationSec,23.5);
  assert.equal(cut.picture?.width,1600);
  assert.equal(cut.picture?.height,900);
  assert.ok(Array.isArray(cut.actions)&&cut.actions.length>=4);
  assert.ok(Array.isArray(cut.dialogue)&&cut.dialogue.length===7);
  const ids=new Set();
  for(const c of cut.dialogue){
    assert.ok(!ids.has(c.id),'duplicate_voice_cue');
    ids.add(c.id);
    assert.ok(['agent','owner'].includes(c.speaker),'speaker_origin_unknown');
    assert.ok(c.startSec>=0 && c.endSec<=cut.picture.durationSec && c.endSec>c.startSec,'cue_time_out_of_range');
    assert.match(c.sourceSha256,/^[a-f0-9]{64}$/,'unbound_or_fake_voice_source');
  }
  const prior=cut.dialogue;
  for(let i=1;i<prior.length;i++){
    assert.ok(prior[i].startSec>=prior[i-1].endSec+.10,'speech_overlap_or_no_turn_gap');
  }
  const actions=new Map(cut.actions.map(a=>[a.id,a]));
  assert.equal(actions.size,cut.actions.length,'duplicate_action');
  const activeAction=actions.get('approval-required-on');
  const permissionOff=actions.get('send-without-approval-off');
  const confirm=actions.get('agent-confirm-safe');
  const resolution=prior.find(c=>c.id==='resolution');
  assert.ok(activeAction&&permissionOff&&confirm&&resolution,'missing_permission_causality');
  assert.ok(permissionOff.timeSec<activeAction.timeSec,'permission_event_order_reversed');
  assert.ok(confirm.timeSec>=activeAction.timeSec+.15,'agent_response_premature');
  assert.ok(resolution.startSec>=activeAction.timeSec+.15,'voice_before_ui_setting_finished');
  assert.ok(resolution.startSec>=confirm.timeSec,'response_does_not_follow_approval');
  for(const a of cut.actions){
    if(a.requiresCue)assert.ok(ids.has(a.requiresCue),'action_cue_unlinked');
    for(const dep of a.dependsOn||[]){
      const previous=actions.get(dep);
      assert.ok(previous&&previous.timeSec<=a.timeSec,'action_dependency_not_met');
    }
  }
  const gates=cut.admission;
  assert.equal(gates.humanActorPerformed,false,'human_actor_claim_not_proven');
  assert.equal(gates.dynamicResponseConditionedVoice,false,'true_dialogue_claim_not_proven');
  assert.equal(gates.commercialVoiceRightsVerified,false,'commercial_voice_rights_not_cleared');
  assert.equal(gates.productInterfaceVerified,false,'live_product_not_proven');
  assert.equal(gates.mediaAdmittedToFallen,false,'shot_tournament_not_passed');
  assert.equal(gates.universityEnrollmentVerified,false,'university_enrollment_unverified');
  assert.equal(gates.publicationAuthorized,false,'publishing_not_authorized');
  assert.equal(cut.audio?.newTtsGenerationThisCut,false,'false_neural_render_claim');
  return {status:'review_only',cueCount:prior.length,
    lastPermissionAt:activeAction.timeSec,agentReplyAt:resolution.startSec,
    acknowledgementDelaySec:Number((resolution.startSec-activeAction.timeSec).toFixed(3))};
}

test('V14 passes timing and release hold for seven complete turns',()=>{
  const receipt=validateDialogueActionAlignment(input);
  assert.equal(receipt.status,'review_only');
  assert.equal(receipt.cueCount,7);
  assert.ok(receipt.acknowledgementDelaySec>=.15);
});
test('fails if agent acknowledges before the permission changes',()=>{
  const wrong=structuredClone(input);
  wrong.dialogue.find(c=>c.id==='resolution').startSec=19.27;
  assert.throws(()=>validateDialogueActionAlignment(wrong),/voice_before_ui_setting_finished/);
});
test('fails on broken voice source evidence, hard overlaps or authority mutation',()=>{
  let wrong=structuredClone(input);
  wrong.dialogue[0].sourceSha256='example';
  assert.throws(()=>validateDialogueActionAlignment(wrong),/unbound_or_fake_voice_source/);
  wrong=structuredClone(input);
  wrong.dialogue[2].startSec=4.60;
  assert.throws(()=>validateDialogueActionAlignment(wrong),/speech_overlap_or_no_turn_gap/);
  wrong=structuredClone(input);
  wrong.admission.publicationAuthorized=true;
  assert.throws(()=>validateDialogueActionAlignment(wrong),/publishing_not_authorized/);
  wrong=structuredClone(input);
  wrong.admission.dynamicResponseConditionedVoice=true;
  assert.throws(()=>validateDialogueActionAlignment(wrong),/true_dialogue_claim_not_proven/);
});
