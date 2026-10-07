import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runCfbPowerEvidenceCycle } from './cfb-power-runner.mjs';

function event(id,date,homeId,homeName,homeScore,awayId,awayName,awayScore){
  return {id,date,status:{type:{completed:true}},competitions:[{id,date,neutralSite:false,status:{type:{completed:true}},competitors:[
    {homeAway:'home',score:String(homeScore),team:{id:homeId,displayName:homeName}},
    {homeAway:'away',score:String(awayScore),team:{id:awayId,displayName:awayName}},
  ]}]};
}
test('materializes membership, game ledger, model input, ranking receipt and Top 25 surface',async()=>{
  const outDir=fs.mkdtempSync(path.join(os.tmpdir(),'cfb-power-run-'));
  const teams={sports:[{leagues:[{teams:[
    {team:{id:'1',displayName:'Alpha State'}},
    {team:{id:'2',displayName:'Beta Tech'}},
    {team:{id:'3',displayName:'Gamma'}},
  ]}]}]};
  const games=[
    event('g1','2026-09-05T20:00:00Z','1','Alpha State',31,'2','Beta Tech',24),
    event('g2','2026-09-06T20:00:00Z','3','Gamma',10,'1','Alpha State',28),
  ];
  const fetchImpl=async(url)=>({
    ok:true,status:200,
    async json(){
      if(String(url).includes('/teams?')) return teams;
      if(String(url).includes('dates=20260905')) return {events:[games[0]]};
      if(String(url).includes('dates=20260906')) return {events:[games[1]]};
      return {events:[]};
    },
  });
  const receipt=await runCfbPowerEvidenceCycle({
    season:2026,startDate:'2026-09-05',throughDate:'2026-09-06',
    weekLabel:'Entering Week 2',outDir,fetchImpl,
    now:new Date('2026-09-07T17:00:00Z'),
  });
  assert.equal(receipt.fbs_team_count,3);
  assert.equal(receipt.completed_game_count,2);
  assert.ok(receipt.ranked_team_count>=2);
  assert.equal(receipt.top_25[0].team_name,'Alpha State');
  for(const name of ['fbs-membership.json','completed-games.json','cfb-power-input.json','cfb-power-rankings.json','top-25.json']){
    assert.ok(fs.existsSync(path.join(outDir,name)),name);
  }
});
