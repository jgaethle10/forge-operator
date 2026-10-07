import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCfbPowerRankings,
  CFB_POWER_INDEX_INPUT_SCHEMA,
  DEFAULT_CFB_POWER_MODEL,
} from './cfb-power-index.mjs';

function input(){
  return {
    schema:CFB_POWER_INDEX_INPUT_SCHEMA,
    season:2026,
    week_label:'Entering Week 6',
    evidence_snapshot_id:'cfb:2026:through-2026-10-03',
    evidence_through_at:'2026-10-04T07:00:00.000Z',
    generated_at:'2026-10-04T14:00:00.000Z',
    previous_ranks:{
      alabama:7,
      missouri:25,
      indiana:6,
    },
    teams:[
      {
        team_id:'alabama',
        team_name:'Alabama',
        record:{wins:5,losses:0},
        components:{
          result_quality:94,
          efficiency:95,
          schedule_strength:82,
          road_neutral:95,
          recent_form:97,
          availability:88,
          turnover_sustainability:76,
        },
        evidence_confidence:0.98,
        best_win:'56-23 at No. 16 Mississippi State',
        source_refs:['game:alabama-mississippi-state','season:alabama'],
        explanation:'Dominant road result plus elite efficiency keeps the profile near the top.',
      },
      {
        team_id:'indiana',
        team_name:'Indiana',
        record:{wins:5,losses:0},
        components:{
          result_quality:89,
          efficiency:96,
          schedule_strength:74,
          road_neutral:91,
          recent_form:96,
          availability:92,
          turnover_sustainability:84,
        },
        evidence_confidence:0.97,
        best_win:'47-15 at Rutgers',
        source_refs:['game:indiana-rutgers','season:indiana'],
        explanation:'The defending champion continues to crush opponents, with schedule strength the main separator.',
      },
      {
        team_id:'missouri',
        team_name:'Missouri',
        record:{wins:4,losses:1},
        components:{
          result_quality:91,
          efficiency:92,
          schedule_strength:79,
          road_neutral:70,
          recent_form:98,
          availability:90,
          turnover_sustainability:80,
        },
        evidence_confidence:0.96,
        best_win:'45-17 vs No. 8 Florida',
        worst_result:'One earlier loss',
        source_refs:['game:missouri-florida','season:missouri'],
        explanation:'The Florida demolition is a major signal, but the full-season profile still contains a loss.',
      },
    ],
  };
}

test('produces a deterministic receipt-like ranking run with movement',()=>{
  const first=buildCfbPowerRankings(input());
  const second=buildCfbPowerRankings(input());
  assert.deepEqual(first,second);
  assert.match(first.run_id,/^cfbpi:[a-f0-9]{24}$/);
  assert.equal(first.rankings[0].team_id,'alabama');
  assert.equal(first.rankings[0].movement_state,'up');
  assert.equal(first.rankings.find(team=>team.team_id==='missouri').movement_state,'up');
  assert.equal(first.rules.missing_is_never_zero,true);
});

test('missing components are renormalized and reduce coverage instead of becoming fake zeroes',()=>{
  const fixture=input();
  const missouri=fixture.teams.find(team=>team.team_id==='missouri');
  delete missouri.components.road_neutral;
  const report=buildCfbPowerRankings(fixture);
  const row=report.rankings.find(team=>team.team_id==='missouri');
  assert.equal(row.components.road_neutral,null);
  assert.ok(row.component_coverage<1);
  assert.ok(row.missing_data_penalty_applied>0);
  assert.ok(row.power_score>70);
  assert.equal(row.missing_components.includes('road_neutral'),true);
});

test('rejects duplicate team identities so a feed cannot double-count one program',()=>{
  const fixture=input();
  fixture.teams.push({...fixture.teams[0]});
  assert.throws(()=>buildCfbPowerRankings(fixture),/duplicate_team_id/);
});

test('requires evidence lineage for every ranked team',()=>{
  const fixture=input();
  fixture.teams[0].source_refs=[];
  assert.throws(()=>buildCfbPowerRankings(fixture),/source_refs_required/);
});

test('rejects a model whose weights do not sum to one',()=>{
  const fixture=input();
  const broken={
    ...DEFAULT_CFB_POWER_MODEL,
    components:{result_quality:0.8,efficiency:0.8},
  };
  assert.throws(()=>buildCfbPowerRankings(fixture,{model:broken}),/weights_must_sum_to_1/);
});
