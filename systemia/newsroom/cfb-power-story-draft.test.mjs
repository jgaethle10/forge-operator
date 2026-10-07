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
