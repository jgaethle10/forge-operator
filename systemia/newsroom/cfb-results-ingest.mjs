const NCAA_SCOREBOARD_ORIGIN='https://sdataprod.ncaa.com/';
const NCAA_SCOREBOARD_HASH='7287cda610a9326931931080cb3a604828febe6fe3c9016a7e4a36db99efdb7c';
const NCAA_FBS_DIVISION=11;
const NCAA_FOOTBALL_CODE='MFB';

function clean(value){ return String(value??'').trim(); }
function slug(value){
  return clean(value).toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
    .replace(/&/g,' and ')
    .replace(/[^a-z0-9]+/g,'-')
    .replace(/^-+|-+$/g,'');
}
function parseThroughDate(value){
  const date=new Date(String(value||'')+'T23:59:59.999Z');
  if(!Number.isFinite(date.getTime())) throw new Error('cfb_ingest_invalid_through_date');
  return date;
}
function contestDate(contest){
  const epoch=Number(contest?.startTimeEpoch);
  if(Number.isFinite(epoch)&&epoch>0){
    const millis=epoch>1e12?epoch:epoch*1000;
    const date=new Date(millis);
    if(Number.isFinite(date.getTime())) return date;
  }
  const raw=clean(contest?.startDate);
  if(!raw) return null;
  const candidates=[
    raw,
    /^\d{2}\/\d{2}\/\d{4}$/.test(raw)
      ? raw.replace(/^(\d{2})\/(\d{2})\/(\d{4})$/,'$3-$1-$2T12:00:00Z')
      : '',
  ].filter(Boolean);
  for(const candidate of candidates){
    const date=new Date(candidate);
    if(Number.isFinite(date.getTime())) return date;
  }
  return null;
}
async function getJson(url,{fetchImpl=globalThis.fetch,timeoutMs=12000}={}){
  if(typeof fetchImpl!=='function') throw new Error('cfb_ingest_fetch_unavailable');
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  let response;
  try{
    response=await fetchImpl(url,{
      headers:{
        Accept:'application/json',
        'User-Agent':'EvercraftCFBPowerIndex/0.2 (+https://journal.evercraft.global)',
        'Cache-Control':'no-cache',
      },
      signal:controller.signal,
    });
  }catch(error){
    if(error?.name==='AbortError') throw new Error('cfb_ingest_timeout');
    throw new Error('cfb_ingest_fetch_failed:'+String(error?.message||error).slice(0,200));
  }finally{
    clearTimeout(timer);
  }
  if(!response?.ok) throw new Error('cfb_ingest_http_status_'+Number(response?.status||0));
  const payload=await response.json();
  if(payload?.errors?.length) throw new Error('cfb_ingest_upstream_graphql_error');
  return payload;
}

export function ncaaFbsScoreboardUrl({season,week,origin=NCAA_SCOREBOARD_ORIGIN}={}){
  const year=Number(season);
  const weekNumber=Number(week);
  if(!Number.isInteger(year)||year<2010||year>3000) throw new Error('cfb_ingest_invalid_season');
  if(!Number.isInteger(weekNumber)||weekNumber<1||weekNumber>20) throw new Error('cfb_ingest_invalid_week');
  const params=new URLSearchParams({
    extensions:JSON.stringify({
      persistedQuery:{version:1,sha256Hash:NCAA_SCOREBOARD_HASH},
    }),
    variables:JSON.stringify({
      sportCode:NCAA_FOOTBALL_CODE,
      division:NCAA_FBS_DIVISION,
      seasonYear:year,
      week:weekNumber,
    }),
  });
  return origin+'?'+params.toString();
}

function teamIdentity(team){
  const teamName=clean(team?.nameShort||team?.name6Char||team?.seoname);
  return {
    team_id:clean(team?.seoname)||slug(teamName),
    team_name:teamName,
    conference_seo:clean(team?.conferenceSeo)||null,
    score:Number(team?.score),
  };
}

