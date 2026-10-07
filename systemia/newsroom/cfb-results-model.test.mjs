import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCfbPowerIndexInputFromGames } from './cfb-results-model.mjs';

const teams=[
  {team_id:'1',team_name:'Alpha State'},
  {team_id:'2',team_name:'Beta Tech'},
  {team_id:'3',team_name:'Gamma'},
];
const games=[
  {game_id:'g1',date:'2026-09-05T20:00:00.000Z',neutral_site:false,home:{team_id:'1',team_name:'Alpha State',score:31},away:{team_id:'2',team_name:'Beta Tech',score:24},source_ref:'ncaa-game:g1'},
  {game_id:'g2',date:'2026-09-12T20:00:00.000Z',neutral_site:false,home:{team_id:'3',team_name:'Gamma',score:14},away:{team_id:'1',team_name:'Alpha State',score:35},source_ref:'ncaa-game:g2'},
  {game_id:'g3',date:'2026-09-19T20:00:00.000Z',neutral_site:false,home:{team_id:'2',team_name:'Beta Tech',score:27},away:{team_id:'3',team_name:'Gamma',score:17},source_ref:'ncaa-game:g3'},
];
test('builds results-first CFBPI inputs without inventing injury or turnover values',()=>{
  const input=buildCfbPowerIndexInputFromGames({
    season:2026,
    weekLabel:'Entering Week 4',
    evidenceSnapshotId:'snapshot:test',
    evidenceThroughAt:'2026-09-20T06:59:59.999Z',
    teams,games,
  });
  const alpha=input.teams.find(team=>team.team_id==='1');
  assert.deepEqual(alpha.record,{wins:2,losses:0});
  assert.equal(alpha.components.availability,null);
  assert.equal(alpha.components.turnover_sustainability,null);
  assert.ok(alpha.components.schedule_strength>=0);
  assert.ok(alpha.components.schedule_strength<=100);
  assert.ok(alpha.components.road_neutral>50);
  assert.deepEqual(alpha.source_refs,['ncaa-game:g1','ncaa-game:g2']);
});
test('a stronger completed-results profile produces stronger result quality',()=>{
  const input=buildCfbPowerIndexInputFromGames({
    season:2026,
    weekLabel:'Entering Week 4',
    evidenceSnapshotId:'snapshot:test',
    evidenceThroughAt:'2026-09-20T06:59:59.999Z',
    teams,games,
  });
  const alpha=input.teams.find(team=>team.team_id==='1');
  const gamma=input.teams.find(team=>team.team_id==='3');
  assert.ok(alpha.components.result_quality>gamma.components.result_quality);
  assert.ok(alpha.components.efficiency>gamma.components.efficiency);
});


test('a non-FBS opponent does not receive average-FBS schedule credit',()=>{
  const localTeams=[
    {team_id:'alpha',team_name:'Alpha'},
    {team_id:'beta',team_name:'Beta'},
  ];
  const localGames=[
    {game_id:'g1',date:'2026-09-05T20:00:00.000Z',neutral_site:false,home:{team_id:'alpha',team_name:'Alpha',score:42},away:{team_id:'visitor',team_name:'Visitor',score:7},source_ref:'ncaa-game:g1'},
    {game_id:'g2',date:'2026-09-12T20:00:00.000Z',neutral_site:false,home:{team_id:'beta',team_name:'Beta',score:14},away:{team_id:'alpha',team_name:'Alpha',score:21},source_ref:'ncaa-game:g2'},
  ];
  const input=buildCfbPowerIndexInputFromGames({
    season:2026,
    weekLabel:'Entering Week 3',
    evidenceSnapshotId:'snapshot:non-fbs',
    evidenceThroughAt:'2026-09-13T06:59:59.999Z',
    teams:localTeams,
    games:localGames,
  });
  const alpha=input.teams.find(team=>team.team_id==='alpha');
  assert.ok(alpha.components.schedule_strength<50);
  assert.equal(alpha.model_observations.fcs_opponent_baseline,-12);
});
