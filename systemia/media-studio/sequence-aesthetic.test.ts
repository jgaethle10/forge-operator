import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assessSequenceAesthetics,
  type SelectedShotAestheticEvidence,
  type SequenceAestheticVerifierReceipt,
} from './sequence-aesthetic.js';
import type { CinematicSequencePlan, CinematicShotContract } from './cinematic-sequence.js';
import type { ShotCandidate, VisualObservationReceipt } from './shot-tournament.js';
import type { VisualObservationPacket } from './visual-observer.js';

function shot(id:string,index:number,scale:CinematicShotContract['shotScale'],movement:CinematicShotContract['cameraMovement'],lensMm:number,durationSec:number):CinematicShotContract{
  return {
    schema:'evercraft.fallen.cinematic-shot-contract.v1',
    sequenceId:'seq',id,needId:'need-'+id,index,locationId:'bridge',durationSec,
    aspectRatio:'16:9',continuityDigest:'c',shotScale:scale,lensMm,cameraMovement:movement,
    screenDirection:'left_to_right',axisReset:false,characters:[],sourceRefs:['story'],
    baseReferences:[],mustProvideStartFrame:false,prompt:'shot'
  };
}

function plan(shots:CinematicShotContract[]):CinematicSequencePlan{
  return {
    schema:'evercraft.fallen.cinematic-sequence-plan.v1',id:'seq',status:'accepted',
    shots,errors:[],warnings:[],continuityDigest:'c',digest:'p'.repeat(64),
    boundaries:{
      identityReferencesRequired:true,environmentReferencesRequired:true,
      actionContinuityFailsClosed:true,axisCrossingFailsClosed:true,
      carryInFramesRequiredWhenContinuous:true,directPublicationAuthority:false
    },
    createdAt:'2026-09-30T00:00:00Z'
  };
}

function evidence(s:CinematicShotContract):SelectedShotAestheticEvidence{
  const digest=(s.index+1).toString(16).repeat(64).slice(0,64);
  const candidate:ShotCandidate={
    id:'candidate-'+s.id,shotId:s.id,artifactPath:'/tmp/'+s.id+'.mp4',
    artifactDigest:digest,kind:'video',durationSec:s.durationSec,aspectRatio:'16:9',
    sourceState:'generated_visualization',provenance:'complete',syntheticLabelPresent:true,
    subjectIds:[],observations:[]
  };
  const packet:VisualObservationPacket={
    schema:'evercraft.fallen.visual-observation-packet.v1',
    candidateId:candidate.id,shotId:s.id,artifactPath:candidate.artifactPath,
    artifactDigest:digest,kind:'video',durationSec:s.durationSec,aspectRatio:'16:9',
    subjectIds:[],requestedMetrics:['composition','motion_quality','beauty','editability'],
    frames:[{index:0,timestampSec:.2,path:'/tmp/f.jpg',sha256:'f'.repeat(64)}],
    objective:{width:1920,height:1080,durationSec:s.durationSec,fps:30,motionActivity:.14}
  };
  const metrics:VisualObservationReceipt['metric'][]=['composition','motion_quality','beauty','editability'];
  const receipts=metrics.map(metric=>({
    schema:'evercraft.fallen.visual-observation.v1' as const,
    candidateId:candidate.id,metric,verifierId:'v',verifierState:'verified' as const,
    score:.9,threshold:.7,evidenceRefs:[digest]
  }));
  return {shotId:s.id,candidate,observationPacket:packet,receipts};
}

function verifier(p:CinematicSequencePlan,selected:SelectedShotAestheticEvidence[]):SequenceAestheticVerifierReceipt{
  const metrics:any[]=[
    'edit_rhythm','composition_variety','camera_motivation','motion_naturalism',
    'performance_naturalism','visual_hierarchy','tone_coherence','spectacle_restraint'
  ].map(metric=>({metric,score:.9,threshold:.76,findings:[]}));
  return {
    schema:'evercraft.fallen.sequence-aesthetic-verifier-receipt.v1',
    sequenceId:p.id,planDigest:p.digest,
    selectedArtifacts:selected.map(item=>({shotId:item.shotId,artifactDigest:item.candidate.artifactDigest})),
    verifierId:'sequence-review-v1',verifierState:'verified',metrics,evidenceRefs:['review:seq']
  };
}

