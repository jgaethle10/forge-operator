import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runCfbPowerEvidenceCycle } from './cfb-power-runner.mjs';

function team(name,seoname,score,{home=false,winner=false,conference='test-conf'}={}){
  return {nameShort:name,seoname,score,isHome:home,isWinner:winner,conferenceSeo:conference};
}
function contest(id,date,homeName,homeSlug,homeScore,awayName,awaySlug,awayScore){
  return {
    contestId:id,
    startDate:date,
    gameState:'F',
    teams:[
      team(homeName,homeSlug,homeScore,{home:true,winner:homeScore>awayScore}),
      team(awayName,awaySlug,awayScore,{home:false,winner:awayScore>homeScore}),
    ],
  };
}

test('materializes NCAA membership inference, game ledger, model input, ranking receipt and Top 25 surface',async()=>{
  const outDir=fs.mkdtempSync(path.join(os.tmpdir(),'cfb-power-run-'));
  const contests=[];
  for(let i=0;i<30;i++){
    contests.push(contest(
      'g'+i,'09/05/2026',
      'Alpha '+i,'alpha-'+i,30,
      'Beta '+i,'beta-'+i,10
    ));
  }
  contests.push(
    contest('alpha-2','09/12/2026','Alpha 0','alpha-0',28,'Beta 1','beta-1',14),
    contest('alpha-3','09/19/2026','Beta 2','beta-2',17,'Alpha 0','alpha-0',24)
  );

  const fetchImpl=async()=>({
    ok:true,status:200,
    async json(){return {data:{contests}};},
  });
  const receipt=await runCfbPowerEvidenceCycle({
    season:2026,
    startDate:'2026-08-15',
    throughDate:'2026-10-03',
    weekLabel:'Entering Week 6',
    outDir,
    minimumAppearances:1,
    fetchImpl,
    now:new Date('2026-10-04T17:00:00Z'),
  });
  assert.ok(receipt.fbs_team_count>=25);
  assert.ok(receipt.completed_game_count>=32);
  assert.ok(receipt.ranked_team_count>=25);
  assert.equal(receipt.source_authority,'NCAA');
  assert.equal(receipt.top_25[0].team_name,'Alpha 0');
  for(const name of ['fbs-membership.json','completed-games.json','cfb-power-input.json','cfb-power-rankings.json','top-25.json']){
    assert.ok(fs.existsSync(path.join(outDir,name)),name);
  }
  const membership=JSON.parse(fs.readFileSync(path.join(outDir,'fbs-membership.json'),'utf8'));
  assert.match(membership.derivation,/NCAA division-11/i);
});
