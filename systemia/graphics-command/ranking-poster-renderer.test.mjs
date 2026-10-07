import assert from 'node:assert/strict';
import test from 'node:test';
import { renderCfbRankingPoster } from './ranking-poster-renderer.mjs';

function ranking(){
  return {
    schema:'evercraft.cfb-power-rankings.v1',
    run_id:'cfbpi:test',
    evidence_through_at:'2026-10-06T23:59:59.999Z',
    model:{model_version:'evercraft-cfbpi-0.2.0'},
    rankings:Array.from({length:25},(_,i)=>({
      rank:i+1,
      team_name:i===0?'Alabama':'Team '+(i+1),
      record:{wins:5,losses:i===9?1:0},
      power_score:81.49-i,
      confidence:i%2?0.8645:0.95,
    })),
  };
}

test('feed poster is a vertical Top 10 with no horizontal table dependency',()=>{
  const svg=renderCfbRankingPoster(ranking(),'feed');
  assert.match(svg,/width="1080" height="1350"/);
  assert.match(svg,/COLLEGE FOOTBALL/);
  assert.match(svg,/#1/);
  assert.match(svg,/Alabama/);
  assert.match(svg,/81\.49/);
  assert.match(svg,/#10/);
  assert.doesNotMatch(svg,/<table/i);
  assert.doesNotMatch(svg,/>#11<\/text>/);
});

test('story poster expands vertically without side-to-side comparison columns',()=>{
  const svg=renderCfbRankingPoster(ranking(),'story');
  assert.match(svg,/height="1920"/);
  assert.match(svg,/#15/);
  assert.doesNotMatch(svg,/>#16<\/text>/);
});

test('rejects non-ranking payloads',()=>{
  assert.throws(()=>renderCfbRankingPoster({schema:'wrong'},'feed'),/schema_invalid/);
});
