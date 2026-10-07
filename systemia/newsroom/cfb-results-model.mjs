function clean(value){ return String(value??'').trim(); }
function clamp(value,min,max){ return Math.min(max,Math.max(min,value)); }
function round(value,digits=2){ const f=10**digits; return Math.round((value+Number.EPSILON)*f)/f; }
function sigmoidMargin(margin){ return Math.tanh(Number(margin||0)/24); }

function teamSide(game,teamId){
  if(game.home?.team_id===teamId) return {self:game.home,opp:game.away,venue:game.neutral_site?'neutral':'home'};
  if(game.away?.team_id===teamId) return {self:game.away,opp:game.home,venue:game.neutral_site?'neutral':'away'};
  return null;
}
function rawRecords(games,eligible){
  const records=new Map([...eligible].map(id=>[id,{wins:0,losses:0,games:0}]));
  for(const game of games){
    for(const id of [game.home?.team_id,game.away?.team_id]){
      if(!eligible.has(id)) continue;
      const side=teamSide(game,id);
      const row=records.get(id);
      row.games+=1;
      if(side.self.score>side.opp.score) row.wins+=1;
      else if(side.self.score<side.opp.score) row.losses+=1;
    }
  }
  return records;
}
function pct(row){ return row?.games?row.wins/row.games:0.5; }
function average(values){
  const rows=values.filter(Number.isFinite);
  return rows.length?rows.reduce((a,b)=>a+b,0)/rows.length:null;
}
function dateSorted(games){ return [...games].sort((a,b)=>a.date.localeCompare(b.date)); }

export function buildCfbPowerIndexInputFromGames({
  season,
  weekLabel,
  evidenceSnapshotId,
  evidenceThroughAt,
  teams,
  games,
  previousRanks={},
  generatedAt=evidenceThroughAt,
}={}){
  if(!Array.isArray(teams)||teams.length<2) throw new Error('cfb_results_model_teams_required');
  if(!Array.isArray(games)||!games.length) throw new Error('cfb_results_model_games_required');
  const eligible=new Set(teams.map(team=>clean(team.team_id)).filter(Boolean));
  const teamNames=new Map(teams.map(team=>[clean(team.team_id),clean(team.team_name)]));
  const records=rawRecords(games,eligible);
  const rows=[];

  for(const team of teams){
    const teamId=clean(team.team_id);
    const played=dateSorted(games.filter(game=>teamSide(game,teamId)));
    if(!played.length) continue;

    const schedule=played.map(game=>{
      const side=teamSide(game,teamId);
      const opponentId=side.opp.team_id;
      const won=side.self.score>side.opp.score;
      const margin=side.self.score-side.opp.score;
      const opponentWinPct=pct(records.get(opponentId));
      const venueBoost=side.venue==='away'?0.05:side.venue==='neutral'?0.025:-0.015;
      const resultSignal=(won?1:0)*(0.72+0.28*opponentWinPct)+venueBoost;
      const marginSignal=sigmoidMargin(margin)*(0.8+0.4*opponentWinPct)+(side.venue==='away'?0.08:0);
      return {game,side,opponentId,opponentWinPct,won,margin,resultSignal,marginSignal};
    });

    const record=records.get(teamId);
    const scheduleStrength=average(schedule.map(row=>row.opponentWinPct));
    const adjustedWin=average(schedule.map(row=>row.resultSignal));
    const resultQuality=100*clamp(0.55*pct(record)+0.45*clamp(adjustedWin??0.5,0,1),0,1);
    const efficiency=clamp(50+45*(average(schedule.map(row=>row.marginSignal))??0),0,100);
    const roadNeutral=schedule.filter(row=>row.side.venue!=='home');
    const roadNeutralScore=roadNeutral.length
      ?100*clamp(average(roadNeutral.map(row=>(row.won?0.7:0.05)+0.25*row.opponentWinPct+0.05*sigmoidMargin(row.margin)))??0.5,0,1)
      :null;
    const recent=schedule.slice(-3);
    const recentForm=clamp(50+45*(average(recent.map(row=>row.marginSignal))??0),0,100);
    const best=[...schedule].sort((a,b)=>
      (Number(b.won)-Number(a.won)) ||
      (b.opponentWinPct-a.opponentWinPct) ||
      (b.margin-a.margin)
    )[0]||null;
    const worst=[...schedule].sort((a,b)=>
      (Number(a.won)-Number(b.won)) ||
      (a.opponentWinPct-b.opponentWinPct) ||
      (a.margin-b.margin)
    )[0]||null;

    rows.push({
      team_id:teamId,
      team_name:teamNames.get(teamId)||teamId,
      record:{wins:record.wins,losses:record.losses},
      components:{
        result_quality:round(resultQuality,3),
        efficiency:round(efficiency,3),
        schedule_strength:round(100*(scheduleStrength??0.5),3),
        road_neutral:roadNeutralScore===null?null:round(roadNeutralScore,3),
        recent_form:round(recentForm,3),
        availability:null,
        turnover_sustainability:null,
      },
      evidence_confidence:round(clamp(0.55+0.09*Math.min(record.games,5),0,1),4),
      best_win:best&&best.won
        ?`${best.side.self.score}-${best.side.opp.score} vs ${best.side.opp.team_name||best.opponentId} (${best.side.venue})`
        :null,
      worst_result:worst
        ?`${worst.side.self.score}-${worst.side.opp.score} vs ${worst.side.opp.team_name||worst.opponentId} (${worst.side.venue})`
        :null,
      source_refs:schedule.map(row=>row.game.source_ref).filter(Boolean),
      explanation:`Results-first profile through ${record.games} completed game${record.games===1?'':'s'}; schedule and margin are opponent-adjusted, while injury and turnover inputs remain missing rather than being imputed.`,
    });
  }

  if(rows.length<2) throw new Error('cfb_results_model_rankable_teams_missing');
  return {
    schema:'evercraft.cfb-power-index-input.v1',
    season:Number(season),
    week_label:clean(weekLabel),
    evidence_snapshot_id:clean(evidenceSnapshotId),
    evidence_through_at:new Date(evidenceThroughAt).toISOString(),
    generated_at:new Date(generatedAt).toISOString(),
    previous_ranks:previousRanks,
    teams:rows,
  };
}