export function parseNcaaCompletedGames(payload){
  const contests=Array.isArray(payload?.data?.contests)?payload.data.contests:[];
  const games=[];
  for(const contest of contests){
    if(clean(contest?.gameState)!=='F') continue;
    const teams=Array.isArray(contest?.teams)?contest.teams:[];
    if(teams.length!==2) continue;
    const homeRaw=teams.find(team=>team?.isHome===true)||teams[0];
    const awayRaw=teams.find(team=>team?.isHome!==true)||teams[1];
    const home=teamIdentity(homeRaw);
    const away=teamIdentity(awayRaw);
    if(!home.team_id||!away.team_id||!home.team_name||!away.team_name) continue;
    if(!Number.isFinite(home.score)||!Number.isFinite(away.score)) continue;
    const id=clean(contest?.contestId);
    if(!id) continue;
    const date=contestDate(contest);
    games.push({
      game_id:id,
      date:date?date.toISOString():null,
      completed:true,
      neutral_site:null,
      home,
      away,
      winner_team_id:home.score===away.score?null:(home.score>away.score?home.team_id:away.team_id),
      source_ref:'ncaa-game:'+id,
    });
  }
  return games;
}

export function inferFbsMembershipFromSchedule(games,{minimumAppearances=3}={}){
  const threshold=Math.max(1,Number(minimumAppearances)||1);
  const teams=new Map();
  for(const game of games){
    for(const side of [game.home,game.away]){
      if(!side?.team_id) continue;
      const current=teams.get(side.team_id)||{
        team_id:side.team_id,
        team_name:side.team_name||side.team_id,
        conference_seo:side.conference_seo||null,
        observed_games:0,
      };
      current.observed_games+=1;
      if(!current.conference_seo&&side.conference_seo) current.conference_seo=side.conference_seo;
      teams.set(side.team_id,current);
    }
  }
  return [...teams.values()]
    .filter(team=>team.observed_games>=threshold)
    .sort((a,b)=>a.team_name.localeCompare(b.team_name))
    .map(team=>({
      ...team,
      membership_state:'inferred_from_ncaa_fbs_schedule_frequency',
      membership_confidence:team.observed_games>=4?'high':'medium',
    }));
}

export async function fetchNcaaFbsSeasonLedger({
  season,
  throughDate,
  maxWeek=15,
  minimumAppearances=3,
  fetchImpl=globalThis.fetch,
  origin=NCAA_SCOREBOARD_ORIGIN,
  timeoutMs=12000,
}={}){
  const through=parseThroughDate(throughDate);
  const byGameId=new Map();
  const sourceUrls=[];
  const fetchedWeeks=[];
  for(let week=1;week<=Number(maxWeek);week+=1){
    const url=ncaaFbsScoreboardUrl({season,week,origin});
    sourceUrls.push(url);
    const payload=await getJson(url,{fetchImpl,timeoutMs});
    fetchedWeeks.push(week);
    for(const game of parseNcaaCompletedGames(payload)){
      const date=game.date?new Date(game.date):null;
      if(date&&date>through) continue;
      byGameId.set(game.game_id,game);
    }
  }

  const games=[...byGameId.values()]
    .sort((a,b)=>(a.date||'').localeCompare(b.date||'')||a.game_id.localeCompare(b.game_id));
  if(!games.length) throw new Error('cfb_ingest_no_completed_games');

  const teams=inferFbsMembershipFromSchedule(games,{minimumAppearances});
  if(teams.length<25) throw new Error('cfb_ingest_fbs_membership_too_small');
  const eligibleIds=new Set(teams.map(team=>team.team_id));
  for(const game of games){
    game.home.fbs=eligibleIds.has(game.home.team_id);
    game.away.fbs=eligibleIds.has(game.away.team_id);
  }

  return {
    schema:'evercraft.cfb.completed-game-ledger.v2',
    source:'ncaa-sdataprod',
    source_authority:'NCAA',
    season:Number(season),
    through_date:through.toISOString().slice(0,10),
    fetched_weeks:fetchedWeeks,
    source_urls:sourceUrls,
    membership:{
      schema:'evercraft.cfb.fbs-team-membership.v2',
      derivation:'Repeated team appearances inside NCAA division-11 FBS scoreboard results.',
      minimum_appearances:Math.max(1,Number(minimumAppearances)||1),
      caveat:'Membership is inferred from the FBS schedule surface and remains explicitly labeled inferred until a direct NCAA membership registry is bound.',
      teams,
    },
    games,
  };
}
