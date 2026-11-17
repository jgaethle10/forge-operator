// Summary of a previously validated, explicitly selected local operator snapshot.
// Never treats source-reported activity as independent worker/provisioning proof.
const MINUTE=60000;
const HOUR=60*MINUTE;
const RUNNING_WINDOW=15*MINUTE;
const OTHER_WINDOW=24*HOUR;

export function summarizeSelectedMissions(missions,{now=Date.now()}={}){
 if(!Array.isArray(missions)||missions.length>80||!Number.isFinite(now))throw Error('invalid selected mission snapshot');
 const counts={selected:missions.length,attention:0,recent_running:0,recorded_complete:0,stale:0};
 const attention=[];
 for(const m of missions){
  if(!m||typeof m!=='object'||typeof m.id!=='string'||typeof m.title!=='string')throw Error('invalid selected mission');
  const at=Date.parse(m.observed_at||'');
  const age=Number.isFinite(at)&&at<=now+300000?Math.max(0,now-at):Infinity;
  const reported=m.status;
  const stale=(reported==='running' ? age>RUNNING_WINDOW :
    !['completed','failed'].includes(reported)&&age>OTHER_WINDOW);
  if(stale)counts.stale++;
  if(reported==='completed')counts.recorded_complete++;
  if(reported==='running'&&!stale)counts.recent_running++;
  let reason='',rank=20;
  if(reported==='failed') {reason='Locally reported failure; outcome not independently verified';rank=1;}
  else if(reported==='held') {reason='Local mission record reports a hold';rank=2;}
  else if(stale&&reported==='running'){reason='Last local running observation is older than 15 minutes';rank=3;}
  else if(stale){reason='Nonterminal local status is older than 24 hours';rank=4;}
  else if(reported==='unknown'){reason='Unknown local mission state';rank=5;}
  if(reason){
   counts.attention++;
   attention.push({id:m.id,title:m.title,lane:m.lane,status:reported,observed_at:m.observed_at,
     reason,rank,historical:stale});
  }
 }
 attention.sort((a,b)=>a.rank-b.rank||Date.parse(a.observed_at)-Date.parse(b.observed_at)||a.id.localeCompare(b.id));
 return {counts,attention:attention.slice(0,6),hidden_attention_count:Math.max(0,counts.attention-6),
  authority:'OPERATOR-REPORTED / UNVERIFIED',scope:'EXPLICITLY SELECTED GOAL FILES ONLY'};
}
