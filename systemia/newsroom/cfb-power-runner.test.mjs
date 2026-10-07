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
test('materializes NCAA membership, game ledger, model input, ranking receipt and Top 25 surface',async()=>{
  const outDir=fs.mkdtempSync(path.join(os.tmpdir(),'cfb-power-run-'));
  const contests=[
    {
      contestId:8001,gameState:'F',startDate:'09/05/2026',
      teams:[
        {isHome:true,seoname:'alpha-state',nameShort:'Alpha State',name6Char:'ALPHA',conferenceSeo:'sec',score:31,isWinner:true},
        {isHome:false,seoname:'beta-tech',nameShort:'Beta Tech',name6Char:'BETA',conferenceSeo:'acc',score:24,isWinner:false},
      ],
    },
    {
      contestId:8002,gameState:'F',startDate:'09/06/2026',
      teams:[
        {isHome:true,seoname:'gamma',nameShort:'Gamma',name6Char:'GAMMA',conferenceSeo:'big-ten',score:10,isWinner:false},
        {isHome:false,seoname:'alpha-state',nameShort:'Alpha State',name6Char:'ALPHA',conferenceSeo:'sec',score:28,isWinner:true},
      ],
    },
  ];
  const fetchImpl=async(url)=>{
    const parsed=new URL(String(url));
    const variables=JSON.parse(parsed.searchParams.get('variables'));
    const week=Number(variables.week);
    const selected=week===0?[contests[0]]:week===1?[contests[1]]:[];
    return {ok:true,status:200,async json(){return {data:{contests:selected}};}};
  };
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
