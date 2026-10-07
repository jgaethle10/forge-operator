const DEFAULT_SCOREBOARD_ORIGIN='https://site.api.espn.com/apis/site/v2/sports/football/college-football';
const FBS_GROUP_ID='80';

function clean(value){ return String(value??'').trim(); }
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
        Referer:'https://www.espn.com/',
        Origin:'https://www.espn.com',
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
  return response.json();
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
    }))
    .filter(team=>team.team_id&&team.team_name);
  const byId=new Map();
  for(const team of teams) byId.set(team.team_id,team);
  return [...byId.values()].sort((a,b)=>a.team_name.localeCompare(b.team_name));
}
export async function fetchEspnFbsTeams({
  fetchImpl=globalThis.fetch,
  origin=DEFAULT_SCOREBOARD_ORIGIN,
  timeoutMs=12000,
}={}){
  const url=`${origin}/teams?limit=250&groups=${FBS_GROUP_ID}`;
  const payload=await getJson(url,{fetchImpl,timeoutMs});
  return {
    schema:'evercraft.cfb.fbs-team-membership.v1',
    source:'espn-site-api',
    source_url:url,
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
      home:{team_id:homeId,team_name:clean(home?.team?.displayName),score:homeScore,fbs:eligible?eligible.has(homeId):null},
      away:{team_id:awayId,team_name:clean(away?.team?.displayName),score:awayScore,fbs:eligible?eligible.has(awayId):null},
      winner_team_id:winnerId,
      source_ref:'espn-game:'+clean(event?.id||competition?.id),
    });
  }
  return games.filter(game=>game.game_id);
}
export async function fetchEspnCompletedFbsGames({
  startDate,
  endDate,
  eligibleTeamIds,
  fetchImpl=globalThis.fetch,
  origin=DEFAULT_SCOREBOARD_ORIGIN,
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
