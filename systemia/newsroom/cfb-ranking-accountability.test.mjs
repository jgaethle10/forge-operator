import assert from 'node:assert/strict';
import test from 'node:test';
import { scorePublishedCfbEdition } from './cfb-ranking-accountability.mjs';

const edition={
  run_id:'cfbpi:test',
  season:2026,
  week_label:'Through 2026-10-06',
  model_version:'evercraft-cfbpi-test',
  evidence_snapshot_id:'snap:test',
  evidence_through_at:'2026-10-06T23:59:59.999Z',
  top_25:[
    {rank:1,team_id:'alpha',team_name:'Alpha'},
    {rank:7,team_id:'bravo',team_name:'Bravo'},
    {rank:18,team_id:'charlie',team_name:'Charlie'},
  ],
};

const ledger={
  schema:'evercraft.cfb.completed-game-ledger.v1',
  source:'ncaa-graphql-scoreboard',
  end_date:'2026-10-13',
  games:[
    {
      game_id:'g1',date:'2026-10-10T19:00:00.000Z',source_ref:'ncaa-game:g1',
      home:{team_id:'bravo',team_name:'Bravo',score:31,fbs:true},
      away:{team_id:'charlie',team_name:'Charlie',score:20,fbs:true},
      winner_team_id:'bravo',
    },
    {
      game_id:'g2',date:'2026-10-11T19:00:00.000Z',source_ref:'ncaa-game:g2',
      home:{team_id:'alpha',team_name:'Alpha',score:17,fbs:true},
      away:{team_id:'delta',team_name:'Delta',score:24,fbs:true},
      winner_team_id:'delta',
    },
    {
      game_id:'g3',date:'2026-10-12T19:00:00.000Z',source_ref:'ncaa-game:g3',
      home:{team_id:'echo',team_name:'Echo',score:10,fbs:true},
      away:{team_id:'foxtrot',team_name:'Foxtrot',score:7,fbs:true},
      winner_team_id:'echo',
    },
    {
      game_id:'g4',date:'2026-10-05T19:00:00.000Z',source_ref:'ncaa-game:g4',
      home:{team_id:'alpha',team_name:'Alpha',score:42,fbs:true},
      away:{team_id:'bravo',team_name:'Bravo',score:17,fbs:true},
      winner_team_id:'alpha',
    },
    {
      game_id:'g5',date:'2026-10-13T19:00:00.000Z',source_ref:'ncaa-game:g5',
      home:{team_id:'charlie',team_name:'Charlie',score:35,fbs:true},
      away:{team_id:'fcs',team_name:'FCS',score:7,fbs:false},
      winner_team_id:'charlie',
    },
  ],
};

test('accountability scores only later eligible FBS games touched by the published Top 25',()=>{
  const scored=scorePublishedCfbEdition({edition,ledger,evaluationThroughAt:'2026-10-13T23:59:59.999Z'});
  assert.equal(scored.summary.decisions,2);
  assert.equal(scored.summary.correct,1);
  assert.equal(scored.summary.misses,1);
  assert.equal(scored.summary.accuracy,0.5);
  assert.equal(scored.summary.top25_head_to_head.decisions,1);
  assert.equal(scored.summary.top25_vs_unranked_fbs.decisions,1);
});

test('higher published rank is the directional pick without inventing probability',()=>{
  const scored=scorePublishedCfbEdition({edition,ledger,evaluationThroughAt:'2026-10-13T23:59:59.999Z'});
  const head=scored.games.find(row=>row.game_id==='g1');
  const upset=scored.games.find(row=>row.game_id==='g2');
  assert.equal(head.expected_winner.team_id,'bravo');
  assert.equal(head.expected_winner.published_rank,7);
  assert.equal(head.opponent.published_rank,18);
  assert.equal(head.correct,true);
  assert.equal(upset.expected_winner.team_id,'alpha');
  assert.equal(upset.actual_winner.team_id,'delta');
  assert.equal(upset.actual_winner.published_rank,null);
  assert.equal(upset.correct,false);
  assert.equal(scored.probability_claimed,false);
  assert.equal(scored.scoring_rule,'published_top25_ordering_only');
});

test('edition with no later eligible games remains explicitly unscored',()=>{
  const scored=scorePublishedCfbEdition({
    edition,
    ledger:{...ledger,games:[]},
    evaluationThroughAt:'2026-10-13T23:59:59.999Z',
  });
  assert.equal(scored.status,'awaiting_future_eligible_games');
  assert.equal(scored.summary.decisions,0);
  assert.equal(scored.summary.accuracy,null);
});
