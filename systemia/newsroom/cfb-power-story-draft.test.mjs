import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCfbPowerStoryDraft } from './cfb-power-story-draft.mjs';

function ranking(){
  const rows = Array.from({length:25}, (_, i) => ({
    rank:i+1,
    previous_rank:null,
    movement:null,
    movement_state:'new',
    team_id:'team-' + (i+1),
    team_name:i===0 ? 'Alpha State' : 'Team ' + (i+1),
    record:{wins:5, losses:0, games:5, win_pct:1},
    components:{
      result_quality:90-i,
      efficiency:88-i,
      schedule_strength:60,
      road_neutral:80,
      recent_form:85,
      availability:null,
      turnover_sustainability:null
    },
    confidence:0.84,
    power_score:90-i,
    source_refs:['ncaa-game:' + (1000+i)],
  }));
  return {
    schema:'evercraft.cfb-power-rankings.v1',
    run_id:'cfbpi:test123',
    season:2026,
    week_label:'Through 2026-10-03',
    evidence_snapshot_id:'snapshot:test',
    evidence_through_at:'2026-10-03T23:59:59.999Z',
    model:{model_version:'evercraft-cfbpi-0.2.0'},
    rankings:rows,
  };
}
function ledger(){
  return {
    schema:'evercraft.cfb.completed-game-ledger.v1',
    games:Array.from({length:391}, (_, i) => ({game_id:String(i)})),
    source_urls:['https://sdataprod.ncaa.com/?variables=test-week-5'],
  };
}
function pollComparison(runId='cfbpi:test123'){
  return {
    schema:'evercraft.cfb.poll-comparison.v1',
    ranking_run_id:runId,
    authority_boundary:{
      poll_used_as_model_input:false,
      comparison_only:true,
      disagreement_is_not_outcome_truth:true,
    },
    poll:{
      poll_id:'ap-top25',
      poll_name:'AP Top 25',
      published_date:'2026-10-04',
      source_authority:'Associated Press',
      source_url:'https://example.test/ap',
    },
    summary:{overlap_count:20},
    largest_disagreements:[
      {
        team_id:'team-1',
        team_name:'Alpha State',
        evercraft_rank:1,
        poll_rank:9,
        rank_delta:8,
        absolute_gap:8,
      },
    ],
  };
}

test('turns one ranking receipt into a Journal draft with a native Top 25 and Fallen brief', () => {
  const story = buildCfbPowerStoryDraft({
    ranking:ranking(),
    ledger:ledger(),
    generatedAt:'2026-10-04T17:00:00Z'
  });
  assert.equal(story.status, 'draft');
  assert.equal(story.editorial_gate.status, 'pending');
  assert.equal(story.ranking_table.rows.length, 25);
  assert.equal(story.ranking_table.rows[0].team_name, 'Alpha State');
  assert.equal(story.fallen_brief.contract, 'evercraft.fallen.journal.production.v1');
  assert.equal(story.fallen_brief.visual_story.metrics.length, 5);
  assert.equal(story.claims[0].claim.includes('391 completed games'), true);
});
test('refuses to create a publishable-looking story from an incomplete ranking', () => {
  const fixture = ranking();
  fixture.rankings = fixture.rankings.slice(0, 20);
  assert.throws(() => buildCfbPowerStoryDraft({ranking:fixture, ledger:ledger()}), /top_25_required/);
});


test('accepts NCAA ledger v2 and preserves membership plus authority in machine evidence', () => {
  const nextLedger=ledger();
  nextLedger.schema='evercraft.cfb.completed-game-ledger.v2';
  nextLedger.source='ncaa-sdataprod';
  nextLedger.source_authority='NCAA';
  nextLedger.season=2026;
  nextLedger.through_date='2026-10-03';
  nextLedger.fetched_weeks=[1,2,3,4,5];
  nextLedger.membership={
    schema:'evercraft.cfb.fbs-team-membership.v2',
    derivation:'Repeated team appearances inside NCAA division-11 FBS scoreboard results.',
    teams:[{team_id:'alpha-state',team_name:'Alpha State'}],
  };
  const story=buildCfbPowerStoryDraft({
    ranking:ranking(),
    ledger:nextLedger,
    generatedAt:'2026-10-04T17:00:00Z'
  });
  const evidence=story.machine_evidence.payload.ledger;
  assert.equal(evidence.schema,'evercraft.cfb.completed-game-ledger.v2');
  assert.equal(evidence.source_authority,'NCAA');
  assert.equal(evidence.through_date,'2026-10-03');
  assert.deepEqual(evidence.fetched_weeks,[1,2,3,4,5]);
  assert.equal(evidence.membership.schema,'evercraft.cfb.fbs-team-membership.v2');
});

test('surfaces receipt-backed movement and comparison-only poll disagreements',()=>{
  const fixture=ranking();
  fixture.rankings[0].previous_rank=3;
  fixture.rankings[0].movement=2;
  fixture.rankings[0].movement_state='up';
  fixture.rankings[1].previous_rank=1;
  fixture.rankings[1].movement=-1;
  fixture.rankings[1].movement_state='down';
  const comparison=pollComparison(fixture.run_id);
  const story=buildCfbPowerStoryDraft({
    ranking:fixture,
    ledger:ledger(),
    pollComparison:comparison,
    generatedAt:'2026-10-04T17:00:00Z',
  });
  const movement=story.sections.find(section=>section.heading==='Movement since the last edition');
  const poll=story.sections.find(section=>section.heading==='Where Evercraft disagrees with AP Top 25');
  assert.ok(movement);
  assert.match(movement.body,/Alpha State up 2 to No\. 1/);
  assert.ok(poll);
  assert.match(poll.body,/not evidence that Evercraft or the poll is already correct/);
  assert.equal(story.machine_evidence.payload.poll_comparison.ranking_run_id,fixture.run_id);
  assert.equal(story.sources.some(source=>source.source_id==='cfb-poll-baseline-ap-top25'),true);
  assert.equal(story.claims.some(claim=>claim.evidence_state==='verified_comparison_only'),true);
});

test('poll comparison must match the exact ranking run and remain comparison-only',()=>{
  assert.throws(()=>buildCfbPowerStoryDraft({
    ranking:ranking(),
    ledger:ledger(),
    pollComparison:pollComparison('wrong-run'),
  }),/poll_comparison_run_mismatch/);
  const invalid=pollComparison();
  invalid.authority_boundary.poll_used_as_model_input=true;
  assert.throws(()=>buildCfbPowerStoryDraft({
    ranking:ranking(),
    ledger:ledger(),
    pollComparison:invalid,
  }),/poll_comparison_authority_invalid/);
});
