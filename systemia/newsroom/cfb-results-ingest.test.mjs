import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseEspnFbsTeamIds,
  parseEspnCompletedGames,
  fetchEspnCompletedFbsGames,
  parseNcaaFbsScoreboard,
  fetchNcaaFbsEvidence,
} from './cfb-results-ingest.mjs';

function teamPayload(){
  return {sports:[{leagues:[{teams:[
    {team:{id:'1',displayName:'Alpha State',abbreviation:'ALP'}},
    {team:{id:'2',displayName:'Beta Tech',abbreviation:'BET'}},
    {team:{id:'3',displayName:'Gamma',abbreviation:'GAM'}},
  ]}]}]};
}
function event(id,date,homeId,homeName,homeScore,awayId,awayName,awayScore,{completed=true,neutralSite=false}={}){
  return {
    id,date,status:{type:{completed}},
    competitions:[{
      id,date,neutralSite,status:{type:{completed}},
      competitors:[
        {homeAway:'home',score:String(homeScore),team:{id:homeId,displayName:homeName}},
        {homeAway:'away',score:String(awayScore),team:{id:awayId,displayName:awayName}},
      ],
    }],
  };
}
test('parses and deduplicates FBS team membership',()=>{
  const payload=teamPayload();
  payload.sports[0].leagues[0].teams.push({team:{id:'1',displayName:'Alpha State'}});
  const teams=parseEspnFbsTeamIds(payload);
  assert.equal(teams.length,3);
  assert.deepEqual(teams.map(t=>t.team_id),['1','2','3']);
});
test('keeps completed games involving an eligible FBS team and preserves FCS opponent evidence',()=>{
  const games=parseEspnCompletedGames({events:[
    event('g1','2026-09-05T20:00:00Z','1','Alpha State',31,'99','FCS Valley',10),
    event('g2','2026-09-06T20:00:00Z','88','FCS East',21,'77','FCS West',17),
    event('g3','2026-09-07T20:00:00Z','2','Beta Tech',7,'3','Gamma',14,{completed:false}),
  ]},{eligibleTeamIds:new Set(['1','2','3'])});
  assert.equal(games.length,1);
  assert.equal(games[0].home.fbs,true);
  assert.equal(games[0].away.fbs,false);
  assert.equal(games[0].winner_team_id,'1');
});
test('daily ingest deduplicates the same ESPN game id across source responses',async()=>{
  const eligible=new Set(['1','2']);
  const duplicate=event('g1','2026-09-05T20:00:00Z','1','Alpha State',31,'2','Beta Tech',24);
  const fetchImpl=async()=>({
    ok:true,status:200,
    async json(){return {events:[duplicate]};},
  });
  const ledger=await fetchEspnCompletedFbsGames({
    startDate:'2026-09-05',
    endDate:'2026-09-06',
    eligibleTeamIds:eligible,
    fetchImpl,
  });
  assert.equal(ledger.source_urls.length,2);
  assert.equal(ledger.games.length,1);
  assert.equal(ledger.games[0].game_id,'g1');
});


test('official NCAA scoreboard keeps an FCS opponent as evidence but not FBS membership',()=>{
  const payload={data:{contests:[{
    contestId:7001,gameState:'F',startDate:'10/03/2026',
    teams:[
      {isHome:true,seoname:'alpha-state',nameShort:'Alpha State',conferenceSeo:'sec',score:42,isWinner:true},
      {isHome:false,seoname:'fcs-valley',nameShort:'FCS Valley',conferenceSeo:'socon',score:10,isWinner:false},
    ],
  }]}};
  const games=parseNcaaFbsScoreboard(payload,{startDate:'2026-10-03',endDate:'2026-10-03'});
  assert.equal(games.length,1);
  assert.equal(games[0].home.fbs,true);
  assert.equal(games[0].away.fbs,false);
  assert.equal(games[0].source_ref,'ncaa-game:7001');
});

test('official NCAA evidence deduplicates games across weekly responses and derives FBS membership',async()=>{
  const payload={data:{contests:[{
    contestId:7002,gameState:'F',startDate:'10/03/2026',
    teams:[
      {isHome:true,seoname:'alpha-state',nameShort:'Alpha State',conferenceSeo:'sec',score:31,isWinner:true},
      {isHome:false,seoname:'beta-tech',nameShort:'Beta Tech',conferenceSeo:'acc',score:24,isWinner:false},
    ],
  }]}};
  const fetchImpl=async()=>({ok:true,status:200,async json(){return payload;}});
  const evidence=await fetchNcaaFbsEvidence({
    season:2026,startDate:'2026-10-03',endDate:'2026-10-03',
    weeks:[5,6],fetchImpl,
  });
  assert.equal(evidence.ledger.games.length,1);
  assert.deepEqual(evidence.membership.teams.map(team=>team.team_id),['alpha-state','beta-tech']);
  assert.equal(evidence.membership.source,'ncaa-graphql-scoreboard');
});
