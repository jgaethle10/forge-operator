import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_VISUAL_STRATEGY,
  buildShotTournamentCandidates,
  normalizeVisualStrategy,
  rankShotTournament,
} from './shot-tournament.mjs';

const story={
  schema:'evercraft.visual-story.v1',
  digest:'story-digest',
};

const plan={
  schema:'evercraft.graphics-command.plan.v1',
  digest:'plan-digest',
  geography:{
    boundaryId:'us-wa-state-outline-cc0-v1',
    terrain:{id:'usgs-wa-shaded-relief-3dep-v1'},
  },
};

function passReports(){
  return Object.fromEntries(['feed','square','story'].map(format=>[
    format,
    {
      schema:'evercraft.graphics-command.poster-layout-report.v1',
      format,
      status:'pass',
      issueCount:0,
      issues:[],
      checks:{regionIdentityClear:true},
      publicationAuthority:false,
    }
  ]));
}

test('Shot Tournament emits three deterministic visual strategies',()=>{
  const candidates=buildShotTournamentCandidates(story,plan);
  assert.deepEqual(candidates.map(row=>row.id),['terrain-hero','balanced-relief','cascade-signal']);
  assert.equal(candidates[0].publicationAuthority,false);
  assert.match(candidates[0].digest,/^[a-f0-9]{64}$/);
  assert.ok(candidates[0].strategy.routeOpacity<candidates[2].strategy.routeOpacity);
  assert.ok(candidates[0].strategy.terrainBaseOpacity>candidates[2].strategy.terrainBaseOpacity);
});

test('strategy normalization clamps unsafe extremes',()=>{
  const normalized=normalizeVisualStrategy({
    terrainBaseOpacity:4,
    routeOpacity:-2,
    pointScale:9,
    regionLabelOpacity:0,
  });
  assert.equal(normalized.terrainBaseOpacity,1);
  assert.equal(normalized.routeOpacity,.01);
  assert.equal(normalized.pointScale,1.28);
  assert.equal(normalized.regionLabelOpacity,.16);
  assert.deepEqual(normalizeVisualStrategy({}),DEFAULT_VISUAL_STRATEGY);
});

test('terrain-backed tournament prefers the terrain-first candidate when all layouts pass',()=>{
  const candidates=buildShotTournamentCandidates(story,plan);
  const layoutByCandidate=Object.fromEntries(candidates.map(row=>[row.id,passReports()]));
  const report=rankShotTournament({story,plan,candidates,layoutByCandidate});
  assert.equal(report.schema,'evercraft.graphics-command.shot-tournament.v1');
  assert.equal(report.winnerId,'terrain-hero');
  assert.equal(report.candidateCount,3);
  assert.equal(report.candidates[0].hardGate,'pass');
  assert.equal(report.humanReviewRequired,true);
  assert.equal(report.publicationAuthority,false);
  assert.match(report.digest,/^[a-f0-9]{64}$/);
});

test('a visually stronger candidate cannot win after any layout hard-gate rejection',()=>{
  const candidates=buildShotTournamentCandidates(story,plan);
  const layoutByCandidate=Object.fromEntries(candidates.map(row=>[row.id,passReports()]));
  layoutByCandidate['terrain-hero'].story={...layoutByCandidate['terrain-hero'].story,status:'reject',issues:['region_label_overlap:x']};
  const report=rankShotTournament({story,plan,candidates,layoutByCandidate});
  assert.notEqual(report.winnerId,'terrain-hero');
  assert.equal(report.candidates.find(row=>row.id==='terrain-hero').hardGate,'reject');
});
