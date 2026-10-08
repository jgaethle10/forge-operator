#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildCfbRankingHistory } from './cfb-ranking-history.mjs';

function clean(value){ return String(value??'').trim(); }
function iso(value,field){
  const d=new Date(value);
  if(!Number.isFinite(d.getTime())) throw new Error(field+'_invalid');
  return d.toISOString();
}
function gameSide(game,teamId){
  if(clean(game?.home?.team_id)===teamId) return game.home;
  if(clean(game?.away?.team_id)===teamId) return game.away;
  return null;
}
function marginForWinner(game,winnerId){
  const winner=gameSide(game,winnerId);
  const loser=winnerId===clean(game?.home?.team_id)?game?.away:game?.home;
  const a=Number(winner?.score);
  const b=Number(loser?.score);
  return Number.isFinite(a)&&Number.isFinite(b)?a-b:null;
}

export function scorePublishedCfbEdition({
  edition,
  ledger,
  evaluationThroughAt,
}={}){
  if(!edition?.run_id||!Array.isArray(edition.top_25)) throw new Error('cfb_accountability_edition_invalid');
  if(ledger?.schema!=='evercraft.cfb.completed-game-ledger.v1') throw new Error('cfb_accountability_ledger_invalid');

  const cutoff=iso(edition.evidence_through_at,'cfb_accountability_edition_cutoff');
  const through=iso(evaluationThroughAt||ledger.end_date+'T23:59:59.999Z','cfb_accountability_evaluation_through');
  if(new Date(through)<new Date(cutoff)) throw new Error('cfb_accountability_window_invalid');

  const rankByTeam=new Map();
  const nameByTeam=new Map();
  for(const row of edition.top_25){
    const id=clean(row.team_id);
    const rank=Number(row.rank);
    if(!id||!Number.isInteger(rank)||rank<1||rank>25) continue;
    rankByTeam.set(id,rank);
    nameByTeam.set(id,clean(row.team_name)||id);
  }

  const games=[];
  for(const game of ledger.games||[]){
    const at=iso(game.date,'cfb_accountability_game_date');
    if(new Date(at)<=new Date(cutoff)||new Date(at)>new Date(through)) continue;
    if(game?.home?.fbs!==true||game?.away?.fbs!==true) continue;
    const homeId=clean(game.home.team_id);
    const awayId=clean(game.away.team_id);
    const winnerId=clean(game.winner_team_id);
    if(!homeId||!awayId||!winnerId) continue;

    const homeRank=rankByTeam.get(homeId)??null;
    const awayRank=rankByTeam.get(awayId)??null;
    if(homeRank===null&&awayRank===null) continue;

    let expectedWinnerId=null;
    let expectationClass='';
    if(homeRank!==null&&awayRank!==null){
      expectedWinnerId=homeRank<awayRank?homeId:awayId;
      expectationClass='top25_head_to_head';
    }else{
      expectedWinnerId=homeRank!==null?homeId:awayId;
      expectationClass='top25_vs_unranked_fbs';
    }

    const expectedRank=rankByTeam.get(expectedWinnerId)??null;
    const actualWinnerRank=rankByTeam.get(winnerId)??null;
    const opponentId=expectedWinnerId===homeId?awayId:homeId;
    const opponentRank=rankByTeam.get(opponentId)??null;
    const actualWinnerSide=gameSide(game,winnerId);
    const loserId=winnerId===homeId?awayId:homeId;

    games.push({
      game_id:clean(game.game_id),
      date:at,
      source_ref:clean(game.source_ref)||null,
      expectation_class:expectationClass,
      expected_winner:{
        team_id:expectedWinnerId,
        team_name:nameByTeam.get(expectedWinnerId)||gameSide(game,expectedWinnerId)?.team_name||expectedWinnerId,
        published_rank:expectedRank,
      },
      opponent:{
        team_id:opponentId,
        team_name:nameByTeam.get(opponentId)||gameSide(game,opponentId)?.team_name||opponentId,
        published_rank:opponentRank,
      },
      actual_winner:{
        team_id:winnerId,
        team_name:nameByTeam.get(winnerId)||actualWinnerSide?.team_name||winnerId,
        published_rank:actualWinnerRank,
      },
      loser_team_id:loserId,
      correct:winnerId===expectedWinnerId,
      final_margin:marginForWinner(game,winnerId),
      rank_gap:homeRank!==null&&awayRank!==null?Math.abs(homeRank-awayRank):null,
    });
  }

  const correct=games.filter(row=>row.correct).length;
  const misses=games.length-correct;
  const headToHead=games.filter(row=>row.expectation_class==='top25_head_to_head');
  const rankedVsUnranked=games.filter(row=>row.expectation_class==='top25_vs_unranked_fbs');

  const group=(rows)=>({
    decisions:rows.length,
    correct:rows.filter(row=>row.correct).length,
    misses:rows.filter(row=>!row.correct).length,
    accuracy:rows.length?Number((rows.filter(row=>row.correct).length/rows.length).toFixed(4)):null,
  });

  return {
    schema:'evercraft.cfb.edition-accountability.v1',
    run_id:edition.run_id,
    season:edition.season,
    week_label:edition.week_label,
    model_version:edition.model_version,
    evidence_snapshot_id:edition.evidence_snapshot_id,
    evidence_through_at:cutoff,
    evaluation_through_at:through,
    scoring_rule:'published_top25_ordering_only',
    probability_claimed:false,
    historical_ranking_mutated:false,
    status:games.length?'scored':'awaiting_future_eligible_games',
    summary:{
      decisions:games.length,
      correct,
      misses,
      accuracy:games.length?Number((correct/games.length).toFixed(4)):null,
      top25_head_to_head:group(headToHead),
      top25_vs_unranked_fbs:group(rankedVsUnranked),
    },
    misses:games.filter(row=>!row.correct),
    games,
  };
}

