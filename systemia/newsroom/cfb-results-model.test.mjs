import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCfbPowerIndexInputFromGames } from './cfb-results-model.mjs';

const teams=[
  {team_id:'1',team_name:'Alpha State'},
  {team_id:'2',team_name:'Beta Tech'},
  {team_id:'3',team_name:'Gamma'},
];
const games=[
  {game_id:'g1',date:'2026-09-05T20:00:00.000Z',neutral_site:false,home:{team_id:'1',team_name:'Alpha State',score:31},away:{team_id:'2',team_name:'Beta Tech',score:24},source_ref:'espn-game:g1'},
  {game_id:'g2',date:'2026-09-12T20:00:00.000Z',neutral_site:false,home:{team_id:'3',team_name:'Gamma',score:14},away:{team_id:'1',team_name:'Alpha State',score:35},source_ref:'espn-game:g2'},
  {game_id:'g3',date:'2026-09-19T20:00:00.000Z',neutral_site:false,home:{team_id:'2',team_name:'Beta Tech',score:27},away:{team_id:'3',team_name:'Gamma',score:17},source_ref:'espn-game:g3'},
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
  assert.deepEqual(alpha.source_refs,['espn-game:g1','espn-game:g2']);
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
