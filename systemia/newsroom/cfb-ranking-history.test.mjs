import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildCfbRankingHistory, previousRanksForCfbEdition } from './cfb-ranking-history.mjs';

function edition({day,season=2026,runId,rows}){
  return {
    schema:'evercraft.cfb.edition-evidence.v1',
    ranking:{
      schema:'evercraft.cfb-power-rankings.v1',
      run_id:runId,
      season,
      week_label:'Through '+day,
      evidence_snapshot_id:'snapshot:'+day,
      evidence_through_at:day+'T23:59:59.999Z',
      generated_at:day+'T23:59:59.999Z',
      model:{model_version:'evercraft-cfbpi-test'},
      rankings:rows,
    },
  };
}

test('previous-rank discovery selects the latest strictly earlier edition',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cfb-history-'));
  try{
    fs.writeFileSync(path.join(dir,'college-football-power-rankings-2026-10-01.json'),JSON.stringify(edition({
      day:'2026-10-01',runId:'r1',rows:[
        {rank:1,team_id:'a',team_name:'A',power_score:90,confidence:.9,record:{wins:5,losses:0}},
        {rank:2,team_id:'b',team_name:'B',power_score:80,confidence:.9,record:{wins:4,losses:1}},
      ]
    })));
    fs.writeFileSync(path.join(dir,'college-football-power-rankings-2026-10-06.json'),JSON.stringify(edition({
      day:'2026-10-06',runId:'r2',rows:[
        {rank:1,team_id:'b',team_name:'B',power_score:91,confidence:.9,record:{wins:5,losses:1}},
        {rank:2,team_id:'a',team_name:'A',power_score:88,confidence:.9,record:{wins:5,losses:1}},
      ]
    })));

    const previous=previousRanksForCfbEdition({dataDir:dir,season:2026,throughDate:'2026-10-10'});
    assert.equal(previous.source_edition.run_id,'r2');
    assert.deepEqual(previous.previous_ranks,{b:1,a:2});

    const sameDay=previousRanksForCfbEdition({dataDir:dir,season:2026,throughDate:'2026-10-06'});
    assert.equal(sameDay.source_edition.run_id,'r1');
  }finally{
    fs.rmSync(dir,{recursive:true,force:true});
  }
});

test('history preserves edition movement and model identity',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cfb-history-'));
  try{
    fs.writeFileSync(path.join(dir,'college-football-power-rankings-2026-10-06.json'),JSON.stringify(edition({
      day:'2026-10-06',runId:'r2',rows:[
        {rank:1,previous_rank:3,movement:2,movement_state:'up',team_id:'b',team_name:'B',power_score:91,confidence:.9,record:{wins:5,losses:1}},
      ]
    })));
    const history=buildCfbRankingHistory({dataDir:dir,season:2026});
    assert.equal(history.edition_count,1);
    assert.equal(history.editions[0].model_version,'evercraft-cfbpi-test');
    assert.equal(history.editions[0].top_25[0].previous_rank,3);
    assert.equal(history.editions[0].top_25[0].movement,2);
    assert.equal(history.editions[0].top_25[0].movement_state,'up');
  }finally{
    fs.rmSync(dir,{recursive:true,force:true});
  }
});

test('invalid and unrelated files never enter history',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cfb-history-'));
  try{
    fs.writeFileSync(path.join(dir,'college-football-power-rankings-2026-10-06.json'),'{}');
    fs.writeFileSync(path.join(dir,'other.json'),'{}');
    const history=buildCfbRankingHistory({dataDir:dir,season:2026});
    assert.equal(history.edition_count,0);
    const previous=previousRanksForCfbEdition({dataDir:dir,season:2026,throughDate:'2026-10-10'});
    assert.equal(previous.source_edition,null);
    assert.deepEqual(previous.previous_ranks,{});
  }finally{
    fs.rmSync(dir,{recursive:true,force:true});
  }
});