test('accepts a varied sequence only when selected-shot evidence and whole-sequence verifier agree',()=>{
  const p=plan([
    shot('a',0,'wide','locked',28,4.2),
    shot('b',1,'medium','dolly_in',50,2.8),
    shot('c',2,'close','handheld',85,3.5),
    shot('d',3,'medium_wide','follow',35,5.1),
    shot('e',4,'extreme_close','locked',100,2.4),
  ]);
  const selected=p.shots.map(evidence);
  const report=assessSequenceAesthetics({plan:p,selected,verifierReceipt:verifier(p,selected)});
  assert.equal(report.status,'accepted');
  assert.equal(report.perShot.every(row=>row.status==='accepted'),true);
  assert.equal(report.sequenceMetrics.length,8);
  assert.equal(report.boundaries.structuralHeuristicsAreNotAestheticTruth,true);
});

test('rejects copy-paste shot grammar even with high verifier scores',()=>{
  const shots=Array.from({length:5},(_,index)=>shot('s'+index,index,'medium','locked',50,4));
  const p=plan(shots),selected=shots.map(evidence);
  const report=assessSequenceAesthetics({plan:p,selected,verifierReceipt:verifier(p,selected)});
  assert.equal(report.status,'rejected');
  assert.ok(report.reasons.includes('shot_scale_run_too_repetitive'));
  assert.ok(report.reasons.includes('camera_movement_run_too_repetitive'));
  assert.ok(report.warnings.includes('lens_palette_narrow'));
  assert.ok(report.warnings.includes('cut_duration_pattern_mechanically_uniform'));
});

test('a beautiful shot with missing motion-quality evidence still fails the sequence',()=>{
  const p=plan([
    shot('a',0,'wide','locked',28,4),
    shot('b',1,'medium','dolly_in',50,3),
  ]);
  const selected=p.shots.map(evidence);
  selected[1].receipts=selected[1].receipts.filter(row=>row.metric!=='motion_quality');
  const report=assessSequenceAesthetics({plan:p,selected,verifierReceipt:verifier(p,selected)});
  assert.equal(report.status,'rejected');
  assert.ok(report.reasons.includes('shot_aesthetic_evidence_failed:b'));
  assert.ok(report.perShot[1].reasons.includes('required_visual_metric_failed_or_missing:motion_quality'));
});

test('whole-sequence verifier cannot review one set of winning artifacts and admit another',()=>{
  const p=plan([
    shot('a',0,'wide','locked',28,4),
    shot('b',1,'close','handheld',85,3),
  ]);
  const selected=p.shots.map(evidence);
  const receipt=verifier(p,selected);
  receipt.selectedArtifacts[1].artifactDigest='0'.repeat(64);
  const report=assessSequenceAesthetics({plan:p,selected,verifierReceipt:receipt});
  assert.equal(report.status,'rejected');
  assert.ok(report.reasons.includes('sequence_aesthetic_selected_artifacts_mismatch'));
});

test('one weak sequence-level dimension fails instead of averaging away the problem',()=>{
  const p=plan([
    shot('a',0,'wide','locked',28,4),
    shot('b',1,'medium','dolly_in',50,3),
  ]);
  const selected=p.shots.map(evidence);
  const receipt=verifier(p,selected);
  const motion=receipt.metrics.find(row=>row.metric==='motion_naturalism');
  if(motion) motion.score=.55;
  const report=assessSequenceAesthetics({plan:p,selected,verifierReceipt:receipt});
  assert.equal(report.status,'rejected');
  assert.ok(report.reasons.includes('sequence_aesthetic_metric_failed:motion_naturalism'));
});
