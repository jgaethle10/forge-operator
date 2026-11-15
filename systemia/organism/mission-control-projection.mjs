import {createHash} from 'node:crypto';
import {goalSnapshot} from './goal-runtime.mjs';
// Persisted local goal-state projection, not provider verification or remote liveness.
const SCHEMA='evercraft.systemia.operator-mission-snapshot.v1';
function observed(value,now){
 const ms=Date.parse(value);
 if(!Number.isFinite(ms)||ms>now+300000||now-ms>180*86400000)throw Error('goal timestamp invalid or stale');
 return new Date(ms).toISOString();
}
function lane(tasks){
 if(tasks.some(t=>['payment','external_purchase'].includes(t.work_type)||['payment','financial_obligation'].includes(t.impact)))return 'revenue';
 if(tasks.some(t=>['deploy','compute','infrastructure','network'].includes(t.work_type)))return 'infrastructure';
 return tasks.some(t=>t.human_gate_unresolved)?'approvals':'execution';
}
function evidence(task){return ['receipt_refs','evidence_refs'].some(k=>Array.isArray(task[k])&&task[k].some(x=>typeof x==='string'&&x.trim()));}
export function projectGoalToOperatorMission(state,{now=Date.now()}={}){
 if(state?.schema!=='evercraft.goal.state.v1'||!Number.isInteger(state.revision)||state.revision<1||!Array.isArray(state.tasks)||state.tasks.length>300)throw Error('invalid persisted goal state');
 const stamp=observed(state.updated_at,now),snapshot=goalSnapshot(state),tasks=state.tasks;
 const hash=createHash('sha256').update(String(state.goal_key)+'|'+String(state.mission_key)).digest('hex').slice(0,16);
 let status=({planning:'planned',ready:'admitted',blocked:'held',waiting:'held'})[snapshot.status]||'unknown';
 if(snapshot.status==='executing'){
  const active=tasks.filter(t=>t.status==='executing');
  const recent=active.length>0&&active.every(t=>{const time=Date.parse(t.last_heartbeat_at||t.updated_at||'');return Number.isFinite(time)&&time<=now+300000&&now-time<=900000&&!t.recovery_hold;});
  status=recent?'running':'held';
 }
 if(snapshot.status==='complete'){
  status=tasks.length>0&&tasks.every(t=>t.status==='complete'&&evidence(t))&&Array.isArray(state.evidence_refs)&&state.evidence_refs.some(x=>typeof x==='string'&&x.trim())?'completed':'held';
 }
 const counts=tasks.reduce((acc,t)=>(acc[t.status]=(acc[t.status]||0)+1,acc),{});
 const compact=Object.entries(counts).sort().map(([k,n])=>n+' '+k).join(', ')||'no tasks';
 const note=status==='running'?'Recent local heartbeat; worker liveness unverified.':status==='completed'?'Goal file reports completion; provider outcome unverified.':snapshot.status==='executing'?'Stale or missing heartbeat; external effect unknown.':'Local goal-state record; independent outcome unverified.';
 return {id:'systemia/goal-'+hash,title:'Systemia goal '+hash.slice(0,10),lane:lane(tasks),status,observed_at:stamp,owner:'Systemia',note:'Revision '+state.revision+'; '+compact+'. '+note};
}
export function projectGoalStates(states,{now=Date.now()}={}){
 if(!Array.isArray(states)||states.length<1||states.length>80)throw Error('expected 1 to 80 explicit goal states');
 const missions=states.map(s=>projectGoalToOperatorMission(s,{now}));
 if(new Set(missions.map(x=>x.id)).size!==missions.length)throw Error('duplicate goals');
 return {schema:SCHEMA,exported_at:new Date(now).toISOString(),missions,provenance:'LOCAL_GOAL_STORE_OPERATOR_EXPORT_UNVERIFIED',notice:'Not independently verified; does not establish provider payment, delivery, remote liveness or execution authority.'};
}
