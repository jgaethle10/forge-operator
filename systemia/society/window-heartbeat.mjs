import {createHash} from 'node:crypto';
import {advanceWorld,REAL_TICK_MS,replayWorld} from '../../public/the-window/world.mjs';
import {decideCivic,ensureCivic} from './window-civic.mjs';

export const STATE_SCHEMA='evercraft.window.heartbeat.v1';
export const STATE_BRANCH='window-society-state';
export const STATE_PATH='state/window.json';
export const MAX_STEPS_PER_HEARTBEAT=2000;

function digest(world) {
  return createHash('sha256').update(JSON.stringify(world)).digest('hex');
}
function assertWorld(w) {
  if(!w||w.version!==1||!Array.isArray(w.actors)||w.actors.length!==12 ||
     !Number.isSafeInteger(w.tick)||!Number.isSafeInteger(w.next_event_id)||
     !Number.isFinite(w.last_tick_at)||
     !Array.isArray(w.events)||w.events.length>160)throw Error('Invalid canonical world');
  if(new Set(w.actors.map(a=>a.id)).size!==12)throw Error('Duplicate resident identity');
}

export function advanceHeartbeat(previous,now,options={}){
  if(previous?.schema!==STATE_SCHEMA)throw Error('Unexpected world-state schema');
  if(!Number.isFinite(now)||now<0)throw Error('Invalid clock');
  const maxSteps=Number.isInteger(options.maxSteps)?Math.max(0,Math.min(MAX_STEPS_PER_HEARTBEAT,options.maxSteps)):MAX_STEPS_PER_HEARTBEAT;
  let w,origin,first;
  if(previous.initialized===true){
    if(!previous.world||typeof previous.world!=='object')throw Error('Missing world');
    w=structuredClone(previous.world);
    assertWorld(w);
    if(previous.world_hash!==digest(w))throw Error('Canonical world hash mismatch; refuse write');
    if(now<w.last_tick_at)throw Error('Clock moved backwards; refuse write');
    first=false;
    origin=previous.origin;
  }else if(previous.initialized===false){
    // First activation preserves public demo continuity rather than resetting its timeline.
    w=replayWorld(now);
    delete w.projection;
    assertWorld(w);
    ensureCivic(w);
    first=true;
    origin='clock-replay-import-2026-10-18';
  }else throw Error('Unknown initialization state');

  const expected=Math.max(0,Math.floor((now-w.last_tick_at)/REAL_TICK_MS));
  const steps=Math.min(expected,maxSteps);
  const oldTick=w.tick;
  const oldEventId=w.next_event_id;
  for(let i=0;i<steps;i++){
    const nextAt=w.last_tick_at+REAL_TICK_MS;
    advanceWorld(w,nextAt);
    decideCivic(w);
  }
  ensureCivic(w);
  assertWorld(w);
  const pending=Math.max(0,Math.floor((now-w.last_tick_at)/REAL_TICK_MS));
  const result={
    schema:STATE_SCHEMA,initialized:true,release_status:'held',
    authority:'github_actions_state_branch',
    model_mode:'rule_policy_no_llm',
    external_actions:'none',
    origin,
    sequence:(Number(previous.sequence)||0)+1,
    heartbeat_at:new Date(now).toISOString(),
    run:{
      first_activation:first,steps,previous_tick:oldTick,current_tick:w.tick,
      pending_ticks:pending,new_event_count:Math.max(0,w.next_event_id-oldEventId),
      scheduler:'GitHub Actions best-effort five-minute cron, not guaranteed'
    },
    world_hash:digest(w), world:w
  };
  if(!first&&steps===0)return {changed:false,state:previous};
  return {changed:true,state:result};
}
const API='https://api.github.com';
function githubClient({token,repo,fetchImpl=fetch}){
  if(!token||!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo))throw Error('GITHUB_TOKEN and GITHUB_REPOSITORY required');
  return async function request(method,pathname,body){
    const response=await fetchImpl(API+pathname,{
      method,
      headers:{
        Accept:'application/vnd.github+json',
        Authorization:'Bearer '+token,
        'X-GitHub-Api-Version':'2022-11-28',
        ...(body?{'Content-Type':'application/json'}:{})
      },
      ...(body?{body:JSON.stringify(body)}:{})
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw Error('GitHub '+method+' '+response.status+': '+JSON.stringify(data).slice(0,350));
    return data;
  };
}
export async function runHeartbeat({token,repo,now=Date.now(),fetchImpl=fetch,dryRun=false}){
  const request=githubClient({token,repo,fetchImpl});
  const endpoint='/repos/'+repo+'/contents/'+STATE_PATH;
  const file=await request('GET',endpoint+'?ref='+encodeURIComponent(STATE_BRANCH));
  if(!file.sha||!file.content||file.encoding!=='base64')throw Error('Expected state-branch content, not repository default');
  const previous=JSON.parse(Buffer.from(file.content.replace(/\s/g,''),'base64').toString('utf8'));
  const {changed,state}=advanceHeartbeat(previous,now);
  if(!changed)return {changed:false,sequence:previous.sequence,tick:previous.world.tick};
  if(!dryRun){
    const content=Buffer.from(JSON.stringify(state)+'\n').toString('base64');
    await request('PUT',endpoint,{
      message:'society heartbeat #'+state.sequence+': tick '+state.world.tick,
      content,sha:file.sha,branch:STATE_BRANCH
    });
  }
  return {
    changed:changed&&!dryRun,preview:dryRun,
    sequence:state.sequence,tick:state.world.tick,
    steps:state.run.steps,events:state.run.new_event_count,
    pending:state.run.pending_ticks,
    world_hash:state.world_hash
  };
}
if(process.argv[1]?.endsWith('/window-heartbeat.mjs')){
  runHeartbeat({
    token:process.env.GITHUB_TOKEN,
    repo:process.env.GITHUB_REPOSITORY,
    dryRun:process.env.WINDOW_DRY_RUN==='true'
  }).then(r=>console.log('WINDOW_HEARTBEAT_RESULT '+JSON.stringify(r)))
    .catch(err=>{console.error('WINDOW_HEARTBEAT_ERROR',err.message);process.exitCode=1});
}
