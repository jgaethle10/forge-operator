import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { compareCfbRankingToPoll, latestPollBaseline } from './cfb-poll-comparison.mjs';

const ranking={
  schema:'evercraft.cfb-power-rankings.v1',
  run_id:'r1',
  evidence_snapshot_id:'s1',
  evidence_through_at:'2026-10-07T23:59:59.999Z',
  generated_at:'2026-10-08T13:00:00.000Z',
  model:{model_version:'m1'},
  rankings:[
    {rank:1,team_id:'a',team_name:'A',power_score:90,confidence:.9},
    {rank:2,team_id:'b',team_name:'B',power_score:85,confidence:.9},
    {rank:3,team_id:'c',team_name:'C',power_score:80,confidence:.9},
    ...Array.from({length:22},(_,i)=>({rank:i+4,team_id:'x'+i,team_name:'X'+i,power_score:70-i,confidence:.8})),
  ],
};

const baseline={
  schema:'evercraft.cfb.poll-baseline.v1',
  poll_id:'ap-top25',
  poll_name:'AP Top 25',
  published_date:'2026-10-04',
  source_authority:'Associated Press',
  source_url:'https://example.test/ap',
  use_policy:'comparison_only_never_model_input',
  rankings:[
    {rank:1,team_id:'b',team_name:'B'},
    {rank:2,team_id:'a',team_name:'A'},
    {rank:3,team_id:'z',team_name:'Z'},
    ...Array.from({length:22},(_,i)=>({rank:i+4,team_id:'x'+i,team_name:'X'+i})),
  ],
};

test('comparison reports direction from the Evercraft perspective',()=>{
  const report=compareCfbRankingToPoll({ranking,baseline});
  const a=report.evercraft_higher.find(row=>row.team_id==='a');
  const b=report.evercraft_lower.find(row=>row.team_id==='b');
  assert.equal(a.rank_delta,1);
  assert.equal(a.direction,'evercraft_higher');
  assert.equal(b.rank_delta,-1);
  assert.equal(b.direction,'evercraft_lower');
});

test('comparison exposes membership differences without declaring an outcome winner',()=>{
  const report=compareCfbRankingToPoll({ranking,baseline});
  assert.deepEqual(report.only_evercraft,[{rank:3,team_id:'c',team_name:'C'}]);
  assert.deepEqual(report.only_poll,[{rank:3,team_id:'z',team_name:'Z'}]);
  assert.equal(report.authority_boundary.poll_used_as_model_input,false);
  assert.equal(report.authority_boundary.disagreement_is_not_outcome_truth,true);
});

test('comparison requires a complete comparison-only Top 25 baseline',()=>{
  assert.throws(
    ()=>compareCfbRankingToPoll({ranking,baseline:{...baseline,rankings:baseline.rankings.slice(0,24)}}),
    /cfb_poll_baseline_top25_required/
  );
  assert.throws(
    ()=>compareCfbRankingToPoll({ranking,baseline:{...baseline,use_policy:'model_input'}}),
    /cfb_poll_baseline_use_policy_invalid/
  );
});

test('baseline discovery accepts the current or previous weekly poll but fails closed once stale',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cfb-poll-baseline-'));
  try{
    fs.writeFileSync(path.join(dir,'ap.json'),JSON.stringify(baseline));
    const current=latestPollBaseline({
      baselineDir:dir,
      pollId:'ap-top25',
      at:'2026-10-11T17:00:00.000Z',
      maxAgeDays:8,
    });
    assert.equal(current.age_days,7);
    assert.equal(current.baseline.published_date,'2026-10-04');
    assert.throws(()=>latestPollBaseline({
      baselineDir:dir,
      pollId:'ap-top25',
      at:'2026-10-13T17:00:00.000Z',
      maxAgeDays:8,
    }),/cfb_poll_baseline_stale/);
  }finally{
    fs.rmSync(dir,{recursive:true,force:true});
  }
});
