import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApprovedCfbPowerStory, preflightCfbPowerRelease } from './cfb-power-release.mjs';

function ranking(){
  const rows=Array.from({length:25},(_,i)=>({
    rank:i+1,
    previous_rank:null,
    movement:null,
    movement_state:'new',
    team_id:'team-'+(i+1),
    team_name:i===0?'Alpha State':'Team '+(i+1),
    record:{wins:5,losses:0,games:5,win_pct:1},
    components:{
      result_quality:90-i,
      efficiency:88-i,
      schedule_strength:60,
      road_neutral:80,
      recent_form:85,
      availability:null,
      turnover_sustainability:null,
    },
    confidence:0.84,
    power_score:90-i,
    source_refs:['ncaa-game:g'+(i+1)],
    explanation:'Fixture result profile.',
  }));
  return {
    schema:'evercraft.cfb-power-rankings.v1',
    run_id:'cfbpi:release-test',
    season:2026,
    week_label:'Through 2026-10-03',
    evidence_snapshot_id:'snapshot:release-test',
    evidence_through_at:'2026-10-03T23:59:59.999Z',
    generated_at:'2026-10-04T16:00:00.000Z',
    model:{model_version:'evercraft-cfbpi-0.2.0'},
    rankings:rows,
  };
}

function pollComparison(runId='cfbpi:release-test'){
  return {
    schema:'evercraft.cfb.poll-comparison.v1',
    ranking_run_id:runId,
    authority_boundary:{poll_used_as_model_input:false,comparison_only:true},
    poll:{
      poll_id:'ap-top25',
      poll_name:'AP Top 25',
      published_date:'2026-10-04',
      source_authority:'Associated Press',
      source_url:'https://example.test/ap',
    },
    summary:{overlap_count:20},
    largest_disagreements:[
      {team_id:'team-1',team_name:'Alpha State',evercraft_rank:1,poll_rank:6,rank_delta:5,absolute_gap:5},
    ],
  };
}

function ledger(){
  return {
    schema:'evercraft.cfb.completed-game-ledger.v1',
    source:'ncaa-graphql-scoreboard',
    source_authority:'NCAA',
    start_date:'2026-08-15',
    end_date:'2026-10-03',
    source_urls:['https://sdataprod.ncaa.com/?variables=test'],
    games:Array.from({length:25},(_,i)=>({
      game_id:'g'+(i+1),
      source_ref:'ncaa-game:g'+(i+1),
    })),
  };
}

test('promotes a receipt-consistent CFB draft to approved Journal status',()=>{
  const generatedAt='2026-10-04T17:00:00.000Z';
  const {story,preflight}=buildApprovedCfbPowerStory({
    ranking:ranking(),
    ledger:ledger(),
    generatedAt,
  });
  assert.equal(preflight.status,'accepted');
  assert.equal(preflight.score,10);
  assert.match(preflight.digest,/^sha256:[a-f0-9]{64}$/);
  assert.equal(story.status,'approved');
  assert.equal(story.editorial_gate.status,'accepted');
  assert.equal(story.editorial_gate.score,10);
  assert.equal(story.editorial_gate.release_preflight_digest,preflight.digest);
  assert.equal(story.release_gate.ranking_run_id,'cfbpi:release-test');
});

test('fails closed when a ranking cites a game missing from the frozen ledger',()=>{
  const fixture=ranking();
  fixture.rankings[0].source_refs=['ncaa-game:not-in-ledger'];
  assert.throws(()=>preflightCfbPowerRelease({
    ranking:fixture,
    ledger:ledger(),
    generatedAt:'2026-10-04T17:00:00.000Z',
  }),/ranking_refs_missing_from_ledger/);
});

test('fails closed when the evidence ledger is not the NCAA GraphQL lane',()=>{
  const fixture=ledger();
  fixture.source='espn-site-api';
  assert.throws(()=>preflightCfbPowerRelease({
    ranking:ranking(),
    ledger:fixture,
    generatedAt:'2026-10-04T17:00:00.000Z',
  }),/ncaa_source_required/);
});

test('fails closed on duplicate visible ranks before publication',()=>{
  const fixture=ranking();
  fixture.rankings[1].rank=1;
  assert.throws(()=>preflightCfbPowerRelease({
    ranking:fixture,
    ledger:ledger(),
    generatedAt:'2026-10-04T17:00:00.000Z',
  }),/duplicate_rank/);
});

test('approved release preserves comparison-only poll receipt and binds it into preflight digest',()=>{
  const generatedAt='2026-10-04T17:00:00.000Z';
  const comparison=pollComparison();
  const {story,preflight}=buildApprovedCfbPowerStory({
    ranking:ranking(),
    ledger:ledger(),
    pollComparison:comparison,
    generatedAt,
  });
  assert.equal(story.machine_evidence.payload.poll_comparison.ranking_run_id,'cfbpi:release-test');
  assert.equal(story.sections.some(section=>section.heading==='Where Evercraft disagrees with AP Top 25'),true);
  assert.equal(preflight.status,'accepted');
  assert.match(preflight.digest,/^sha256:[a-f0-9]{64}$/);
});

test('release fails closed if a poll comparison claims model-input authority',()=>{
  const comparison=pollComparison();
  comparison.authority_boundary.poll_used_as_model_input=true;
  assert.throws(()=>preflightCfbPowerRelease({
    ranking:ranking(),
    ledger:ledger(),
    pollComparison:comparison,
    generatedAt:'2026-10-04T17:00:00.000Z',
  }),/poll_used_as_model_input/);
});

test('release fails closed if the comparison belongs to a different ranking run',()=>{
  assert.throws(()=>preflightCfbPowerRelease({
    ranking:ranking(),
    ledger:ledger(),
    pollComparison:pollComparison('cfbpi:other'),
    generatedAt:'2026-10-04T17:00:00.000Z',
  }),/poll_comparison_run_mismatch/);
});
