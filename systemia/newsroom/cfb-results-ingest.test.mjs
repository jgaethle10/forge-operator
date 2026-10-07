import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ncaaFbsScoreboardUrl,
  parseNcaaCompletedGames,
  inferFbsMembershipFromSchedule,
  fetchNcaaFbsSeasonLedger,
} from './cfb-results-ingest.mjs';

function team(name,seoname,score,{home=false,winner=false,conference='test-conf'}={}){
  return {nameShort:name,seoname,score,isHome:home,isWinner:winner,conferenceSeo:conference};
}
function contest(id,date,homeName,homeSlug,homeScore,awayName,awaySlug,awayScore,{state='F'}={}){
  return {
    contestId:id,
    startDate:date,
    gameState:state,
    teams:[
      team(homeName,homeSlug,homeScore,{home:true,winner:homeScore>awayScore}),
      team(awayName,awaySlug,awayScore,{home:false,winner:awayScore>homeScore}),
    ],
  };
}

test('builds the official NCAA FBS scoreboard persisted-query URL',()=>{
  const url=new URL(ncaaFbsScoreboardUrl({season:2026,week:5}));
  assert.equal(url.hostname,'sdataprod.ncaa.com');
  const vars=JSON.parse(url.searchParams.get('variables'));
  assert.deepEqual(vars,{sportCode:'MFB',division:11,seasonYear:2026,week:5});
});

test('parses only final NCAA contests into source-bound games',()=>{
  const games=parseNcaaCompletedGames({data:{contests:[
    contest('g1','10/03/2026','Alpha State','alpha-state',31,'Beta Tech','beta-tech',24),
    contest('g2','10/04/2026','Gamma','gamma',10,'Delta','delta',17,{state:'P'}),
  ]}});
  assert.equal(games.length,1);
  assert.equal(games[0].game_id,'g1');
  assert.equal(games[0].winner_team_id,'alpha-state');
  assert.equal(games[0].source_ref,'ncaa-game:g1');
});

test('infers current FBS membership from repeated appearances rather than one-off visitors',()=>{
  const games=[
    ...parseNcaaCompletedGames({data:{contests:[contest('g1','09/05/2026','Alpha','alpha',31,'Visitor','visitor',7)]}}),
    ...parseNcaaCompletedGames({data:{contests:[contest('g2','09/12/2026','Beta','beta',14,'Alpha','alpha',28)]}}),
    ...parseNcaaCompletedGames({data:{contests:[contest('g3','09/19/2026','Alpha','alpha',35,'Gamma','gamma',21)]}}),
  ];
  const teams=inferFbsMembershipFromSchedule(games,{minimumAppearances:2});
  assert.equal(teams.some(team=>team.team_id==='alpha'),true);
  assert.equal(teams.some(team=>team.team_id==='visitor'),false);
  assert.equal(teams.find(team=>team.team_id==='alpha').membership_state,'inferred_from_ncaa_fbs_schedule_frequency');
});

test('season ledger deduplicates contests and marks inferred FBS membership explicitly',async()=>{
  const alphaGames=[
    contest('g1','09/05/2026','Alpha','alpha',31,'Visitor A','visitor-a',7),
    contest('g2','09/12/2026','Beta','beta',17,'Alpha','alpha',24),
    contest('g3','09/19/2026','Alpha','alpha',28,'Gamma','gamma',20),
  ];
  const betaGames=[
    contest('g4','09/19/2026','Beta','beta',30,'Visitor B','visitor-b',3),
    contest('g5','09/26/2026','Gamma','gamma',14,'Beta','beta',21),
  ];
  const gammaGames=[contest('g6','09/26/2026','Gamma','gamma',35,'Visitor C','visitor-c',10)];
  const filler=[];
  for(let i=0;i<30;i++){
    filler.push(contest('f'+i,'09/20/2026','FBS '+i,'fbs-'+i,20,'FBS '+(i+30),'fbs-'+(i+30),10));
  }
  const all=[...alphaGames,...betaGames,...gammaGames,...filler];
  const fetchImpl=async()=>({
    ok:true,status:200,
    async json(){return {data:{contests:all}};},
  });
  const ledger=await fetchNcaaFbsSeasonLedger({
    season:2026,throughDate:'2026-10-03',maxWeek:2,minimumAppearances:1,fetchImpl,
  });
  assert.ok(ledger.games.length>=36);
  assert.ok(ledger.membership.teams.length>=25);
  assert.equal(ledger.source_authority,'NCAA');
  assert.equal(ledger.membership.teams[0].membership_state,'inferred_from_ncaa_fbs_schedule_frequency');
});