export function buildCfbAccountabilityReport({
  dataDir='public/journal/data',
  ledger,
  season=null,
  evaluationThroughAt,
}={}){
  const history=buildCfbRankingHistory({dataDir,season});
  const through=evaluationThroughAt||ledger?.end_date+'T23:59:59.999Z';
  const editions=history.editions.map(edition=>scorePublishedCfbEdition({
    edition,
    ledger,
    evaluationThroughAt:through,
  }));
  const scored=editions.filter(row=>row.summary.decisions>0);
  const decisions=scored.reduce((sum,row)=>sum+row.summary.decisions,0);
  const correct=scored.reduce((sum,row)=>sum+row.summary.correct,0);
  return {
    schema:'evercraft.cfb.accountability-report.v1',
    season:history.season,
    evaluation_through_at:iso(through,'cfb_accountability_report_through'),
    source_history_schema:history.schema,
    source_ledger_schema:ledger?.schema||null,
    scoring_rule:'published_top25_ordering_only',
    probability_claimed:false,
    immutable_published_editions:true,
    summary:{
      edition_count:editions.length,
      scored_edition_count:scored.length,
      decisions,
      correct,
      misses:decisions-correct,
      accuracy:decisions?Number((correct/decisions).toFixed(4)):null,
    },
    editions,
  };
}

async function main(){
  const ledgerPath=clean(process.argv[2])||'_cfb_power_run/completed-games.json';
  const dataDir=clean(process.argv[3])||'public/journal/data';
  const output=clean(process.argv[4])||'public/journal/data/cfb-power-rankings-accountability.json';
  const season=process.argv[5]?Number(process.argv[5]):null;
  const ledger=JSON.parse(fs.readFileSync(ledgerPath,'utf8'));
  const report=buildCfbAccountabilityReport({dataDir,ledger,season});
  fs.mkdirSync(path.dirname(output),{recursive:true});
  fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
  process.stdout.write(JSON.stringify({
    schema:'evercraft.cfb.accountability-build-receipt.v1',
    output,
    season:report.season,
    edition_count:report.summary.edition_count,
    scored_edition_count:report.summary.scored_edition_count,
    decisions:report.summary.decisions,
    accuracy:report.summary.accuracy,
  },null,2)+'\n');
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  await main();
}
