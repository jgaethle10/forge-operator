function clean(value){ return String(value??'').trim(); }
function clamp(value,min,max){ return Math.min(max,Math.max(min,value)); }
function round(value,digits=2){ const f=10**digits; return Math.round((value+Number.EPSILON)*f)/f; }
function average(values){
  const rows=values.filter(Number.isFinite);
  return rows.length?rows.reduce((a,b)=>a+b,0)/rows.length:null;
}
function dateSorted(games){ return [...games].sort((a,b)=>a.date.localeCompare(b.date)); }
function cappedMargin(value){ return clamp(Number(value||0),-35,35); }

function teamSide(game,teamId){
  if(game.home?.team_id===teamId) return {self:game.home,opp:game.away,venue:game.neutral_site===true?'neutral':'home'};
  if(game.away?.team_id===teamId) return {self:game.away,opp:game.home,venue:game.neutral_site===true?'neutral':'away'};
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
function locationAdjustment(venue){
  if(venue==='away') return 2.5;
  if(venue==='home') return -2.5;
  return 0;
}
function opponentAdjustedRatings({games,eligible,iterations=60,damping=0.45,fcsBaseline=-12}){
  let ratings=new Map([...eligible].map(id=>[id,0]));
  for(let iteration=0;iteration<iterations;iteration+=1){
    const next=new Map();
    for(const teamId of eligible){
      const performances=[];
      for(const game of games){
        const side=teamSide(game,teamId);
        if(!side) continue;
        const opponentRating=ratings.get(side.opp.team_id)??fcsBaseline;
        const margin=cappedMargin(side.self.score-side.opp.score);
        performances.push(opponentRating+margin+locationAdjustment(side.venue));
      }
      next.set(teamId,average(performances)??0);
    }
    const center=average([...next.values()])??0;
    const centered=new Map([...next].map(([teamId,rating])=>[teamId,rating-center]));
    ratings=new Map([...eligible].map(teamId=>[
      teamId,
      (1-damping)*(ratings.get(teamId)??0)+damping*(centered.get(teamId)??0),
    ]));
  }
  return ratings;
}
function gameQuality({won,margin,opponentRating,venue}){
  const outcome=won?15:-15;
  const venueAdjustment=venue==='away'?3:venue==='home'?-2:1;
  return clamp(50+outcome+0.55*opponentRating+0.45*clamp(margin,-28,28)+venueAdjustment,0,100);
}

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
  const ratings=opponentAdjustedRatings({games,eligible});
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
      const opponentRating=ratings.get(opponentId)??-12;
      const quality=gameQuality({won,margin,opponentRating,venue:side.venue});
      return {game,side,opponentId,opponentRating,won,margin,quality};
    });

    const record=records.get(teamId);
    const scheduleRating=average(schedule.map(row=>row.opponentRating))??0;
    const resultQuality=average(schedule.map(row=>row.quality))??50;
    const efficiency=clamp(50+1.25*(ratings.get(teamId)??0),0,100);
    const scheduleStrength=clamp(50+1.5*scheduleRating,0,100);
    const roadNeutral=schedule.filter(row=>row.side.venue!=='home');
    const roadNeutralScore=roadNeutral.length?average(roadNeutral.map(row=>row.quality)):null;
    const recent=schedule.slice(-3);
    const recentForm=average(recent.map(row=>row.quality))??50;
    const best=[...schedule].filter(row=>row.won).sort((a,b)=>b.quality-a.quality||b.margin-a.margin)[0]||null;
    const worst=[...schedule].sort((a,b)=>a.quality-b.quality||a.margin-b.margin)[0]||null;

    rows.push({
      team_id:teamId,
      team_name:teamNames.get(teamId)||teamId,
      record:{wins:record.wins,losses:record.losses},
      components:{
        result_quality:round(resultQuality,3),
        efficiency:round(efficiency,3),
        schedule_strength:round(scheduleStrength,3),
        road_neutral:roadNeutralScore===null?null:round(roadNeutralScore,3),
        recent_form:round(recentForm,3),
        availability:null,
        turnover_sustainability:null,
      },
      evidence_confidence:round(clamp(0.55+0.09*Math.min(record.games,5),0,1),4),
      best_win:best
        ?`${best.side.self.score}-${best.side.opp.score} vs ${best.side.opp.team_name||best.opponentId} (${best.side.venue})`
        :null,
      worst_result:worst
        ?`${worst.side.self.score}-${worst.side.opp.score} vs ${worst.side.opp.team_name||worst.opponentId} (${worst.side.venue})`
        :null,
      source_refs:schedule.map(row=>row.game.source_ref).filter(Boolean),
      explanation:`Opponent-adjusted results-first profile through ${record.games} completed game${record.games===1?'':'s'} using capped margins and iterative opponent strength. Injury and turnover inputs remain missing rather than being imputed.`,
      model_observations:{
        opponent_adjusted_rating:round(ratings.get(teamId)??0,3),
        mean_opponent_rating:round(scheduleRating,3),
        fcs_opponent_baseline:-12,
        margin_cap:35,
      },
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
    methodology:{
      result_model:'iterative opponent-adjusted rating with capped scoring margins',
      location_adjustment:'designated away +2.5, designated home -2.5, known neutral 0',
      fcs_opponent_baseline:-12,
      margin_cap:35,
      iterations:60,
      note:'NCAA 2026 scoreboard exposes designated home/away; neutral-site state may be unavailable for some games and is not invented.',
    },
    teams:rows,
  };
}
