import assert from 'node:assert/strict';
import test from 'node:test';
import { runShotTournament, TOURNAMENT_ROLES } from './shot-tournament-runner.mjs';

function observation(candidateId,metric,score,threshold=.8,subjectId){
  return {
    schema:'evercraft.fallen.visual-observation.v1',
    candidateId,
    metric,
    verifierId:'verifier-'+metric,
    verifierState:'verified',
    score,
    threshold,
    evidenceRefs:['frame-sha256:'+candidateId+':'+metric],
    ...(subjectId?{subjectId}:{}),
  };
}

function candidate(id,beauty,continuity=.9){
  return {
    id,
    shotId:'shot-1',
    artifactPath:'/tmp/'+id+'.mp4',
    artifactDigest:(id==='a'?'a':'b').repeat(64),
    kind:'video',
    durationSec:5,
    aspectRatio:'16:9',
    sourceState:'generated_visualization',
    provenance:'complete',
    syntheticLabelPresent:true,
    providerId:'provider-'+id,
    providerModel:'model-'+id,
    subjectIds:['subject-1'],
    observations:[
      observation(id,'subject_coverage',.94,.85,'subject-1'),
      observation(id,'composition',id==='a'?.94:.84),
      observation(id,'motion_quality',id==='a'?.92:.83),
      observation(id,'continuity',continuity,.85),
      observation(id,'brand_fidelity',id==='a'?.91:.86),
      observation(id,'beauty',beauty,.8),
      observation(id,'editability',1,1),
    ],
  };
}

test('eight-judge tournament emits the exact selection receipt timeline ingest expects',async()=>{
  assert.equal(TOURNAMENT_ROLES.length,8);
  const result=await runShotTournament({
    schema:'evercraft.fallen.shot-tournament-run.v1',
    needId:'need-1',
    shotId:'shot-1',
    creativeGenomeDigest:'genome-1',
    candidates:[
      candidate('a',.97),
      candidate('b',.82),
    ],
  });
  assert.equal(result.status,'selected');
  assert.equal(result.selectionReceipt.schema,'evercraft.fallen.shot-selection-receipt.v1');
  assert.equal(result.selectionReceipt.needId,'need-1');
  assert.equal(result.selectionReceipt.candidateId,'a');
  assert.equal(result.selectionReceipt.artifactDigest,'a'.repeat(64));
  assert.equal(result.selectionReceipt.creativeGenomeDigest,'genome-1');
  assert.equal(result.selectionReceipt.tournamentReceiptDigest,result.tournamentReceiptDigest);
  assert.equal(result.judgeReceipts.length,16);
  assert.equal(result.boundaries.selectionAdvancesToProductionAdmissionOnly,true);
  assert.equal(result.boundaries.publicationAuthorityGranted,false);
});

test('hard continuity failure blocks the prettier candidate from selection',async()=>{
  const prettyWrong=candidate('a',.99,.4);
  const solid=candidate('b',.86,.94);
  const result=await runShotTournament({
    schema:'evercraft.fallen.shot-tournament-run.v1',
    needId:'need-2',
    shotId:'shot-1',
    creativeGenomeDigest:'genome-1',
    candidates:[prettyWrong,solid],
  });
  assert.equal(result.status,'selected');
  assert.equal(result.selectionReceipt.candidateId,'b');
  assert.ok(
    result.reconciliation.blocked.some(
      row=>row.candidate_id==='a'&&row.hard_fail_roles.includes('continuity_judge')
    )
  );
});

test('missing verified hard-gate observation can block the whole tournament',async()=>{
  const a=candidate('a',.95);
  const b=candidate('b',.94);
  a.observations=a.observations.filter(row=>row.metric!=='editability');
  b.observations=b.observations.filter(row=>row.metric!=='editability');
  const result=await runShotTournament({
    schema:'evercraft.fallen.shot-tournament-run.v1',
    needId:'need-3',
    shotId:'shot-1',
    creativeGenomeDigest:'genome-1',
    candidates:[a,b],
  });
  assert.equal(result.status,'blocked');
  assert.equal(result.selectionReceipt,null);
  assert.equal(result.reconciliation.rankable_candidate_count,0);
});

test('candidate digest and shot identity are validated before judging',async()=>{
  await assert.rejects(
    ()=>runShotTournament({
      schema:'evercraft.fallen.shot-tournament-run.v1',
      needId:'need-4',
      shotId:'shot-1',
      creativeGenomeDigest:'genome-1',
      candidates:[
        candidate('a',.9),
        {...candidate('b',.9),shotId:'other-shot'},
      ],
    }),
    /tournament_run_candidate_shot_mismatch:b/
  );
});
