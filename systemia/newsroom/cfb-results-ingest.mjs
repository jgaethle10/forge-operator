const ESPN_ORIGIN='https://site.api.espn.com/apis/site/v2/sports/football/college-football';
const NCAA_GRAPHQL_ORIGIN='https://sdataprod.ncaa.com/';
const NCAA_SCOREBOARD_HASH='7287cda610a9326931931080cb3a604828febe6fe3c9016a7e4a36db99efdb7c';
const FBS_GROUP_ID='80';
const NCAA_FBS_DIVISION=11;

export const NCAA_FBS_CONFERENCE_SLUGS=Object.freeze(new Set([
  'acc',
  'american',
  'big-12',
  'big-ten',
  'cusa',
  'mac',
  'mountain-west',
  'pac-12',
  'sec',
  'sun-belt',
  'fbs-independent',
  'fbs-independents',
  'independent',
  'independents',
  'di-independent',
]));

function clean(value){ return String(value??'').trim(); }
function slug(value){
  return clean(value).toLowerCase()
    .replace(/&/g,' and ')
    .replace(/[^a-z0-9]+/g,'-')
    .replace(/^-+|-+$/g,'');
}
function ymd(date){
  const d=new Date(date);
  if(!Number.isFinite(d.getTime())) throw new Error('cfb_ingest_invalid_date');
  return d.toISOString().slice(0,10).replaceAll('-','');
}
function isoDay(date){
  const d=new Date(date);
  if(!Number.isFinite(d.getTime())) throw new Error('cfb_ingest_invalid_date');
  return d.toISOString().slice(0,10);
}
function mmddyyyyToIso(value){
  const match=clean(value).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if(!match) return null;
  const [,month,day,year]=match;
  const date=new Date(Date.UTC(Number(year),Number(month)-1,Number(day),12,0,0));
  if(!Number.isFinite(date.getTime())) return null;
  return date.toISOString().slice(0,10);
}
function daysBetween(start,end){
  const first=new Date(start+'T12:00:00.000Z');
  const last=new Date(end+'T12:00:00.000Z');
  if(!Number.isFinite(first.getTime())||!Number.isFinite(last.getTime())||first>last){
    throw new Error('cfb_ingest_date_range_invalid');
  }
  const out=[];
  for(let cursor=first;cursor<=last;cursor=new Date(cursor.getTime()+86400000)){
    out.push(ymd(cursor));
  }
  return out;
}
async function getJson(url,{fetchImpl=globalThis.fetch,timeoutMs=12000}={}){
  if(typeof fetchImpl!=='function') throw new Error('cfb_ingest_fetch_unavailable');
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  let response;
  try{
    response=await fetchImpl(url,{
      headers:{
        Accept:'application/json, text/plain, */*',
        'User-Agent':'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
        'Accept-Language':'en-US,en;q=0.9',
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

export function parseEspnFbsTeamIds(payload){
  const rows=payload?.sports?.[0]?.leagues?.[0]?.teams;
  if(!Array.isArray(rows)) throw new Error('cfb_ingest_team_payload_invalid');
  const teams=rows
    .map(row=>row?.team||row)
    .map(team=>({
      team_id:clean(team?.id),
      team_name:clean(team?.displayName||team?.name),
      abbreviation:clean(team?.abbreviation)||null,
      conference:null,
    }))
    .filter(team=>team.team_id&&team.team_name);
  const byId=new Map();
  for(const team of teams) byId.set(team.team_id,team);
  return [...byId.values()].sort((a,b)=>a.team_name.localeCompare(b.team_name));
}
export async function fetchEspnFbsTeams({
  fetchImpl=globalThis.fetch,
  origin=ESPN_ORIGIN,
  timeoutMs=12000,
}={}){
  const url=`${origin}/teams?limit=250&groups=${FBS_GROUP_ID}`;
  const payload=await getJson(url,{fetchImpl,timeoutMs});
  return {
    schema:'evercraft.cfb.fbs-team-membership.v1',
    source:'espn-site-api',
    source_urls:[url],
    teams:parseEspnFbsTeamIds(payload),
  };
}
export function parseEspnCompletedGames(payload,{eligibleTeamIds=null}={}){
  const events=Array.isArray(payload?.events)?payload.events:[];
  const eligible=eligibleTeamIds?new Set([...eligibleTeamIds].map(clean)) : null;
  const games=[];
  for(const event of events){
    const competition=event?.competitions?.[0];
    if(competition?.status?.type?.completed!==true && event?.status?.type?.completed!==true) continue;
    const competitors=Array.isArray(competition?.competitors)?competition.competitors:[];
    if(competitors.length!==2) continue;
    const home=competitors.find(row=>row?.homeAway==='home')||competitors[0];
    const away=competitors.find(row=>row?.homeAway==='away')||competitors[1];
    const homeId=clean(home?.team?.id);
    const awayId=clean(away?.team?.id);
    const homeScore=Number(home?.score);
    const awayScore=Number(away?.score);
    if(!homeId||!awayId||!Number.isFinite(homeScore)||!Number.isFinite(awayScore)) continue;
    if(eligible && !eligible.has(homeId) && !eligible.has(awayId)) continue;
    const winnerId=homeScore===awayScore?null:(homeScore>awayScore?homeId:awayId);
    games.push({
      game_id:clean(event?.id)||clean(competition?.id),
      date:new Date(event?.date||competition?.date).toISOString(),
      completed:true,
      neutral_site:competition?.neutralSite===true,
      home:{team_id:homeId,team_name:clean(home?.team?.displayName),score:homeScore,fbs:eligible?eligible.has(homeId):null,conference:null},
      away:{team_id:awayId,team_name:clean(away?.team?.displayName),score:awayScore,fbs:eligible?eligible.has(awayId):null,conference:null},
      winner_team_id:winnerId,
      source_ref:'espn-game:'+clean(event?.id||competition?.id),
      source:'espn-site-api',
    });
  }
  return games.filter(game=>game.game_id);
}
export async function fetchEspnCompletedFbsGames({
  startDate,
  endDate,
  eligibleTeamIds,
  fetchImpl=globalThis.fetch,
  origin=ESPN_ORIGIN,
  timeoutMs=12000,
}={}){
  const dateKeys=daysBetween(isoDay(startDate),isoDay(endDate));
  const byGameId=new Map();
  const sourceUrls=[];
  for(const dateKey of dateKeys){
    const url=`${origin}/scoreboard?dates=${dateKey}&groups=${FBS_GROUP_ID}&limit=1000`;
    sourceUrls.push(url);
    const payload=await getJson(url,{fetchImpl,timeoutMs});
    for(const game of parseEspnCompletedGames(payload,{eligibleTeamIds})){
      byGameId.set(game.game_id,game);
    }
  }
  return {
    schema:'evercraft.cfb.completed-game-ledger.v1',
    source:'espn-site-api',
    start_date:isoDay(startDate),
    end_date:isoDay(endDate),
    source_urls:sourceUrls,
    games:[...byGameId.values()].sort((a,b)=>a.date.localeCompare(b.date)||a.game_id.localeCompare(b.game_id)),
  };
}

function ncaaTeam(team){
  const conference=clean(team?.conferenceSeo).toLowerCase();
  const id=clean(team?.seoname)||slug(team?.nameShort||team?.name6Char);
  return {
    team_id:id,
    team_name:clean(team?.nameShort||team?.name6Char||team?.seoname),
    abbreviation:clean(team?.name6Char)||null,
    conference:conference||null,
    fbs:NCAA_FBS_CONFERENCE_SLUGS.has(conference),
    score:Number(team?.score),
    is_home:team?.isHome===true,
    is_winner:team?.isWinner===true,
  };
}
export function parseNcaaFbsScoreboard(payload,{startDate,endDate}={}){
  const contests=Array.isArray(payload?.data?.contests)?payload.data.contests:[];
  const start=isoDay(startDate);
  const end=isoDay(endDate);
  const games=[];
  for(const contest of contests){
    if(clean(contest?.gameState).toUpperCase()!=='F') continue;
    const date=mmddyyyyToIso(contest?.startDate);
    if(!date||date<start||date>end) continue;
    const teams=Array.isArray(contest?.teams)?contest.teams.map(ncaaTeam):[];
    if(teams.length!==2) continue;
    const home=teams.find(team=>team.is_home);
    const away=teams.find(team=>!team.is_home);
    if(!home||!away||!home.team_id||!away.team_id) continue;
    if(!Number.isFinite(home.score)||!Number.isFinite(away.score)) continue;
    if(!home.fbs&&!away.fbs) continue;
    const gameId=clean(contest?.contestId);
    if(!gameId) continue;
    games.push({
      game_id:gameId,
      date:new Date(date+'T12:00:00.000Z').toISOString(),
      completed:true,
      neutral_site:null,
      venue_evidence_state:'designated_home_away_neutral_unknown',
      home:{team_id:home.team_id,team_name:home.team_name,score:home.score,fbs:home.fbs,conference:home.conference},
      away:{team_id:away.team_id,team_name:away.team_name,score:away.score,fbs:away.fbs,conference:away.conference},
      winner_team_id:home.score===away.score?null:(home.score>away.score?home.team_id:away.team_id),
      source_ref:'ncaa-game:'+gameId,
      source:'ncaa-graphql-scoreboard',
    });
  }
  return games;
}
function ncaaScoreboardUrl({season,week,origin=NCAA_GRAPHQL_ORIGIN}){
  const extensions={persistedQuery:{version:1,sha256Hash:NCAA_SCOREBOARD_HASH}};
  const variables={sportCode:'MFB',division:NCAA_FBS_DIVISION,seasonYear:Number(season),week:Number(week)};
  const url=new URL(origin);
  url.searchParams.set('extensions',JSON.stringify(extensions));
  url.searchParams.set('variables',JSON.stringify(variables));
  return url.toString();
}
export async function fetchNcaaFbsEvidence({
  season,
  startDate,
  endDate,
  weeks=Array.from({length:16},(_,index)=>index),
  fetchImpl=globalThis.fetch,
  origin=NCAA_GRAPHQL_ORIGIN,
  timeoutMs=12000,
}={}){
  const byGameId=new Map();
  const sourceUrls=[];
  for(const week of weeks){
    const url=ncaaScoreboardUrl({season,week,origin});
    sourceUrls.push(url);
    const payload=await getJson(url,{fetchImpl,timeoutMs});
    for(const game of parseNcaaFbsScoreboard(payload,{startDate,endDate})){
      byGameId.set(game.game_id,game);
    }
  }
  const games=[...byGameId.values()].sort((a,b)=>a.date.localeCompare(b.date)||a.game_id.localeCompare(b.game_id));
  const membership=new Map();
  for(const game of games){
    for(const team of [game.home,game.away]){
      if(team.fbs!==true) continue;
      membership.set(team.team_id,{
        team_id:team.team_id,
        team_name:team.team_name,
        abbreviation:null,
        conference:team.conference,
      });
    }
  }
  return {
    membership:{
      schema:'evercraft.cfb.fbs-team-membership.v1',
      source:'ncaa-graphql-scoreboard',
      source_authority:'NCAA',
      source_urls:sourceUrls,
      membership_rule:'team conferenceSeo must match versioned FBS conference slug allowlist',
      conference_slugs:[...NCAA_FBS_CONFERENCE_SLUGS].sort(),
      teams:[...membership.values()].sort((a,b)=>a.team_name.localeCompare(b.team_name)),
    },
    ledger:{
      schema:'evercraft.cfb.completed-game-ledger.v1',
      source:'ncaa-graphql-scoreboard',
      source_authority:'NCAA',
      start_date:isoDay(startDate),
      end_date:isoDay(endDate),
      source_urls:sourceUrls,
      games,
    },
  };
}
